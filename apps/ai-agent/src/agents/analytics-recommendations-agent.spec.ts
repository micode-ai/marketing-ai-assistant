import { buildRecommendationsPrompt, parseRecommendations, type AnalyticsRecommendationsInput } from './analytics-recommendations-agent';

const input: AnalyticsRecommendationsInput = {
  projectName: 'MiCode', industry: 'SaaS', projectType: 'WEBSITE', language: 'en',
  data: { periodDays: 30, web: { visitors: 54, conversions: 0, conversionRate: 0 },
    funnel: [], topUtm: [], gsc: { connected: true, clicks: 9 },
    instagram: { connected: true, accounts: 1, followers: 1080, followerChange: 80,
      postsInPeriod: 2, views: 6000, likes: 300, comments: 15, shares: 6, avgEngagementRate: 4 },
    threads: { connected: false, accounts: 0, followers: null, followerChange: null,
      postsInPeriod: 0, views: null, likes: null, comments: null, shares: null, avgEngagementRate: null },
    tiktok: { connected: true, accounts: 1, followers: 12, followerChange: null,
      postsInPeriod: 1, views: 812, likes: 9, comments: 1, shares: 0, avgEngagementRate: 1.23 },
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
