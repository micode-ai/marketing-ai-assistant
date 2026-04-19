import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

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
      select: { id: true },
    });

    for (const project of projects) {
      try {
        await this.aggregateForProject(project.id, yesterday, today);
      } catch (err) {
        this.logger.error(`Failed to aggregate metrics for project ${project.id}:`, err);
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
