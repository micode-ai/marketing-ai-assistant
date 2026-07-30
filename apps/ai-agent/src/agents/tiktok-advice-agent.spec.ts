import {
  buildTikTokAdvicePrompt,
  periodDelta,
  TikTokAccountPoint,
} from './tiktok-advice-agent';

function snapshot(
  date: string,
  values: Partial<TikTokAccountPoint> = {},
): TikTokAccountPoint {
  return {
    date,
    followersCount: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    ...values,
  };
}

describe('periodDelta', () => {
  it('returns last minus first for cumulative snapshots', () => {
    const rows = [
      snapshot('2026-07-01', { views: 1000 }),
      snapshot('2026-07-15', { views: 1500 }),
      snapshot('2026-07-30', { views: 4000 }),
    ];
    expect(periodDelta(rows, 'views')).toBe(3000);
  });

  it('returns the lone value when only one snapshot exists', () => {
    expect(periodDelta([snapshot('2026-07-30', { likes: 42 })], 'likes')).toBe(42);
  });

  it('clamps at zero when a deleted video lowers the lifetime total', () => {
    const rows = [
      snapshot('2026-07-01', { views: 5000 }),
      snapshot('2026-07-30', { views: 3000 }),
    ];
    expect(periodDelta(rows, 'views')).toBe(0);
  });

  it('returns null when the metric was never recorded', () => {
    expect(periodDelta([snapshot('2026-07-30')], 'shares')).toBeNull();
  });

  it('ignores gaps where the metric is missing', () => {
    const rows = [
      snapshot('2026-07-01', { comments: 10 }),
      snapshot('2026-07-15'),
      snapshot('2026-07-30', { comments: 25 }),
    ];
    expect(periodDelta(rows, 'comments')).toBe(15);
  });
});

describe('buildTikTokAdvicePrompt', () => {
  const base = {
    language: 'ru',
    projectName: 'Acme',
    industry: 'SaaS',
    topPosts: [],
    worstPosts: [],
  };

  it('reports period GROWTH, not a sum of cumulative snapshots', () => {
    const { userPrompt } = buildTikTokAdvicePrompt({
      ...base,
      account: [
        snapshot('2026-07-01', { followersCount: 900, views: 1000, likes: 100, comments: 5, shares: 2 }),
        snapshot('2026-07-30', { followersCount: 1200, views: 4000, likes: 260, comments: 9, shares: 6 }),
      ],
    });

    expect(userPrompt).toContain('Views gained in period: 3000');
    expect(userPrompt).toContain('Likes gained in period: 160');
    expect(userPrompt).toContain('Followers: 900 → 1200');
    // A naive sum would have produced 5000 views.
    expect(userPrompt).not.toContain('5000');
  });

  it('says growth is not computable yet with a single snapshot', () => {
    const { userPrompt } = buildTikTokAdvicePrompt({
      ...base,
      account: [snapshot('2026-07-30', { followersCount: 1200, views: 4000 })],
    });

    expect(userPrompt).toContain('Only one snapshot exists');
    expect(userPrompt).not.toContain('gained in period');
  });

  it('forbids inventing metrics TikTok does not expose', () => {
    const { systemPrompt } = buildTikTokAdvicePrompt({ ...base, account: [] });
    expect(systemPrompt).toMatch(/completion rate/i);
    expect(systemPrompt).toMatch(/never invent/i);
  });

  it('respects the requested language', () => {
    const { systemPrompt } = buildTikTokAdvicePrompt({ ...base, language: 'pl', account: [] });
    expect(systemPrompt).toContain('Respond in this language: pl');
  });

  it('describes videos with length, engagement and weekday', () => {
    const { userPrompt } = buildTikTokAdvicePrompt({
      ...base,
      account: [],
      topPosts: [
        {
          title: 'Hook test',
          duration: 21,
          timestamp: '2026-07-27T18:30:00Z',
          viewCount: 12000,
          likeCount: 900,
          commentCount: 40,
          shareCount: 30,
          engagementRate: 0.0808,
        },
      ],
    });

    expect(userPrompt).toContain('Hook test');
    expect(userPrompt).toContain('length 21s');
    expect(userPrompt).toContain('eng.rate 8.1%');
    expect(userPrompt).toContain('Mon'); // 2026-07-27 is a Monday
  });

  it('falls back to the description when a video has no title', () => {
    const { userPrompt } = buildTikTokAdvicePrompt({
      ...base,
      account: [],
      topPosts: [{ description: 'caption only', timestamp: '2026-07-27T18:30:00Z' }],
    });
    expect(userPrompt).toContain('caption only');
  });

  it('degrades to a no-data prompt and summary when nothing was synced', () => {
    const { userPrompt, contextSummary } = buildTikTokAdvicePrompt({ ...base, account: [] });
    expect(userPrompt).toMatch(/^No data:/);
    expect(contextSummary).toBe('TikTok: no analytics data available for this period.');
  });

  it('summarizes followers and analyzed video counts when data exists', () => {
    const { contextSummary } = buildTikTokAdvicePrompt({
      ...base,
      account: [snapshot('2026-07-30', { followersCount: 1200 })],
      topPosts: [{ title: 'a' }, { title: 'b' }],
      worstPosts: [{ title: 'c' }],
    });

    expect(contextSummary).toContain('followers 1200');
    expect(contextSummary).toContain('2 top videos');
    expect(contextSummary).toContain('1 weak videos');
  });
});
