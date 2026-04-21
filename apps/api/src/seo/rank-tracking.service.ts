import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../database/prisma.service';
import { SeoService } from './seo.service';
import { CseConfigService } from './cse-config.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CheckResult =
  | { skipped: true; reason: 'NOT_TRACKING' | 'ORG_SCOPED_NOT_SUPPORTED' | 'NO_TARGET_URL' | 'CSE_NOT_CONFIGURED' }
  | { skipped: false; rank: number | null };

// ---------------------------------------------------------------------------
// Exported helpers (unit-testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Converts a locale tag (e.g. 'pl-PL') to Google CSE gl/hl params.
 * gl = country code (lowercased 2nd segment), hl = language (lowercased 1st segment).
 * Malformed or missing country segment falls back to { gl: 'us', hl: 'en' }.
 */
export function localeToGlHl(locale: string): { gl: string; hl: string } {
  const parts = (locale ?? '').split('-');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { gl: 'us', hl: 'en' };
  }
  return {
    hl: parts[0].toLowerCase(),
    gl: parts[1].toLowerCase(),
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

type GoogleErrorCode = 'CSE_QUOTA_EXCEEDED' | 'CSE_INVALID_KEY' | 'CSE_UNKNOWN_ERROR';

function mapGoogleError(err: unknown): GoogleErrorCode {
  const e = err as any;

  // HTTP 429 or explicit quota reason
  if (e?.code === 429) return 'CSE_QUOTA_EXCEEDED';

  const reason: string | undefined = e?.errors?.[0]?.reason ?? e?.reason ?? '';

  if (reason === 'dailyLimitExceeded' || reason === 'quotaExceeded') {
    return 'CSE_QUOTA_EXCEEDED';
  }

  // HTTP 403 with quotaExceeded
  if (e?.code === 403 && reason === 'quotaExceeded') {
    return 'CSE_QUOTA_EXCEEDED';
  }

  if (reason === 'keyInvalid') {
    return 'CSE_INVALID_KEY';
  }

  return 'CSE_UNKNOWN_ERROR';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RankTrackingService {
  private readonly logger = new Logger(RankTrackingService.name);

  constructor(
    private prisma: PrismaService,
    private seo: SeoService,
    private cseConfig: CseConfigService,
  ) {}

  async checkKeyword(keywordId: string, source: 'cron' | 'manual' = 'manual'): Promise<CheckResult> {
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

    // 5. Require CSE credentials
    const creds = await this.cseConfig.getCredentials(keyword.projectId);
    if (!creds) {
      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: { lastCheckError: 'CSE_NOT_CONFIGURED', lastCheckedAt: now },
      });
      return { skipped: true, reason: 'CSE_NOT_CONFIGURED' };
    }

    // 6. Locale → gl/hl
    const { gl, hl } = localeToGlHl(keyword.locale);

    // 7. Query Google CSE
    const customsearch = google.customsearch('v1');
    let rank: number | null = null;

    try {
      outer: for (let page = 0; page < 10; page++) {
        const start = page * 10 + 1; // 1, 11, 21, …, 91

        const response = await customsearch.cse.list({
          q: keyword.keyword,
          cx: creds.cseId,
          auth: creds.apiKey,
          gl,
          hl,
          num: 10,
          start,
        } as any);

        const items: Array<{ link?: string }> = (response as any)?.data?.items ?? [];

        for (let i = 0; i < items.length; i++) {
          if (hostMatches(items[i].link ?? '', keyword.url!)) {
            rank = start + i;
            break outer;
          }
        }

        // If Google returned fewer than 10 results, there are no more pages
        if (items.length < 10) break;
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

      await this.cseConfig.clearValidationError(keyword.projectId);

      return { skipped: false, rank };
    } catch (err) {
      // 9. Map and persist Google error
      const code = mapGoogleError(err);

      this.logger.warn(
        `[${source}] CSE error for keyword "${keyword.keyword}" (${keywordId}): ${code}`,
        err instanceof Error ? err.message : String(err),
      );

      await this.prisma.keyword.update({
        where: { id: keywordId },
        data: { lastCheckError: code, lastCheckedAt: now },
      });

      if (code === 'CSE_QUOTA_EXCEEDED' || code === 'CSE_INVALID_KEY') {
        await this.cseConfig.markValidationError(keyword.projectId, code);
      }

      throw err;
    }
  }
}
