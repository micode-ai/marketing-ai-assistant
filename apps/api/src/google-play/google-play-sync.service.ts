import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import {
  GooglePlayAuthService,
  GooglePlayConfig,
} from './google-play-auth.service';

@Injectable()
export class GooglePlaySyncService {
  private readonly logger = new Logger(GooglePlaySyncService.name);

  constructor(
    private prisma: PrismaService,
    private authService: GooglePlayAuthService,
  ) {}

  /**
   * Scheduled sync: runs every hour.
   * Skips FREE plans entirely. PRO plans sync at most every 6 hours.
   */
  @Cron('0 * * * *')
  async scheduledSync() {
    this.logger.log('Starting scheduled Google Play sync');

    const integrations = await this.prisma.projectApiKey.findMany({
      where: { platform: 'GOOGLE_PLAY' },
      include: {
        project: {
          include: {
            organization: {
              include: { subscription: true },
            },
          },
        },
      },
    });

    for (const integration of integrations) {
      try {
        const plan = integration.project.organization.subscription?.plan;

        // Skip FREE plan
        if (!plan || plan === 'FREE') continue;

        const config = await this.authService.getConfig(integration.projectId);

        // PRO plan: skip if synced less than 6 hours ago
        if (plan === 'PRO' && config.lastSyncAt) {
          const lastSync = new Date(config.lastSyncAt).getTime();
          if (Date.now() - lastSync < 6 * 60 * 60 * 1000) continue;
        }

        await this.syncProject(integration.projectId, config);
      } catch (error) {
        this.logger.error(
          `Scheduled sync failed for project ${integration.projectId}: ${error}`,
        );
      }
    }
  }

  /**
   * Determine date range and run metrics + reviews sync.
   */
  async syncProject(projectId: string, config?: GooglePlayConfig) {
    if (!config) {
      config = await this.authService.getConfig(projectId);
    }

    const endDate = new Date();
    let startDate: Date;

    if (!config.initialSyncCompleted) {
      // Initial sync: duration based on plan
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { organization: { include: { subscription: true } } },
      });
      const plan = project?.organization?.subscription?.plan || 'PRO';
      const months = plan === 'ENTERPRISE' ? 12 : 6;
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
    } else if (config.lastSyncAt) {
      // Incremental sync: from last sync
      startDate = new Date(config.lastSyncAt);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    }

    try {
      const accessToken = await this.authService.getValidAccessToken(projectId);

      await Promise.all([
        this.syncMetrics(projectId, config.packageName, accessToken, startDate, endDate),
        this.syncReviews(projectId, config.packageName, accessToken),
      ]);

      await this.authService.updateConfig(projectId, {
        lastSyncAt: endDate.toISOString(),
        initialSyncCompleted: true,
        consecutiveFailures: 0,
      });

      this.logger.log(`Sync completed for project ${projectId}`);
    } catch (error: any) {
      const failures = (config.consecutiveFailures || 0) + 1;

      if (error?.message === 'REVOKED') {
        this.logger.warn(`Token revoked for project ${projectId}, disconnecting`);
        await this.authService.disconnect(projectId, false);
        return;
      }

      await this.authService.updateConfig(projectId, {
        consecutiveFailures: failures,
      }).catch(() => {});

      if (failures >= 5) {
        this.logger.warn(`Project ${projectId} reached ${failures} consecutive sync failures — marked as ERROR`);
      }

      this.logger.error(`Sync failed for project ${projectId} (failure #${failures}): ${error}`);
      throw error;
    }
  }

  /**
   * Sync metrics from Play Developer Reporting API v1beta1.
   */
  private async syncMetrics(
    projectId: string,
    packageName: string,
    accessToken: string,
    startDate: Date,
    endDate: Date,
  ) {
    const baseUrl = 'https://playdeveloperreporting.googleapis.com/v1beta1';
    const appName = `apps/${packageName}`;

    const timelineSpec = {
      aggregationPeriod: 'DAILY',
      startTime: {
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
        day: startDate.getDate(),
      },
      endTime: {
        year: endDate.getFullYear(),
        month: endDate.getMonth() + 1,
        day: endDate.getDate(),
      },
    };

    // Fetch crash rate metrics
    const crashData = await this.queryMetricSet(
      `${baseUrl}/${appName}/crashRateMetricSet:query`,
      accessToken,
      {
        timelineSpec,
        metrics: ['crashRate', 'crashCount', 'anrRate', 'anrCount'],
        dimensions: [],
      },
    );

    // Fetch store acquisition metrics
    const storeData = await this.queryMetricSet(
      `${baseUrl}/${appName}/storeAcquisitionMetricSet:query`,
      accessToken,
      {
        timelineSpec,
        metrics: [
          'newAcquisitions',
          'storeListingVisitors',
          'storeListingConversionRate',
        ],
        dimensions: [],
      },
    );

    // Process and upsert daily rows
    const metricsMap = new Map<string, any>();

    this.processMetricRows(crashData, metricsMap, (dateKey, row) => ({
      crashes: this.extractMetricValue(row, 'crashCount'),
      anrs: this.extractMetricValue(row, 'anrCount'),
      crashRate: this.extractMetricValue(row, 'crashRate'),
      anrRate: this.extractMetricValue(row, 'anrRate'),
    }));

    this.processMetricRows(storeData, metricsMap, (dateKey, row) => ({
      installs: this.extractMetricValue(row, 'newAcquisitions'),
      storeListingVisitors: this.extractMetricValue(row, 'storeListingVisitors'),
      storeListingConversions: this.extractMetricValue(row, 'storeListingConversionRate'),
    }));

    // Upsert all daily metrics
    for (const [dateKey, metrics] of metricsMap) {
      const date = new Date(dateKey);
      await this.prisma.appStoreMetrics.upsert({
        where: {
          projectId_date: { projectId, date },
        },
        create: {
          projectId,
          date,
          ...metrics,
        },
        update: metrics,
      });
    }

    this.logger.log(
      `Synced ${metricsMap.size} days of metrics for project ${projectId}`,
    );
  }

  /**
   * Query a Play Developer Reporting metric set endpoint.
   */
  private async queryMetricSet(
    url: string,
    accessToken: string,
    body: any,
  ): Promise<any> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.warn(`Metric set query failed (${response.status}): ${error}`);
        return { rows: [] };
      }

      return response.json();
    } catch (error) {
      this.logger.warn(`Metric set query error: ${error}`);
      return { rows: [] };
    }
  }

  /**
   * Process rows from a metric set response into the metricsMap.
   */
  private processMetricRows(
    data: any,
    metricsMap: Map<string, any>,
    extractor: (dateKey: string, row: any) => Record<string, number>,
  ) {
    if (!data?.rows) return;

    for (const row of data.rows) {
      const startTime = row.startTime;
      if (!startTime) continue;

      const dateKey = `${startTime.year}-${String(startTime.month).padStart(2, '0')}-${String(startTime.day).padStart(2, '0')}`;
      const existing = metricsMap.get(dateKey) || {};
      const extracted = extractor(dateKey, row);
      metricsMap.set(dateKey, { ...existing, ...extracted });
    }
  }

  /**
   * Extract a numeric value from a metric set row.
   */
  private extractMetricValue(row: any, metricName: string): number {
    if (!row.metrics) return 0;
    const metric = row.metrics[metricName];
    if (!metric) return 0;
    return metric.decimalValue
      ? parseFloat(metric.decimalValue)
      : metric.intValue || 0;
  }

  /**
   * Sync reviews from Android Publisher API v3.
   */
  private async syncReviews(
    projectId: string,
    packageName: string,
    accessToken: string,
  ) {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/reviews?maxResults=100`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.warn(`Reviews fetch failed (${response.status}): ${error}`);
        return;
      }

      const data = await response.json() as {
        reviews?: Array<{
          reviewId: string;
          authorName: string;
          comments: Array<{
            userComment?: {
              text: string;
              starRating: number;
              lastModified: { seconds: string };
              reviewerLanguage: string;
            };
            developerComment?: {
              text: string;
              lastModified: { seconds: string };
            };
          }>;
        }>;
      };

      if (!data.reviews) return;

      for (const review of data.reviews) {
        const userComment = review.comments?.[0]?.userComment;
        if (!userComment) continue;

        const developerComment = review.comments?.[0]?.developerComment;

        await this.prisma.appReview.upsert({
          where: {
            projectId_reviewId: {
              projectId,
              reviewId: review.reviewId,
            },
          },
          create: {
            projectId,
            reviewId: review.reviewId,
            authorName: review.authorName || 'Anonymous',
            language: userComment.reviewerLanguage || 'en',
            starRating: userComment.starRating,
            text: userComment.text,
            reviewCreatedAt: new Date(
              parseInt(userComment.lastModified.seconds) * 1000,
            ),
            replyText: developerComment?.text || null,
            replyCreatedAt: developerComment
              ? new Date(parseInt(developerComment.lastModified.seconds) * 1000)
              : null,
            isReplied: !!developerComment,
          },
          update: {
            authorName: review.authorName || 'Anonymous',
            starRating: userComment.starRating,
            text: userComment.text,
            replyText: developerComment?.text || null,
            replyCreatedAt: developerComment
              ? new Date(parseInt(developerComment.lastModified.seconds) * 1000)
              : null,
            isReplied: !!developerComment,
          },
        });
      }

      this.logger.log(
        `Synced ${data.reviews.length} reviews for project ${projectId}`,
      );
    } catch (error) {
      this.logger.warn(`Reviews sync error: ${error}`);
    }
  }

  /**
   * Manual sync entry point.
   */
  async triggerManualSync(projectId: string) {
    return this.syncProject(projectId);
  }
}
