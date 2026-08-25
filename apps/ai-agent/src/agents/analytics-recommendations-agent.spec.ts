import { buildRecommendationsPrompt, parseRecommendations, type AnalyticsRecommendationsInput } from './analytics-recommendations-agent';

const input: AnalyticsRecommendationsInput = {
  projectName: 'MiCode', industry: 'SaaS', projectType: 'WEBSITE', language: 'en',
  data: { periodDays: 30, web: { visitors: 54, conversions: 0, conversionRate: 0 },
    funnel: [], topUtm: [],
    gsc: { connected: true, clicks: 412, impressions: 9540, ctr: 4.32, avgPosition: 18.4,
      topQueries: [{ query: 'crm software', clicks: 90, impressions: 1200, position: 4.2 }],
      lagDays: 2 },
    instagram: { connected: true, accounts: 1, followers: 1080, followerChange: 80,
      postsInPeriod: 2, views: 6000, likes: 300, comments: 15, shares: 6, avgEngagementRate: 4 },
    threads: { connected: false, accounts: 0, followers: null, followerChange: null,
      postsInPeriod: 0, views: null, likes: null, comments: null, shares: null, avgEngagementRate: null },
    tiktok: { connected: true, accounts: 1, followers: 12, followerChange: null,
      postsInPeriod: 1, views: 812, likes: 9, comments: 1, shares: 0, avgEngagementRate: 1.23 },
    seo: { keywords: 12, tracked: 10, ranked: 8, top3: 1, top10: 3, top50: 7,
      avgRank: 18.4, improved: 2, declined: 1,
      topMovers: [{ keyword: 'crm software', rank: 4, change: 16 }] },
    email: { lists: 2, subscribers: 340, campaignsSent: 2, emailsSent: 340, openTracking: false },
    app: { connected: false, installs: null, uninstalls: null, netInstalls: null,
      activeDeviceInstalls: null, storeListingVisitors: null, storeConversionRate: null,
      crashRate: null, anrRate: null, averageRating: null, totalRatings: null,
      reviews: { total: 0, unanswered: 0, avgRating: null } },
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
