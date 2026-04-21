import { suggestCompetitors, normalizeToOrigin, SuggestCompetitorsInput } from './seo-agent';

// ── Mock getModel / ChatOpenAI ──────────────────────────────────
// We mock '@langchain/openai' so that ChatOpenAI.invoke() returns
// a canned response without hitting the network.

const mockInvoke = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

// Also mock '@langchain/community/tools/tavily_search' to avoid import errors
jest.mock('@langchain/community/tools/tavily_search', () => ({
  TavilySearchResults: jest.fn(),
}));

// Mock prisma to avoid DB connection during tests
jest.mock('../prisma', () => ({
  prisma: {
    project: { findUnique: jest.fn() },
    document: { create: jest.fn() },
  },
}));

// ── Helpers ─────────────────────────────────────────────────────

function makeLlmResponse(body: object): { content: string; usage_metadata: null } {
  return { content: JSON.stringify(body), usage_metadata: null };
}

const BASE_INPUT: SuggestCompetitorsInput = {
  action: 'suggest-competitors',
  projectName: 'Acme SaaS',
  industry: 'Marketing Software',
  websiteUrl: 'https://acme.com',
  targetKeywords: ['email marketing', 'campaign builder'],
  existingCompetitorUrls: [],
  locale: 'en',
  count: 5,
};

// ── normalizeToOrigin unit tests ─────────────────────────────────

describe('normalizeToOrigin', () => {
  it('strips path and trailing slash', () => {
    expect(normalizeToOrigin('https://example.com/foo/bar')).toBe('https://example.com');
  });

  it('strips www prefix', () => {
    expect(normalizeToOrigin('https://www.example.com')).toBe('https://example.com');
  });

  it('strips trailing slash from bare origin', () => {
    expect(normalizeToOrigin('https://example.com/')).toBe('https://example.com');
  });

  it('lowercases the host', () => {
    expect(normalizeToOrigin('https://EXAMPLE.COM/page')).toBe('https://example.com');
  });

  it('adds https:// when protocol is missing', () => {
    expect(normalizeToOrigin('example.com')).toBe('https://example.com');
  });

  it('strips www when protocol is missing', () => {
    expect(normalizeToOrigin('www.example.com')).toBe('https://example.com');
  });
});

// ── suggestCompetitors integration-style tests ───────────────────

describe('suggestCompetitors', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('returns competitors array from a valid LLM response', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'Alpha', websiteUrl: 'https://alpha.com', rationale: 'They compete.' },
          { name: 'Beta',  websiteUrl: 'https://beta.com',  rationale: 'Same audience.' },
          { name: 'Gamma', websiteUrl: 'https://gamma.com', rationale: 'Same keywords.' },
        ],
      }),
    );

    const result = await suggestCompetitors(BASE_INPUT);
    expect(result.competitors).toHaveLength(3);
    expect(result.competitors[0]).toMatchObject({ name: 'Alpha', websiteUrl: 'https://alpha.com' });
    expect(result.competitors[1]).toMatchObject({ name: 'Beta',  websiteUrl: 'https://beta.com' });
    expect(result.competitors[2]).toMatchObject({ name: 'Gamma', websiteUrl: 'https://gamma.com' });
  });

  it('normalizes URLs with paths to origin form', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'X Corp', websiteUrl: 'https://x.com/foo/bar', rationale: 'Rationale.' },
        ],
      }),
    );

    const result = await suggestCompetitors(BASE_INPUT);
    expect(result.competitors[0]!.websiteUrl).toBe('https://x.com');
  });

  it('strips trailing slashes from competitor URLs', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'Trailing', websiteUrl: 'https://trailing.com/', rationale: 'R.' },
        ],
      }),
    );

    const result = await suggestCompetitors(BASE_INPUT);
    expect(result.competitors[0]!.websiteUrl).toBe('https://trailing.com');
  });

  it('adds https:// when LLM omits protocol', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'No Proto', websiteUrl: 'noproto.com', rationale: 'R.' },
        ],
      }),
    );

    const result = await suggestCompetitors(BASE_INPUT);
    expect(result.competitors[0]!.websiteUrl).toBe('https://noproto.com');
  });

  it('filters out competitors whose host matches existingCompetitorUrls', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'Alpha', websiteUrl: 'https://alpha.com',   rationale: 'Keep.' },
          { name: 'Known', websiteUrl: 'https://known.com',   rationale: 'Should be removed.' },
          { name: 'Beta',  websiteUrl: 'https://beta.com',    rationale: 'Keep.' },
        ],
      }),
    );

    const input: SuggestCompetitorsInput = {
      ...BASE_INPUT,
      existingCompetitorUrls: ['https://www.known.com/some/path'],
    };

    const result = await suggestCompetitors(input);
    expect(result.competitors).toHaveLength(2);
    expect(result.competitors.map(c => c.name)).not.toContain('Known');
  });

  it('filters after URL normalization — path and www variants excluded', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'WWW Variant', websiteUrl: 'https://www.existing.com', rationale: 'R.' },
        ],
      }),
    );

    const input: SuggestCompetitorsInput = {
      ...BASE_INPUT,
      existingCompetitorUrls: ['existing.com/page'],
    };

    const result = await suggestCompetitors(input);
    expect(result.competitors).toHaveLength(0);
  });

  it('defaults count to 5 when not specified', async () => {
    const manyCompetitors = Array.from({ length: 8 }, (_, i) => ({
      name: `Comp${i}`,
      websiteUrl: `https://comp${i}.com`,
      rationale: 'R.',
    }));

    mockInvoke.mockResolvedValueOnce(makeLlmResponse({ competitors: manyCompetitors }));

    const { count: _removed, ...inputWithoutCount } = BASE_INPUT;
    const result = await suggestCompetitors(inputWithoutCount as SuggestCompetitorsInput);
    expect(result.competitors).toHaveLength(5);
  });

  it('caps count at 10 even when caller requests more', async () => {
    const manyCompetitors = Array.from({ length: 15 }, (_, i) => ({
      name: `Comp${i}`,
      websiteUrl: `https://comp${i}.com`,
      rationale: 'R.',
    }));

    mockInvoke.mockResolvedValueOnce(makeLlmResponse({ competitors: manyCompetitors }));

    const result = await suggestCompetitors({ ...BASE_INPUT, count: 99 });
    expect(result.competitors).toHaveLength(10);
  });

  it('throws "AI returned non-JSON output" on malformed JSON', async () => {
    mockInvoke.mockResolvedValueOnce({ content: 'Not JSON at all!!!', usage_metadata: null });

    await expect(suggestCompetitors(BASE_INPUT)).rejects.toThrow('AI returned non-JSON output');
  });

  it('throws "AI returned non-JSON output" when competitors key is missing', async () => {
    mockInvoke.mockResolvedValueOnce(makeLlmResponse({ wrong: 'shape' }));

    await expect(suggestCompetitors(BASE_INPUT)).rejects.toThrow('AI returned non-JSON output');
  });

  it('is resilient to www prefix in LLM URL output', async () => {
    mockInvoke.mockResolvedValueOnce(
      makeLlmResponse({
        competitors: [
          { name: 'WWW', websiteUrl: 'https://www.somesite.com/page', rationale: 'R.' },
        ],
      }),
    );

    const result = await suggestCompetitors(BASE_INPUT);
    expect(result.competitors[0]!.websiteUrl).toBe('https://somesite.com');
  });
});
