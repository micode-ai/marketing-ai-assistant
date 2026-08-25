import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import {
  buildChannelDigest,
  EMPTY_CHANNEL_DIGEST,
  SocialChannelDigest,
} from './social-digest.util';
import { buildSeoDigest, SeoDigest } from './seo-digest.util';
import { buildEmailDigest, EmailDigest } from './email-digest.util';
import { buildAppDigest, AppDigest, EMPTY_APP_DIGEST } from './app-digest.util';

/** Start of the reporting window, snapped to a UTC day boundary. */
function periodStart(days: number): Date {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private notifier: CronFailureNotifier,
    private config: ConfigService,
  ) {}

  async getMetrics(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    days: number | string = 30,
  ) {
    days = Number(days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = { date: { gte: since } };
    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId) {
      // DailyMetrics is project-scoped; find all projects in org
      const projects = await this.prisma.project.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true },
      });
      where.projectId = { in: projects.map(p => p.id) };
    }

    const metrics = await this.prisma.dailyMetrics.findMany({
      where,
      orderBy: { date: 'asc' },
    });
    return metrics;
  }

  async trackEvent(dto: any) {
    let organizationId = dto.organizationId;
    if (!organizationId && dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { organizationId: true },
      });
      organizationId = project?.organizationId;
    }

    return this.prisma.analyticsEvent.create({
      data: {
        projectId: dto.projectId,
        organizationId,
        scope: dto.scope || 'PROJECT',
        campaignId: dto.campaignId,
        type: dto.type as any,
        metadata: dto.metadata || {},
      },
    });
  }

  async getMetricsTotals(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    days: number | string = 30,
  ) {
    days = Number(days) || 30;
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

    const projectFilter: any = {};
    if (scope.projectId) {
      projectFilter.projectId = scope.projectId;
    } else if (scope.organizationId) {
      const projects = await this.prisma.project.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true },
      });
      projectFilter.projectId = { in: projects.map(p => p.id) };
    }

    const [currentRows, previousRows] = await Promise.all([
      this.prisma.dailyMetrics.findMany({
        where: { ...projectFilter, date: { gte: currentStart } },
      }),
      this.prisma.dailyMetrics.findMany({
        where: { ...projectFilter, date: { gte: previousStart, lt: currentStart } },
      }),
    ]);

    type MetricsTotal = Record<string, number>;

    const sumMetrics = (rows: any[]): MetricsTotal => {
      const t: MetricsTotal = { visitors: 0, leads: 0, conversions: 0, emailsSent: 0, emailOpens: 0, emailClicks: 0, socialReach: 0, socialEngagements: 0 };
      for (const row of rows) {
        const m = row.metrics as any;
        for (const key of Object.keys(t)) {
          t[key] += m[key] || 0;
        }
      }
      return t;
    };

    const current = sumMetrics(currentRows);
    const previous = sumMetrics(previousRows);

    const change: Record<string, number> = {};
    const trend: Record<string, string> = {};
    for (const key of Object.keys(current)) {
      const prev = previous[key] || 0;
      const curr = current[key] || 0;
      change[key] = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;
      trend[key] = curr > prev ? 'up' : curr < prev ? 'down' : 'stable';
    }

    return { total: current, change, trend };
  }

  async getSummary(scope: { projectId?: string; organizationId?: string; aggregated?: boolean }) {
    const contentWhere: any = { status: 'PUBLISHED' };
    const campaignWhere: any = { status: 'ACTIVE' };
    const subscriberWhere: any = { status: 'ACTIVE' };
    const checklistWhere: any = { isCompleted: true };

    if (scope.projectId) {
      contentWhere.projectId = scope.projectId;
      campaignWhere.projectId = scope.projectId;
      subscriberWhere.list = { projectId: scope.projectId };
      checklistWhere.checklist = { projectId: scope.projectId };
    } else if (scope.organizationId) {
      contentWhere.organizationId = scope.organizationId;
      campaignWhere.organizationId = scope.organizationId;
      subscriberWhere.list = { organizationId: scope.organizationId };
      checklistWhere.checklist = { organizationId: scope.organizationId };
    }

    const checklistCountWhere: any = {};
    const contentAllWhere: any = {};
    if (scope.projectId) {
      checklistCountWhere.projectId = scope.projectId;
      contentAllWhere.projectId = scope.projectId;
    } else if (scope.organizationId) {
      checklistCountWhere.organizationId = scope.organizationId;
      contentAllWhere.organizationId = scope.organizationId;
    }

    const socialAccountWhere: any = { status: 'ACTIVE' };
    if (scope.projectId) {
      // Social accounts are org-scoped; resolve org from project
      const project = await this.prisma.project.findUnique({ where: { id: scope.projectId }, select: { organizationId: true } });
      if (project) socialAccountWhere.organizationId = project.organizationId;
    } else if (scope.organizationId) {
      socialAccountWhere.organizationId = scope.organizationId;
    }

    const [contentCount, campaignCount, subscriberCount, checklistItems, checklistCount, contentCountAll, socialAccountCount] = await Promise.all([
      this.prisma.content.count({ where: contentWhere }),
      this.prisma.campaign.count({ where: campaignWhere }),
      this.prisma.emailSubscriber.count({ where: subscriberWhere }),
      this.prisma.checklistItem.count({ where: checklistWhere }),
      this.prisma.checklist.count({ where: checklistCountWhere }),
      this.prisma.content.count({ where: contentAllWhere }),
      this.prisma.socialAccount.count({ where: socialAccountWhere }),
    ]);
    return { contentCount, campaignCount, subscriberCount, checklistItems, checklistCount, contentCountAll, socialAccountCount };
  }

  async generateRecommendations(
    projectId: string,
    language: string,
    days = 30,
  ): Promise<{ recommendations: any[]; generatedAt: number; periodDays: number }> {
    // The analytics page has one global period selector and every chart follows
    // it; the recommendations used to ignore it and always compute 30 days, so
    // the cards silently disagreed with the charts above them.
    const periodDays = Number.isFinite(days)
      ? Math.min(Math.max(Math.trunc(days), 1), 365)
      : 30;
    const [
      projectResult,
      metricsTotalsResult,
      funnelResult,
      utmResult,
      contentTotalResult,
      contentPublishedResult,
      campaignCountResult,
      keywordCountResult,
      competitorCountResult,
      emailListCountResult,
      gscKeyResult,
      socialLinksResult,
    ] = await Promise.allSettled([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, industry: true, projectType: true },
      }),
      this.getMetricsTotals({ projectId }, periodDays),
      this.getFunnel({ projectId }, periodDays),
      this.getUtmBreakdown({ projectId }, periodDays),
      this.prisma.content.count({ where: { projectId } }),
      this.prisma.content.count({ where: { projectId, status: 'PUBLISHED' as any } }),
      this.prisma.campaign.count({ where: { projectId } }),
      this.prisma.keyword.count({ where: { projectId } }),
      this.prisma.competitor.count({ where: { projectId } }),
      this.prisma.emailList.count({ where: { projectId } }),
      this.prisma.projectApiKey.findFirst({
        where: { projectId, platform: 'GOOGLE' as any },
        select: { id: true },
      }),
      this.prisma.projectSocialAccount.findMany({
        where: { projectId },
        include: { socialAccount: { select: { id: true, platform: true } } },
      }),
    ]);

    // Log any partial failures but continue with defaults
    const labels = [
      'project', 'metricsTotals', 'funnel', 'utm',
      'contentTotal', 'contentPublished', 'campaigns',
      'keywords', 'competitors', 'emailLists', 'gscKey', 'socialLinks',
    ];
    [
      projectResult, metricsTotalsResult, funnelResult, utmResult,
      contentTotalResult, contentPublishedResult, campaignCountResult,
      keywordCountResult, competitorCountResult, emailListCountResult,
      gscKeyResult, socialLinksResult,
    ].forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.warn(`[recommendations] project=${projectId} partial failure [${labels[i]}]: ${r.reason}`);
      }
    });

    const project = projectResult.status === 'fulfilled' ? projectResult.value : null;
    const metricsTotal = metricsTotalsResult.status === 'fulfilled' ? metricsTotalsResult.value : null;
    const funnel = funnelResult.status === 'fulfilled' ? funnelResult.value : null;
    const utm = utmResult.status === 'fulfilled' ? utmResult.value : null;

    const visitors = metricsTotal?.total.visitors ?? 0;
    const conversions = metricsTotal?.total.conversions ?? 0;
    const conversionRate =
      visitors > 0 ? Number(((conversions / visitors) * 100).toFixed(2)) : 0;

    const funnelSteps = (funnel?.steps ?? []).map((s: any) => ({
      step: s.name as string,
      count: s.count as number,
      dropOffPct: (s.dropOffRate as number) ?? 0,
    }));

    const topUtm = (utm?.sources ?? []).slice(0, 5).map((s: any) => ({
      source: s.name as string,
      medium: '',
      visits: s.visits as number,
      conversionRate: s.conversionRate as number,
    }));

    // GSC: cheap existence check only — clicks/avgPosition skipped (spec §7)
    const gscConnected =
      gscKeyResult.status === 'fulfilled' && gscKeyResult.value !== null;
    this.logger.log(
      `[recommendations] project=${projectId} GSC connected=${gscConnected}; clicks/avgPosition degraded to connected-only flag (spec §7)`,
    );

    const socialLinks =
      socialLinksResult.status === 'fulfilled'
        ? (socialLinksResult.value as any[])
        : [];
    const accountIdsByPlatform = (platform: string): string[] =>
      socialLinks
        .filter((l: any) => l.socialAccount?.platform === platform)
        .map((l: any) => l.socialAccount.id as string);

    const [social, extra] = await Promise.all([
      this.loadSocialDigests(
        projectId,
        {
          instagram: accountIdsByPlatform('INSTAGRAM'),
          threads: accountIdsByPlatform('THREADS'),
          tiktok: accountIdsByPlatform('TIKTOK'),
        },
        periodDays,
      ),
      this.loadOwnedDigests(projectId, periodDays),
    ]);

    const digest = {
      periodDays,
      web: { visitors, conversions, conversionRate },
      funnel: funnelSteps,
      topUtm,
      gsc: { connected: gscConnected },
      instagram: social.instagram,
      threads: social.threads,
      tiktok: social.tiktok,
      seo: extra.seo,
      email: extra.email,
      app: extra.app,
      counts: {
        content: contentTotalResult.status === 'fulfilled' ? contentTotalResult.value : 0,
        contentPublished: contentPublishedResult.status === 'fulfilled' ? contentPublishedResult.value : 0,
        campaigns: campaignCountResult.status === 'fulfilled' ? campaignCountResult.value : 0,
        keywords: keywordCountResult.status === 'fulfilled' ? keywordCountResult.value : 0,
        competitors: competitorCountResult.status === 'fulfilled' ? competitorCountResult.value : 0,
        emailLists: emailListCountResult.status === 'fulfilled' ? emailListCountResult.value : 0,
      },
      projectType: project?.projectType ?? 'WEBSITE',
    };

    const agentUrl = process.env.AI_AGENT_URL || 'http://localhost:3001';

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${agentUrl}/analytics-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project?.name ?? null,
          industry: project?.industry ?? null,
          projectType: project?.projectType ?? null,
          language,
          data: digest,
        }),
      });
    } catch (error) {
      this.logger.error(`Analytics recommendations request failed: ${error}`);
      throw new BadRequestException('Failed to reach the AI agent');
    }

    if (!response.ok) {
      this.logger.error(
        `Analytics recommendations agent returned ${response.status}`,
      );
      throw new BadRequestException('AI agent returned an error');
    }

    const data = (await response.json()) as { recommendations: any[] };
    const recommendations = data.recommendations ?? [];

    // Persist the latest non-empty result so the cards survive page re-entry,
    // reloads, and device/browser changes. Empty responses (e.g. an agent parse
    // failure) are not stored, so a previously good set is never clobbered.
    const now = new Date();
    if (recommendations.length > 0) {
      try {
        await this.prisma.analyticsRecommendation.upsert({
          where: { projectId },
          create: { projectId, recommendations, language, generatedAt: now, periodDays },
          update: { recommendations, language, generatedAt: now, periodDays },
        });
      } catch (error) {
        this.logger.warn(
          `[recommendations] persist failed for project=${projectId}: ${error}`,
        );
      }
    }

    return { recommendations, generatedAt: now.getTime(), periodDays };
  }

  /**
   * Loads the digest blocks that come from our own tables: SEO positions, email
   * activity and Play Console figures.
   *
   * Each block is settled independently — a project with no app should not lose
   * its SEO numbers because the app query failed.
   */
  private async loadOwnedDigests(
    projectId: string,
    periodDays: number,
  ): Promise<{ seo: SeoDigest; email: EmailDigest; app: AppDigest }> {
    const since = periodStart(periodDays);

    const loadSeo = async (): Promise<SeoDigest> => {
      const keywords = await this.prisma.keyword.findMany({
        where: { projectId },
        select: { id: true, keyword: true, currentRank: true, isTracking: true },
      });
      if (keywords.length === 0) return buildSeoDigest([], []);

      const history = await this.prisma.keywordRankHistory.findMany({
        where: { keywordId: { in: keywords.map((k) => k.id) }, date: { gte: since } },
        orderBy: { date: 'asc' },
        select: { keywordId: true, rank: true },
      });
      return buildSeoDigest(keywords, history);
    };

    const loadEmail = async (): Promise<EmailDigest> => {
      const [lists, subscribers, campaigns] = await Promise.all([
        this.prisma.emailList.count({ where: { projectId } }),
        this.prisma.emailSubscriber.count({
          where: { list: { projectId }, status: 'ACTIVE' as any },
        }),
        this.prisma.emailCampaign.findMany({
          where: { list: { projectId }, sentAt: { gte: since } },
          select: { stats: true },
        }),
      ]);
      return buildEmailDigest({ lists, subscribers, campaigns });
    };

    const loadApp = async (): Promise<AppDigest> => {
      // A Play connection is what makes the block meaningful — without it the
      // absence of installs is "not connected", not "nobody installed it".
      const key = await this.prisma.projectApiKey.findFirst({
        where: { projectId, platform: 'GOOGLE_PLAY' as any },
        select: { id: true },
      });
      const [metrics, reviews] = await Promise.all([
        this.prisma.appStoreMetrics.findMany({
          where: { projectId, date: { gte: since } },
          orderBy: { date: 'asc' },
        }),
        this.prisma.appReview.findMany({
          where: { projectId, reviewCreatedAt: { gte: since } },
          select: { starRating: true, isReplied: true },
        }),
      ]);
      const connected = key !== null || metrics.length > 0 || reviews.length > 0;
      return buildAppDigest(metrics, reviews, connected);
    };

    const [seo, email, app] = await Promise.allSettled([loadSeo(), loadEmail(), loadApp()]);

    const warn = (label: string, reason: unknown) =>
      this.logger.warn(`[recommendations] project=${projectId} ${label} failed: ${reason}`);

    if (seo.status === 'rejected') warn('seo', seo.reason);
    if (email.status === 'rejected') warn('email', email.reason);
    if (app.status === 'rejected') warn('app', app.reason);

    return {
      seo: seo.status === 'fulfilled' ? seo.value : buildSeoDigest([], []),
      email:
        email.status === 'fulfilled'
          ? email.value
          : buildEmailDigest({ lists: 0, subscribers: 0, campaigns: [] }),
      app: app.status === 'fulfilled' ? app.value : { ...EMPTY_APP_DIGEST },
    };
  }

  /**
   * Loads the real per-channel figures for the recommendations digest.
   *
   * Followers come from the account snapshots, engagement from the post rows —
   * see `social-digest.util.ts` for why mixing those up would double-count.
   * Each channel is fetched independently so one failing channel degrades to an
   * empty block instead of losing the whole digest.
   */
  private async loadSocialDigests(
    projectId: string,
    ids: { instagram: string[]; threads: string[]; tiktok: string[] },
    periodDays: number,
  ): Promise<{
    instagram: SocialChannelDigest;
    threads: SocialChannelDigest;
    tiktok: SocialChannelDigest;
  }> {
    const since = periodStart(periodDays);

    const snapshotArgs = (accountIds: string[]) => ({
      where: { socialAccountId: { in: accountIds }, date: { gte: since } },
      orderBy: { date: 'asc' as const },
      select: { socialAccountId: true, followersCount: true },
    });
    const postArgs = (accountIds: string[]) => ({
      where: { socialAccountId: { in: accountIds }, timestamp: { gte: since } },
    });

    const load = async (
      platform: 'instagram' | 'threads' | 'tiktok',
    ): Promise<SocialChannelDigest> => {
      const accountIds = ids[platform];
      if (accountIds.length === 0) return { ...EMPTY_CHANNEL_DIGEST };

      if (platform === 'instagram') {
        const [snapshots, media] = await Promise.all([
          this.prisma.instagramAccountMetrics.findMany(snapshotArgs(accountIds)),
          this.prisma.instagramMedia.findMany(postArgs(accountIds)),
        ]);
        return buildChannelDigest({
          accounts: accountIds.length,
          snapshots,
          posts: media.map((m) => ({
            views: m.views,
            likes: m.likeCount,
            comments: m.commentsCount,
            shares: m.shares,
            engagementRate: m.engagementRate,
          })),
        });
      }

      if (platform === 'threads') {
        const [snapshots, media] = await Promise.all([
          this.prisma.threadsAccountMetrics.findMany(snapshotArgs(accountIds)),
          this.prisma.threadsMedia.findMany(postArgs(accountIds)),
        ]);
        return buildChannelDigest({
          accounts: accountIds.length,
          snapshots,
          posts: media.map((m) => ({
            views: m.views,
            likes: m.likes,
            // Threads calls them replies; the digest keeps one vocabulary so the
            // model can compare channels without a glossary.
            comments: m.replies,
            shares: m.shares,
            engagementRate: m.engagementRate,
          })),
        });
      }

      const [snapshots, media] = await Promise.all([
        this.prisma.tikTokAccountMetrics.findMany(snapshotArgs(accountIds)),
        this.prisma.tikTokMedia.findMany(postArgs(accountIds)),
      ]);
      return buildChannelDigest({
        accounts: accountIds.length,
        snapshots,
        posts: media.map((m) => ({
          views: m.viewCount,
          likes: m.likeCount,
          comments: m.commentCount,
          shares: m.shareCount,
          engagementRate: m.engagementRate,
        })),
      });
    };

    const [instagram, threads, tiktok] = await Promise.allSettled([
      load('instagram'),
      load('threads'),
      load('tiktok'),
    ]);

    const unwrap = (
      result: PromiseSettledResult<SocialChannelDigest>,
      label: string,
    ): SocialChannelDigest => {
      if (result.status === 'fulfilled') return result.value;
      this.logger.warn(
        `[recommendations] project=${projectId} ${label} metrics failed: ${result.reason}`,
      );
      return { ...EMPTY_CHANNEL_DIGEST };
    };

    return {
      instagram: unwrap(instagram, 'instagram'),
      threads: unwrap(threads, 'threads'),
      tiktok: unwrap(tiktok, 'tiktok'),
    };
  }

  /**
   * Returns the last persisted AI recommendations for a project (or an empty
   * set if none have been generated yet). Used to restore the cards on page
   * entry so they survive reloads and device changes.
   */
  async getStoredRecommendations(projectId: string): Promise<{
    recommendations: any[];
    generatedAt: number | null;
    language: string | null;
    periodDays: number | null;
  }> {
    const row = await this.prisma.analyticsRecommendation.findUnique({
      where: { projectId },
    });
    if (!row) {
      return { recommendations: [], generatedAt: null, language: null, periodDays: null };
    }
    const recommendations = Array.isArray(row.recommendations)
      ? (row.recommendations as any[])
      : [];
    return {
      recommendations,
      generatedAt: row.generatedAt.getTime(),
      language: row.language ?? null,
      periodDays: row.periodDays ?? null,
    };
  }

  @Cron('0 1 * * *')
  async aggregateDailyMetrics() {
    this.logger.log('Starting daily metrics aggregation...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, organizationId: true },
    });

    for (const project of projects) {
      try {
        await this.aggregateForProject(project.id, yesterday, today);
      } catch (err) {
        this.logger.error(`Failed to aggregate metrics for project ${project.id}:`, err);
        const webUrl = (this.config.get<string>('WEB_URL') || 'http://localhost:5173').replace(/\/$/, '');
        await this.notifier.report({
          organizationId: project.organizationId,
          cronName: 'analytics',
          resourceType: 'Project',
          resourceId: project.id,
          resourceLabel: project.name,
          errorCode: 'ANALYTICS_AGGREGATION_FAILED',
          error: err instanceof Error ? err.message : String(err),
          actionUrl: `${webUrl}/projects/${project.id}/analytics`,
        });
      }
    }

    this.logger.log(`Daily metrics aggregation completed for ${projects.length} projects.`);
  }

  async aggregateNow(projectId?: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const projects = projectId
      ? [{ id: projectId }]
      : await this.prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

    let aggregated = 0;
    for (const project of projects) {
      try {
        await this.aggregateForProject(project.id, todayStart, tomorrowStart);
        aggregated++;
      } catch (err) {
        this.logger.error(`Failed to aggregate for ${project.id}:`, err);
      }
    }

    return { aggregated, projects: projects.length };
  }

  // ── UTM Attribution ──────────────────────────────────────────

  async getUtmBreakdown(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    days: number | string = 30,
  ) {
    days = Number(days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = { timestamp: { gte: since } };
    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
    }

    const events = await this.prisma.analyticsEvent.findMany({
      where,
      select: { type: true, metadata: true },
    });

    const sources: Record<string, { visits: number; conversions: number }> = {};
    const mediums: Record<string, { visits: number; conversions: number }> = {};
    const campaigns: Record<string, { visits: number; conversions: number }> = {};

    for (const event of events) {
      const meta = event.metadata as any;
      const utm = meta?.utm || {};
      const source = utm.source || meta?.referrer || 'direct';
      const medium = utm.medium || 'none';
      const campaign = utm.campaign || 'none';

      if (!sources[source]) sources[source] = { visits: 0, conversions: 0 };
      if (!mediums[medium]) mediums[medium] = { visits: 0, conversions: 0 };
      if (!campaigns[campaign]) campaigns[campaign] = { visits: 0, conversions: 0 };

      if (event.type === 'PAGE_VIEW') {
        sources[source]!.visits++;
        mediums[medium]!.visits++;
        campaigns[campaign]!.visits++;
      } else if (event.type === 'CONVERSION' || event.type === 'SIGNUP' || event.type === 'UPGRADE') {
        sources[source]!.conversions++;
        mediums[medium]!.conversions++;
        campaigns[campaign]!.conversions++;
      }
    }

    const toSorted = (obj: Record<string, { visits: number; conversions: number }>) =>
      Object.entries(obj)
        .map(([name, data]) => ({
          name,
          ...data,
          conversionRate: data.visits > 0 ? Number(((data.conversions / data.visits) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 20);

    return {
      sources: toSorted(sources),
      mediums: toSorted(mediums),
      campaigns: toSorted(campaigns),
    };
  }

  // ── Conversion Funnel ──────────────────────────────────────

  async getFunnel(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    days: number | string = 30,
  ) {
    days = Number(days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Funnel steps are project-scoped; for org scope use defaults
    const funnelSteps = scope.projectId
      ? await this.prisma.funnelStep.findMany({
          where: { projectId: scope.projectId },
          orderBy: { order: 'asc' },
        })
      : [];

    const steps = funnelSteps.length > 0
      ? funnelSteps.map(s => ({ name: s.name, eventType: s.eventType }))
      : [
          { name: 'Visitors', eventType: 'PAGE_VIEW' },
          { name: 'Signups', eventType: 'SIGNUP' },
          { name: 'Activated', eventType: 'ACTIVATION' },
          { name: 'Converted', eventType: 'CONVERSION' },
        ];

    const where: any = { timestamp: { gte: since } };
    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
    }

    const events = await this.prisma.analyticsEvent.findMany({
      where,
      select: { type: true, metadata: true },
    });

    const typeCounts: Record<string, Set<string>> = {};
    for (const event of events) {
      const meta = event.metadata as any;
      const sessionKey = meta?.sessionId || meta?.sid || meta?.userId || event.type;
      if (!typeCounts[event.type]) typeCounts[event.type] = new Set();
      typeCounts[event.type]!.add(sessionKey);
    }

    const totalVisitors = typeCounts['PAGE_VIEW']?.size || 0;

    const funnelData = steps.map((step, i) => {
      const count = typeCounts[step.eventType]?.size || 0;
      const previousCount = i > 0
        ? (typeCounts[steps[i - 1]!.eventType]?.size || 0)
        : totalVisitors;
      return {
        name: step.name,
        eventType: step.eventType,
        count,
        conversionRate: previousCount > 0 ? Number(((count / previousCount) * 100).toFixed(2)) : 0,
        dropOffRate: previousCount > 0 ? Number((((previousCount - count) / previousCount) * 100).toFixed(2)) : 0,
      };
    });

    return { steps: funnelData, period: `${days} days`, totalVisitors };
  }

  // ── Page Analytics ─────────────────────────────────────────

  async getPageAnalytics(
    scope: { projectId?: string; organizationId?: string; aggregated?: boolean },
    days: number | string = 30,
  ) {
    days = Number(days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = {
      timestamp: { gte: since },
      type: { in: ['PAGE_VIEW', 'CONVERSION'] },
    };
    if (scope.projectId) {
      where.projectId = scope.projectId;
    } else if (scope.organizationId) {
      where.organizationId = scope.organizationId;
    }

    const events = await this.prisma.analyticsEvent.findMany({
      where,
      select: { type: true, metadata: true },
    });

    const pages: Record<string, { views: number; uniqueVisitors: Set<string>; conversions: number }> = {};

    for (const event of events) {
      const meta = event.metadata as any;
      const url = meta?.url || meta?.path || 'unknown';
      let path: string;
      try { path = new URL(url).pathname; } catch { path = url; }
      const sessionKey = meta?.sessionId || meta?.sid || 'anon';

      if (!pages[path]) pages[path] = { views: 0, uniqueVisitors: new Set(), conversions: 0 };

      if (event.type === 'PAGE_VIEW') {
        pages[path]!.views++;
        pages[path]!.uniqueVisitors.add(sessionKey);
      } else if (event.type === 'CONVERSION') {
        pages[path]!.conversions++;
      }
    }

    return Object.entries(pages)
      .map(([path, data]) => ({
        path,
        views: data.views,
        uniqueVisitors: data.uniqueVisitors.size,
        conversions: data.conversions,
        conversionRate: data.views > 0 ? Number(((data.conversions / data.views) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 50);
  }

  // ── Org-Level Analytics ────────────────────────────────────

  async getOrgSummary(organizationId: string, period: string = '30d') {
    const days = parseInt(period) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });
    const projectIds = projects.map(p => p.id);

    const [contentCount, emailEvents, pageViews, conversions] = await Promise.all([
      this.prisma.content.count({ where: { organizationId, createdAt: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { projectId: { in: projectIds }, type: 'EMAIL_OPEN', timestamp: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { projectId: { in: projectIds }, type: 'PAGE_VIEW', timestamp: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { projectId: { in: projectIds }, type: 'CONVERSION', timestamp: { gte: since } } }),
    ]);

    const byProject = await Promise.all(
      projects.map(async (p) => ({
        projectId: p.id,
        projectName: p.name,
        content: await this.prisma.content.count({ where: { projectId: p.id, createdAt: { gte: since } } }),
        emailsSent: await this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'EMAIL_OPEN', timestamp: { gte: since } } }),
        pageViews: await this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'PAGE_VIEW', timestamp: { gte: since } } }),
        conversions: await this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'CONVERSION', timestamp: { gte: since } } }),
      })),
    );

    return { totalContent: contentCount, totalEmailsSent: emailEvents, totalPageViews: pageViews, totalConversions: conversions, byProject };
  }

  async compareProjects(projectIds: string[], period: string = '30d') {
    const days = parseInt(period) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });

    const data = await Promise.all(
      projects.map(async (p) => {
        const [content, emails, views, convs] = await Promise.all([
          this.prisma.content.count({ where: { projectId: p.id, createdAt: { gte: since } } }),
          this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'EMAIL_OPEN', timestamp: { gte: since } } }),
          this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'PAGE_VIEW', timestamp: { gte: since } } }),
          this.prisma.analyticsEvent.count({ where: { projectId: p.id, type: 'CONVERSION', timestamp: { gte: since } } }),
        ]);
        return {
          projectId: p.id,
          projectName: p.name,
          values: { content, emailsSent: emails, pageViews: views, conversions: convs },
        };
      }),
    );

    return { projectIds, metrics: ['content', 'emailsSent', 'pageViews', 'conversions'], period, data };
  }

  // ── Funnel Steps CRUD ──────────────────────────────────────

  async getFunnelSteps(projectId: string) {
    return this.prisma.funnelStep.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async setFunnelSteps(projectId: string, steps: Array<{ name: string; eventType: string; order: number; description?: string }>) {
    await this.prisma.funnelStep.deleteMany({ where: { projectId } });
    return this.prisma.funnelStep.createMany({
      data: steps.map(s => ({ projectId, name: s.name, eventType: s.eventType, order: s.order, description: s.description })),
    });
  }

  private async aggregateForProject(projectId: string, dayStart: Date, dayEnd: Date) {
    const [events, leadsCount, sentCampaigns] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where: {
          projectId,
          timestamp: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.emailSubscriber.count({
        where: {
          list: { projectId },
          subscribedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.emailCampaign.findMany({
        where: {
          list: { projectId },
          sentAt: { gte: dayStart, lt: dayEnd },
        },
        select: { stats: true },
      }),
    ]);

    const emailsSent = sentCampaigns.reduce(
      (sum, c) => sum + (Number((c.stats as any)?.sent) || 0),
      0,
    );

    if (events.length === 0 && leadsCount === 0 && emailsSent === 0) return;

    const uniqueSessions = new Set<string>();
    let pageViews = 0;
    let conversions = 0;
    let emailOpens = 0;
    let emailClicks = 0;
    let socialEngagements = 0;

    for (const event of events) {
      const meta = event.metadata as any;
      const sessionKey = meta?.sessionId || meta?.ip || event.id;

      switch (event.type) {
        case 'PAGE_VIEW':
          pageViews++;
          uniqueSessions.add(sessionKey);
          break;
        case 'CONVERSION':
          conversions++;
          uniqueSessions.add(sessionKey);
          break;
        case 'EMAIL_OPEN':
          emailOpens++;
          break;
        case 'EMAIL_CLICK':
          emailClicks++;
          break;
        case 'SOCIAL_ENGAGEMENT':
          socialEngagements++;
          break;
      }
    }

    const metrics = {
      visitors: uniqueSessions.size,
      pageViews,
      leads: leadsCount,
      conversions,
      emailsSent,
      emailOpens,
      emailClicks,
      socialReach: 0,
      socialEngagements,
    };

    await this.prisma.dailyMetrics.upsert({
      where: { projectId_date: { projectId, date: dayStart } },
      update: { metrics },
      create: { projectId, date: dayStart, metrics },
    });
  }
}
