import { buildSeoAdvicePrompt, SeoAdviceInput } from './seo-advice-agent';

const baseInput: SeoAdviceInput = {
  project: { name: 'Acme', websiteUrl: 'https://acme.com', industry: 'SaaS' },
  period: { days: 28 },
  totals: { clicks: 120, impressions: 5000, ctr: 0.024, position: 14.2, prevClicks: 90, prevImpressions: 4000, prevCtr: 0.022, prevPosition: 15.1 },
  insights: {
    strikingDistance: [{ key: 'best crm', impressions: 800, position: 12.3 }],
    lowCtr: [{ key: 'acme pricing', impressions: 1200, ctr: 0.005, position: 4, missedClicks: 90 }],
    cannibalization: [{ query: 'acme login', totalImpressions: 300, pages: [{ page: '/login' }, { page: '/auth' }] }],
    moversQueries: { gainers: [{ key: 'best crm', deltaClicks: 40, deltaPosition: -3 }], losers: [{ key: 'old feature', deltaClicks: -25, deltaPosition: 5 }] },
  },
  language: 'ru',
};

describe('buildSeoAdvicePrompt', () => {
  it('includes the project, period, totals and each insight list in the user prompt', () => {
    const { systemPrompt, userPrompt, contextSummary } = buildSeoAdvicePrompt(baseInput);
    expect(systemPrompt).toContain('ru'); // language instruction
    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('best crm');       // striking distance
    expect(userPrompt).toContain('acme pricing');   // low CTR
    expect(userPrompt).toContain('acme login');     // cannibalization
    expect(userPrompt).toContain('old feature');    // movers (losers)
    expect(contextSummary).toContain('120');        // clicks in the digest
    expect(contextSummary.length).toBeGreaterThan(0);
  });

  it('handles empty data (null totals, empty insight lists) without throwing', () => {
    const empty: SeoAdviceInput = {
      project: {}, period: { days: 7 },
      totals: null,
      insights: { strikingDistance: [], lowCtr: [], cannibalization: [], moversQueries: { gainers: [], losers: [] } },
      language: 'en',
    };
    const out = buildSeoAdvicePrompt(empty);
    expect(out.userPrompt).toContain('No data');
    expect(typeof out.contextSummary).toBe('string');
  });
});
