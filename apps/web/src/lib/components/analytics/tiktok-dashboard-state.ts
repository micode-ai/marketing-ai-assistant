// Pure view-state helpers for the TikTok analytics dashboard. Extracted so the
// connection branching and — more importantly — the cumulative-to-period maths
// can be unit-tested without a DOM render harness.

export interface TikTokStatus {
  connected: boolean;
  accountName?: string;
  accountId?: string;
  lastSyncAt?: string | Date | null;
  /** Both user.info.stats and video.list were granted. */
  statsGranted: boolean;
}

export type TikTokDashboardView = 'loading' | 'hidden' | 'reconnect' | 'connected';

/**
 * Decide what the dashboard should render:
 * - `loading`   — still checking status
 * - `hidden`    — no TikTok account linked to the project
 * - `reconnect` — account linked but the analytics scopes were not granted
 * - `connected` — account linked with analytics scopes → show metrics
 */
export function resolveTikTokView(opts: {
  loading: boolean;
  status: TikTokStatus | null;
}): TikTokDashboardView {
  if (opts.loading) return 'loading';
  if (!opts.status?.connected) return 'hidden';
  if (!opts.status.statsGranted) return 'reconnect';
  return 'connected';
}

const STALE_MS = 10 * 60 * 1000; // 10 minutes

/** True when the last sync is missing or older than ~10 minutes. */
export function isSyncStale(
  lastSyncAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSyncAt) return true;
  const ts = new Date(lastSyncAt).getTime();
  if (Number.isNaN(ts)) return true;
  return now - ts > STALE_MS;
}

/**
 * A snapshot row from GET /tiktok/metrics. TikTok's Display API only exposes
 * lifetime counters, so every numeric field here is CUMULATIVE as of `date`.
 */
export interface TikTokSnapshot {
  date: string;
  followersCount: number | null;
  followingCount?: number | null;
  likesCount?: number | null;
  videoCount?: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export type CumulativeKey = 'views' | 'likes' | 'comments' | 'shares';

/**
 * Growth across the window: last − first.
 *
 * Summing the rows would be wrong — each row already contains the account's
 * lifetime total, so a sum counts the same views once per snapshot. With a
 * single snapshot there is no baseline to subtract, so its own value (the
 * lifetime total) is the only honest answer. Clamped at 0 because deleting a
 * video lowers the lifetime counter.
 */
export function periodDelta(rows: TikTokSnapshot[], key: CumulativeKey): number {
  const values = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  return Math.max(0, values[values.length - 1]! - values[0]!);
}

export interface DeltaPoint {
  date: string;
  value: number;
}

/**
 * Day-over-day deltas for charting. The first snapshot has no predecessor, so it
 * is dropped rather than plotted as a spike of its entire lifetime total.
 * Negative steps (deleted videos) clamp to 0.
 */
export function deltaSeries(rows: TikTokSnapshot[], key: CumulativeKey): DeltaPoint[] {
  const points: DeltaPoint[] = [];
  let prev: number | null = null;

  for (const row of rows) {
    const current = row[key];
    if (typeof current !== 'number') continue;
    if (prev !== null) {
      points.push({ date: row.date, value: Math.max(0, current - prev) });
    }
    prev = current;
  }

  return points;
}

/** Follower change across the window (can legitimately be negative). */
export function followerChange(rows: TikTokSnapshot[]): number {
  const values = rows
    .map((r) => r.followersCount)
    .filter((v): v is number => typeof v === 'number');
  if (values.length < 2) return 0;
  return values[values.length - 1]! - values[0]!;
}

/**
 * True when the account has a single snapshot, i.e. history has not accumulated
 * yet. The UI explains that TikTok cannot be backfilled instead of implying the
 * sync is broken.
 */
export function isHistoryTooShort(rows: TikTokSnapshot[]): boolean {
  return rows.length === 1;
}
