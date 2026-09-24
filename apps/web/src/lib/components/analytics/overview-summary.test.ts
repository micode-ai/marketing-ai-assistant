import { describe, it, expect } from 'vitest';
import { buildSummaryCards, readGscSummary, readThreadsEngagement } from './overview-summary';

describe('buildSummaryCards', () => {
  it('includes site KPIs always and channel KPIs only when connected', () => {
    const cards = buildSummaryCards({
      totals: { total: { visitors: 12800, conversions: 432 }, change: { visitors: 5, conversions: -2 }, trend: { visitors: 'up', conversions: 'down' } },
      gsc: { connected: true, clicks: 9100, clicksChange: 12 },
      instagram: { connected: false },
      threads: { connected: true, engagement: 1200, engagementChange: 8 },
    });
    const keys = cards.map((c) => c.key);
    expect(keys).toContain('visitors');
    expect(keys).toContain('conversions');
    expect(keys).toContain('gscClicks');
    expect(keys).toContain('threadsEngagement');
    expect(keys).not.toContain('igFollowers');
    const conv = cards.find((c) => c.key === 'conversions');
    expect(conv?.trend).toBe('down');
  });

  it('adds a TikTok views card when TikTok is connected', () => {
    const cards = buildSummaryCards({
      totals: { total: { visitors: 1, conversions: 1 }, change: { visitors: 0, conversions: 0 } },
      gsc: { connected: false },
      instagram: { connected: false },
      threads: { connected: false },
      tiktok: { connected: true, views: 3000, viewsChange: 4 },
    });

    const tiktok = cards.find((c) => c.key === 'tiktokViews');
    expect(tiktok).toMatchObject({ value: 3000, channel: 'tiktok', trend: 'up' });
  });

  it('omits the TikTok card when the channel is absent or disconnected', () => {
    const base = {
      totals: { total: { visitors: 1, conversions: 1 }, change: { visitors: 0, conversions: 0 } },
      gsc: { connected: false },
      instagram: { connected: false },
      threads: { connected: false },
    };

    // Callers written before the TikTok channel omit the field entirely.
    expect(buildSummaryCards(base).map((c) => c.key)).not.toContain('tiktokViews');
    expect(
      buildSummaryCards({ ...base, tiktok: { connected: false } }).map((c) => c.key),
    ).not.toContain('tiktokViews');
  });
});

// The two readers below parse the responses the overview actually receives.
// They exist because the strip read fields no endpoint returns — `clicks` /
// `daily` for GSC and `totalInteractions` / `posts` for Threads — and so showed
// 0 for both on prod while the tabs had 106 clicks and 48 interactions.
describe('readGscSummary', () => {
  it('reads clicks from totals and the daily series from byDate', () => {
    const r = readGscSummary({
      totals: { clicks: 106, impressions: 9973, ctr: 0.01, position: 20.8 },
      byDate: [
        { date: '2026-09-01', clicks: 3, impressions: 100 },
        { date: '2026-09-02', clicks: 5, impressions: 120 },
      ],
    });
    expect(r.clicks).toBe(106);
    expect(r.daily).toEqual([
      { date: '2026-09-01', clicks: 3 },
      { date: '2026-09-02', clicks: 5 },
    ]);
  });

  it('degrades to 0 and no series for an empty or odd response', () => {
    expect(readGscSummary(null)).toEqual({ clicks: 0, daily: null });
    expect(readGscSummary({ totals: {} })).toEqual({ clicks: 0, daily: null });
  });
});

describe('readThreadsEngagement', () => {
  it('sums likes, replies, reposts and quotes from the period totals', () => {
    expect(
      readThreadsEngagement({
        account: [],
        periodTotals: { views: 0, likes: 35, replies: 13, reposts: 0, quotes: 0 },
      }),
    ).toBe(48);
  });

  it('falls back to the daily rows for a metric the period totals lack', () => {
    expect(
      readThreadsEngagement({
        account: [
          { likes: 2, replies: 1, reposts: null, quotes: null },
          { likes: 3, replies: null, reposts: 1, quotes: null },
        ],
        periodTotals: {},
      }),
    ).toBe(7);
  });

  it('never counts views as engagement', () => {
    expect(readThreadsEngagement({ account: [{ views: 500 }], periodTotals: { views: 500 } })).toBe(0);
  });

  it('is 0 for an empty response', () => {
    expect(readThreadsEngagement(null)).toBe(0);
  });
});
