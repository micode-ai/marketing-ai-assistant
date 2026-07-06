import { buildStoriesBlock, storyCompletion, StoryMetricRow } from './stories.util';

function row(overrides: Partial<StoryMetricRow>): StoryMetricRow {
  return {
    igStoryId: 's',
    mediaType: 'VIDEO',
    permalink: null,
    timestamp: new Date('2026-07-05T08:00:00Z'),
    caption: null,
    reach: null,
    views: null,
    replies: null,
    shares: null,
    totalInteractions: null,
    tapsForward: null,
    tapsBack: null,
    exits: null,
    ...overrides,
  };
}

describe('storyCompletion', () => {
  it('is null when reach is null or 0', () => {
    expect(storyCompletion(null, 5)).toBeNull();
    expect(storyCompletion(0, 5)).toBeNull();
  });
  it('treats missing exits as 0 (full completion)', () => {
    expect(storyCompletion(100, null)).toBe(1);
  });
  it('computes 1 - exits/reach', () => {
    expect(storyCompletion(100, 20)).toBeCloseTo(0.8);
  });
  it('clamps to [0,1]', () => {
    expect(storyCompletion(100, 150)).toBe(0);
  });
});

describe('buildStoriesBlock', () => {
  it('returns empty summary for no rows', () => {
    expect(buildStoriesBlock([])).toEqual({
      list: [],
      summary: { count: 0, avgReach: 0, avgReplies: 0, avgCompletion: null },
      daily: [],
    });
  });

  it('computes per-story completion, summary averages, and daily grouping', () => {
    const rows: StoryMetricRow[] = [
      row({ igStoryId: 'a', reach: 100, replies: 4, exits: 20, timestamp: new Date('2026-07-05T08:00:00Z') }),
      row({ igStoryId: 'b', reach: 300, replies: 6, exits: 30, timestamp: new Date('2026-07-05T20:00:00Z') }),
      row({ igStoryId: 'c', reach: 200, replies: 2, exits: 0, timestamp: new Date('2026-07-04T09:00:00Z') }),
    ];

    const out = buildStoriesBlock(rows);

    // completion: a=0.8, b=0.9, c=1.0
    expect(out.list.find((r) => r.igStoryId === 'a')!.completion).toBeCloseTo(0.8);
    expect(out.summary.count).toBe(3);
    expect(out.summary.avgReach).toBe(200); // (100+300+200)/3
    expect(out.summary.avgReplies).toBe(4); // (4+6+2)/3
    expect(out.summary.avgCompletion).toBeCloseTo(0.9); // (0.8+0.9+1.0)/3
    // daily sorted asc; Jul-04 one story reach 200; Jul-05 two stories avg (100+300)/2=200
    expect(out.daily).toEqual([
      { date: '2026-07-04', avgReach: 200, count: 1 },
      { date: '2026-07-05', avgReach: 200, count: 2 },
    ]);
  });

  it('excludes null-reach stories from avgReach but counts them', () => {
    const rows: StoryMetricRow[] = [
      row({ igStoryId: 'a', reach: 100, timestamp: new Date('2026-07-05T08:00:00Z') }),
      row({ igStoryId: 'b', reach: null, timestamp: new Date('2026-07-05T09:00:00Z') }),
    ];
    const out = buildStoriesBlock(rows);
    expect(out.daily).toEqual([{ date: '2026-07-05', avgReach: 100, count: 2 }]);
    expect(out.summary.avgReach).toBe(100);
  });
});
