import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { InstagramSyncService } from './instagram-sync.service';
import { decryptData } from '../common/crypto.util';
import { fetchAccountInsightsTotals, AccountInsights } from './instagram-graph.util';
import { buildStoriesBlock, StoryMetricRow } from './stories.util';
import {
  resolveProjectSocialAccount,
  listProjectSocialAccounts,
  toAccountOptions,
} from '../common/resolve-social-account.util';

const INSIGHTS_SCOPE = 'instagram_business_manage_insights';
const SKIP_IF_RECENT_MS = 10 * 60 * 1000; // 10 minutes

interface ResolvedAccount {
  id: string;
  organizationId: string;
  accountName: string;
  accountId: string;
  encryptedTokens: string;
  scopes: string[];
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: InstagramSyncService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the INSTAGRAM SocialAccount linked to a project via
   * ProjectSocialAccount. The org is derived from the project (ProjectAccessGuard
   * has already authorized the caller for it), and the IG account is still
   * filtered by the project's org for safety.
   */
  private async resolveAccount(
    projectId: string,
    accountId?: string,
  ): Promise<ResolvedAccount | null> {
    return (await resolveProjectSocialAccount(
      this.prisma,
      projectId,
      'INSTAGRAM',
      accountId,
    )) as ResolvedAccount | null;
  }

  /** Accounts of this channel linked to the project, for the dashboard switcher. */
  private async listAccounts(projectId: string) {
    return toAccountOptions(await listProjectSocialAccounts(this.prisma, projectId, 'INSTAGRAM'));
  }

  async getStatus(projectId: string, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    const accounts = await this.listAccounts(projectId);
    if (!account) {
      // accounts still travels: a request naming an account that is not linked
      // must let the dashboard recover, not just say "not connected".
      return { connected: false, insightsGranted: false, accounts, selectedAccountId: null };
    }

    const lastSyncAt = await this.getLastSyncAt(account.id);

    return {
      connected: true,
      accountName: account.accountName,
      accountId: account.accountId,
      lastSyncAt,
      insightsGranted: account.scopes?.includes(INSIGHTS_SCOPE) ?? false,
      accounts,
      // Our SocialAccount id, not the platform's — that one is accountId above.
      selectedAccountId: account.id,
    };
  }

  async getMetrics(projectId: string, days: number, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    if (!account) {
      return {
        account: [],
        topPosts: [],
        worstPosts: [],
        recentPosts: [],
        periodTotals: {},
        stories: {
          list: [],
          summary: { count: 0, avgReach: 0, avgReplies: 0, avgCompletion: null },
          daily: [],
        },
      };
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const accountMetrics = await this.prisma.instagramAccountMetrics.findMany({
      where: { socialAccountId: account.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Post tables are windowed to the requested period and de-duplicated:
    // worstPosts excludes anything already shown in topPosts so small accounts
    // don't list the same post under both Best and Worst.
    const ratedMedia = await this.prisma.instagramMedia.findMany({
      where: {
        socialAccountId: account.id,
        engagementRate: { not: null },
        timestamp: { gte: since },
      },
      orderBy: { engagementRate: 'desc' },
    });

    const topPosts = ratedMedia.slice(0, 5);
    const topIds = new Set(topPosts.map((m) => m.igMediaId));
    const worstPosts = [...ratedMedia]
      .reverse()
      .filter((m) => !topIds.has(m.igMediaId))
      .slice(0, 5);

    // Per-post likes/comments for the engagement chart. Unlike the rated tables
    // this is NOT filtered by engagementRate — a post with likes but no reach
    // insight still belongs on a likes chart. Newest-first from the DB (so the
    // cap keeps the most recent posts), then reversed to chronological order.
    const recentMedia = await this.prisma.instagramMedia.findMany({
      where: { socialAccountId: account.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: {
        igMediaId: true,
        mediaType: true,
        caption: true,
        permalink: true,
        timestamp: true,
        likeCount: true,
        commentsCount: true,
      },
    });
    const recentPosts = [...recentMedia].reverse();

    // Stories snapshots windowed to the requested period (newest first).
    const storyRows = await this.prisma.instagramStory.findMany({
      where: { socialAccountId: account.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
    });
    const stories = buildStoriesBlock(storyRows as StoryMetricRow[]);

    // Fetch aggregate period totals (metric_type=total_value over the window).
    // Any failure is swallowed — periodTotals is supplementary data.
    let periodTotals: AccountInsights = {};
    try {
      const tokens = decryptData(
        account.encryptedTokens,
        this.config.get<string>('ENCRYPTION_KEY', ''),
      );
      if (tokens?.accessToken && tokens?.igUserId) {
        const now = new Date();
        const until = Math.floor(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
        );
        const sinceUnix = until - days * 86400;
        periodTotals = await fetchAccountInsightsTotals(
          tokens.igUserId,
          tokens.accessToken,
          sinceUnix,
          until,
        );
      }
    } catch (e) {
      this.logger.warn(`IG periodTotals failed for project ${projectId}: ${e}`);
      periodTotals = {};
    }

    return {
      account: accountMetrics.map((m) => ({
        date: m.date,
        followersCount: m.followersCount,
        reach: m.reach,
        views: m.views,
        likes: m.likes,
        accountsEngaged: m.accountsEngaged,
        totalInteractions: m.totalInteractions,
      })),
      topPosts,
      worstPosts,
      recentPosts,
      periodTotals,
      stories,
    };
  }

  async triggerSync(projectId: string, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    if (!account) {
      throw new BadRequestException('Instagram not connected');
    }

    // Apply the same plan throttle as the cron: FREE pulls account metrics only.
    const org = await this.prisma.organization.findUnique({
      where: { id: account.organizationId },
      include: { subscription: true },
    });
    const plan = org?.subscription?.plan || 'FREE';
    const withMedia = this.syncService.planAllowsMedia(plan);

    // Self-healing backfill: runs BEFORE the skip-if-recent guard so a sparse
    // account (count < threshold) always gets its 90-day history even when the
    // page was visited very recently and "today" already has a metric row.
    const have = await this.prisma.instagramAccountMetrics.count({
      where: { socialAccountId: account.id },
    });
    if (have < InstagramSyncService.BACKFILL_THRESHOLD_DAYS) {
      await this.syncService.backfillAccount(account, 90);
    }

    const newest = await this.prisma.instagramAccountMetrics.findFirst({
      where: { socialAccountId: account.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (
      newest?.createdAt &&
      Date.now() - new Date(newest.createdAt).getTime() < SKIP_IF_RECENT_MS
    ) {
      return { skipped: true };
    }

    const result = await this.syncService.syncAccount(account, withMedia);
    return { skipped: false, ...result };
  }

  async generateAdvice(projectId: string, language: string, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    if (!account) {
      throw new BadRequestException('Instagram not connected');
    }

    const [metrics, project] = await Promise.all([
      this.getMetrics(projectId, 28),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, industry: true },
      }),
    ]);

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${agentUrl}/generate-instagram-advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          projectName: project?.name ?? null,
          industry: project?.industry ?? null,
          account: metrics.account,
          topPosts: metrics.topPosts,
          worstPosts: metrics.worstPosts,
        }),
      });
    } catch (error) {
      this.logger.error(`Instagram advice request failed: ${error}`);
      throw new BadRequestException('Failed to reach the AI agent');
    }

    if (!response.ok) {
      this.logger.error(
        `Instagram advice agent returned ${response.status}`,
      );
      throw new BadRequestException('AI agent returned an error');
    }

    const data = (await response.json()) as {
      advice: string;
      contextSummary?: string;
    };

    // Persist the latest non-empty advice so the card survives page re-entry,
    // tab switches, and reloads. Failures are swallowed — generation still
    // returns normally.
    const now = new Date();
    if (data.advice) {
      try {
        await this.prisma.aiAdvice.upsert({
          where: { projectId_channel: { projectId, channel: 'instagram' } },
          create: {
            projectId,
            channel: 'instagram',
            advice: data.advice,
            contextSummary: data.contextSummary ?? null,
            language,
            generatedAt: now,
          },
          update: {
            advice: data.advice,
            contextSummary: data.contextSummary ?? null,
            language,
            generatedAt: now,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Instagram advice persist failed for project ${projectId}: ${error}`,
        );
      }
    }

    return {
      advice: data.advice,
      contextSummary: data.contextSummary,
      generatedAt: now.getTime(),
    };
  }

  /**
   * Returns the last persisted Instagram advice for a project (or nulls if none
   * has been generated yet). Used to restore the advice card on page entry.
   */
  async getStoredAdvice(projectId: string): Promise<{
    advice: string | null;
    contextSummary: string | null;
    generatedAt: number | null;
  }> {
    const row = await this.prisma.aiAdvice.findUnique({
      where: { projectId_channel: { projectId, channel: 'instagram' } },
    });
    if (!row) {
      return { advice: null, contextSummary: null, generatedAt: null };
    }
    return {
      advice: row.advice,
      contextSummary: row.contextSummary ?? null,
      generatedAt: row.generatedAt.getTime(),
    };
  }

  /** Most recent sync timestamp: max account-metric createdAt or media lastSyncedAt. */
  private async getLastSyncAt(
    socialAccountId: string,
  ): Promise<Date | null> {
    const [metric, media] = await Promise.all([
      this.prisma.instagramAccountMetrics.findFirst({
        where: { socialAccountId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.instagramMedia.findFirst({
        where: { socialAccountId },
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      }),
    ]);

    const candidates: Date[] = [];
    if (metric?.createdAt) candidates.push(new Date(metric.createdAt));
    if (media?.lastSyncedAt) candidates.push(new Date(media.lastSyncedAt));
    if (candidates.length === 0) return null;

    return candidates.reduce((a, b) => (a > b ? a : b));
  }
}
