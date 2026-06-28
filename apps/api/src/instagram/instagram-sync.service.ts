import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { decryptData } from '../common/crypto.util';
import {
  fetchAccountProfile,
  fetchAccountInsights,
  fetchAccountInsightsRange,
  fetchMediaList,
  fetchMediaInsights,
  InstagramAuthError,
  DailyInsightRow,
} from './instagram-graph.util';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export interface SyncAccountResult {
  accountSynced: boolean;
  mediaSynced: number;
}

/**
 * Pulls Instagram account- and media-level metrics from graph.instagram.com
 * using the per-account long-lived token stored on `SocialAccount`.
 * Mirrors `google-play-sync.service.ts`: hourly cron, plan throttling,
 * per-account try/catch, CronFailureNotifier on failure.
 */
@Injectable()
export class InstagramSyncService {
  private readonly logger = new Logger(InstagramSyncService.name);

  /**
   * Minimum number of daily account-metric rows that must exist before we
   * consider the account sufficiently backfilled. Accounts below this
   * threshold trigger a 90-day historical backfill before each sync.
   */
  static readonly BACKFILL_THRESHOLD_DAYS = 7;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifier: CronFailureNotifier,
  ) {}

  /**
   * Core, testable unit: sync one account. Decrypts the token, upserts today's
   * account metrics, and (when `withMedia`) upserts the latest media with a
   * computed engagement rate. On an auth error the account is flipped to
   * REAUTH_REQUIRED and a cron-failure notification is reported.
   */
  async syncAccount(
    account: {
      id: string;
      organizationId: string;
      accountName: string;
      encryptedTokens: string;
      scopes?: string[];
    },
    withMedia = true,
  ): Promise<SyncAccountResult> {
    let accessToken: string | undefined;
    let igUserId: string | undefined;
    try {
      const tokens = decryptData(
        account.encryptedTokens,
        this.config.get<string>('ENCRYPTION_KEY', ''),
      );
      accessToken = tokens?.accessToken;
      igUserId = tokens?.igUserId;
    } catch (e) {
      this.logger.warn(
        `Failed to decrypt tokens for IG account ${account.id}: ${e}`,
      );
      return { accountSynced: false, mediaSynced: 0 };
    }

    if (!accessToken || !igUserId) {
      this.logger.warn(
        `IG account ${account.id} missing accessToken/igUserId — skipping`,
      );
      return { accountSynced: false, mediaSynced: 0 };
    }

    try {
      // --- Account metrics ---
      const [profile, insights] = await Promise.all([
        fetchAccountProfile(igUserId, accessToken),
        fetchAccountInsights(igUserId, accessToken),
      ]);

      const today = this.truncateToDate(new Date());
      const accountData = {
        followersCount: profile.followersCount ?? null,
        reach: insights.reach ?? null,
        views: insights.views ?? null,
        accountsEngaged: insights.accountsEngaged ?? null,
        totalInteractions: insights.totalInteractions ?? null,
      };

      await this.prisma.instagramAccountMetrics.upsert({
        where: {
          socialAccountId_date: { socialAccountId: account.id, date: today },
        },
        create: { socialAccountId: account.id, date: today, ...accountData },
        update: accountData,
      });

      let mediaSynced = 0;

      // --- Media metrics ---
      if (withMedia) {
        const mediaList = await fetchMediaList(igUserId, accessToken, 25);
        for (const media of mediaList) {
          const mediaInsights = await fetchMediaInsights(
            media.id,
            accessToken,
            media.mediaProductType || media.mediaType,
          );

          const likeCount = media.likeCount ?? null;
          const commentsCount = media.commentsCount ?? null;
          const reach = mediaInsights.reach ?? null;
          const saved = mediaInsights.saved ?? null;
          const shares = mediaInsights.shares ?? null;
          const views = mediaInsights.views ?? null;
          const engagementRate = this.computeEngagementRate(
            likeCount,
            commentsCount,
            saved,
            reach,
          );

          const mediaData = {
            mediaType: media.mediaType,
            caption: media.caption ?? null,
            permalink: media.permalink ?? null,
            timestamp: new Date(media.timestamp),
            likeCount,
            commentsCount,
            reach,
            saved,
            shares,
            views,
            engagementRate,
            lastSyncedAt: new Date(),
          };

          await this.prisma.instagramMedia.upsert({
            where: {
              socialAccountId_igMediaId: {
                socialAccountId: account.id,
                igMediaId: media.id,
              },
            },
            create: {
              socialAccountId: account.id,
              igMediaId: media.id,
              ...mediaData,
            },
            update: mediaData,
          });
          mediaSynced++;
        }
      }

      this.logger.log(
        `Synced IG account ${account.id} (media: ${mediaSynced})`,
      );
      return { accountSynced: true, mediaSynced };
    } catch (error) {
      if (this.isAuthError(error)) {
        await this.handleAuthError(account, error);
      }
      throw error;
    }
  }

  /**
   * Backfill up to `days` (default 90) days of daily account-level metrics
   * for an account that has too few historical rows. Token decryption and auth
   * errors are handled the same way as in `syncAccount`. Safe to call
   * repeatedly — each row is upserted, so re-runs are idempotent.
   *
   * @returns `{ daysWritten }` — number of distinct calendar days written.
   */
  async backfillAccount(
    account: {
      id: string;
      organizationId: string;
      accountName: string;
      encryptedTokens: string;
      scopes?: string[];
    },
    days = 90,
  ): Promise<{ daysWritten: number }> {
    let accessToken: string | undefined;
    let igUserId: string | undefined;
    try {
      const tokens = decryptData(
        account.encryptedTokens,
        this.config.get<string>('ENCRYPTION_KEY', ''),
      );
      accessToken = tokens?.accessToken;
      igUserId = tokens?.igUserId;
    } catch (e) {
      this.logger.warn(
        `Failed to decrypt tokens for IG account ${account.id} during backfill: ${e}`,
      );
      return { daysWritten: 0 };
    }

    if (!accessToken || !igUserId) {
      this.logger.warn(
        `IG account ${account.id} missing accessToken/igUserId — skipping backfill`,
      );
      return { daysWritten: 0 };
    }

    const until = Math.floor(this.truncateToDate(new Date()).getTime() / 1000);
    const since = until - days * 86400;

    let rows: DailyInsightRow[];
    try {
      rows = await fetchAccountInsightsRange(igUserId, accessToken, since, until);
    } catch (e) {
      if (this.isAuthError(e)) {
        await this.handleAuthError(account, e);
      }
      throw e;
    }

    for (const row of rows) {
      const date = new Date(row.date);
      await this.prisma.instagramAccountMetrics.upsert({
        where: {
          socialAccountId_date: { socialAccountId: account.id, date },
        },
        create: {
          socialAccountId: account.id,
          date,
          reach: row.reach ?? null,
          views: row.views ?? null,
          accountsEngaged: row.accountsEngaged ?? null,
          totalInteractions: row.totalInteractions ?? null,
        },
        // `?? undefined` (not null) on update: a metric the range didn't return
        // must NOT overwrite a value an existing day already has (e.g. today's
        // row populated by the daily total_value sync). Backfill only fills gaps.
        update: {
          reach: row.reach ?? undefined,
          views: row.views ?? undefined,
          accountsEngaged: row.accountsEngaged ?? undefined,
          totalInteractions: row.totalInteractions ?? undefined,
        },
      });
    }

    this.logger.log(`Backfilled IG account ${account.id} (${rows.length} days)`);
    return { daysWritten: rows.length };
  }

  /**
   * Hourly cron. Plan throttling:
   *  FREE       → account metrics only, at most once/day.
   *  PRO        → account + media, skip if synced within 6h.
   *  ENTERPRISE → account + media, every hour.
   */
  @Cron('0 * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting scheduled Instagram sync');

    const accounts = await this.prisma.socialAccount.findMany({
      where: { platform: 'INSTAGRAM', status: 'ACTIVE' },
      include: {
        organization: { include: { subscription: true } },
      },
    });

    for (const account of accounts) {
      try {
        const plan = account.organization.subscription?.plan || 'FREE';

        // Self-healing backfill: if this account has fewer than the threshold
        // of daily rows, pull 90 days of history before the regular sync.
        // Runs BEFORE the plan-throttle continues so a sparse account always
        // gets its historical data even when today's metric already exists.
        const have = await this.prisma.instagramAccountMetrics.count({
          where: { socialAccountId: account.id },
        });
        if (have < InstagramSyncService.BACKFILL_THRESHOLD_DAYS) {
          await this.backfillAccount(account, 90);
        }

        // plan throttle for the daily sync only:
        if (plan === 'FREE') {
          // Account metrics only, once per day.
          if (await this.hasMetricsForToday(account.id)) continue;
        } else if (plan === 'PRO') {
          // Account + media, but skip if synced within the last 6 hours.
          if (await this.syncedWithin(account.id, SIX_HOURS_MS)) continue;
        }
        // ENTERPRISE: hourly, account + media.

        await this.syncAccount(account, this.planAllowsMedia(plan));
      } catch (error) {
        this.logger.error(
          `Scheduled IG sync failed for account ${account.id}: ${error}`,
        );
        // syncAccount already reports IG_TOKEN_EXPIRED for auth errors —
        // don't double-notify with a generic failure for the same cause.
        if (this.isAuthError(error)) continue;
        const webUrl = (
          this.config.get<string>('WEB_URL') || 'http://localhost:5173'
        ).replace(/\/$/, '');
        await this.notifier.report({
          organizationId: account.organizationId,
          cronName: 'instagram-sync',
          resourceType: 'SocialAccount',
          resourceId: account.id,
          resourceLabel: account.accountName,
          errorCode: 'INSTAGRAM_SYNC_FAILED',
          error: error instanceof Error ? error.message : String(error),
          actionUrl: `${webUrl}/settings/integrations`,
        });
      }
    }
  }

  /** Manual sync entry point. */
  async triggerManualSync(account: {
    id: string;
    organizationId: string;
    accountName: string;
    encryptedTokens: string;
    scopes?: string[];
  }): Promise<SyncAccountResult> {
    return this.syncAccount(account, true);
  }

  // ---------------------------------------------------------------------------

  /**
   * Plan → media decision. FREE syncs account metrics only; PRO/ENTERPRISE also
   * pull media insights. Public so the manual-sync path (InstagramService) can
   * apply the same throttle as the cron.
   */
  planAllowsMedia(plan: string): boolean {
    return plan !== 'FREE';
  }

  /** engagement = (likes + comments + saved) / reach; null when reach falsy. */
  private computeEngagementRate(
    likeCount: number | null,
    commentsCount: number | null,
    saved: number | null,
    reach: number | null,
  ): number | null {
    if (!reach) return null;
    const interactions =
      (likeCount ?? 0) + (commentsCount ?? 0) + (saved ?? 0);
    return interactions / reach;
  }

  private truncateToDate(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async hasMetricsForToday(socialAccountId: string): Promise<boolean> {
    const today = this.truncateToDate(new Date());
    const existing = await this.prisma.instagramAccountMetrics.findUnique({
      where: { socialAccountId_date: { socialAccountId, date: today } },
    });
    return !!existing;
  }

  /** True if the newest media was synced within `windowMs`. */
  private async syncedWithin(
    socialAccountId: string,
    windowMs: number,
  ): Promise<boolean> {
    const latest = await this.prisma.instagramMedia.findFirst({
      where: { socialAccountId },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });
    if (!latest?.lastSyncedAt) return false;
    return Date.now() - new Date(latest.lastSyncedAt).getTime() < windowMs;
  }

  /** Heuristic: does the thrown error look like an expired/invalid token? */
  private isAuthError(error: unknown): boolean {
    const e = error as any;
    if (!e) return false;
    if (error instanceof InstagramAuthError) return true;
    if (e.status === 401 || e.statusCode === 401) return true;
    const body = e.response?.data?.error ?? e.error ?? e;
    if (body?.code === 190) return true;
    if (body?.type === 'OAuthException') return true;
    const msg = e instanceof Error ? e.message : String(e);
    return /OAuthException|invalid.*token|token.*expired|\b401\b/i.test(msg);
  }

  private async handleAuthError(
    account: { id: string; organizationId: string; accountName: string },
    error: unknown,
  ): Promise<void> {
    this.logger.warn(
      `IG token invalid for account ${account.id} — marking REAUTH_REQUIRED`,
    );
    await this.prisma.socialAccount
      .update({
        where: { id: account.id },
        data: { status: 'REAUTH_REQUIRED' },
      })
      .catch(() => {});

    const webUrl = (
      this.config.get<string>('WEB_URL') || 'http://localhost:5173'
    ).replace(/\/$/, '');
    await this.notifier.report({
      organizationId: account.organizationId,
      cronName: 'instagram-sync',
      resourceType: 'SocialAccount',
      resourceId: account.id,
      resourceLabel: account.accountName,
      errorCode: 'IG_TOKEN_EXPIRED',
      error: error instanceof Error ? error.message : String(error),
      actionUrl: `${webUrl}/settings/integrations`,
    });
  }
}
