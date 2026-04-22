import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../database/prisma.service';
import { SeoService } from './seo.service';
import { BraveSearchConfigService } from './brave-search-config.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CheckResult =
  | { skipped: true; reason: 'NOT_TRACKING' | 'ORG_SCOPED_NOT_SUPPORTED' | 'NO_TARGET_URL' | 'BRAVE_NOT_CONFIGURED' }
  | { skipped: false; rank: number | null };

// ---------------------------------------------------------------------------
// Exported helpers (unit-testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Converts a locale tag (e.g. 'pl-PL') to Brave Search query params.
 * country = lowercased 2nd segment, search_lang = lowercased 1st segment.
 * Malformed or missing country segment falls back to { country: 'us', search_lang: 'en' }.
 */
export function localeToBraveParams(locale: string): { country: string; search_lang: string } {
  const parts = (locale ?? '').split('-');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { country: 'us', search_lang: 'en' };
  }
  return {
    search_lang: parts[0].toLowerCase(),
    country: parts[1].toLowerCase(),
  };
}

/**
 * Returns true when URL `a` and URL `b` share the same effective host.
 * Normalisation: strip www., lowercase, strip port.
 * Returns false if either value is not a valid URL.
 */
export function hostMatches(a: string, b: string): boolean {
  try {
    const normalize = (raw: string): string => {
      const { hostname } = new URL(raw);
      return hostname.toLowerCase().replace(/^www\./, '');
    };
    return normalize(a) === normalize(b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

type BraveErrorCode = 'BRAVE_QUOTA_EXCEEDED' | 'BRAVE_INVALID_KEY' | 'BRAVE_UNKNOWN_ERROR';

function mapBraveError(err: unknown): BraveErrorCode {
  const e = err as any;
  const status: number | undefined = e?.response?.status ?? e?.status ?? e?.code;

  if (status === 429) return 'BRAVE_QUOTA_EXCEEDED';
  if (status === 401 || status === 403) return 'BRAVE_INVALID_KEY';

  // axios error with response object
  if (e?.response?.status === 429) return 'BRAVE_QUOTA_EXCEEDED';
  if (e?.response?.status === 401 || e?.response?.status === 403) return 'BRAVE_INVALID_KEY';

  return 'BRAVE_UNKNOWN_ERROR';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RankTrackingService {
  private readonly logger = new Logger(RankTrackingService.name);

  private readonly recentChecks = new Map<string, number[]>(); // keywordId → timestamps
  private MAX_TRACKED = 10_000;

  constructor(
    private prisma: PrismaService,
    private seo: SeoService,
    private braveConfig: BraveSearchConfigService,
  ) {}

  private throttleOrAllow(keywordId: string): void {
    const now = Date.now();
    const windowStart = now - 3_600_000; // 1 hour
    const list = (this.recentChecks.get(keywordId) ?? []).filter((t) => t > windowStart);
    if (list.length >= 3) {
      throw new HttpException({ code: 'RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    list.push(now);
    this.recentChecks.set(keywordId, list);

    // Crude eviction when the map grows past MAX_TRACKED — drop oldest half by insertion order.
    // Acceptable for single-instance API (documented in spec Open Risks).
    if (this.recentChecks.size > this.MAX_TRACKED) {
      const entries = Array.from(this.recentChecks.entries());
      this.recentChecks.clear();
      for (const [k, v] of entries.slice(Math.floor(entries.length / 2))) {
        this.recentChecks.set(k, v);
      }
    }
  }

  async checkKeyword(keywordId: string, source: 'cron' | 'manual' = 'manual'): Promise<CheckResult> {
    // 0. Throttle manual checks (cron path is unthrottled)
    if (source === 'manual') {
      this.throttleOrAllow(keywordId);
    }

    // 1. Load keyword
    const keyword = await this.prisma.keyword.findUnique({ where: { id: keywordId } });
    if (!keyword) throw new NotFoundException(`Keyword ${keywordId} not found`);

    // 2. Skip if not tracking
    if (!keyword.isTracking) {
      return { skipped: true, reason: 'NOT_TRACKING' };
    }

    // 3. Skip org-scoped keywords (v1 limitation)
    if (keyword.projectId === null) {
      return { skipped: true, reason: 'ORG_SCOPED_NOT_SUPPORTED' };
    }

    const now = new Date();

    // 4. Require target URL
    if (!keyword.url) {
      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: { lastCheckError: 'NO_TARGET_URL', lastCheckedAt: now },
      });
      return { skipped: true, reason: 'NO_TARGET_URL' };
    }

    // 5. Require Brave Search credentials
    const creds = await this.braveConfig.getCredentials(keyword.projectId);
    if (!creds) {
      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: { lastCheckError: 'BRAVE_NOT_CONFIGURED', lastCheckedAt: now },
      });
      return { skipped: true, reason: 'BRAVE_NOT_CONFIGURED' };
    }

    // 6. Locale → Brave country/search_lang params
    const { country, search_lang } = localeToBraveParams(keyword.locale);

    // 7. Query Brave Search API (top-20 only — single request per keyword fits free tier)
    let rank: number | null = null;

    try {
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        headers: {
          'X-Subscription-Token': creds.apiKey,
          'Accept': 'application/json',
        },
        params: {
          q: keyword.keyword,
          country,
          search_lang,
          count: 20,
          offset: 0,
        },
      });

      const results: Array<{ url: string }> = response.data?.web?.results ?? [];

      for (let i = 0; i < results.length; i++) {
        if (hostMatches(results[i].url ?? '', keyword.url!)) {
          rank = i + 1;
          break;
        }
      }

      // 8. Record success
      await this.seo.addRankHistory(keywordId, rank, keyword.url);

      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: {
          lastCheckedAt: now,
          lastCheckError: null,
          ...(rank !== null && { currentRank: rank }),
        },
      });

      await this.braveConfig.clearValidationError(keyword.projectId);

      return { skipped: false, rank };
    } catch (err) {
      // 9. Map and persist Brave error
      const code = mapBraveError(err);

      this.logger.warn(
        `[${source}] Brave Search error for keyword "${keyword.keyword}" (${keywordId}): ${code}`,
        err instanceof Error ? err.message : String(err),
      );

      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: { lastCheckError: code, lastCheckedAt: now },
      });

      if (code === 'BRAVE_QUOTA_EXCEEDED' || code === 'BRAVE_INVALID_KEY') {
        await this.braveConfig.markValidationError(keyword.projectId, code);
      }

      throw err;
    }
  }
}
