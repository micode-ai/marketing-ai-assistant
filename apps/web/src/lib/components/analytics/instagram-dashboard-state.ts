// Pure view-state helper for the Instagram analytics dashboard. Extracted so the
// connection-state branching can be unit-tested without a DOM render harness.

export interface InstagramStatus {
  connected: boolean;
  accountName?: string;
  accountId?: string;
  lastSyncAt?: string | Date | null;
  insightsGranted: boolean;
}

export type InstagramDashboardView = 'loading' | 'hidden' | 'reconnect' | 'connected';

/**
 * Decide what the dashboard should render:
 * - `loading`    — still checking status
 * - `hidden`     — no Instagram account linked to the project (render a small hint / nothing)
 * - `reconnect`  — account linked but the insights scope was not granted
 * - `connected`  — account linked with insights → show metrics
 */
export function resolveInstagramView(opts: {
  loading: boolean;
  status: InstagramStatus | null;
}): InstagramDashboardView {
  if (opts.loading) return 'loading';
  if (!opts.status?.connected) return 'hidden';
  if (!opts.status.insightsGranted) return 'reconnect';
  return 'connected';
}

/**
 * Latest non-null value in a daily series, or 0 when there is none.
 *
 * Needed because only `reach` has a daily time series in the Graph API: days
 * that came from the 90-day backfill carry reach and nothing else. Reading the
 * last row blindly therefore reports 0 followers whenever the newest row is a
 * backfilled one.
 */
export function lastKnown(values: Array<number | null | undefined>): number {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

const STALE_MS = 10 * 60 * 1000; // 10 minutes

/** True when the last sync is missing or older than ~10 minutes. */
export function isSyncStale(lastSyncAt: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (!lastSyncAt) return true;
  const ts = new Date(lastSyncAt).getTime();
  if (Number.isNaN(ts)) return true;
  return now - ts > STALE_MS;
}
