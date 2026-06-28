import { buildRecommendationsPrompt, parseRecommendations, type AnalyticsRecommendationsInput } from './analytics-recommendations-agent';

const input: AnalyticsRecommendationsInput = {
  projectName: 'MiCode', industry: 'SaaS', projectType: 'WEBSITE', language: 'en',
  data: { periodDays: 30, web: { visitors: 54, conversions: 0, conversionRate: 0 },
    funnel: [], topUtm: [], gsc: { connected: true, clicks: 9 },
    instagram: { connected: true, followers: 0, engagement: 0, posts: 0 },
    threads: { connected: false }, projectType: 'WEBSITE',
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
