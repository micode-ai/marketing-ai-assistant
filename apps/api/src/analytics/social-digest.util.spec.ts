import {
  buildChannelDigest,
  followerStats,
  postStats,
  EMPTY_CHANNEL_DIGEST,
} from './social-digest.util';

describe('followerStats', () => {
  it('reports the newest level and the change across the period', () => {
    const rows = [
      { socialAccountId: 'a', followersCount: 100 },
      { socialAccountId: 'a', followersCount: 110 },
      { socialAccountId: 'a', followersCount: 125 },
    ];

    expect(followerStats(rows)).toEqual({ followers: 125, change: 25 });
  });

  it('sums both accounts of the same channel', () => {
    // The per-channel dashboards show one account (issue #169); the digest must
    // describe the whole project, so a second account cannot be dropped.
    const rows = [
      { socialAccountId: 'a', followersCount: 100 },
      { socialAccountId: 'b', followersCount: 40 },
      { socialAccountId: 'a', followersCount: 120 },
      { socialAccountId: 'b', followersCount: 35 },
    ];

    expect(followerStats(rows)).toEqual({ followers: 155, change: 15 });
  });

  it('keeps a negative change — losing followers is a real result', () => {
    const rows = [
      { socialAccountId: 'a', followersCount: 500 },
      { socialAccountId: 'a', followersCount: 480 },
    ];

    expect(followerStats(rows).change).toBe(-20);
  });

  it('gives a level but no change when there is only one snapshot', () => {
    expect(followerStats([{ socialAccountId: 'a', followersCount: 90 }])).toEqual({
      followers: 90,
      change: null,
    });
  });

  it('distinguishes a measured flat period from an unmeasured one', () => {
    const flat = followerStats([
      { socialAccountId: 'a', followersCount: 90 },
      { socialAccountId: 'a', followersCount: 90 },
    ]);

    // Two identical readings mean "no growth", which is worth reporting as 0
    // rather than as "unknown".
    expect(flat).toEqual({ followers: 90, change: 0 });
  });

  it('ignores rows where the count was never measured', () => {
    const rows = [
      { socialAccountId: 'a', followersCount: null },
      { socialAccountId: 'a', followersCount: 70 },
      { socialAccountId: 'a', followersCount: null },
      { socialAccountId: 'a', followersCount: 80 },
    ];

    expect(followerStats(rows)).toEqual({ followers: 80, change: 10 });
  });

  it('returns nulls when nothing was measured at all', () => {
    expect(followerStats([{ socialAccountId: 'a', followersCount: null }])).toEqual({
      followers: null,
      change: null,
    });
    expect(followerStats([])).toEqual({ followers: null, change: null });
  });
});

describe('postStats', () => {
  it('sums per-post figures and averages the engagement rate', () => {
    const rows = [
      { views: 1000, likes: 50, comments: 4, shares: 2, engagementRate: 5.6 },
      { views: 500, likes: 20, comments: 1, shares: 0, engagementRate: 4.2 },
    ];

    expect(postStats(rows)).toEqual({
      postsInPeriod: 2,
      views: 1500,
      likes: 70,
      comments: 5,
      shares: 2,
      avgEngagementRate: 4.9,
    });
  });

  it('reports an unmeasured metric as null, not zero', () => {
    const rows = [
      { views: 10, likes: null, comments: undefined, shares: 1 },
      { views: 5, likes: null, comments: undefined, shares: 2 },
    ];

    const stats = postStats(rows);
    expect(stats.views).toBe(15);
    expect(stats.likes).toBeNull();
    expect(stats.comments).toBeNull();
    expect(stats.avgEngagementRate).toBeNull();
  });

  it('sums the metrics that are present even when some posts lack them', () => {
    const rows = [{ views: 10 }, { views: null }, { views: 7 }];

    expect(postStats(rows).views).toBe(17);
  });

  it('counts posts even with no metrics at all', () => {
    expect(postStats([{}, {}]).postsInPeriod).toBe(2);
  });
});

describe('buildChannelDigest', () => {
  it('marks a channel with no linked accounts as disconnected', () => {
    const digest = buildChannelDigest({ accounts: 0, snapshots: [], posts: [] });

    expect(digest).toEqual(EMPTY_CHANNEL_DIGEST);
    expect(digest.connected).toBe(false);
  });

  it('does not leak the shared empty constant', () => {
    const digest = buildChannelDigest({ accounts: 0, snapshots: [], posts: [] });
    digest.followers = 5;

    expect(EMPTY_CHANNEL_DIGEST.followers).toBeNull();
  });

  it('reports a connected channel that has no data yet', () => {
    // TikTok history starts at connection time — a freshly linked account is
    // connected but has nothing to show, and that is not the same as absent.
    const digest = buildChannelDigest({ accounts: 1, snapshots: [], posts: [] });

    expect(digest.connected).toBe(true);
    expect(digest.accounts).toBe(1);
    expect(digest.postsInPeriod).toBe(0);
    expect(digest.followers).toBeNull();
  });

  it('combines follower level with period engagement', () => {
    const digest = buildChannelDigest({
      accounts: 2,
      snapshots: [
        { socialAccountId: 'a', followersCount: 200 },
        { socialAccountId: 'a', followersCount: 240 },
      ],
      posts: [{ views: 900, likes: 30, comments: 3, shares: 1, engagementRate: 3.8 }],
    });

    expect(digest).toEqual({
      connected: true,
      accounts: 2,
      followers: 240,
      followerChange: 40,
      postsInPeriod: 1,
      views: 900,
      likes: 30,
      comments: 3,
      shares: 1,
      avgEngagementRate: 3.8,
    });
  });
});
