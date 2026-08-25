import { buildGscDigest, EMPTY_GSC_DIGEST, GSC_LAG_DAYS } from './gsc-digest.util';

const summary = {
  totals: { clicks: 412, impressions: 9540, ctr: 0.0432, position: 18.37 },
  topQueries: [
    { query: 'crm software', clicks: 90, impressions: 1200, ctr: 0.075, position: 4.2 },
    { query: 'invoicing app', clicks: 60, impressions: 2400, ctr: 0.025, position: 12.61 },
    { query: 'q3', clicks: 5, impressions: 100, ctr: 0.05, position: 30.4 },
    { query: 'q4', clicks: 4, impressions: 90, ctr: 0.044, position: 31.1 },
    { query: 'q5', clicks: 3, impressions: 80, ctr: 0.037, position: 32.9 },
    { query: 'q6', clicks: 2, impressions: 70, ctr: 0.028, position: 40.0 },
  ],
};

describe('buildGscDigest', () => {
  it('reports nothing when the integration is absent', () => {
    expect(buildGscDigest(summary, false)).toEqual(EMPTY_GSC_DIGEST);
  });

  it('does not leak the shared empty constant', () => {
    const digest = buildGscDigest(null, false);
    digest.clicks = 5;

    expect(EMPTY_GSC_DIGEST.clicks).toBeNull();
  });

  it('stays connected with null figures when the fetch failed', () => {
    // A Google outage or a timeout must not read as "no search traffic".
    const digest = buildGscDigest(null, true);

    expect(digest.connected).toBe(true);
    expect(digest.clicks).toBeNull();
    expect(digest.avgPosition).toBeNull();
    expect(digest.topQueries).toEqual([]);
  });

  it('converts CTR from a fraction to a percent', () => {
    // Every other rate in the digest is a percent; leaving this as 0.0432 would
    // put it two orders of magnitude below the social engagement rates.
    expect(buildGscDigest(summary, true).ctr).toBe(4.32);
  });

  it('rounds clicks, impressions and position to useful precision', () => {
    const digest = buildGscDigest(summary, true);

    expect(digest.clicks).toBe(412);
    expect(digest.impressions).toBe(9540);
    expect(digest.avgPosition).toBe(18.4);
  });

  it('keeps five queries at most, in the order given', () => {
    const digest = buildGscDigest(summary, true);

    expect(digest.topQueries).toHaveLength(5);
    expect(digest.topQueries[0].query).toBe('crm software');
    expect(digest.topQueries[0].position).toBe(4.2);
    expect(digest.topQueries.map((q) => q.query)).not.toContain('q6');
  });

  it('drops the per-query CTR — clicks against impressions already says it', () => {
    const digest = buildGscDigest(summary, true);

    expect(digest.topQueries[0]).toEqual({
      query: 'crm software',
      clicks: 90,
      impressions: 1200,
      position: 4.2,
    });
  });

  it('always carries the reporting lag', () => {
    expect(buildGscDigest(summary, true).lagDays).toBe(GSC_LAG_DAYS);
    expect(buildGscDigest(null, true).lagDays).toBe(GSC_LAG_DAYS);
  });

  it('survives a summary with no queries and zeroed totals', () => {
    const digest = buildGscDigest(
      { totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, topQueries: [] },
      true,
    );

    expect(digest.connected).toBe(true);
    expect(digest.clicks).toBe(0);
    expect(digest.topQueries).toEqual([]);
  });
});
