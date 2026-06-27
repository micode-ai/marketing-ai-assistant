import {
  buildThreadsAdvicePrompt,
  ThreadsAdviceInput,
} from './threads-advice-agent';

const baseInput: ThreadsAdviceInput = {
  language: 'ru',
  projectName: 'Acme',
  industry: 'Fitness',
  account: [
    {
      date: '2026-06-01T00:00:00.000Z',
      followersCount: 1000,
      views: 800,
      likes: 120,
      replies: 30,
      reposts: 15,
      quotes: 5,
    },
    {
      date: '2026-06-28T00:00:00.000Z',
      followersCount: 1180,
      views: 1100,
      likes: 160,
      replies: 45,
      reposts: 22,
      quotes: 8,
    },
  ],
  topPosts: [
    {
      text: 'Morning workout routine — 5 moves to start your day #fitness',
      permalink: 'https://www.threads.net/@acme/post/abc123',
      timestamp: '2026-06-20T18:00:00.000Z',
      views: 9000,
      likes: 320,
      replies: 40,
      reposts: 55,
      quotes: 12,
      shares: 22,
      engagementRate: 0.1,
    },
  ],
  worstPosts: [
    {
      text: 'Office photo',
      permalink: 'https://www.threads.net/@acme/post/xyz789',
      timestamp: '2026-06-10T09:00:00.000Z',
      views: 0,
      likes: 10,
      replies: 1,
      reposts: 0,
      quotes: 0,
      shares: 0,
      engagementRate: 0.013,
    },
  ],
};

describe('buildThreadsAdvicePrompt', () => {
  it('includes language, project, account trend and top/worst posts in the prompt', () => {
    const { systemPrompt, userPrompt, contextSummary } =
      buildThreadsAdvicePrompt(baseInput);
    expect(systemPrompt).toContain('ru'); // language instruction
    expect(systemPrompt).toContain('Performance');
    expect(systemPrompt).toContain('What to post next');
    expect(systemPrompt).toContain('When to post');
    expect(userPrompt).toContain('Acme');
    expect(userPrompt).toContain('1000'); // starting followers
    expect(userPrompt).toContain('1180'); // ending followers
    expect(userPrompt).toContain('Morning workout routine'); // top post text
    expect(userPrompt).toContain('Office photo'); // worst post text
    expect(contextSummary).toContain('1180');
    expect(contextSummary.length).toBeGreaterThan(0);
  });

  it('handles empty data (no account series, no posts) without throwing', () => {
    const empty: ThreadsAdviceInput = {
      language: 'en',
      projectName: null,
      industry: null,
      account: [],
      topPosts: [],
      worstPosts: [],
    };
    const out = buildThreadsAdvicePrompt(empty);
    expect(out.userPrompt).toContain('No data');
    expect(out.contextSummary).toContain('no analytics data');
    expect(typeof out.contextSummary).toBe('string');
  });
});
