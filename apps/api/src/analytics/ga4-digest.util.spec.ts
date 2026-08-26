import { buildGa4Digest, EMPTY_GA4_DIGEST } from './ga4-digest.util';

const totals = [
  {
    dimensions: {},
    metrics: {
      sessions: 1240,
      totalUsers: 980,
      newUsers: 610,
      screenPageViews: 3100,
      engagementRate: 0.6428,
    },
  },
];

const sources = [
  { dimensions: { sessionDefaultChannelGroup: 'Organic Search' }, metrics: { sessions: 700 } },
  { dimensions: { sessionDefaultChannelGroup: 'Direct' }, metrics: { sessions: 300 } },
  { dimensions: { sessionDefaultChannelGroup: 'Referral' }, metrics: { sessions: 140 } },
  { dimensions: { sessionDefaultChannelGroup: 'Organic Social' }, metrics: { sessions: 60 } },
  { dimensions: { sessionDefaultChannelGroup: 'Email' }, metrics: { sessions: 30 } },
  { dimensions: { sessionDefaultChannelGroup: 'Paid Search' }, metrics: { sessions: 10 } },
];

describe('buildGa4Digest', () => {
  it('reports nothing when no property is configured', () => {
    expect(buildGa4Digest({ connected: false, totals })).toEqual(EMPTY_GA4_DIGEST);
  });

  it('does not leak the shared empty constant', () => {
    const digest = buildGa4Digest({ connected: false });
    digest.sessions = 5;

    expect(EMPTY_GA4_DIGEST.sessions).toBeNull();
  });

  it('reads the totals it was given', () => {
    const digest = buildGa4Digest({ connected: true, totals });

    expect(digest).toMatchObject({
      connected: true,
      sessions: 1240,
      users: 980,
      newUsers: 610,
      pageViews: 3100,
    });
  });

  it('states the engagement rate as a percent, like every other rate', () => {
    // GA4 returns 0.6428; the social blocks state rates as percents, and mixing
    // the two invites a comparison two orders of magnitude wrong.
    expect(buildGa4Digest({ connected: true, totals }).engagementRate).toBe(64.3);
  });

  it('stays connected with null figures when the property answered nothing', () => {
    // A new property, or a tag that was never installed.
    const digest = buildGa4Digest({ connected: true, totals: [] });

    expect(digest.connected).toBe(true);
    expect(digest.sessions).toBeNull();
    expect(digest.engagementRate).toBeNull();
    expect(digest.topSources).toEqual([]);
  });

  it('keeps key events null when that report failed on its own', () => {
    // It is fetched separately because a metric a property does not populate
    // fails the whole report, not one column.
    const digest = buildGa4Digest({ connected: true, totals, keyEvents: null });

    expect(digest.sessions).toBe(1240);
    expect(digest.keyEvents).toBeNull();
  });

  it('reads key events when that report succeeded', () => {
    const digest = buildGa4Digest({
      connected: true,
      totals,
      keyEvents: [{ dimensions: {}, metrics: { keyEvents: 47 } }],
    });

    expect(digest.keyEvents).toBe(47);
  });

  it('orders channels by sessions and keeps five', () => {
    const digest = buildGa4Digest({ connected: true, totals, sources });

    expect(digest.topSources).toHaveLength(5);
    expect(digest.topSources[0]).toEqual({ source: 'Organic Search', sessions: 700 });
    expect(digest.topSources.map((s) => s.source)).not.toContain('Paid Search');
  });

  it('drops rows with no dimension value', () => {
    const digest = buildGa4Digest({
      connected: true,
      totals,
      sources: [
        { dimensions: { sessionDefaultChannelGroup: '' }, metrics: { sessions: 999 } },
        { dimensions: { sessionDefaultChannelGroup: 'Direct' }, metrics: { sessions: 10 } },
      ],
    });

    expect(digest.topSources).toEqual([{ source: 'Direct', sessions: 10 }]);
  });

  it('reads landing pages under their own key', () => {
    const digest = buildGa4Digest({
      connected: true,
      totals,
      landingPages: [
        { dimensions: { landingPage: '/pricing' }, metrics: { sessions: 210 } },
        { dimensions: { landingPage: '/' }, metrics: { sessions: 640 } },
      ],
    });

    expect(digest.topLandingPages).toEqual([
      { page: '/', sessions: 640 },
      { page: '/pricing', sessions: 210 },
    ]);
  });

  it('rounds fractional session counts', () => {
    const digest = buildGa4Digest({
      connected: true,
      totals,
      sources: [{ dimensions: { sessionDefaultChannelGroup: 'Direct' }, metrics: { sessions: 10.6 } }],
    });

    expect(digest.topSources[0].sessions).toBe(11);
  });
});
