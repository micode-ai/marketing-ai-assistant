import { describe, it, expect } from 'vitest';
import {
  resolveInstagramView,
  isSyncStale,
  lastKnown,
  type InstagramStatus,
} from './instagram-dashboard-state';

// The Instagram dashboard self-hides / branches purely on the status payload.
// These tests lock the branching contract without a full DOM render harness
// (the web app has no @testing-library/jsdom setup).

describe('resolveInstagramView', () => {
  it('returns "loading" while status is still being fetched', () => {
    expect(resolveInstagramView({ loading: true, status: null })).toBe('loading');
  });

  it('returns "hidden" (renders nothing/hint) when no IG account is linked', () => {
    const status: InstagramStatus = { connected: false, insightsGranted: false };
    expect(resolveInstagramView({ loading: false, status })).toBe('hidden');
    expect(resolveInstagramView({ loading: false, status: null })).toBe('hidden');
  });

  it('returns "reconnect" when connected but insights scope not granted', () => {
    const status: InstagramStatus = {
      connected: true,
      accountName: 'acme',
      insightsGranted: false,
    };
    expect(resolveInstagramView({ loading: false, status })).toBe('reconnect');
  });

  it('returns "connected" when linked with insights granted', () => {
    const status: InstagramStatus = {
      connected: true,
      accountName: 'acme',
      insightsGranted: true,
      lastSyncAt: new Date().toISOString(),
    };
    expect(resolveInstagramView({ loading: false, status })).toBe('connected');
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

describe('lastKnown', () => {
  it('returns 0 for an empty series', () => {
    expect(lastKnown([])).toBe(0);
  });

  it('returns 0 when every value is missing', () => {
    expect(lastKnown([null, undefined, null])).toBe(0);
  });

  it('returns the last value when the series is complete', () => {
    expect(lastKnown([10, 20, 30])).toBe(30);
  });

  it('skips trailing gaps — a backfilled newest row must not report 0', () => {
    expect(lastKnown([1200, 1250, null, null])).toBe(1250);
  });

  it('keeps a genuine zero', () => {
    expect(lastKnown([5, 0])).toBe(0);
  });

  it('ignores non-finite values', () => {
    expect(lastKnown([42, Number.NaN])).toBe(42);
  });
});
