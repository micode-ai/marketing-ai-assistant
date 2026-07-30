import { describe, it, expect } from 'vitest';
import { buildPostsEngagementSeries, type RecentPost } from './instagram-posts-chart';

function post(overrides: Partial<RecentPost> & { timestamp: string }): RecentPost {
  return {
    igMediaId: 'm-' + overrides.timestamp,
    mediaType: 'IMAGE',
    caption: null,
    permalink: null,
    likeCount: null,
    commentsCount: null,
    ...overrides,
  };
}

describe('buildPostsEngagementSeries', () => {
  it('returns an empty series for no posts', () => {
    expect(buildPostsEngagementSeries([]).count).toBe(0);
    expect(buildPostsEngagementSeries(null).labels).toEqual([]);
    expect(buildPostsEngagementSeries(undefined).totalLikes).toBe(0);
  });

  it('maps likes and comments per post', () => {
    const series = buildPostsEngagementSeries([
      post({ timestamp: '2026-07-01T10:00:00Z', likeCount: 10, commentsCount: 2 }),
      post({ timestamp: '2026-07-03T10:00:00Z', likeCount: 30, commentsCount: 4 }),
    ]);
    expect(series.likes).toEqual([10, 30]);
    expect(series.comments).toEqual([2, 4]);
    expect(series.labels).toEqual(['07-01', '07-03']);
    expect(series.count).toBe(2);
    expect(series.totalLikes).toBe(40);
    expect(series.avgLikes).toBe(20);
  });

  it('sorts chronologically regardless of input order', () => {
    const series = buildPostsEngagementSeries([
      post({ timestamp: '2026-07-05T10:00:00Z', likeCount: 5 }),
      post({ timestamp: '2026-07-01T10:00:00Z', likeCount: 1 }),
      post({ timestamp: '2026-07-03T10:00:00Z', likeCount: 3 }),
    ]);
    expect(series.likes).toEqual([1, 3, 5]);
    expect(series.labels).toEqual(['07-01', '07-03', '07-05']);
  });

  it('drops posts with no engagement data at all', () => {
    const series = buildPostsEngagementSeries([
      post({ timestamp: '2026-07-01T10:00:00Z', likeCount: 10, commentsCount: 1 }),
      post({ timestamp: '2026-07-02T10:00:00Z' }), // both null → dropped
    ]);
    expect(series.count).toBe(1);
    expect(series.likes).toEqual([10]);
  });

  it('treats a single null counter as zero when the other is present', () => {
    const series = buildPostsEngagementSeries([
      post({ timestamp: '2026-07-01T10:00:00Z', likeCount: null, commentsCount: 7 }),
    ]);
    expect(series.likes).toEqual([0]);
    expect(series.comments).toEqual([7]);
    expect(series.totalLikes).toBe(0);
  });

  it('rounds the average likes', () => {
    const series = buildPostsEngagementSeries([
      post({ timestamp: '2026-07-01T10:00:00Z', likeCount: 10 }),
      post({ timestamp: '2026-07-02T10:00:00Z', likeCount: 11 }),
      post({ timestamp: '2026-07-03T10:00:00Z', likeCount: 11 }),
    ]);
    expect(series.avgLikes).toBe(11); // 32 / 3 = 10.67 → 11
  });

  it('uses the supplied label formatter and keeps captions aligned', () => {
    const series = buildPostsEngagementSeries(
      [
        post({ timestamp: '2026-07-02T10:00:00Z', likeCount: 2, caption: 'second' }),
        post({ timestamp: '2026-07-01T10:00:00Z', likeCount: 1, caption: 'first' }),
      ],
      (t) => 'D' + t.slice(8, 10),
    );
    expect(series.labels).toEqual(['D01', 'D02']);
    expect(series.captions).toEqual(['first', 'second']);
  });
});
