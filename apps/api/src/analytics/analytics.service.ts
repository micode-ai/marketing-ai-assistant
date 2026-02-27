import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(projectId: string, days = 30) {
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
}
