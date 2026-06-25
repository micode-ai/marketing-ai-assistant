import {
  strikingDistance, lowCtr, cannibalization, movers, mergePreviousMetrics, expectedCtr,
} from './gsc-insights.util';

const row = (keys: string[], clicks: number, impressions: number, ctr: number, position: number) =>
  ({ keys, clicks, impressions, ctr, position });

describe('strikingDistance', () => {
  it('keeps only positions in (10,20] above the impressions floor, sorted by impressions', () => {
    const rows = [
      row(['a'], 0, 100, 0, 12),   // qualifies
      row(['b'], 0, 5, 0, 15),     // below MIN_IMPRESSIONS (10)
      row(['c'], 0, 200, 0, 9),    // position <= 10, excluded
      row(['d'], 0, 50, 0, 18),    // qualifies
    ];
    const out = strikingDistance(rows);
    expect(out.map((r) => r.key)).toEqual(['a', 'd']);
  });
});

describe('lowCtr', () => {
  it('ranks page-1 high-impression rows by missed clicks vs expected CTR', () => {
    const rows = [
      row(['x'], 5, 1000, 0.005, 3), // expected ~0.11 -> big missed
      row(['y'], 90, 1000, 0.09, 3), // ctr near/above expected -> ~0 missed, dropped
      row(['z'], 0, 10, 0, 2),       // below MIN_IMPRESSIONS (20), excluded
    ];
    const out = lowCtr(rows);
    expect(out[0].key).toBe('x');
    expect(out[0].missedClicks).toBeGreaterThan(0);
    expect(out.find((r) => r.key === 'z')).toBeUndefined();
  });
});

describe('cannibalization', () => {
  it('flags queries with >= 2 pages above the impressions floor', () => {
    const rows = [
      row(['q1', '/a'], 1, 30, 0, 5),
      row(['q1', '/b'], 1, 20, 0, 8),
      row(['q2', '/c'], 1, 100, 0, 2),  // only one page -> not cannibalized
      row(['q3', '/d'], 0, 2, 0, 9),    // below CANNIBAL floor (5)
    ];
    const out = cannibalization(rows);
    expect(out.map((r) => r.query)).toEqual(['q1']);
    expect(out[0].pages).toHaveLength(2);
  });
});

describe('movers', () => {
  it('computes click and position deltas and splits gainers/losers', () => {
    const current = [row(['up'], 100, 500, 0.2, 4), row(['down'], 10, 500, 0.02, 9)];
    const previous = [row(['up'], 20, 400, 0.05, 8), row(['down'], 80, 400, 0.2, 3)];
    const { gainers, losers } = movers(current, previous);
    expect(gainers[0].key).toBe('up');
    expect(gainers[0].deltaClicks).toBe(80);
    expect(gainers[0].deltaPosition).toBeCloseTo(-4); // 4 - 8 improved
    expect(losers[0].key).toBe('down');
    expect(losers[0].deltaClicks).toBe(-70);
  });
});

describe('mergePreviousMetrics', () => {
  it('attaches previous-period metrics by joined keys, null position when absent', () => {
    const current = [row(['q', '/a'], 5, 50, 0.1, 4)];
    const previous = [row(['q', '/a'], 2, 40, 0.05, 6)];
    const merged = mergePreviousMetrics(current, previous);
    expect(merged[0].prevClicks).toBe(2);
    expect(merged[0].prevPosition).toBe(6);
    expect(mergePreviousMetrics([row(['new'], 1, 10, 0.1, 5)], [])[0].prevPosition).toBeNull();
  });
});

describe('expectedCtr', () => {
  it('returns higher expected CTR for better positions', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(99)).toBeLessThanOrEqual(expectedCtr(10));
  });
});
