import { buildRecommendationsPrompt, parseRecommendations, type AnalyticsRecommendationsInput } from './analytics-recommendations-agent';

const input: AnalyticsRecommendationsInput = {
  projectName: 'MiCode', industry: 'SaaS', projectType: 'WEBSITE', language: 'en',
  data: { periodDays: 30, web: { visitors: 54, conversions: 0, conversionRate: 0 },
    funnel: [], topUtm: [],
    gsc: { connected: true, clicks: 412, impressions: 9540, ctr: 4.32, avgPosition: 18.4,
      topQueries: [{ query: 'crm software', clicks: 90, impressions: 1200, position: 4.2 }],
      topPages: [{ page: '/pricing', clicks: 120, impressions: 3000, position: 6.4 }],
      strikingDistance: [{ query: 'faktura online', impressions: 900, position: 13.4 }],
      lowCtr: [{ query: 'crm dla firm', position: 3.2, missedClicks: 84 }],
      cannibalization: [{ query: 'crm software', pages: ['/crm', '/blog/crm-guide'] }],
      movers: { gainers: [{ query: 'invoicing app', clicks: 40 }], losers: [] },
      lagDays: 2 },
    instagram: { connected: true, accounts: 1, followers: 1080, followerChange: 80,
      postsInPeriod: 2, views: 6000, likes: 300, comments: 15, shares: 6, avgEngagementRate: 4,
      bestPosts: [{ label: 'Behind the scenes', url: 'https://ig/2', views: 5000, engagementRate: 8.6 }],
      worstPosts: [{ label: 'Quiet Tuesday', url: 'https://ig/1', views: 100, engagementRate: 0.4 }] },
    threads: { connected: false, accounts: 0, followers: null, followerChange: null,
      postsInPeriod: 0, views: null, likes: null, comments: null, shares: null, avgEngagementRate: null,
      bestPosts: [], worstPosts: [] },
    tiktok: { connected: true, accounts: 1, followers: 12, followerChange: null,
      postsInPeriod: 1, views: 812, likes: 9, comments: 1, shares: 0, avgEngagementRate: 1.23,
      bestPosts: [{ label: '#ai #budget', url: 'https://tt/1', views: 812, engagementRate: 1.23 }],
      worstPosts: [] },
    seo: { keywords: 12, tracked: 10, ranked: 8, top3: 1, top10: 3, top50: 7,
      avgRank: 18.4, improved: 2, declined: 1,
      topMovers: [{ keyword: 'crm software', rank: 4, change: 16 }] },
    email: { lists: 2, subscribers: 340, campaignsSent: 2, emailsSent: 340, openTracking: false },
    app: { connected: false, installs: null, uninstalls: null, netInstalls: null,
      activeDeviceInstalls: null, storeListingVisitors: null, storeConversionRate: null,
      crashRate: null, anrRate: null, averageRating: null, totalRatings: null,
      reviews: { total: 0, unanswered: 0, avgRating: null }, lastMeasuredAt: null },
    ga4: { connected: true, lagHours: 48, sessions: 1240, users: 980, newUsers: 610,
      pageViews: 3100, engagementRate: 64.3, avgSessionDuration: 75,
      keyEvents: 47, keyEventsConfigured: true,
      previous: { sessions: 620, users: 500, keyEvents: 20 },
      change: { sessions: 100, users: 96, keyEvents: 135 },
      channels: [{ channel: 'Organic Search', sessions: 700 }],
      sources: [{ source: 'google', medium: 'organic', sessions: 700 }],
      landingPages: [{ page: '/pricing', sessions: 210, keyEvents: 0, engagementRate: 22.5 }],
      devices: [{ device: 'mobile', sessions: 800, engagementRate: 18 }],
      events: [{ event: 'page_view', count: 3100 }],
      countries: [{ country: 'Poland', sessions: 900 }] },
    competitors: [{ name: 'Fakturownia', websiteUrl: 'https://fakturownia.pl' }],
    projectType: 'WEBSITE',
    counts: { content: 4, contentPublished: 4, campaigns: 1, keywords: 0, competitors: 0, emailLists: 0 } },
};

describe('buildRecommendationsPrompt', () => {
  it('embeds key data points and the sparse-data instruction', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);
    expect(systemPrompt.toLowerCase()).toContain('json');
    expect(systemPrompt.toLowerCase()).toMatch(/sparse|little|no data|set up|setup/);
    expect(userPrompt).toContain('54');     // visitors
    expect(userPrompt).toContain('keywords');
    expect(userPrompt).toContain('"keywords":0'.replace(/\s/g, '')); // counts serialized — tolerate formatting
  });

  it('carries the social figures and explains how to read them', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);

    expect(userPrompt).toContain('1080');   // instagram followers
    expect(userPrompt).toContain('812');    // tiktok views
    expect(userPrompt).toContain('tiktok');

    // The model must not read a period total as a lifetime one, nor null as zero.
    expect(systemPrompt).toContain('followerChange');
    expect(systemPrompt.toLowerCase()).toContain('not lifetime totals');
    expect(systemPrompt.toLowerCase()).toContain('null means not measured');
  });

  it('asks for cross-channel moves rather than per-channel hygiene', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    // Per-channel advice already exists in each channel dashboard; this prompt
    // exists for what only makes sense across channels.
    expect(systemPrompt.toLowerCase()).toContain('cross-channel');
    expect(systemPrompt.toLowerCase()).toMatch(/brand/);
  });

  it('spells out that a lower search position is better', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);

    // Handed raw positions, a model reads "20 -> 4" as a decline unless told.
    expect(systemPrompt.toUpperCase()).toContain('LOWER IS BETTER');
    expect(systemPrompt).toContain('positions gained');
    expect(userPrompt).toContain('crm software');
  });

  it('warns that email opens are not tracked rather than zero', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    expect(systemPrompt).toContain('openTracking');
    expect(systemPrompt.toLowerCase()).toContain('does not measure opens');
  });

  it('explains which app figures are levels and which are period totals', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    expect(systemPrompt.toLowerCase()).toContain('not sums');
    expect(systemPrompt).toContain('reviews.unanswered');
  });

  it('warns that an app level may predate the period', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    // Otherwise "installs: null, activeDeviceInstalls: 15" reads as an app with
    // no users, and the advice tells the user to launch what is already live.
    expect(systemPrompt.toLowerCase()).toContain('before the period started');
    expect(systemPrompt).toContain('the app has no users');
  });

  it('demands every recommendation be anchored to a named entity', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    // The old prompt shipped a literal list of cards to produce, which is why
    // every project got the same four.
    expect(systemPrompt).not.toContain('recommend what to set up first');
    expect(systemPrompt.toLowerCase()).toContain('anchored to something named');
    expect(systemPrompt).toContain('strikingDistance');
    expect(systemPrompt).toContain('bestPosts');
    expect(systemPrompt.toLowerCase()).toContain('are failures');
  });

  it('prefers fewer deeper cards over one per channel', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    expect(systemPrompt).toContain('2 to 5 recommendations');
    expect(systemPrompt.toLowerCase()).toContain('do not try to cover every channel');
    expect(systemPrompt.toLowerCase()).toContain('do not pad the list');
  });

  it('passes the named findings through to the model', () => {
    const { userPrompt } = buildRecommendationsPrompt(input);

    expect(userPrompt).toContain('faktura online');   // striking distance
    expect(userPrompt).toContain('84');               // missed clicks
    expect(userPrompt).toContain('Behind the scenes'); // best post
    expect(userPrompt).toContain('Fakturownia');       // competitor
  });

  it('forbids stating a frozen app figure as today', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    // Levels reach back past the window, so without this a month-old install
    // base is reported as the current one.
    expect(systemPrompt).toContain('lastMeasuredAt');
    expect(systemPrompt.toLowerCase()).toContain('frozen');
    expect(systemPrompt.toLowerCase()).toContain('no recent measurement');
  });

  it('keeps our tracker and Analytics apart instead of merging them', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);

    // Two measurements of one website. Added together they are nonsense; used
    // interchangeably they contradict each other.
    expect(systemPrompt.toLowerCase()).toContain('never add them together');
    expect(systemPrompt.toLowerCase()).toContain('our own tracking script');
    expect(systemPrompt).toContain('keyEvents');
    expect(userPrompt).toContain('Organic Search');
  });

  it('separates unconfigured conversions from zero conversions', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    // "keyEvents: 0" with tracking off is not a conversion problem, it is a
    // measurement problem — and the more valuable recommendation.
    expect(systemPrompt).toContain('keyEventsConfigured');
    expect(systemPrompt.toLowerCase()).toContain('not zero conversions');
  });

  it('carries the depth GA4 actually offers', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);

    expect(userPrompt).toContain('google');      // real source, not the grouping
    expect(userPrompt).toContain('mobile');      // device split
    expect(userPrompt).toContain('page_view');   // what is measured at all
    expect(systemPrompt.toLowerCase()).toContain('name the path');
    expect(systemPrompt).toContain('lagHours');
  });

  it('forbids inventing a percentage for growth from zero', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    expect(systemPrompt.toLowerCase()).toContain('from zero');
  });

  it('leads with the ranked findings when they are supplied', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt({
      ...input,
      findings: [
        { id: 'lowctr:crm', severity: 'high', source: 'gsc',
          fact: '"crm" ranks 3.2 but loses about 84 clicks a month to a weak snippet.' },
        { id: 'tiktok:silent', severity: 'low', source: 'tiktok',
          fact: 'tiktok is connected but nothing was published this period.' },
      ],
    });

    // Findings come first in the prompt, ahead of the digest they were derived
    // from — the model reads the shortlist before the haystack.
    expect(userPrompt.indexOf('Findings, already ranked')).toBeLessThan(
      userPrompt.indexOf('Full analytics digest'),
    );
    expect(userPrompt).toContain('[high] (gsc)');
    expect(userPrompt).toContain('84 clicks');
    expect(systemPrompt.toLowerCase()).toContain('do not restate a finding');
  });

  it('omits the findings section when there are none', () => {
    const { userPrompt } = buildRecommendationsPrompt({ ...input, findings: [] });

    expect(userPrompt).not.toContain('Findings, already ranked');
    expect(userPrompt).toContain('Full analytics digest');
  });

  it('tells the model not to manufacture urgency from an empty list', () => {
    const { systemPrompt } = buildRecommendationsPrompt(input);

    expect(systemPrompt.toLowerCase()).toContain('do not manufacture urgency');
  });

  it('warns that Search Console lags behind today', () => {
    const { systemPrompt, userPrompt } = buildRecommendationsPrompt(input);

    // Comparing lagging GSC clicks against same-day visitors looks like a crash.
    expect(systemPrompt).toContain('lagDays');
    expect(systemPrompt.toLowerCase()).toContain('do not compare gsc clicks');
    expect(userPrompt).toContain('9540');
  });
});

describe('parseRecommendations', () => {
  it('parses a JSON array, tolerating code fences', () => {
    const raw = '```json\n{"recommendations":[{"id":"r1","title":"Set up SEO","why":"keywords=0","how":"add keywords","priority":"high","channel":"seo","impact":"more traffic"}]}\n```';
    const recs = parseRecommendations(raw);
    expect(recs).toHaveLength(1);
    expect(recs[0].priority).toBe('high');
    expect(recs[0].channel).toBe('seo');
  });
  it('returns [] on malformed output', () => {
    expect(parseRecommendations('not json at all')).toEqual([]);
  });
});
