import { Logger } from '@nestjs/common';

// "Instagram API with Instagram Login" Graph client.
// Base URL graph.instagram.com; auth via the account's long-lived token
// passed as the `access_token` query param. Pure-ish fetch + mapping helpers.
const GRAPH = 'https://graph.instagram.com';

const logger = new Logger('InstagramGraph');

/**
 * Raised when the Graph API rejects the call because the access token is
 * expired/invalid (HTTP 401, or a Graph error body with code 190 /
 * type OAuthException). Unlike the per-metric tolerance, these errors must
 * propagate so the sync can flip the account to REAUTH_REQUIRED.
 */
export class InstagramAuthError extends Error {}

/**
 * Inspect a non-ok response for an auth failure. Throws InstagramAuthError on
 * HTTP 401 or a Graph OAuth error body (code 190 / type OAuthException),
 * tolerating both `{ error: { ... } }` and flat shapes. Returns the raw body
 * text for non-auth failures so callers can still log it.
 */
async function throwIfAuthError(res: Awaited<ReturnType<typeof fetch>>): Promise<string> {
  if (res.status === 401) {
    throw new InstagramAuthError('Instagram auth failed: HTTP 401');
  }
  let text = '';
  try {
    text = await res.text();
  } catch {
    return '';
  }
  if (text) {
    try {
      const parsed = JSON.parse(text) as any;
      const err = parsed?.error ?? parsed;
      if (err?.code === 190 || err?.type === 'OAuthException') {
        throw new InstagramAuthError(`Instagram auth failed: ${text}`);
      }
    } catch (e) {
      if (e instanceof InstagramAuthError) throw e;
      // Non-JSON / non-auth body — fall through to tolerant handling.
    }
  }
  return text;
}

export interface AccountProfile {
  followersCount?: number;
  mediaCount?: number;
}

export interface AccountInsights {
  reach?: number;
  views?: number;
  accountsEngaged?: number;
  totalInteractions?: number;
}

/**
 * One day of account-level insight data returned by the range-fetch helper.
 * Extends AccountInsights so the ACCOUNT_METRIC_KEYS mapping can assign
 * fields directly without extra casts.
 */
export interface DailyInsightRow extends AccountInsights {
  date: string; // YYYY-MM-DD (UTC)
}

export interface MediaItem {
  id: string;
  caption?: string;
  mediaType: string;
  mediaProductType?: string;
  permalink?: string;
  timestamp: string;
  likeCount?: number;
  commentsCount?: number;
}

export interface MediaInsights {
  reach?: number;
  saved?: number;
  shares?: number;
  views?: number;
}

// Shape of an IG insights response row. Newer responses use
// `total_value.value`; older ones use `values[0].value`.
interface InsightRow {
  name: string;
  total_value?: { value?: number };
  values?: Array<{ value?: number }>;
}

/** Read the numeric value from an insight row, preferring total_value. */
function readInsightValue(row: InsightRow | undefined): number | undefined {
  if (!row) return undefined;
  if (row.total_value && typeof row.total_value.value === 'number') {
    return row.total_value.value;
  }
  if (row.values && row.values.length > 0 && typeof row.values[0].value === 'number') {
    return row.values[0].value;
  }
  return undefined;
}

/** GET /{igUserId}?fields=followers_count,media_count */
export async function fetchAccountProfile(
  igUserId: string,
  token: string,
): Promise<AccountProfile> {
  const params = new URLSearchParams({
    fields: 'followers_count,media_count',
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${igUserId}?${params}`);
  if (!res.ok) {
    const body = await throwIfAuthError(res);
    logger.warn(`fetchAccountProfile failed for ${igUserId}: ${res.status} ${body}`);
    return {};
  }
  const data = (await res.json()) as { followers_count?: number; media_count?: number };
  const profile: AccountProfile = {};
  if (typeof data.followers_count === 'number') profile.followersCount = data.followers_count;
  if (typeof data.media_count === 'number') profile.mediaCount = data.media_count;
  return profile;
}

// API metric name → AccountInsights key.
const ACCOUNT_METRIC_KEYS: Record<string, keyof AccountInsights> = {
  reach: 'reach',
  views: 'views',
  accounts_engaged: 'accountsEngaged',
  total_interactions: 'totalInteractions',
};

// API metric name → MediaInsights key.
const MEDIA_METRIC_KEYS: Record<string, keyof MediaInsights> = {
  reach: 'reach',
  saved: 'saved',
  shares: 'shares',
  views: 'views',
};

/**
 * Fetch insights for a node with per-metric tolerance: try the whole batch
 * first; if that fails, retry each metric individually and keep only the ones
 * that succeed. Failures are skipped and logged. Returns a partial result.
 */
async function fetchInsightsWithTolerance<T>(
  path: string,
  token: string,
  metricKeys: Record<string, keyof T>,
  extraParams: Record<string, string>,
): Promise<Partial<T>> {
  const metricNames = Object.keys(metricKeys);

  const requestMetrics = async (names: string[]): Promise<InsightRow[] | null> => {
    const params = new URLSearchParams({
      metric: names.join(','),
      ...extraParams,
      access_token: token,
    });
    const res = await fetch(`${GRAPH}/${path}/insights?${params}`);
    if (!res.ok) {
      // Auth failures throw and propagate; other failures are tolerated.
      await throwIfAuthError(res);
      return null;
    }
    const json = (await res.json()) as { data?: InsightRow[] };
    return json.data ?? [];
  };

  const applyRows = (rows: InsightRow[], result: Partial<T>): void => {
    for (const row of rows) {
      const key = metricKeys[row.name];
      if (!key) continue;
      const value = readInsightValue(row);
      if (typeof value === 'number') {
        result[key] = value as T[keyof T];
      }
    }
  };

  const result: Partial<T> = {};

  // Try the batched request first.
  const batched = await requestMetrics(metricNames);
  if (batched) {
    applyRows(batched, result);
    return result;
  }

  // Batch failed — retry each metric on its own, skipping failures.
  const dropped: string[] = [];
  for (const name of metricNames) {
    const rows = await requestMetrics([name]);
    if (!rows) {
      dropped.push(name);
      continue;
    }
    applyRows(rows, result);
  }
  if (dropped.length > 0) {
    logger.warn(`Dropped insight metrics for ${path}: ${dropped.join(', ')}`);
  }
  return result;
}

/**
 * GET /{igUserId}/insights?metric=reach,views,accounts_engaged,total_interactions
 *   &period=day&metric_type=total_value
 */
export async function fetchAccountInsights(
  igUserId: string,
  token: string,
): Promise<AccountInsights> {
  return fetchInsightsWithTolerance<AccountInsights>(igUserId, token, ACCOUNT_METRIC_KEYS, {
    period: 'day',
    metric_type: 'total_value',
  });
}

/**
 * Fetch daily account insights for a date range by chunking into spans of
 * ≤ 30 days. Uses the time-series form of the insights API (no
 * `metric_type=total_value`) so each metric row exposes a `values[]` array
 * with one entry per day. Auth errors propagate via InstagramAuthError;
 * non-auth failures for a given chunk are skipped gracefully.
 *
 * @param sinceUnix  Unix timestamp (seconds) for the start of the range (inclusive).
 * @param untilUnix  Unix timestamp (seconds) for the end of the range (exclusive).
 */
export async function fetchAccountInsightsRange(
  igUserId: string,
  token: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<DailyInsightRow[]> {
  const CHUNK_SECS = 30 * 86400;
  const map = new Map<string, DailyInsightRow>();

  let s = sinceUnix;
  while (s < untilUnix) {
    const u = Math.min(s + CHUNK_SECS, untilUnix);

    const params = new URLSearchParams({
      metric: 'reach,views,accounts_engaged,total_interactions',
      period: 'day',
      since: String(s),
      until: String(u),
      access_token: token,
    });

    const res = await fetch(`${GRAPH}/${igUserId}/insights?${params}`);
    if (!res.ok) {
      // Throws InstagramAuthError on 401 / OAuthException; non-auth → skip.
      await throwIfAuthError(res);
      logger.warn(
        `fetchAccountInsightsRange: chunk [${s},${u}] failed for ${igUserId} (non-auth), skipping`,
      );
      s = u;
      continue;
    }

    const json = (await res.json()) as {
      data?: Array<{
        name: string;
        period?: string;
        values?: Array<{ value?: number; end_time?: string }>;
      }>;
    };

    for (const row of json.data ?? []) {
      const key = ACCOUNT_METRIC_KEYS[row.name];
      if (!key) continue;
      for (const entry of row.values ?? []) {
        if (!entry.end_time) continue;
        const val = entry.value;
        if (typeof val !== 'number') continue;
        const date = new Date(entry.end_time).toISOString().slice(0, 10);
        const existing = map.get(date) ?? { date };
        (existing as AccountInsights)[key] = val;
        map.set(date, existing);
      }
    }

    s = u;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * GET /{igUserId}/media?fields=...&limit={limit||25}
 */
export async function fetchMediaList(
  igUserId: string,
  token: string,
  limit = 25,
): Promise<MediaItem[]> {
  const params = new URLSearchParams({
    fields:
      'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${igUserId}/media?${params}`);
  if (!res.ok) {
    const body = await throwIfAuthError(res);
    logger.warn(`fetchMediaList failed for ${igUserId}: ${res.status} ${body}`);
    return [];
  }
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      caption?: string;
      media_type: string;
      media_product_type?: string;
      permalink?: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
    }>;
  };
  return (json.data ?? []).map((m) => {
    const item: MediaItem = {
      id: m.id,
      mediaType: m.media_type,
      timestamp: m.timestamp,
    };
    if (typeof m.caption === 'string') item.caption = m.caption;
    if (typeof m.media_product_type === 'string') item.mediaProductType = m.media_product_type;
    if (typeof m.permalink === 'string') item.permalink = m.permalink;
    if (typeof m.like_count === 'number') item.likeCount = m.like_count;
    if (typeof m.comments_count === 'number') item.commentsCount = m.comments_count;
    return item;
  });
}

/**
 * GET /{mediaId}/insights?metric=...
 * Available metrics vary by media type: only REELS/VIDEO expose `views`/`shares`,
 * so requesting them for IMAGE/CAROUSEL_ALBUM 400s on every run. The metric set
 * is chosen by media type; per-metric tolerance remains as a backstop.
 */
export async function fetchMediaInsights(
  mediaId: string,
  token: string,
  mediaType: string,
): Promise<MediaInsights> {
  const isVideo = mediaType === 'REELS' || mediaType === 'VIDEO';
  const names = isVideo
    ? ['reach', 'saved', 'shares', 'views']
    : ['reach', 'saved', 'shares'];
  const metricKeys: Record<string, keyof MediaInsights> = {};
  for (const name of names) metricKeys[name] = MEDIA_METRIC_KEYS[name];
  return fetchInsightsWithTolerance<MediaInsights>(mediaId, token, metricKeys, {});
}
