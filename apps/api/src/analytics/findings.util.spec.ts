import { collectFindings, MAX_FINDINGS } from './findings.util';

const ids = (digest: Record<string, any>) => collectFindings(digest).map((f) => f.id);
const find = (digest: Record<string, any>, id: string) =>
  collectFindings(digest).find((f) => f.id === id);

describe('collectFindings', () => {
  it('finds nothing in an empty digest', () => {
    expect(collectFindings({})).toEqual([]);
  });

  describe('search', () => {
    it('reports lost clicks with the query and the number', () => {
      const finding = find(
        { gsc: { lowCtr: [{ query: 'crm dla firm', position: 3.2, missedClicks: 84 }] } },
        'lowctr:crm dla firm',
      );

      expect(finding?.severity).toBe('high');
      expect(finding?.fact).toContain('84');
      expect(finding?.fact).toContain('crm dla firm');
      // The distinction that makes it actionable.
      expect(finding?.fact).toContain('not a ranking one');
    });

    it('names the competing pages for cannibalisation', () => {
      const finding = find(
        { gsc: { cannibalization: [{ query: 'crm', pages: ['/crm', '/blog/crm'] }] } },
        'cannibal:crm',
      );

      expect(finding?.fact).toContain('/crm, /blog/crm');
    });

    it('ranks striking distance below a snippet problem', () => {
      const found = collectFindings({
        gsc: {
          lowCtr: [{ query: 'a', position: 3, missedClicks: 40 }],
          strikingDistance: [{ query: 'b', position: 13, impressions: 900 }],
        },
      });

      expect(found[0].id).toBe('lowctr:a');
      expect(found[1].severity).toBe('medium');
    });
  });

  describe('analytics', () => {
    const connected = (over: Record<string, any> = {}) => ({
      ga4: { connected: true, keyEventsConfigured: true, ...over },
    });

    it('reports conversions that were never configured', () => {
      const finding = find(connected({ keyEventsConfigured: false }), 'ga4:no-key-events');

      expect(finding?.severity).toBe('high');
      expect(finding?.fact.toLowerCase()).toContain('no key events');
    });

    it('reports a device gap only when both sides were measured', () => {
      const measured = connected({
        devices: [
          { device: 'mobile', sessions: 60, engagementRate: 18 },
          { device: 'desktop', sessions: 30, engagementRate: 42 },
        ],
      });
      const unmeasured = connected({
        devices: [
          { device: 'mobile', sessions: 60, engagementRate: null },
          { device: 'desktop', sessions: 30, engagementRate: 42 },
        ],
      });

      expect(find(measured, 'ga4:device-gap')?.fact).toContain('18%');
      expect(find(unmeasured, 'ga4:device-gap')).toBeUndefined();
    });

    it('ignores a device gap on a handful of sessions', () => {
      const digest = connected({
        devices: [
          { device: 'tablet', sessions: 3, engagementRate: 10 },
          { device: 'desktop', sessions: 300, engagementRate: 50 },
        ],
      });

      expect(find(digest, 'ga4:device-gap')).toBeUndefined();
    });

    it('reports a page that converts nothing — but only where conversions exist', () => {
      const measured = connected({
        landingPages: [{ page: '/pricing', sessions: 120, keyEvents: 0 }],
      });
      const unmeasured = {
        ga4: {
          connected: true,
          keyEventsConfigured: false,
          landingPages: [{ page: '/pricing', sessions: 120, keyEvents: 0 }],
        },
      };

      expect(find(measured, 'ga4:dead-page:/pricing')?.severity).toBe('high');
      // With conversions unmeasured, zero means nothing at all.
      expect(find(unmeasured, 'ga4:dead-page:/pricing')).toBeUndefined();
    });

    it('reports a traffic move only when it is large', () => {
      const big = connected({ sessions: 130, previous: { sessions: 100 }, change: { sessions: 30 } });
      const small = connected({ sessions: 105, previous: { sessions: 100 }, change: { sessions: 5 } });

      expect(find(big, 'ga4:traffic-move')?.fact).toContain('up 30%');
      expect(find(small, 'ga4:traffic-move')).toBeUndefined();
    });

    it('says nothing about Analytics when it is not connected', () => {
      expect(ids({ ga4: { connected: false, keyEventsConfigured: false } })).toEqual([]);
    });
  });

  describe('social', () => {
    const channel = (over: Record<string, any> = {}) => ({
      connected: true,
      avgEngagementRate: 1,
      postsInPeriod: 3,
      ...over,
    });

    it('compares channels instead of describing each one', () => {
      const finding = find(
        {
          instagram: channel({ avgEngagementRate: 8 }),
          tiktok: channel({ avgEngagementRate: 1.2 }),
        },
        'social:channel-gap',
      );

      expect(finding?.fact).toContain('instagram');
      expect(finding?.fact).toContain('tiktok');
    });

    it('needs two measured channels to compare', () => {
      expect(
        find({ instagram: channel({ avgEngagementRate: 8 }) }, 'social:channel-gap'),
      ).toBeUndefined();
    });

    it('names a post that beat its channel average', () => {
      const finding = find(
        {
          threads: channel({
            avgEngagementRate: 1.5,
            bestPosts: [{ label: 'Jeden agent', engagementRate: 6 }],
          }),
        },
        'threads:standout',
      );

      expect(finding?.fact).toContain('Jeden agent');
      expect(finding?.fact).toContain('6%');
    });

    it('reports a connected channel that published nothing', () => {
      expect(ids({ tiktok: channel({ postsInPeriod: 0 }) })).toContain('tiktok:silent');
    });
  });

  describe('the rest', () => {
    it('reports keywords falling faster than rising, naming the worst', () => {
      const finding = find(
        {
          seo: {
            improved: 1,
            declined: 4,
            topMovers: [{ keyword: 'invoicing', rank: 31, change: -22 }],
          },
        },
        'seo:declining',
      );

      expect(finding?.severity).toBe('high');
      expect(finding?.fact).toContain('invoicing');
      expect(finding?.fact).toContain('22');
    });

    it('reports a list that received nothing', () => {
      expect(
        find({ email: { subscribers: 340, campaignsSent: 0 } }, 'email:idle-list')?.fact,
      ).toContain('340');
    });

    it('reports unanswered store reviews and a shrinking install base', () => {
      const found = ids({
        app: { connected: true, reviews: { unanswered: 3 }, installs: 4, uninstalls: 9, netInstalls: -5 },
      });

      expect(found).toContain('app:unanswered-reviews');
      expect(found).toContain('app:shrinking');
    });

    it('reports visitors with no conversions', () => {
      expect(find({ web: { visitors: 89, conversions: 0 } }, 'web:no-conversions')?.fact).toContain('89');
    });

    it('stays quiet on a handful of visitors', () => {
      expect(ids({ web: { visitors: 5, conversions: 0 } })).toEqual([]);
    });
  });

  describe('ranking', () => {
    it('puts high severity first and caps the list', () => {
      const digest = {
        gsc: {
          lowCtr: [
            { query: 'a', position: 3, missedClicks: 40 },
            { query: 'b', position: 4, missedClicks: 30 },
          ],
          cannibalization: [
            { query: 'c', pages: ['/1', '/2'] },
            { query: 'd', pages: ['/3', '/4'] },
          ],
          strikingDistance: [
            { query: 'e', position: 12, impressions: 500 },
            { query: 'f', position: 15, impressions: 400 },
          ],
          movers: { losers: [{ query: 'g', clicks: 3 }] },
        },
        web: { visitors: 200, conversions: 0 },
        seo: { improved: 0, declined: 3, topMovers: [] },
        email: { subscribers: 10, campaignsSent: 0 },
        app: { connected: true, reviews: { unanswered: 1 }, netInstalls: -2, installs: 1, uninstalls: 3 },
      };

      const found = collectFindings(digest);

      expect(found).toHaveLength(MAX_FINDINGS);
      // Seven high-severity findings exist in this digest, so they take the
      // first seven places and only one medium slips into the cap. What matters
      // is the order: severity never runs backwards.
      const order = { high: 0, medium: 1, low: 2 } as const;
      const ranks = found.map((f) => order[f.severity]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(found.filter((f) => f.severity === 'high')).toHaveLength(7);
      expect(found[7].severity).toBe('medium');
    });

    it('keeps every finding carrying its own numbers', () => {
      const found = collectFindings({
        gsc: { lowCtr: [{ query: 'a', position: 3, missedClicks: 40 }] },
        web: { visitors: 89, conversions: 0 },
      });

      // A finding without a number is an opinion, and the model has enough of
      // its own.
      expect(found.every((f) => /\d/.test(f.fact))).toBe(true);
    });
  });
});
