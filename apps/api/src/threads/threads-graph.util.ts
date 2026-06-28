import { Logger } from '@nestjs/common';

// Threads Graph API client.
// Base URL graph.threads.net; auth via the account's long-lived token
// passed as the `access_token` query param. Pure-ish fetch + mapping helpers.
const GRAPH = 'https://graph.threads.net';

const logger = new Logger('ThreadsGraph');

/**
 * Raised when the Graph API rejects the call because the access token is
 * expired/invalid (HTTP 401, or a Graph error body with code 190 /
 * type OAuthException). Unlike the per-metric tolerance, these errors must
 * propagate so the sync can flip the account to REAUTH_REQUIRED.
 */
export class ThreadsAuthError extends Error {}

/**
 * Inspect a non-ok response for an auth failure. Throws ThreadsAuthError on
 * HTTP 401 or a Graph OAuth error body (code 190 / type OAuthException),
 * tolerating both `{ error: { ... } }` and flat shapes. Returns the raw body
 * text for non-auth failures so callers can still log it.
 */
async function throwIfAuthError(res: Awaited<ReturnType<typeof fetch>>): Promise<string> {
  if (res.status === 401) {
    throw new ThreadsAuthError('Threads auth failed: HTTP 401');
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
        throw new ThreadsAuthError(`Threads auth failed: ${text}`);
      }
    } catch (e) {
      if (e instanceof ThreadsAuthError) throw e;
      // Non-JSON / non-auth body — fall through to tolerant handling.
    }
  }
  return text;
}

export interface ThreadsProfile {
  username?: string;
  followersCount?: number;
  profilePictureUrl?: string;
}

export interface ThreadsAccountInsights {
  followersCount?: number;
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
}

export interface ThreadsMediaItem {
  id: string;
  mediaType: string;
  text?: string;
  permalink?: string;
  timestamp: string;
}

export interface ThreadsMediaInsights {
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  shares?: number;
}

// Shape of a Threads insights response row. Newer responses use
// `total_value.value` (lifetime/total metrics like followers_count);
// time-series responses use `values[0].value`.
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

/**
 * The numeric-only fields of a Threads daily row. Used as the assignment
 * target in the range-fetch map to avoid TypeScript complaining that
 * `string` (date) is not assignable to `number`. Also used as the return
 * type for the period-total fetch so callers can type against a named shape.
 */
export interface DailyThreadsInsightValues {
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
}

/**
 * One day of account-level insight data returned by the range-fetch helper.
 * Mirrors DailyInsightRow from instagram-graph.util — no followersCount
 * because the time-series endpoint does not support that metric.
 */
export interface DailyThreadsInsightRow extends DailyThreadsInsightValues {
  date: string; // YYYY-MM-DD (UTC)
}

// API metric name → ThreadsAccountInsights key.
const ACCOUNT_METRIC_KEYS: Record<string, keyof ThreadsAccountInsights> = {
  views: 'views',
  likes: 'likes',
  replies: 'replies',
  reposts: 'reposts',
  quotes: 'quotes',
  followers_count: 'followersCount',
};

// Metric names used exclusively for time-series range fetches (no followers_count).
const RANGE_METRIC_KEYS: Record<string, keyof DailyThreadsInsightValues> = {
  views: 'views',
  likes: 'likes',
  replies: 'replies',
  reposts: 'reposts',
  quotes: 'quotes',
};

// API metric name → ThreadsMediaInsights key.
const MEDIA_METRIC_KEYS: Record<string, keyof ThreadsMediaInsights> = {
  views: 'views',
  likes: 'likes',
  replies: 'replies',
  reposts: 'reposts',
  quotes: 'quotes',
  shares: 'shares',
};

/**
 * Fetch insights for a node with per-metric tolerance: try the whole batch
 * first; if that fails, retry each metric individually and keep only the ones
 * that succeed. Failures are skipped and logged. Returns a partial result.
 *
 * `insightsEndpoint` defaults to `'insights'` (used for media); pass
 * `'threads_insights'` for account-level metrics.
 */
async function fetchInsightsWithTolerance<T>(
  path: string,
  token: string,
  metricKeys: Record<string, keyof T>,
  extraParams: Record<string, string>,
  insightsEndpoint = 'insights',
): Promise<Partial<T>> {
  const metricNames = Object.keys(metricKeys);

  const requestMetrics = async (names: string[]): Promise<InsightRow[] | null> => {
    const params = new URLSearchParams({
      metric: names.join(','),
      ...extraParams,
      access_token: token,
    });
    const res = await fetch(`${GRAPH}/${path}/${insightsEndpoint}?${params}`);
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
 * GET {GRAPH}/me?fields=username,followers_count,threads_profile_picture_url
 *
 * Uses /me (not /{threadsUserId}) as Threads profile metadata is fetched
 * via the authenticated user endpoint. threadsUserId is used for logging.
 */
export async function fetchThreadsProfile(
  threadsUserId: string,
  token: string,
): Promise<ThreadsProfile> {
  const params = new URLSearchParams({
    fields: 'username,followers_count,threads_profile_picture_url',
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/me?${params}`);
  if (!res.ok) {
    const body = await throwIfAuthError(res);
    logger.warn(`fetchThreadsProfile failed for ${threadsUserId}: ${res.status} ${body}`);
    return {};
  }
  const data = (await res.json()) as {
    username?: string;
    followers_count?: number;
    threads_profile_picture_url?: string;
  };
  const profile: ThreadsProfile = {};
  if (typeof data.username === 'string') profile.username = data.username;
  if (typeof data.followers_count === 'number') profile.followersCount = data.followers_count;
  if (typeof data.threads_profile_picture_url === 'string') {
    profile.profilePictureUrl = data.threads_profile_picture_url;
  }
  return profile;
}

/**
 * GET {GRAPH}/{threadsUserId}/threads_insights
 *   ?metric=views,likes,replies,reposts,quotes,followers_count
 *   &period=day&metric_type=total_value
 *
 * followers_count arrives as total_value.value (lifetime metric).
 * The engagement metrics (views/likes/replies/reposts/quotes) are time-series;
 * readInsightValue takes total_value first, then values[0] as fallback.
 */
export async function fetchThreadsAccountInsights(
  threadsUserId: string,
  token: string,
): Promise<ThreadsAccountInsights> {
  return fetchInsightsWithTolerance<ThreadsAccountInsights>(
    threadsUserId,
    token,
    ACCOUNT_METRIC_KEYS,
    { period: 'day', metric_type: 'total_value' },
    'threads_insights',
  );
}

/**
 * GET {GRAPH}/{threadsUserId}/threads_insights
 *   ?metric=views,likes,replies,reposts,quotes
 *   &period=day&metric_type=total_value&since=<sinceUnix>&until=<untilUnix>
 *
 * Returns the aggregate totals for the requested time window. Does NOT
 * include followers_count (that metric is not supported with since/until).
 * Uses the same per-metric tolerance as the other insight helpers (batch →
 * individual retry on non-auth failure; auth errors always propagate).
 */
export async function fetchThreadsAccountInsightsTotals(
  threadsUserId: string,
  token: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<DailyThreadsInsightValues> {
  return fetchInsightsWithTolerance<DailyThreadsInsightValues>(
    threadsUserId,
    token,
    RANGE_METRIC_KEYS,
    {
      period: 'day',
      metric_type: 'total_value',
      since: String(sinceUnix),
      until: String(untilUnix),
    },
    'threads_insights',
  );
}

/**
 * Fetch daily account insights for a date range by chunking into spans of
 * ≤ 30 days. Uses the time-series form of the threads_insights API (no
 * `metric_type=total_value`) so each metric row exposes a `values[]` array
 * with one entry per day. Auth errors propagate via ThreadsAuthError;
 * non-auth failures for a given chunk are skipped gracefully.
 *
 * @param sinceUnix  Unix timestamp (seconds) for the start of the range (inclusive).
 * @param untilUnix  Unix timestamp (seconds) for the end of the range (exclusive).
 */
export async function fetchThreadsAccountInsightsRange(
  threadsUserId: string,
  token: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<DailyThreadsInsightRow[]> {
  const CHUNK_SECS = 30 * 86400;
  const map = new Map<string, DailyThreadsInsightRow>();

  let s = sinceUnix;
  while (s < untilUnix) {
    const u = Math.min(s + CHUNK_SECS, untilUnix);

    const params = new URLSearchParams({
      metric: 'views,likes,replies,reposts,quotes',
      period: 'day',
      since: String(s),
      until: String(u),
      access_token: token,
    });

    const res = await fetch(`${GRAPH}/${threadsUserId}/threads_insights?${params}`);
    if (!res.ok) {
      // Throws ThreadsAuthError on 401 / OAuthException; non-auth → skip chunk.
      await throwIfAuthError(res);
      logger.warn(
        `fetchThreadsAccountInsightsRange: chunk [${s},${u}] failed for ${threadsUserId} (non-auth), skipping`,
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
      const key = RANGE_METRIC_KEYS[row.name];
      if (!key) continue;
      for (const entry of row.values ?? []) {
        if (!entry.end_time) continue;
        const val = entry.value;
        if (typeof val !== 'number') continue;
        const date = new Date(entry.end_time).toISOString().slice(0, 10);
        const existing = map.get(date) ?? { date };
        (existing as DailyThreadsInsightValues)[key] = val;
        map.set(date, existing);
      }
    }

    s = u;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * GET {GRAPH}/{threadsUserId}/threads?fields=id,media_type,text,permalink,timestamp&limit={limit}
 */
export async function fetchThreadsMediaList(
  threadsUserId: string,
  token: string,
  limit = 25,
): Promise<ThreadsMediaItem[]> {
  const params = new URLSearchParams({
    fields: 'id,media_type,text,permalink,timestamp',
    limit: String(limit),
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${threadsUserId}/threads?${params}`);
  if (!res.ok) {
    const body = await throwIfAuthError(res);
    logger.warn(`fetchThreadsMediaList failed for ${threadsUserId}: ${res.status} ${body}`);
    return [];
  }
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      media_type: string;
      text?: string;
      permalink?: string;
      timestamp: string;
    }>;
  };
  return (json.data ?? []).map((m) => {
    const item: ThreadsMediaItem = {
      id: m.id,
      mediaType: m.media_type,
      timestamp: m.timestamp,
    };
    if (typeof m.text === 'string') item.text = m.text;
    if (typeof m.permalink === 'string') item.permalink = m.permalink;
    return item;
  });
}

/**
 * GET {GRAPH}/{mediaId}/insights?metric=views,likes,replies,reposts,quotes,shares
 */
export async function fetchThreadsMediaInsights(
  mediaId: string,
  token: string,
): Promise<ThreadsMediaInsights> {
  return fetchInsightsWithTolerance<ThreadsMediaInsights>(
    mediaId,
    token,
    MEDIA_METRIC_KEYS,
    {},
  );
}
