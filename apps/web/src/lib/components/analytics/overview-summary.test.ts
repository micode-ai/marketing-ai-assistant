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
});
