import {
  buildInstagramAdvicePrompt,
  InstagramAdviceInput,
} from './instagram-advice-agent';

const baseInput: InstagramAdviceInput = {
  language: 'ru',
  projectName: 'Acme',
  industry: 'Fitness',
  account: [
    {
      date: '2026-06-01T00:00:00.000Z',
      followersCount: 1000,
      reach: 500,
      views: 800,
      accountsEngaged: 120,
      totalInteractions: 300,
    },
    {
      date: '2026-06-28T00:00:00.000Z',
      followersCount: 1180,
      reach: 700,
      views: 1100,
      accountsEngaged: 160,
      totalInteractions: 420,
    },
  ],
  topPosts: [
    {
      igMediaId: 'm1',
      mediaType: 'REELS',
      caption: 'Morning workout routine #fitness',
      timestamp: '2026-06-20T18:00:00.000Z',
      likeCount: 320,
      commentsCount: 40,
      saved: 55,
      shares: 22,
      reach: 4000,
      views: 9000,
      engagementRate: 0.1,
    },
  ],
  worstPosts: [
    {
      igMediaId: 'm2',
      mediaType: 'IMAGE',
      caption: 'Office photo',
      timestamp: '2026-06-10T09:00:00.000Z',
      likeCount: 10,
      commentsCount: 1,
      saved: 0,
      shares: 0,
      reach: 800,
      views: 0,
      engagementRate: 0.013,
    },
  ],
};

describe('buildInstagramAdvicePrompt', () => {
  it('includes language, project, account trend and top/worst posts in the prompt', () => {
    const { systemPrompt, userPrompt, contextSummary } =
      buildInstagramAdvicePrompt(baseInput);
    expect(systemPrompt).toContain('ru'); // language instruction
    expect(systemPrompt).toContain('Performance');
    expect(systemPrompt).toContain('What to post next');
    expect(systemPrompt).toContain('When to post');
    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('1000'); // starting followers
    expect(userPrompt).toContain('1180'); // ending followers
    expect(userPrompt).toContain('Morning workout routine'); // top post caption
    expect(userPrompt).toContain('REELS'); // top post format
    expect(userPrompt).toContain('Office photo'); // worst post caption
    expect(contextSummary).toContain('1180');
    expect(contextSummary.length).toBeGreaterThan(0);
  });

  it('handles empty data (no account series, no posts) without throwing', () => {
    const empty: InstagramAdviceInput = {
      language: 'en',
      projectName: null,
      industry: null,
      account: [],
      topPosts: [],
      worstPosts: [],
    };
    const out = buildInstagramAdvicePrompt(empty);
    expect(out.userPrompt).toContain('No data');
    expect(out.contextSummary).toContain('no analytics data');
    expect(typeof out.contextSummary).toBe('string');
  });
});
