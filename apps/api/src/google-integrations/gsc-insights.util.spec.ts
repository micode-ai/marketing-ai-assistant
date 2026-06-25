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
  it('ranks page-1 high-impression rows by missed clicks and drops rows at/above expected CTR', () => {
    const rows = [
      row(['x'], 5, 1000, 0.005, 3), // expected ~0.11 -> big missed clicks
      row(['y'], 120, 1000, 0.12, 3), // ctr above expected(3)=0.11 -> 0 missed -> dropped
      row(['z'], 0, 10, 0, 2),       // below MIN_IMPRESSIONS (20) -> excluded
    ];
    const out = lowCtr(rows);
    expect(out[0].key).toBe('x');
    expect(out[0].missedClicks).toBeGreaterThan(0);
    expect(out.find((r) => r.key === 'y')).toBeUndefined();
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

  it('surfaces previous-only keys as losers and caps each list at MOVERS_LIMIT', () => {
    const current = [row(['stay'], 50, 500, 0.1, 5)];
    const previous = [row(['stay'], 40, 500, 0.08, 5), row(['gone'], 200, 800, 0.25, 3)];
    const { losers } = movers(current, previous);
    const gone = losers.find((m) => m.key === 'gone');
    expect(gone).toBeDefined();
    expect(gone!.deltaClicks).toBe(-200);

    const manyCurrent = Array.from({ length: 30 }, (_, i) => row([`k${i}`], i, 100, 0.1, 5));
    const { gainers } = movers(manyCurrent, []);
    expect(gainers.length).toBe(25);
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

  it('handles no-dimension (site totals) rows where GSC omits keys entirely', () => {
    // GSC returns the aggregate row with NO `keys` field for a no-dimension query.
    const current = [{ clicks: 100, impressions: 2000, ctr: 0.05, position: 8 } as any];
    const previous = [{ clicks: 80, impressions: 1800, ctr: 0.044, position: 9 } as any];
    const merged = mergePreviousMetrics(current, previous);
    expect(merged[0].keys).toEqual([]);
    expect(merged[0].clicks).toBe(100);
    expect(merged[0].prevClicks).toBe(80);
    expect(merged[0].prevPosition).toBe(9);
  });
});

describe('expectedCtr', () => {
  it('returns higher expected CTR for better positions', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(99)).toBeLessThanOrEqual(expectedCtr(10));
  });
});
