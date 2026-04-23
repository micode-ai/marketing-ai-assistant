import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GoogleIntegrationsService } from '../google-integrations/google-integrations.service';
import { SeoService } from './seo.service';

export interface GscSyncDetail {
  keywordId: string;
  keyword: string;
  rank: number | null;
  previousRank: number | null;
  reason?: 'NO_URL' | 'NO_MATCH_IN_GSC';
}

export interface GscSyncSummary {
  synced: number;
  matched: number;
  skipped: string[];
  details: GscSyncDetail[];
  siteUrl: string;
  date: string;
}

@Injectable()
export class GscSyncService {
  private readonly logger = new Logger(GscSyncService.name);

  constructor(
    private prisma: PrismaService,
    private googleIntegrations: GoogleIntegrationsService,
    private seo: SeoService,
  ) {}

  /**
   * Sync yesterday's GSC data for all tracked keywords on a project.
   * Returns a summary: { synced: number, matched: number, skipped: string[] }
   */
  async syncProject(projectId: string): Promise<GscSyncSummary> {
    // 1. Load Google integration config
    const config = await this.googleIntegrations.getIntegration(projectId);
    if (!config || !config.siteUrl) {
      throw new BadRequestException({ code: 'GSC_NOT_CONFIGURED' });
    }

    const siteUrl = config.siteUrl as string;

    // 2. Load all tracked keywords that have a url
    const keywords = await this.prisma.keyword.findMany({
      where: {
        projectId,
        isTracking: true,
        url: { not: null },
      },
    });

    if (keywords.length === 0) {
      return {
        synced: 0,
        matched: 0,
        skipped: [],
        details: [],
        siteUrl,
        date: getYesterdayDateString(),
      };
    }

    // Ensure fresh access token
    let accessToken = config.accessToken as string;
    if (new Date(config.expiresAt as string) < new Date() && config.refreshToken) {
      try {
        accessToken = await this.googleIntegrations.refreshAccessToken(config.refreshToken as string);
        await this.googleIntegrations.saveIntegration(projectId, 'gsc', {
          ...config,
          accessToken,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new BadRequestException({ code: 'GSC_ERROR', message: msg });
      }
    }

    // 3. Fetch GSC data for yesterday
    const yesterday = getYesterdayDateString();
    let rows: Awaited<ReturnType<typeof this.googleIntegrations.fetchSearchConsoleData>>;
    try {
      rows = await this.googleIntegrations.fetchSearchConsoleData(
        accessToken,
        siteUrl,
        yesterday,
        yesterday,
        ['query', 'page'],
        25000,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException({ code: 'GSC_ERROR', message: msg });
    }

    // 4. Match each keyword to a GSC row
    let matched = 0;
    const skipped: string[] = [];
    const details: GscSyncDetail[] = [];

    for (const keyword of keywords) {
      const previousRank = keyword.currentRank ?? null;

      if (!keyword.url) {
        skipped.push(`${keyword.keyword}:NO_URL`);
        details.push({
          keywordId: keyword.id,
          keyword: keyword.keyword,
          rank: null,
          previousRank,
          reason: 'NO_URL',
        });
        continue;
      }

      const row = rows.find(
        (r) =>
          r.keys[0]?.toLowerCase() === keyword.keyword.toLowerCase() &&
          hostMatches(r.keys[1], keyword.url!),
      );

      if (!row) {
        skipped.push(`${keyword.keyword}:NO_MATCH_IN_GSC`);
        details.push({
          keywordId: keyword.id,
          keyword: keyword.keyword,
          rank: null,
          previousRank,
          reason: 'NO_MATCH_IN_GSC',
        });
        continue;
      }

      const roundedRank = Math.round(row.position);

      // 5. Upsert rank history for yesterday
      await this.seo.addRankHistoryForDate(keyword.id, roundedRank, row.keys[1], getYesterdayDate());

      // 6. Update keyword metadata (including currentRank so the summary chart/row reflects latest)
      await this.prisma.keyword.update({
        where: { id: keyword.id },
        data: {
          lastCheckedAt: new Date(),
          lastCheckError: null,
          currentRank: roundedRank,
        },
      });

      details.push({
        keywordId: keyword.id,
        keyword: keyword.keyword,
        rank: roundedRank,
        previousRank,
      });
      matched++;
    }

    return {
      synced: keywords.length,
      matched,
      skipped,
      details,
      siteUrl,
      date: getYesterdayDateString(),
    };
  }
}

function getYesterdayDate(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getYesterdayDateString(): string {
  return getYesterdayDate().toISOString().split('T')[0]!;
}

/**
 * Returns true if the GSC page URL's host matches the keyword's target URL host.
 * Falls back to prefix match if URL parsing fails.
 */
function hostMatches(gscPage: string | undefined, keywordUrl: string): boolean {
  if (!gscPage) return false;
  try {
    const gscHost = new URL(gscPage).hostname.replace(/^www\./, '');
    const kwHost = new URL(keywordUrl).hostname.replace(/^www\./, '');
    return gscHost === kwHost;
  } catch {
    return gscPage.includes(keywordUrl) || keywordUrl.includes(gscPage);
  }
}
