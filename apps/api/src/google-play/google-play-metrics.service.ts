import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface MetricsTotals {
  installs: number;
  uninstalls: number;
  activeDeviceInstalls: number;
  storeListingVisitors: number;
  storeListingConversions: number;
  crashes: number;
  anrs: number;
  crashRate: number;
  anrRate: number;
  averageRating: number;
  totalRatings: number;
  revenue: number;
}

export interface MetricsTotalsWithTrend extends MetricsTotals {
  previous: MetricsTotals;
  changes: Record<keyof MetricsTotals, { value: number; trend: 'up' | 'down' | 'flat' }>;
}

@Injectable()
export class GooglePlayMetricsService {
  private readonly logger = new Logger(GooglePlayMetricsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Query AppStoreMetrics for a project within a date range.
   */
  async getMetrics(projectId: string, startDate: string, endDate: string) {
    return this.prisma.appStoreMetrics.findMany({
      where: {
        projectId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Calculate current vs previous period totals with % change and trend.
   */
  async getMetricsTotals(
    projectId: string,
    days = 30,
  ): Promise<MetricsTotalsWithTrend> {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    const [currentMetrics, previousMetrics] = await Promise.all([
      this.prisma.appStoreMetrics.findMany({
        where: {
          projectId,
          date: { gte: currentStart, lte: now },
        },
      }),
      this.prisma.appStoreMetrics.findMany({
        where: {
          projectId,
          date: { gte: previousStart, lt: currentStart },
        },
      }),
    ]);

    const current = this.sumMetrics(currentMetrics);
    const previous = this.sumMetrics(previousMetrics);

    const changes = {} as MetricsTotalsWithTrend['changes'];
    const keys = Object.keys(current) as (keyof MetricsTotals)[];

    for (const key of keys) {
      const curr = current[key];
      const prev = previous[key];
      let pctChange = 0;
      if (prev !== 0) {
        pctChange = ((curr - prev) / Math.abs(prev)) * 100;
      } else if (curr > 0) {
        pctChange = 100;
      }

      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (pctChange > 1) trend = 'up';
      else if (pctChange < -1) trend = 'down';

      changes[key] = { value: Math.round(pctChange * 100) / 100, trend };
    }

    return { ...current, previous, changes };
  }

  private sumMetrics(rows: any[]): MetricsTotals {
    const result: MetricsTotals = {
      installs: 0,
      uninstalls: 0,
      activeDeviceInstalls: 0,
      storeListingVisitors: 0,
      storeListingConversions: 0,
      crashes: 0,
      anrs: 0,
      crashRate: 0,
      anrRate: 0,
      averageRating: 0,
      totalRatings: 0,
      revenue: 0,
    };

    if (rows.length === 0) return result;

    for (const row of rows) {
      result.installs += row.installs || 0;
      result.uninstalls += row.uninstalls || 0;
      result.activeDeviceInstalls = Math.max(result.activeDeviceInstalls, row.activeDeviceInstalls || 0);
      result.storeListingVisitors += row.storeListingVisitors || 0;
      result.storeListingConversions += row.storeListingConversions || 0;
      result.crashes += row.crashes || 0;
      result.anrs += row.anrs || 0;
      result.totalRatings = Math.max(result.totalRatings, row.totalRatings || 0);
      result.revenue += row.revenue || 0;
    }

    // Average rates over the period
    const count = rows.length;
    result.crashRate =
      rows.reduce((sum: number, r: any) => sum + (r.crashRate || 0), 0) / count;
    result.anrRate =
      rows.reduce((sum: number, r: any) => sum + (r.anrRate || 0), 0) / count;
    result.averageRating =
      rows.reduce((sum: number, r: any) => sum + (r.averageRating || 0), 0) / count;

    // Round floats
    result.crashRate = Math.round(result.crashRate * 1000) / 1000;
    result.anrRate = Math.round(result.anrRate * 1000) / 1000;
    result.averageRating = Math.round(result.averageRating * 100) / 100;
    result.storeListingConversions =
      Math.round(result.storeListingConversions * 100) / 100;
    result.revenue = Math.round(result.revenue * 100) / 100;

    return result;
  }
}
