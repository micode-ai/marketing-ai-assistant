import { buildDealInsightsPrompt, parseDealInsights, type DealInsightsInput } from './deal-insights-agent';

const input: DealInsightsInput = {
  language: 'en',
  deal: { title: 'Acme renewal', value: 5000, currency: 'USD', stageName: 'Proposal', stageProbability: 50, status: 'OPEN', ageDays: 12 },
  activities: [{ type: 'CALL', occurredAt: '2026-06-20', body: 'Discussed pricing' }],
  tasks: { open: 2, overdue: 1 },
  contact: { name: 'Jane Doe' },
};

describe('buildDealInsightsPrompt', () => {
  it('asks for strict JSON, embeds the deal context + sparse-data instruction + language', () => {
    const { systemPrompt, userPrompt } = buildDealInsightsPrompt(input);
    expect(systemPrompt.toLowerCase()).toContain('json');
    expect(systemPrompt.toLowerCase()).toMatch(/sparse|little|no activit|few/);
    expect(systemPrompt).toContain('en');
    expect(userPrompt).toContain('Acme renewal');
    expect(userPrompt).toContain('Proposal');
    expect(userPrompt).toContain('Jane Doe');
  });
});

describe('parseDealInsights', () => {
  it('parses strict JSON, tolerating code fences, and clamps score to 0..100', () => {
    const raw = '```json\n{"score":140,"scoreReason":"strong","nextStep":"call","draftSubject":"Hi","draftBody":"Let us talk"}\n```';
    const r = parseDealInsights(raw);
    expect(r.score).toBe(100); // clamped
    expect(r.nextStep).toBe('call');
    expect(r.draftBody).toBe('Let us talk');
  });
  it('clamps a negative score to 0', () => {
    expect(parseDealInsights('{"score":-5,"scoreReason":"x","nextStep":"y","draftBody":"z"}').score).toBe(0);
  });
  it('falls back to a neutral object on malformed output', () => {
    const r = parseDealInsights('not json');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(typeof r.nextStep).toBe('string');
    expect(typeof r.draftBody).toBe('string');
  });
});
