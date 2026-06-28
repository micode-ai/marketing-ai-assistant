import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ThreadsSyncService } from './threads-sync.service';

const INSIGHTS_SCOPE = 'threads_manage_insights';
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
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: ThreadsSyncService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the THREADS SocialAccount linked to a project via
   * ProjectSocialAccount. The org is derived from the project (ProjectAccessGuard
   * has already authorized the caller for it), and the Threads account is still
   * filtered by the project's org for safety.
   */
  private async resolveAccount(
    projectId: string,
  ): Promise<ResolvedAccount | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) return null;

    const links = await this.prisma.projectSocialAccount.findMany({
      where: { projectId },
      include: {
        socialAccount: {
          select: {
            id: true,
            organizationId: true,
            platform: true,
            accountName: true,
            accountId: true,
            encryptedTokens: true,
            scopes: true,
          },
        },
      },
    });

    const link = links.find(
      (l) =>
        l.socialAccount.platform === 'THREADS' &&
        l.socialAccount.organizationId === project.organizationId,
    );

    return link ? (link.socialAccount as ResolvedAccount) : null;
  }

  async getStatus(projectId: string) {
    const account = await this.resolveAccount(projectId);
    if (!account) {
      return { connected: false, insightsGranted: false };
    }

    const lastSyncAt = await this.getLastSyncAt(account.id);

    return {
      connected: true,
      accountName: account.accountName,
      accountId: account.accountId,
      lastSyncAt,
      insightsGranted: account.scopes?.includes(INSIGHTS_SCOPE) ?? false,
    };
  }

  async getMetrics(projectId: string, days: number) {
    const account = await this.resolveAccount(projectId);
    if (!account) {
      return { account: [], topPosts: [], worstPosts: [] };
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const accountMetrics = await this.prisma.threadsAccountMetrics.findMany({
      where: { socialAccountId: account.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Post tables are windowed to the requested period and de-duplicated:
    // worstPosts excludes anything already shown in topPosts so small accounts
    // don't list the same post under both Best and Worst.
    const ratedMedia = await this.prisma.threadsMedia.findMany({
      where: {
        socialAccountId: account.id,
        engagementRate: { not: null },
        timestamp: { gte: since },
      },
      orderBy: { engagementRate: 'desc' },
    });

    const topPosts = ratedMedia.slice(0, 5);
    const topIds = new Set(topPosts.map((m) => m.threadsMediaId));
    const worstPosts = [...ratedMedia]
      .reverse()
      .filter((m) => !topIds.has(m.threadsMediaId))
      .slice(0, 5);

    return {
      account: accountMetrics.map((m) => ({
        date: m.date,
        followersCount: m.followersCount,
        views: m.views,
        likes: m.likes,
        replies: m.replies,
        reposts: m.reposts,
        quotes: m.quotes,
      })),
      topPosts,
      worstPosts,
    };
  }

  async triggerSync(projectId: string) {
    const account = await this.resolveAccount(projectId);
    if (!account) {
      throw new BadRequestException('Threads not connected');
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
    const have = await this.prisma.threadsAccountMetrics.count({
      where: { socialAccountId: account.id },
    });
    if (have < ThreadsSyncService.BACKFILL_THRESHOLD_DAYS) {
      await this.syncService.backfillAccount(account, 90);
    }

    const newest = await this.prisma.threadsAccountMetrics.findFirst({
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

  async generateAdvice(projectId: string, language: string) {
    const account = await this.resolveAccount(projectId);
    if (!account) {
      throw new BadRequestException('Threads not connected');
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
      response = await fetch(`${agentUrl}/generate-threads-advice`, {
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
      this.logger.error(`Threads advice request failed: ${error}`);
      throw new BadRequestException('Failed to reach the AI agent');
    }

    if (!response.ok) {
      this.logger.error(
        `Threads advice agent returned ${response.status}`,
      );
      throw new BadRequestException('AI agent returned an error');
    }

    const data = (await response.json()) as {
      advice: string;
      contextSummary?: string;
    };

    return {
      advice: data.advice,
      contextSummary: data.contextSummary,
    };
  }

  /** Most recent sync timestamp: max account-metric createdAt or media lastSyncedAt. */
  private async getLastSyncAt(
    socialAccountId: string,
  ): Promise<Date | null> {
    const [metric, media] = await Promise.all([
      this.prisma.threadsAccountMetrics.findFirst({
        where: { socialAccountId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.threadsMedia.findFirst({
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
