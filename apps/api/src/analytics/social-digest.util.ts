/**
 * Builds the per-channel social summary that goes into the cross-channel
 * recommendations prompt.
 *
 * Two deliberate choices, both about not double-counting:
 *
 * 1. Followers come from account snapshots, engagement comes from post rows.
 *    TikTok snapshots are cumulative lifetime counters and Instagram stores
 *    `total_value` figures dated by day, so summing snapshot rows inflates
 *    everything. Post rows are per-post facts, so summing those across the
 *    period is sound. Followers are a level, not a flow, which is why reading
 *    the newest snapshot (and the difference against the oldest) is correct.
 *
 * 2. Every channel is aggregated across *all* accounts linked to the project.
 *    The per-channel dashboards still show a single account (issue #169), but
 *    the whole point of the cross-channel digest is to describe the project, so
 *    it must not silently drop the second Instagram account.
 */

export interface SocialSnapshotRow {
  socialAccountId: string;
  followersCount: number | null;
}

export interface SocialPostRow {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  engagementRate?: number | null;
  /** Caption, text or title — whatever the platform calls the words. */
  label?: string | null;
  url?: string | null;
}

/** One post, named, so advice can point at it instead of at an average. */
export interface NamedPost {
  label: string;
  url: string | null;
  views: number | null;
  engagementRate: number | null;
}

export interface SocialChannelDigest {
  connected: boolean;
  /** Linked accounts of this platform — the figures below cover all of them. */
  accounts: number;
  /** Newest known follower count, summed across accounts. */
  followers: number | null;
  /** Change over the period, summed across accounts. Can be negative. */
  followerChange: number | null;
  postsInPeriod: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Percent, averaged over the posts that carry a rate. */
  avgEngagementRate: number | null;
  /**
   * The two best and two worst posts of the period by engagement rate.
   *
   * Aggregates can only produce aggregate advice: "engagement is higher on
   * Instagram" is not something a person can act on, while "this post did four
   * times the median, do more of it" is. Kept short on purpose — a long list
   * makes the model summarise instead of pick.
   */
  bestPosts: NamedPost[];
  worstPosts: NamedPost[];
}

export const EMPTY_CHANNEL_DIGEST: SocialChannelDigest = {
  connected: false,
  accounts: 0,
  followers: null,
  followerChange: null,
  postsInPeriod: 0,
  views: null,
  likes: null,
  comments: null,
  shares: null,
  avgEngagementRate: null,
  bestPosts: [],
  worstPosts: [],
};

/** Sum of the non-null values, or null when nothing was measured at all. */
function sumOrNull(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => typeof v === 'number');
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/**
 * Follower level and its change over the period.
 *
 * `rows` must be ordered by date ascending. Rows are grouped per account, so a
 * project with two accounts reports their combined following. A single snapshot
 * gives a level but no change — one measurement is not a trend.
 */
export function followerStats(rows: SocialSnapshotRow[]): {
  followers: number | null;
  change: number | null;
} {
  const firstSeen = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  const readings = new Map<string, number>();

  for (const row of rows) {
    if (typeof row.followersCount !== 'number') continue;
    if (!firstSeen.has(row.socialAccountId)) {
      firstSeen.set(row.socialAccountId, row.followersCount);
    }
    lastSeen.set(row.socialAccountId, row.followersCount);
    readings.set(row.socialAccountId, (readings.get(row.socialAccountId) ?? 0) + 1);
  }

  if (lastSeen.size === 0) return { followers: null, change: null };

  let followers = 0;
  let change = 0;
  // Growth needs two readings to exist. Counting them — rather than comparing
  // first against last — is what separates a measured flat period ("0 new
  // followers") from a single snapshot ("not measured yet").
  let changeMeasured = false;

  for (const [accountId, last] of lastSeen) {
    followers += last;
    if ((readings.get(accountId) ?? 0) >= 2) changeMeasured = true;
    change += last - (firstSeen.get(accountId) ?? last);
  }

  return { followers, change: changeMeasured ? change : null };
}

/** Period totals over the posts published in the period. */
export function postStats(rows: SocialPostRow[]): {
  postsInPeriod: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  avgEngagementRate: number | null;
} {
  const rates = rows
    .map((r) => r.engagementRate)
    .filter((v): v is number => typeof v === 'number');

  return {
    postsInPeriod: rows.length,
    views: sumOrNull(rows.map((r) => r.views)),
    likes: sumOrNull(rows.map((r) => r.likes)),
    comments: sumOrNull(rows.map((r) => r.comments)),
    shares: sumOrNull(rows.map((r) => r.shares)),
    avgEngagementRate:
      rates.length === 0
        ? null
        : Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2)),
  };
}

const NAMED_POSTS = 2;
const LABEL_MAX = 120;

/** Trims a caption to something a prompt can carry without losing the subject. */
function toNamedPost(row: SocialPostRow): NamedPost {
  const raw = (row.label ?? '').replace(/\s+/g, ' ').trim();
  return {
    label: raw.length > LABEL_MAX ? `${raw.slice(0, LABEL_MAX - 1)}…` : raw || '(no caption)',
    url: row.url ?? null,
    views: typeof row.views === 'number' ? row.views : null,
    engagementRate: typeof row.engagementRate === 'number' ? row.engagementRate : null,
  };
}

/**
 * Best and worst by engagement rate, over the posts that have one.
 *
 * Worst excludes anything already named as best, so a channel with two posts
 * does not list the same post as its triumph and its problem.
 */
function namedPosts(posts: SocialPostRow[]): { bestPosts: NamedPost[]; worstPosts: NamedPost[] } {
  const rated = posts
    .filter((p) => typeof p.engagementRate === 'number')
    .sort((a, b) => (b.engagementRate as number) - (a.engagementRate as number));

  const bestPosts = rated.slice(0, NAMED_POSTS).map(toNamedPost);
  const bestKeys = new Set(rated.slice(0, NAMED_POSTS));
  const worstPosts = [...rated]
    .reverse()
    .filter((p) => !bestKeys.has(p))
    .slice(0, NAMED_POSTS)
    .map(toNamedPost);

  return { bestPosts, worstPosts };
}

export function buildChannelDigest(args: {
  accounts: number;
  snapshots: SocialSnapshotRow[];
  posts: SocialPostRow[];
}): SocialChannelDigest {
  if (args.accounts === 0) return { ...EMPTY_CHANNEL_DIGEST };

  const { followers, change } = followerStats(args.snapshots);

  return {
    connected: true,
    accounts: args.accounts,
    followers,
    followerChange: change,
    ...postStats(args.posts),
    ...namedPosts(args.posts),
  };
}
