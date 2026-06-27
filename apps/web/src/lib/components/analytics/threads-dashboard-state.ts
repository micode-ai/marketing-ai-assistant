// Pure view-state helper for the Threads analytics dashboard. Extracted so the
// connection-state branching can be unit-tested without a DOM render harness.

export interface ThreadsStatus {
  connected: boolean;
  accountName?: string;
  accountId?: string;
  lastSyncAt?: string | Date | null;
  insightsGranted: boolean;
}

export type ThreadsDashboardView = 'loading' | 'hidden' | 'reconnect' | 'connected';

/**
 * Decide what the dashboard should render:
 * - `loading`    — still checking status
 * - `hidden`     — no Threads account linked to the project (render a small hint / nothing)
 * - `reconnect`  — account linked but the insights scope was not granted
 * - `connected`  — account linked with insights → show metrics
 */
export function resolveThreadsView(opts: {
  loading: boolean;
  status: ThreadsStatus | null;
}): ThreadsDashboardView {
  if (opts.loading) return 'loading';
  if (!opts.status?.connected) return 'hidden';
  if (!opts.status.insightsGranted) return 'reconnect';
  return 'connected';
}

const STALE_MS = 10 * 60 * 1000; // 10 minutes

/** True when the last sync is missing or older than ~10 minutes. */
export function isSyncStale(lastSyncAt: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (!lastSyncAt) return true;
  const ts = new Date(lastSyncAt).getTime();
  if (Number.isNaN(ts)) return true;
  return now - ts > STALE_MS;
}
