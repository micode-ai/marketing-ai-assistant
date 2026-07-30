import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { TikTokAccount, TikTokTokenService } from './tiktok-token.service';
import { fetchTikTokUser, fetchTikTokVideoList, TikTokAuthError } from './tiktok-api.util';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Videos pulled per sync: 2 pages of 20. Enough for a month of daily posting. */
const PAGE_SIZE = 20;
const MAX_PAGES = 2;

export interface TikTokSyncResult {
  accountSynced: boolean;
  mediaSynced: number;
}

/**
 * Pulls TikTok profile counters and per-video metrics through the Display API.
 *
 * Unlike the Threads/Instagram syncs there is **no backfill**: TikTok exposes
 * lifetime counters only, with no historical series to fetch. Each run writes a
 * cumulative snapshot for today, so history begins at connection time and
 * period figures are derived as `last - first` by the consumer.
 */
@Injectable()
export class TikTokSyncService {
  private readonly logger = new Logger(TikTokSyncService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifier: CronFailureNotifier,
    private tokenService: TikTokTokenService,
  ) {}

  /**
   * Core, testable unit: sync one account. Upserts today's snapshot and, when
   * `withMedia`, each recent video with a computed engagement rate.
   *
   * The snapshot's aggregate counters are summed from the stored `TikTokMedia`
   * rows rather than from this run's fetch, so a partially failed pagination
   * leaves the totals consistent with what we actually know instead of
   * reporting a sudden drop.
   */
  async syncAccount(account: TikTokAccount, withMedia = true): Promise<TikTokSyncResult> {
    let accessToken: string;
    try {
      accessToken = await this.tokenService.getValidAccessToken(account);
    } catch (e) {
      // getValidAccessToken already flipped the account and reported when the
      // refresh token is dead; nothing left to sync.
      this.logger.warn(`TikTok account ${account.id} has no usable token: ${e}`);
      return { accountSynced: false, mediaSynced: 0 };
    }

    try {
      const profile = await fetchTikTokUser(accessToken);

      let mediaSynced = 0;
      if (withMedia) {
        mediaSynced = await this.syncMedia(account.id, accessToken);
      }

      const totals = await this.aggregateStoredMedia(account.id);
      const today = this.truncateToDate(new Date());
      const snapshot = {
        followersCount: profile.followerCount ?? null,
        followingCount: profile.followingCount ?? null,
        likesCount: profile.likesCount ?? null,
        videoCount: profile.videoCount ?? null,
        views: totals.views,
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
      };

      await this.prisma.tikTokAccountMetrics.upsert({
        where: { socialAccountId_date: { socialAccountId: account.id, date: today } },
        create: { socialAccountId: account.id, date: today, ...snapshot },
        update: snapshot,
      });

      this.logger.log(`Synced TikTok account ${account.id} (videos: ${mediaSynced})`);
      return { accountSynced: true, mediaSynced };
    } catch (error) {
      if (error instanceof TikTokAuthError) {
        await this.tokenService.markReauthRequired(
          account,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  /** Page through the video list, upserting each video. Returns how many were seen. */
  private async syncMedia(socialAccountId: string, accessToken: string): Promise<number> {
    let cursor: number | undefined;
    let synced = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await fetchTikTokVideoList(accessToken, {
        maxCount: PAGE_SIZE,
        cursor,
      });

      for (const video of result.videos) {
        if (!video.id) continue;

        const views = video.viewCount ?? null;
        const likes = video.likeCount ?? null;
        const comments = video.commentCount ?? null;
        const shares = video.shareCount ?? null;
        const interactions = (likes ?? 0) + (comments ?? 0) + (shares ?? 0);

        const data = {
          title: video.title ?? null,
          description: video.description ?? null,
          coverImageUrl: video.coverImageUrl ?? null,
          shareUrl: video.shareUrl ?? null,
          embedLink: video.embedLink ?? null,
          duration: video.duration ?? null,
          timestamp: video.timestamp,
          viewCount: views,
          likeCount: likes,
          commentCount: comments,
          shareCount: shares,
          engagementRate: views && views > 0 ? interactions / views : null,
          lastSyncedAt: new Date(),
        };

        await this.prisma.tikTokMedia.upsert({
          where: {
            socialAccountId_tiktokVideoId: {
              socialAccountId,
              tiktokVideoId: video.id,
            },
          },
          create: { socialAccountId, tiktokVideoId: video.id, ...data },
          update: data,
        });
        synced++;
      }

      if (!result.hasMore || result.cursor === undefined) break;
      cursor = result.cursor;
    }

    return synced;
  }

  /** Lifetime totals across every video we have stored for the account. */
  private async aggregateStoredMedia(socialAccountId: string): Promise<{
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }> {
    const agg = await this.prisma.tikTokMedia.aggregate({
      where: { socialAccountId },
      _sum: { viewCount: true, likeCount: true, commentCount: true, shareCount: true },
    });
    return {
      views: agg._sum.viewCount ?? null,
      likes: agg._sum.likeCount ?? null,
      comments: agg._sum.commentCount ?? null,
      shares: agg._sum.shareCount ?? null,
    };
  }

  /**
   * Hourly at :15 (offset from the Instagram/Threads syncs). Plan throttling:
   *  FREE       → once/day
   *  PRO        → skip if synced within 6h
   *  ENTERPRISE → every hour
   * Per-video metrics are included on every plan; plans differ only in frequency.
   */
  @Cron('15 * * * *')
  async handleCron(): Promise<void> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { platform: 'TIKTOK', status: 'ACTIVE' },
      include: { organization: { include: { subscription: true } } },
    });

    if (accounts.length === 0) return;
    this.logger.log(`Starting scheduled TikTok sync for ${accounts.length} account(s)`);

    for (const account of accounts) {
      try {
        const plan = account.organization.subscription?.plan || 'FREE';

        if (plan === 'FREE') {
          if (await this.hasMetricsForToday(account.id)) continue;
        } else if (plan === 'PRO') {
          if (await this.syncedWithin(account.id, SIX_HOURS_MS)) continue;
        }

        await this.syncAccount(account as TikTokAccount, this.planAllowsMedia(plan));
      } catch (error) {
        this.logger.error(`Scheduled TikTok sync failed for account ${account.id}: ${error}`);
        // An auth error was already reported as TIKTOK_TOKEN_EXPIRED — don't
        // send a second email for the same cause.
        if (error instanceof TikTokAuthError) continue;

        const webUrl = (
          this.config.get<string>('WEB_URL') || 'http://localhost:5173'
        ).replace(/\/$/, '');
        await this.notifier.report({
          organizationId: account.organizationId,
          cronName: 'tiktok-sync',
          resourceType: 'SocialAccount',
          resourceId: account.id,
          resourceLabel: account.accountName,
          errorCode: 'TIKTOK_SYNC_FAILED',
          error: error instanceof Error ? error.message : String(error),
          actionUrl: `${webUrl}/settings/integrations`,
        });
      }
    }
  }

  /**
   * Per-video analytics are available on every plan; plans differ only in sync
   * frequency (see handleCron). Public so manual-sync paths apply the same rule.
   */
  planAllowsMedia(_plan: string): boolean {
    return true;
  }

  private truncateToDate(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async hasMetricsForToday(socialAccountId: string): Promise<boolean> {
    const today = this.truncateToDate(new Date());
    const existing = await this.prisma.tikTokAccountMetrics.findUnique({
      where: { socialAccountId_date: { socialAccountId, date: today } },
    });
    return !!existing;
  }

  /** True if the newest video row was synced within `windowMs`. */
  private async syncedWithin(socialAccountId: string, windowMs: number): Promise<boolean> {
    const latest = await this.prisma.tikTokMedia.findFirst({
      where: { socialAccountId },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });
    if (!latest?.lastSyncedAt) return false;
    return Date.now() - new Date(latest.lastSyncedAt).getTime() < windowMs;
  }
}
