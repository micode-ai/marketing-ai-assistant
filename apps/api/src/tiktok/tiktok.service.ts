import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TikTokSyncService } from './tiktok-sync.service';
import { TikTokAccount } from './tiktok-token.service';
import {
  resolveProjectSocialAccount,
  listProjectSocialAccounts,
  toAccountOptions,
} from '../common/resolve-social-account.util';

/** Analytics needs both scopes: profile counters and the video list. */
const STATS_SCOPES = ['user.info.stats', 'video.list'];

const SKIP_IF_RECENT_MS = 10 * 60 * 1000; // 10 minutes

interface ResolvedAccount extends TikTokAccount {
  accountName: string;
  accountId: string;
  scopes: string[];
}

@Injectable()
export class TikTokService {
  private readonly logger = new Logger(TikTokService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: TikTokSyncService,
  ) {}

  /**
   * Resolve the TIKTOK SocialAccount linked to a project via
   * ProjectSocialAccount. ProjectAccessGuard has already authorized the caller
   * for the project; the account is still filtered by the project's org.
   */
  private async resolveAccount(
    projectId: string,
    accountId?: string,
  ): Promise<ResolvedAccount | null> {
    return (await resolveProjectSocialAccount(
      this.prisma,
      projectId,
      'TIKTOK',
      accountId,
    )) as ResolvedAccount | null;
  }

  /** Accounts of this channel linked to the project, for the dashboard switcher. */
  private async listAccounts(projectId: string) {
    return toAccountOptions(await listProjectSocialAccounts(this.prisma, projectId, 'TIKTOK'));
  }

  async getStatus(projectId: string, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    const accounts = await this.listAccounts(projectId);
    if (!account) {
      // accounts still travels: a request naming an account that is not linked
      // must let the dashboard recover, not just say "not connected".
      return { connected: false, statsGranted: false, accounts, selectedAccountId: null };
    }

    return {
      connected: true,
      accountName: account.accountName,
      accountId: account.accountId,
      lastSyncAt: await this.getLastSyncAt(account.id),
      statsGranted: STATS_SCOPES.every((s) => account.scopes?.includes(s)),
      accounts,
      // Our SocialAccount id, not the platform's — that one is accountId above.
      selectedAccountId: account.id,
    };
  }

  /**
   * Snapshots for the window plus the best/worst videos posted in it.
   *
   * There is no `periodTotals` counterpart to the Threads/Instagram response:
   * TikTok has no aggregate-over-a-window endpoint. Each `account` row is a
   * cumulative snapshot, so the client derives period figures as last − first —
   * summing the rows would count the same lifetime views once per day.
   */
  async getMetrics(projectId: string, days: number, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    if (!account) {
      return { account: [], topPosts: [], worstPosts: [] };
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const snapshots = await this.prisma.tikTokAccountMetrics.findMany({
      where: { socialAccountId: account.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Videos are windowed to the requested period and de-duplicated: worstPosts
    // excludes anything already in topPosts so a small account doesn't list the
    // same video under both Best and Worst.
    const rated = await this.prisma.tikTokMedia.findMany({
      where: {
        socialAccountId: account.id,
        engagementRate: { not: null },
        timestamp: { gte: since },
      },
      orderBy: { engagementRate: 'desc' },
    });

    const topPosts = rated.slice(0, 5);
    const topIds = new Set(topPosts.map((m) => m.tiktokVideoId));
    const worstPosts = [...rated]
      .reverse()
      .filter((m) => !topIds.has(m.tiktokVideoId))
      .slice(0, 5);

    return {
      account: snapshots.map((m) => ({
        date: m.date,
        followersCount: m.followersCount,
        followingCount: m.followingCount,
        likesCount: m.likesCount,
        videoCount: m.videoCount,
        views: m.views,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
      })),
      topPosts,
      worstPosts,
    };
  }

  async triggerSync(projectId: string, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    if (!account) {
      throw new BadRequestException('TikTok not connected');
    }

    // getLastSyncAt, not the snapshot's createdAt: there is one snapshot row per
    // day and later syncs only update it, so createdAt freezes at the first sync
    // of the day and the guard stops guarding. An open dashboard polls every five
    // minutes, so this used to hit TikTok all day and bypass the plan throttle.
    const lastSyncAt = await this.getLastSyncAt(account.id);

    if (lastSyncAt && Date.now() - lastSyncAt.getTime() < SKIP_IF_RECENT_MS) {
      return { skipped: true };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: account.organizationId },
      include: { subscription: true },
    });
    const plan = org?.subscription?.plan || 'FREE';

    const result = await this.syncService.syncAccount(
      account,
      this.syncService.planAllowsMedia(plan),
    );
    return { skipped: false, ...result };
  }

  async generateAdvice(projectId: string, language: string, accountId?: string) {
    const account = await this.resolveAccount(projectId, accountId);
    if (!account) {
      throw new BadRequestException('TikTok not connected');
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
      response = await fetch(`${agentUrl}/generate-tiktok-advice`, {
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
      this.logger.error(`TikTok advice request failed: ${error}`);
      throw new BadRequestException('Failed to reach the AI agent');
    }

    if (!response.ok) {
      this.logger.error(`TikTok advice agent returned ${response.status}`);
      throw new BadRequestException('AI agent returned an error');
    }

    const data = (await response.json()) as { advice: string; contextSummary?: string };

    // Persist the latest non-empty advice so the card survives page re-entry.
    // Failures are swallowed — generation still returns normally.
    const now = new Date();
    if (data.advice) {
      try {
        await this.prisma.aiAdvice.upsert({
          where: { projectId_channel: { projectId, channel: 'tiktok' } },
          create: {
            projectId,
            channel: 'tiktok',
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
        this.logger.warn(`TikTok advice persist failed for project ${projectId}: ${error}`);
      }
    }

    return {
      advice: data.advice,
      contextSummary: data.contextSummary,
      generatedAt: now.getTime(),
    };
  }

  /** Last persisted TikTok advice for a project, or nulls when none exists. */
  async getStoredAdvice(projectId: string): Promise<{
    advice: string | null;
    contextSummary: string | null;
    generatedAt: number | null;
  }> {
    const row = await this.prisma.aiAdvice.findUnique({
      where: { projectId_channel: { projectId, channel: 'tiktok' } },
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

  /** Most recent sync timestamp: newest snapshot createdAt or video lastSyncedAt. */
  private async getLastSyncAt(socialAccountId: string): Promise<Date | null> {
    const [metric, media] = await Promise.all([
      this.prisma.tikTokAccountMetrics.findFirst({
        where: { socialAccountId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.tikTokMedia.findFirst({
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
