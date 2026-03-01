import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async getMetrics(projectId: string, days: number | string = 30) {
    days = Number(days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const metrics = await this.prisma.dailyMetrics.findMany({
      where: { projectId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    return metrics;
  }

  async trackEvent(dto: any) {
    return this.prisma.analyticsEvent.create({
      data: {
        projectId: dto.projectId,
        campaignId: dto.campaignId,
        type: dto.type as any,
        metadata: dto.metadata || {},
      },
    });
  }

  async getMetricsTotals(projectId: string, days: number | string = 30) {
    days = Number(days) || 30;
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

    const [currentRows, previousRows] = await Promise.all([
      this.prisma.dailyMetrics.findMany({
        where: { projectId, date: { gte: currentStart } },
      }),
      this.prisma.dailyMetrics.findMany({
        where: { projectId, date: { gte: previousStart, lt: currentStart } },
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

  async getSummary(projectId: string) {
    const [contentCount, campaignCount, subscriberCount, checklistItems] = await Promise.all([
      this.prisma.content.count({ where: { projectId, status: 'PUBLISHED' } }),
      this.prisma.campaign.count({ where: { projectId, status: 'ACTIVE' } }),
      this.prisma.emailSubscriber.count({
        where: { list: { projectId }, status: 'ACTIVE' },
      }),
      this.prisma.checklistItem.count({
        where: { checklist: { projectId }, isCompleted: true },
      }),
    ]);
    return { contentCount, campaignCount, subscriberCount, checklistItems };
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

  private async aggregateForProject(projectId: string, dayStart: Date, dayEnd: Date) {
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        timestamp: { gte: dayStart, lt: dayEnd },
      },
    });

    if (events.length === 0) return;

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
      leads: 0,
      conversions,
      emailsSent: 0,
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
