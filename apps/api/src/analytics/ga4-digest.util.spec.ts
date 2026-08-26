import { buildGa4Digest, EMPTY_GA4_DIGEST, GA4_LAG_HOURS } from './ga4-digest.util';

const totalMetrics = {
  sessions: 93,
  totalUsers: 19,
  newUsers: 19,
  screenPageViews: 147,
  engagementRate: 0.2903,
  averageSessionDuration: 74.6,
};

const totals = [{ dimensions: {}, metrics: totalMetrics }];

const comparedTotals = [
  { dimensions: { dateRange: 'current' }, metrics: totalMetrics },
  {
    dimensions: { dateRange: 'previous' },
    metrics: { ...totalMetrics, sessions: 62, totalUsers: 20 },
  },
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

  it('always carries the processing lag', () => {
    expect(buildGa4Digest({ connected: true, totals }).lagHours).toBe(GA4_LAG_HOURS);
    expect(buildGa4Digest({ connected: true }).lagHours).toBe(GA4_LAG_HOURS);
  });

  it('reads the totals and states rates as percents', () => {
    const digest = buildGa4Digest({ connected: true, totals });

    expect(digest).toMatchObject({
      sessions: 93,
      users: 19,
      newUsers: 19,
      pageViews: 147,
      engagementRate: 29,
      avgSessionDuration: 75,
    });
  });

  describe('period comparison', () => {
    it('computes the change against the previous window', () => {
      const digest = buildGa4Digest({ connected: true, totals: comparedTotals });

      expect(digest.sessions).toBe(93);
      expect(digest.previous).toMatchObject({ sessions: 62, users: 20 });
      expect(digest.change?.sessions).toBe(50);
      // Users fell while sessions rose — the kind of thing a single number hides.
      expect(digest.change?.users).toBe(-5);
    });

    it('reports no comparison when only one window was requested', () => {
      const digest = buildGa4Digest({ connected: true, totals });

      expect(digest.previous).toBeNull();
      expect(digest.change).toBeNull();
    });

    it('leaves a change null when the previous value was zero', () => {
      // Growth from zero is unbounded; inventing 100% would be a fabrication.
      const digest = buildGa4Digest({
        connected: true,
        totals: [
          { dimensions: { dateRange: 'current' }, metrics: { sessions: 10 } },
          { dimensions: { dateRange: 'previous' }, metrics: { sessions: 0 } },
        ],
      });

      expect(digest.previous?.sessions).toBe(0);
      expect(digest.change?.sessions).toBeNull();
    });
  });

  describe('key events', () => {
    it('distinguishes "not configured" from "zero this period"', () => {
      const notConfigured = buildGa4Digest({ connected: true, totals, keyEvents: [] });
      const configuredButZero = buildGa4Digest({
        connected: true,
        totals,
        keyEvents: [{ dimensions: {}, metrics: { keyEvents: 0 } }],
      });

      expect(notConfigured.keyEvents).toBeNull();
      expect(notConfigured.keyEventsConfigured).toBe(false);

      expect(configuredButZero.keyEvents).toBe(0);
      expect(configuredButZero.keyEventsConfigured).toBe(true);
    });

    it('compares key events too', () => {
      const digest = buildGa4Digest({
        connected: true,
        totals: comparedTotals,
        keyEvents: [
          { dimensions: { dateRange: 'current' }, metrics: { keyEvents: 12 } },
          { dimensions: { dateRange: 'previous' }, metrics: { keyEvents: 8 } },
        ],
      });

      expect(digest.keyEvents).toBe(12);
      expect(digest.change?.keyEvents).toBe(50);
    });
  });

  describe('breakdowns', () => {
    it('keeps real attribution separate from the channel grouping', () => {
      const digest = buildGa4Digest({
        connected: true,
        totals,
        channels: [
          { dimensions: { sessionDefaultChannelGroup: 'Direct' }, metrics: { sessions: 52 } },
        ],
        sources: [
          { dimensions: { sessionSource: 'google', sessionMedium: 'organic' }, metrics: { sessions: 38 } },
        ],
      });

      expect(digest.channels[0]).toEqual({ channel: 'Direct', sessions: 52 });
      expect(digest.sources[0]).toEqual({ source: 'google', medium: 'organic', sessions: 38 });
    });

    it('drops GA4 placeholders instead of treating them as pages', () => {
      // "(not set)" showed up among landing pages on production. It is a
      // session whose landing page could not be resolved, not a URL to optimise.
      const digest = buildGa4Digest({
        connected: true,
        totals,
        landingPages: [
          { dimensions: { landingPage: '/' }, metrics: { sessions: 62 } },
          { dimensions: { landingPage: '(not set)' }, metrics: { sessions: 5 } },
          { dimensions: { landingPage: '' }, metrics: { sessions: 2 } },
        ],
        sources: [
          { dimensions: { sessionSource: '(none)', sessionMedium: '' }, metrics: { sessions: 9 } },
        ],
      });

      expect(digest.landingPages.map((p) => p.page)).toEqual(['/']);
      expect(digest.sources).toEqual([]);
    });

    it('carries conversions and engagement per landing page', () => {
      const digest = buildGa4Digest({
        connected: true,
        totals,
        landingPages: [
          {
            dimensions: { landingPage: '/pricing' },
            metrics: { sessions: 40, keyEvents: 6, engagementRate: 0.55 },
          },
        ],
      });

      // Sessions alone cannot say which page loses people.
      expect(digest.landingPages[0]).toEqual({
        page: '/pricing',
        sessions: 40,
        keyEvents: 6,
        engagementRate: 55,
      });
    });

    it('reads devices with their engagement, capped at three', () => {
      const digest = buildGa4Digest({
        connected: true,
        totals,
        devices: [
          { dimensions: { deviceCategory: 'mobile' }, metrics: { sessions: 60, engagementRate: 0.18 } },
          { dimensions: { deviceCategory: 'desktop' }, metrics: { sessions: 30, engagementRate: 0.42 } },
          { dimensions: { deviceCategory: 'tablet' }, metrics: { sessions: 3 } },
          { dimensions: { deviceCategory: 'smart tv' }, metrics: { sessions: 1 } },
        ],
      });

      expect(digest.devices).toHaveLength(3);
      expect(digest.devices[0]).toEqual({ device: 'mobile', sessions: 60, engagementRate: 18 });
      expect(digest.devices[2].engagementRate).toBeNull();
    });

    it('lists event names and countries', () => {
      const digest = buildGa4Digest({
        connected: true,
        totals,
        events: [{ dimensions: { eventName: 'page_view' }, metrics: { eventCount: 147 } }],
        countries: [{ dimensions: { country: 'Poland' }, metrics: { sessions: 70 } }],
      });

      expect(digest.events[0]).toEqual({ event: 'page_view', count: 147 });
      expect(digest.countries[0]).toEqual({ country: 'Poland', sessions: 70 });
    });

    it('takes only the current window for breakdowns', () => {
      const digest = buildGa4Digest({
        connected: true,
        totals: comparedTotals,
        channels: [
          { dimensions: { sessionDefaultChannelGroup: 'Direct', dateRange: 'current' }, metrics: { sessions: 52 } },
          { dimensions: { sessionDefaultChannelGroup: 'Direct', dateRange: 'previous' }, metrics: { sessions: 40 } },
        ],
      });

      expect(digest.channels).toEqual([{ channel: 'Direct', sessions: 52 }]);
    });
  });

  it('stays connected with null figures when the property answered nothing', () => {
    const digest = buildGa4Digest({ connected: true, totals: [] });

    expect(digest.connected).toBe(true);
    expect(digest.sessions).toBeNull();
    expect(digest.channels).toEqual([]);
    expect(digest.keyEventsConfigured).toBe(false);
  });
});
