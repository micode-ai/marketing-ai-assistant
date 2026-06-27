import { describe, it, expect } from 'vitest';
import { resolveThreadsView, isSyncStale, type ThreadsStatus } from './threads-dashboard-state';

describe('resolveThreadsView', () => {
  it('loading when loading', () => {
    expect(resolveThreadsView({ loading: true, status: null })).toBe('loading');
  });
  it('hidden when not connected', () => {
    const s: ThreadsStatus = { connected: false, insightsGranted: false };
    expect(resolveThreadsView({ loading: false, status: s })).toBe('hidden');
    expect(resolveThreadsView({ loading: false, status: null })).toBe('hidden');
  });
  it('reconnect when connected but no insights', () => {
    const s: ThreadsStatus = { connected: true, insightsGranted: false };
    expect(resolveThreadsView({ loading: false, status: s })).toBe('reconnect');
  });
  it('connected when insights granted', () => {
    const s: ThreadsStatus = { connected: true, insightsGranted: true };
    expect(resolveThreadsView({ loading: false, status: s })).toBe('connected');
  });
});

describe('isSyncStale', () => {
  const now = Date.now();

  it('is stale when there is no last sync', () => {
    expect(isSyncStale(null, now)).toBe(true);
    expect(isSyncStale(undefined, now)).toBe(true);
  });

  it('is stale when older than 10 minutes', () => {
    const old = new Date(now - 11 * 60 * 1000).toISOString();
    expect(isSyncStale(old, now)).toBe(true);
  });

  it('is fresh when synced recently', () => {
    const recent = new Date(now - 2 * 60 * 1000).toISOString();
    expect(isSyncStale(recent, now)).toBe(false);
  });
});
