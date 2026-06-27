import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { InstagramSyncService } from './instagram-sync.service';

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
   * ProjectSocialAccount, scoped to the caller's organization.
   */
  private async resolveAccount(
    projectId: string,
    organizationId: string,
  ): Promise<ResolvedAccount | null> {
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
        l.socialAccount.platform === 'INSTAGRAM' &&
        l.socialAccount.organizationId === organizationId,
    );

    return link ? (link.socialAccount as ResolvedAccount) : null;
  }

  async getStatus(projectId: string, organizationId: string) {
    const account = await this.resolveAccount(projectId, organizationId);
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

  async getMetrics(projectId: string, organizationId: string, days: number) {
    const account = await this.resolveAccount(projectId, organizationId);
    if (!account) {
      return { account: [], topPosts: [], worstPosts: [] };
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const accountMetrics = await this.prisma.instagramAccountMetrics.findMany({
      where: { socialAccountId: account.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    const [topPosts, worstPosts] = await Promise.all([
      this.prisma.instagramMedia.findMany({
        where: { socialAccountId: account.id, engagementRate: { not: null } },
        orderBy: { engagementRate: 'desc' },
        take: 5,
      }),
      this.prisma.instagramMedia.findMany({
        where: { socialAccountId: account.id, engagementRate: { not: null } },
        orderBy: { engagementRate: 'asc' },
        take: 5,
      }),
    ]);

    return {
      account: accountMetrics.map((m) => ({
        date: m.date,
        followersCount: m.followersCount,
        reach: m.reach,
        views: m.views,
        accountsEngaged: m.accountsEngaged,
        totalInteractions: m.totalInteractions,
      })),
      topPosts,
      worstPosts,
    };
  }

  async triggerSync(projectId: string, organizationId: string) {
    const account = await this.resolveAccount(projectId, organizationId);
    if (!account) {
      throw new BadRequestException('Instagram not connected');
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

    const result = await this.syncService.syncAccount(account);
    return { skipped: false, ...result };
  }

  async generateAdvice(
    projectId: string,
    organizationId: string,
    language: string,
  ) {
    const account = await this.resolveAccount(projectId, organizationId);
    if (!account) {
      throw new BadRequestException('Instagram not connected');
    }

    const [metrics, project] = await Promise.all([
      this.getMetrics(projectId, organizationId, 28),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, industry: true },
      }),
    ]);

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';

    let response: Response;
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
