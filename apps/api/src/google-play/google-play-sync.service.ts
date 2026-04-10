import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { parse } from 'csv-parse/sync';
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

      const syncTasks: Promise<void>[] = [
        this.syncMetrics(projectId, config.packageName, accessToken, startDate, endDate),
        this.syncReviews(projectId, config.packageName, accessToken),
      ];

      // If GCS bucket URI is configured, sync CSV exports (installs, ratings, store performance)
      if (config.gcsBucketUri) {
        syncTasks.push(
          this.syncCsvExports(projectId, config.packageName, accessToken, config.gcsBucketUri, startDate, endDate),
        );
      }

      await Promise.all(syncTasks);

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

    // Fetch crash rate metrics (valid combo: crashRate, userPerceivedCrashRate, distinctUsers)
    const crashData = await this.queryMetricSet(
      `${baseUrl}/${appName}/crashRateMetricSet:query`,
      accessToken,
      {
        timelineSpec,
        metrics: ['crashRate', 'userPerceivedCrashRate', 'distinctUsers'],
        dimensions: [],
      },
    );

    // Fetch ANR rate metrics separately
    const anrData = await this.queryMetricSet(
      `${baseUrl}/${appName}/anrRateMetricSet:query`,
      accessToken,
      {
        timelineSpec,
        metrics: ['anrRate', 'userPerceivedAnrRate', 'distinctUsers'],
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
      crashRate: this.extractMetricValue(row, 'crashRate'),
      crashes: Math.round(this.extractMetricValue(row, 'distinctUsers') * this.extractMetricValue(row, 'crashRate')),
    }));

    this.processMetricRows(anrData, metricsMap, (dateKey, row) => ({
      anrRate: this.extractMetricValue(row, 'anrRate'),
      anrs: Math.round(this.extractMetricValue(row, 'distinctUsers') * this.extractMetricValue(row, 'anrRate')),
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

      // Remove reviews that no longer exist in Google Play
      const apiReviewIds = data.reviews.map((r: any) => r.reviewId);
      const dbReviews = await this.prisma.appReview.findMany({
        where: { projectId },
        select: { reviewId: true },
      });
      const orphanIds = dbReviews
        .filter((r) => !apiReviewIds.includes(r.reviewId))
        .map((r) => r.reviewId);
      if (orphanIds.length > 0) {
        await this.prisma.appReview.deleteMany({
          where: { projectId, reviewId: { in: orphanIds } },
        });
        this.logger.log(`Removed ${orphanIds.length} deleted reviews for project ${projectId}`);
      }

      this.logger.log(
        `Synced ${data.reviews.length} reviews for project ${projectId}`,
      );
    } catch (error) {
      this.logger.warn(`Reviews sync error: ${error}`);
    }
  }

  /**
   * Sync install, rating, and store performance data from GCS CSV exports.
   * Uses GCS JSON API directly with OAuth access token (no @google-cloud/storage SDK).
   */
  private async syncCsvExports(
    projectId: string,
    packageName: string,
    accessToken: string,
    gcsBucketUri: string,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    this.logger.log(`Syncing CSV exports from ${gcsBucketUri} for ${packageName}`);

    try {
      // Parse gs://bucket-name/optional-prefix
      const uriMatch = gcsBucketUri.match(/^gs:\/\/([^/]+)(?:\/(.*))?$/);
      if (!uriMatch) {
        this.logger.warn('Invalid GCS bucket URI format');
        return;
      }
      const bucketName = uriMatch[1];
      const basePath = uriMatch[2]?.replace(/\/+$/, '') || '';

      // Sync installs
      await this.syncCsvReport(bucketName, basePath, 'stats/installs', accessToken, packageName, projectId, startDate, endDate,
        (row) => {
          const p = (s: string | undefined) => parseInt(s || '0', 10) || 0;
          return {
            installs: Math.max(p(row['Daily Device Installs']), p(row['Daily User Installs']), p(row['Install events'])),
            uninstalls: Math.max(p(row['Daily Device Uninstalls']), p(row['Daily User Uninstalls']), p(row['Uninstall events'])),
            updates: Math.max(p(row['Daily Device Upgrades']), p(row['Update events'])),
            activeDeviceInstalls: Math.max(p(row['Active Device Installs']), p(row['Current Device Installs'])),
          };
        },
      );

      // Sync ratings
      await this.syncCsvReport(bucketName, basePath, 'stats/ratings', accessToken, packageName, projectId, startDate, endDate,
        (row) => ({
          averageRating: parseFloat(row['Daily Average Rating'] || row['Total Average Rating'] || '0'),
          totalRatings: parseInt(row['Total Ratings'] || '0', 10),
          ratingsCount1: parseInt(row['1 Star'] || row['1-star'] || '0', 10),
          ratingsCount2: parseInt(row['2 Stars'] || row['2-star'] || '0', 10),
          ratingsCount3: parseInt(row['3 Stars'] || row['3-star'] || '0', 10),
          ratingsCount4: parseInt(row['4 Stars'] || row['4-star'] || '0', 10),
          ratingsCount5: parseInt(row['5 Stars'] || row['5-star'] || '0', 10),
        }),
      );

      // Sync store performance
      await this.syncCsvReport(bucketName, basePath, 'stats/store_performance', accessToken, packageName, projectId, startDate, endDate,
        (row) => ({
          storeListingVisitors: parseInt(row['Store Listing Visitors'] || row['Store listing visitors'] || '0', 10),
          storeListingConversions: parseFloat(row['Conversion Rate'] || row['Store listing conversion rate'] || '0'),
        }),
      );

      this.logger.log(`CSV export sync completed for ${packageName}`);
    } catch (error) {
      this.logger.warn(`CSV export sync error: ${error}`);
    }
  }

  /**
   * List and download CSV files from GCS using the JSON API.
   */
  private async syncCsvReport(
    bucketName: string,
    basePath: string,
    reportPath: string,
    accessToken: string,
    packageName: string,
    projectId: string,
    startDate: Date,
    endDate: Date,
    mapper: (row: Record<string, string>) => Record<string, number>,
  ): Promise<void> {
    try {
      // Build prefix: if basePath already contains stats/, don't double it
      let prefix: string;
      if (basePath && basePath.includes('stats/')) {
        // User pasted full path like gs://bucket/stats/installs/
        prefix = basePath;
      } else {
        prefix = basePath ? `${basePath}/${reportPath}` : reportPath;
      }

      // List objects via GCS JSON API
      const listUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o?prefix=${encodeURIComponent(prefix)}&maxResults=50`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        this.logger.warn(`GCS list failed (${listRes.status}) for ${prefix}: ${errText.substring(0, 200)}`);
        return;
      }

      const listData = await listRes.json() as { items?: Array<{ name: string; mediaLink?: string }> };
      const csvFiles = (listData.items || [])
        .filter((f) => f.name.endsWith('.csv') && f.name.includes('_overview'))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (csvFiles.length === 0) {
        this.logger.log(`No CSV files found at ${prefix}`);
        return;
      }

      let totalRows = 0;

      for (const file of csvFiles) {
        try {
          // Download file content via GCS JSON API
          const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(file.name)}?alt=media`;
          const dlRes = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!dlRes.ok) {
            this.logger.warn(`Failed to download ${file.name}: ${dlRes.status}`);
            continue;
          }

          // Google Play CSV exports are UTF-16LE encoded — convert to UTF-8
          const rawBuffer = Buffer.from(await dlRes.arrayBuffer());
          let csvText: string;
          if (rawBuffer[0] === 0xFF && rawBuffer[1] === 0xFE) {
            // UTF-16LE BOM detected
            csvText = rawBuffer.toString('utf16le').replace(/^\uFEFF/, '');
          } else if (rawBuffer[0] === 0x00 || rawBuffer[1] === 0x00) {
            // UTF-16LE without BOM (null bytes present)
            csvText = rawBuffer.toString('utf16le');
          } else {
            csvText = rawBuffer.toString('utf-8');
          }

          const records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }) as Record<string, string>[];

          for (const row of records) {
            const dateStr = row['Date'] || row['date'];
            if (!dateStr) continue;

            const rowDate = new Date(dateStr);
            if (isNaN(rowDate.getTime())) continue;
            // No startDate filter for CSV — monthly files contain all data for the month
            if (rowDate > endDate) continue;

            const rowPkg = row['Package Name'] || row['Package name'] || '';
            if (rowPkg && rowPkg !== packageName) continue;

            const mapped = mapper(row);
            const cleanMapped: Record<string, number> = {};
            for (const [k, v] of Object.entries(mapped)) {
              if (!isNaN(v)) cleanMapped[k] = v;
            }
            if (Object.keys(cleanMapped).length === 0) continue;

            await this.prisma.appStoreMetrics.upsert({
              where: { projectId_date: { projectId, date: rowDate } },
              create: { projectId, date: rowDate, ...cleanMapped },
              update: cleanMapped,
            });
            totalRows++;
          }
        } catch (fileErr) {
          this.logger.warn(`Failed to parse CSV file ${file.name}: ${fileErr}`);
        }
      }

      this.logger.log(`Synced ${totalRows} rows from ${reportPath} for ${packageName}`);
    } catch (error) {
      this.logger.warn(`CSV report sync error (${reportPath}): ${error}`);
    }
  }

  /**
   * Manual sync entry point.
   */
  async triggerManualSync(projectId: string) {
    return this.syncProject(projectId);
  }
}
