import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import { decryptData } from '../common/crypto.util';
import {
  fetchThreadsProfile,
  fetchThreadsAccountInsights,
  fetchThreadsAccountInsightsRange,
  fetchThreadsMediaList,
  fetchThreadsMediaInsights,
  ThreadsAuthError,
  DailyThreadsInsightRow,
} from './threads-graph.util';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export interface SyncAccountResult {
  accountSynced: boolean;
  mediaSynced: number;
}

/**
 * Pulls Threads account- and media-level metrics from graph.threads.net
 * using the per-account long-lived token stored on `SocialAccount`.
 * Mirrors `instagram-sync.service.ts`: hourly cron, plan throttling,
 * per-account try/catch, CronFailureNotifier on failure.
 */
@Injectable()
export class ThreadsSyncService {
  private readonly logger = new Logger(ThreadsSyncService.name);

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
    let threadsUserId: string | undefined;
    try {
      const tokens = decryptData(
        account.encryptedTokens,
        this.config.get<string>('ENCRYPTION_KEY', ''),
      );
      accessToken = tokens?.accessToken;
      threadsUserId = tokens?.threadsUserId;
    } catch (e) {
      this.logger.warn(
        `Failed to decrypt tokens for Threads account ${account.id}: ${e}`,
      );
      return { accountSynced: false, mediaSynced: 0 };
    }

    if (!accessToken || !threadsUserId) {
      this.logger.warn(
        `Threads account ${account.id} missing accessToken/threadsUserId — skipping`,
      );
      return { accountSynced: false, mediaSynced: 0 };
    }

    try {
      // --- Account metrics ---
      const [profile, insights] = await Promise.all([
        fetchThreadsProfile(threadsUserId, accessToken),
        fetchThreadsAccountInsights(threadsUserId, accessToken),
      ]);

      const today = this.truncateToDate(new Date());
      const accountData = {
        followersCount: profile.followersCount ?? insights.followersCount ?? null,
        views: insights.views ?? null,
        likes: insights.likes ?? null,
        replies: insights.replies ?? null,
        reposts: insights.reposts ?? null,
        quotes: insights.quotes ?? null,
      };

      await this.prisma.threadsAccountMetrics.upsert({
        where: {
          socialAccountId_date: { socialAccountId: account.id, date: today },
        },
        create: { socialAccountId: account.id, date: today, ...accountData },
        update: accountData,
      });

      let mediaSynced = 0;

      // --- Media metrics ---
      if (withMedia) {
        const mediaList = await fetchThreadsMediaList(
          threadsUserId,
          accessToken,
          25,
        );
        for (const media of mediaList) {
          const mediaInsights = await fetchThreadsMediaInsights(
            media.id,
            accessToken,
          );

          const views = mediaInsights.views ?? null;
          const likes = mediaInsights.likes ?? null;
          const replies = mediaInsights.replies ?? null;
          const reposts = mediaInsights.reposts ?? null;
          const quotes = mediaInsights.quotes ?? null;
          const shares = mediaInsights.shares ?? null;

          const interactions =
            (likes ?? 0) +
            (replies ?? 0) +
            (reposts ?? 0) +
            (quotes ?? 0) +
            (shares ?? 0);
          const engagementRate =
            views && views > 0 ? interactions / views : null;

          const mediaData = {
            mediaType: media.mediaType,
            text: media.text ?? null,
            permalink: media.permalink ?? null,
            timestamp: new Date(media.timestamp),
            views,
            likes,
            replies,
            reposts,
            quotes,
            shares,
            engagementRate,
            lastSyncedAt: new Date(),
          };

          await this.prisma.threadsMedia.upsert({
            where: {
              socialAccountId_threadsMediaId: {
                socialAccountId: account.id,
                threadsMediaId: media.id,
              },
            },
            create: {
              socialAccountId: account.id,
              threadsMediaId: media.id,
              ...mediaData,
            },
            update: mediaData,
          });
          mediaSynced++;
        }
      }

      this.logger.log(
        `Synced Threads account ${account.id} (media: ${mediaSynced})`,
      );
      return { accountSynced: true, mediaSynced };
    } catch (error) {
      if (error instanceof ThreadsAuthError) {
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
    let threadsUserId: string | undefined;
    try {
      const tokens = decryptData(
        account.encryptedTokens,
        this.config.get<string>('ENCRYPTION_KEY', ''),
      );
      accessToken = tokens?.accessToken;
      threadsUserId = tokens?.threadsUserId;
    } catch (e) {
      this.logger.warn(
        `Failed to decrypt tokens for Threads account ${account.id} during backfill: ${e}`,
      );
      return { daysWritten: 0 };
    }

    if (!accessToken || !threadsUserId) {
      this.logger.warn(
        `Threads account ${account.id} missing accessToken/threadsUserId — skipping backfill`,
      );
      return { daysWritten: 0 };
    }

    const until = Math.floor(this.truncateToDate(new Date()).getTime() / 1000);
    const since = until - days * 86400;

    let rows: DailyThreadsInsightRow[];
    try {
      rows = await fetchThreadsAccountInsightsRange(threadsUserId, accessToken, since, until);
    } catch (e) {
      if (e instanceof ThreadsAuthError) {
        await this.handleAuthError(account, e);
      }
      throw e;
    }

    for (const row of rows) {
      const date = new Date(row.date);
      await this.prisma.threadsAccountMetrics.upsert({
        where: {
          socialAccountId_date: { socialAccountId: account.id, date },
        },
        create: {
          socialAccountId: account.id,
          date,
          views: row.views ?? null,
          likes: row.likes ?? null,
          replies: row.replies ?? null,
          reposts: row.reposts ?? null,
          quotes: row.quotes ?? null,
        },
        // `?? undefined` (not null) on update: a metric the range didn't return
        // must NOT overwrite a value an existing day already has. Backfill only
        // fills gaps; it never destroys data from the daily total_value sync.
        update: {
          views: row.views ?? undefined,
          likes: row.likes ?? undefined,
          replies: row.replies ?? undefined,
          reposts: row.reposts ?? undefined,
          quotes: row.quotes ?? undefined,
        },
      });
    }

    this.logger.log(`Backfilled Threads account ${account.id} (${rows.length} days)`);
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
    this.logger.log('Starting scheduled Threads sync');

    const accounts = await this.prisma.socialAccount.findMany({
      where: { platform: 'THREADS', status: 'ACTIVE' },
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
        const have = await this.prisma.threadsAccountMetrics.count({
          where: { socialAccountId: account.id },
        });
        if (have < ThreadsSyncService.BACKFILL_THRESHOLD_DAYS) {
          await this.backfillAccount(account, 90);
        }

        // Plan throttle for the daily sync only:
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
          `Scheduled Threads sync failed for account ${account.id}: ${error}`,
        );
        // syncAccount already reports THREADS_TOKEN_EXPIRED for auth errors —
        // don't double-notify with a generic failure for the same cause.
        if (error instanceof ThreadsAuthError) continue;
        const webUrl = (
          this.config.get<string>('WEB_URL') || 'http://localhost:5173'
        ).replace(/\/$/, '');
        await this.notifier.report({
          organizationId: account.organizationId,
          cronName: 'threads-sync',
          resourceType: 'SocialAccount',
          resourceId: account.id,
          resourceLabel: account.accountName,
          errorCode: 'THREADS_SYNC_FAILED',
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
   * Plan → media decision. Per-post analytics (media insights) are available on
   * every plan; plans differ only in sync frequency (the throttle in handleCron:
   * FREE once/day, PRO every 6h, ENTERPRISE hourly). Public so manual-sync paths
   * can apply the same decision as the cron.
   */
  planAllowsMedia(_plan: string): boolean {
    return true;
  }

  private truncateToDate(d: Date): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  private async hasMetricsForToday(socialAccountId: string): Promise<boolean> {
    const today = this.truncateToDate(new Date());
    const existing = await this.prisma.threadsAccountMetrics.findUnique({
      where: { socialAccountId_date: { socialAccountId, date: today } },
    });
    return !!existing;
  }

  /** True if the newest media was synced within `windowMs`. */
  private async syncedWithin(
    socialAccountId: string,
    windowMs: number,
  ): Promise<boolean> {
    const latest = await this.prisma.threadsMedia.findFirst({
      where: { socialAccountId },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });
    if (!latest?.lastSyncedAt) return false;
    return Date.now() - new Date(latest.lastSyncedAt).getTime() < windowMs;
  }

  private async handleAuthError(
    account: { id: string; organizationId: string; accountName: string },
    error: unknown,
  ): Promise<void> {
    this.logger.warn(
      `Threads token invalid for account ${account.id} — marking REAUTH_REQUIRED`,
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
      cronName: 'threads-sync',
      resourceType: 'SocialAccount',
      resourceId: account.id,
      resourceLabel: account.accountName,
      errorCode: 'THREADS_TOKEN_EXPIRED',
      error: error instanceof Error ? error.message : String(error),
      actionUrl: `${webUrl}/settings/integrations`,
    });
  }
}
