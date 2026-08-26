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

const insights = {
  strikingDistance: [
    { key: 'faktura online', clicks: 3, impressions: 900, position: 13.4 },
    { key: 'program do faktur', clicks: 1, impressions: 500, position: 17.9 },
    { key: 'q3', clicks: 0, impressions: 200, position: 19.1 },
    { key: 'q4', clicks: 0, impressions: 150, position: 12.2 },
  ],
  lowCtr: [
    { key: 'crm dla firm', clicks: 10, impressions: 4000, position: 3.2, missedClicks: 84 },
    { key: 'crm cennik', clicks: 4, impressions: 900, position: 6.1, missedClicks: 21 },
  ],
  cannibalization: [
    {
      query: 'crm software',
      totalImpressions: 2000,
      pages: [
        { page: '/crm', clicks: 20, impressions: 1200, position: 8.1 },
        { page: '/blog/crm-guide', clicks: 4, impressions: 800, position: 14.6 },
        { page: '/pricing', clicks: 1, impressions: 300, position: 22.0 },
        { page: '/about', clicks: 0, impressions: 100, position: 40.0 },
      ],
    },
  ],
  moversQueries: {
    gainers: [{ key: 'invoicing app', clicks: 40 }],
    losers: [{ key: 'accounting tool', clicks: 5 }],
  },
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

  it('carries the insights the SEO page already computes', () => {
    const digest = buildGscDigest(summary, true, insights);

    expect(digest.strikingDistance[0]).toEqual({
      query: 'faktura online',
      impressions: 900,
      position: 13.4,
    });
    // missedClicks is the whole point: a quantified, nameable loss.
    expect(digest.lowCtr[0]).toEqual({
      query: 'crm dla firm',
      position: 3.2,
      missedClicks: 84,
    });
    expect(digest.movers.gainers[0]).toEqual({ query: 'invoicing app', clicks: 40 });
    expect(digest.movers.losers[0]).toEqual({ query: 'accounting tool', clicks: 5 });
  });

  it('caps every insight list so the prompt stays small', () => {
    const digest = buildGscDigest(summary, true, insights);

    expect(digest.strikingDistance).toHaveLength(3);
    expect(digest.lowCtr).toHaveLength(2);
    expect(digest.cannibalization).toHaveLength(1);
  });

  it('reduces cannibalization to the query and the competing page URLs', () => {
    const digest = buildGscDigest(summary, true, insights);

    expect(digest.cannibalization[0]).toEqual({
      query: 'crm software',
      pages: ['/crm', '/blog/crm-guide', '/pricing'],
    });
  });

  it('keeps the insights when the summary itself failed', () => {
    // They come from a separate call, so one failing does not blank the other.
    const digest = buildGscDigest(null, true, insights);

    expect(digest.clicks).toBeNull();
    expect(digest.strikingDistance).toHaveLength(3);
  });

  it('carries top pages, which the summary was already fetching', () => {
    const withPages = {
      ...summary,
      topPages: [{ page: '/pricing', clicks: 120, impressions: 3000, ctr: 0.04, position: 6.4 }],
    };

    expect(buildGscDigest(withPages, true).topPages[0]).toEqual({
      page: '/pricing',
      clicks: 120,
      impressions: 3000,
      position: 6.4,
    });
  });

  it('leaves the insight lists empty when they were not fetched', () => {
    const digest = buildGscDigest(summary, true);

    expect(digest.strikingDistance).toEqual([]);
    expect(digest.movers).toEqual({ gainers: [], losers: [] });
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
