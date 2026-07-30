import { describe, it, expect } from 'vitest';
import {
  deltaSeries,
  followerChange,
  isHistoryTooShort,
  isSyncStale,
  periodDelta,
  resolveTikTokView,
  type TikTokSnapshot,
} from './tiktok-dashboard-state';

function snap(date: string, values: Partial<TikTokSnapshot> = {}): TikTokSnapshot {
  return {
    date,
    followersCount: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    ...values,
  };
}

describe('resolveTikTokView', () => {
  it('shows the skeleton while status is unknown', () => {
    expect(resolveTikTokView({ loading: true, status: null })).toBe('loading');
  });

  it('hides itself when no TikTok account is linked', () => {
    expect(resolveTikTokView({ loading: false, status: null })).toBe('hidden');
    expect(
      resolveTikTokView({ loading: false, status: { connected: false, statsGranted: false } }),
    ).toBe('hidden');
  });

  it('asks for a reconnect when the analytics scopes are missing', () => {
    expect(
      resolveTikTokView({ loading: false, status: { connected: true, statsGranted: false } }),
    ).toBe('reconnect');
  });

  it('renders metrics when connected with analytics scopes', () => {
    expect(
      resolveTikTokView({ loading: false, status: { connected: true, statsGranted: true } }),
    ).toBe('connected');
  });
});

describe('isSyncStale', () => {
  const now = Date.parse('2026-07-30T12:00:00Z');

  it('treats a missing or unparsable timestamp as stale', () => {
    expect(isSyncStale(null, now)).toBe(true);
    expect(isSyncStale(undefined, now)).toBe(true);
    expect(isSyncStale('not-a-date', now)).toBe(true);
  });

  it('is fresh within ten minutes and stale beyond it', () => {
    expect(isSyncStale('2026-07-30T11:55:00Z', now)).toBe(false);
    expect(isSyncStale('2026-07-30T11:45:00Z', now)).toBe(true);
  });
});

describe('periodDelta', () => {
  it('subtracts the first snapshot from the last instead of summing them', () => {
    const rows = [
      snap('2026-07-01', { views: 1000 }),
      snap('2026-07-15', { views: 2500 }),
      snap('2026-07-30', { views: 4000 }),
    ];
    // A sum would give 7500 — every row already holds the lifetime total.
    expect(periodDelta(rows, 'views')).toBe(3000);
  });

  it('returns the lifetime total when only one snapshot exists', () => {
    expect(periodDelta([snap('2026-07-30', { likes: 42 })], 'likes')).toBe(42);
  });

  it('clamps to zero when a deleted video lowers the lifetime counter', () => {
    const rows = [snap('2026-07-01', { views: 5000 }), snap('2026-07-30', { views: 3000 })];
    expect(periodDelta(rows, 'views')).toBe(0);
  });

  it('returns zero when the metric was never recorded', () => {
    expect(periodDelta([], 'shares')).toBe(0);
    expect(periodDelta([snap('2026-07-30')], 'shares')).toBe(0);
  });

  it('skips snapshots missing the metric', () => {
    const rows = [
      snap('2026-07-01', { comments: 10 }),
      snap('2026-07-15'),
      snap('2026-07-30', { comments: 25 }),
    ];
    expect(periodDelta(rows, 'comments')).toBe(15);
  });
});

describe('deltaSeries', () => {
  it('plots day-over-day growth and drops the baseline snapshot', () => {
    const rows = [
      snap('2026-07-01', { views: 1000 }),
      snap('2026-07-02', { views: 1200 }),
      snap('2026-07-03', { views: 1700 }),
    ];
    // The first row would otherwise spike the chart with the entire lifetime total.
    expect(deltaSeries(rows, 'views')).toEqual([
      { date: '2026-07-02', value: 200 },
      { date: '2026-07-03', value: 500 },
    ]);
  });

  it('clamps a negative step to zero', () => {
    const rows = [
      snap('2026-07-01', { likes: 500 }),
      snap('2026-07-02', { likes: 300 }),
      snap('2026-07-03', { likes: 350 }),
    ];
    expect(deltaSeries(rows, 'likes')).toEqual([
      { date: '2026-07-02', value: 0 },
      { date: '2026-07-03', value: 50 },
    ]);
  });

  it('produces nothing from a single snapshot', () => {
    expect(deltaSeries([snap('2026-07-30', { views: 4000 })], 'views')).toEqual([]);
  });

  it('bridges over snapshots missing the metric', () => {
    const rows = [
      snap('2026-07-01', { shares: 10 }),
      snap('2026-07-02'),
      snap('2026-07-03', { shares: 18 }),
    ];
    expect(deltaSeries(rows, 'shares')).toEqual([{ date: '2026-07-03', value: 8 }]);
  });
});

describe('followerChange', () => {
  it('reports growth across the window', () => {
    const rows = [
      snap('2026-07-01', { followersCount: 900 }),
      snap('2026-07-30', { followersCount: 1200 }),
    ];
    expect(followerChange(rows)).toBe(300);
  });

  it('keeps a loss negative — unlike cumulative counters, this can legitimately drop', () => {
    const rows = [
      snap('2026-07-01', { followersCount: 1200 }),
      snap('2026-07-30', { followersCount: 1150 }),
    ];
    expect(followerChange(rows)).toBe(-50);
  });

  it('is zero without a baseline', () => {
    expect(followerChange([snap('2026-07-30', { followersCount: 1200 })])).toBe(0);
    expect(followerChange([])).toBe(0);
  });
});

describe('isHistoryTooShort', () => {
  it('flags the single-snapshot case so the UI can explain the platform limit', () => {
    expect(isHistoryTooShort([snap('2026-07-30')])).toBe(true);
    expect(isHistoryTooShort([snap('2026-07-29'), snap('2026-07-30')])).toBe(false);
    expect(isHistoryTooShort([])).toBe(false);
  });
});
