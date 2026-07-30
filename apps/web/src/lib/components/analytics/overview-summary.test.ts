import { describe, it, expect } from 'vitest';
import { buildSummaryCards } from './overview-summary';

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
