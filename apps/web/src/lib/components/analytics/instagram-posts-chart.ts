// Pure data prep for the "likes and comments per post" chart on the Instagram
// analytics dashboard. Kept out of the component so the maths is unit-tested.
//
// Why per-post and not per-day: Meta exposes NO daily time series for likes at
// account level (only `reach` supports metric_type=time_series), so the only
// likes data that exists for PAST days is the per-post `like_count` we already
// store in `instagram_media`. Charting those works retroactively.

export interface RecentPost {
  igMediaId: string;
  mediaType: string;
  caption: string | null;
  permalink: string | null;
  timestamp: string;
  likeCount: number | null;
  commentsCount: number | null;
}

export interface PostsEngagementSeries {
  /** X-axis label per post (post date). */
  labels: string[];
  likes: number[];
  comments: number[];
  /** Caption per post, for the tooltip. Same length as `labels`. */
  captions: string[];
  /** Number of posts plotted. */
  count: number;
  totalLikes: number;
  /** Mean likes per plotted post, rounded. 0 when nothing is plotted. */
  avgLikes: number;
}

const EMPTY: PostsEngagementSeries = {
  labels: [],
  likes: [],
  comments: [],
  captions: [],
  count: 0,
  totalLikes: 0,
  avgLikes: 0,
};

/** Default label: `MM-DD` slice of the ISO timestamp (locale-free fallback). */
function isoDayLabel(timestamp: string): string {
  return timestamp.slice(5, 10);
}

/**
 * Build the per-post likes/comments series.
 *
 * - Sorted chronologically (oldest → newest) regardless of input order, so the
 *   chart never renders time backwards.
 * - Posts with no engagement data at all (both counters null) are dropped —
 *   they'd be indistinguishable from a genuine zero.
 * - A null counter on a post that has the other one is treated as 0.
 */
export function buildPostsEngagementSeries(
  posts: RecentPost[] | null | undefined,
  formatLabel: (timestamp: string) => string = isoDayLabel,
): PostsEngagementSeries {
  if (!posts || posts.length === 0) return { ...EMPTY };

  const usable = posts
    .filter((p) => p.likeCount != null || p.commentsCount != null)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (usable.length === 0) return { ...EMPTY };

  const likes = usable.map((p) => p.likeCount ?? 0);
  const totalLikes = likes.reduce((s, v) => s + v, 0);

  return {
    labels: usable.map((p) => formatLabel(p.timestamp)),
    likes,
    comments: usable.map((p) => p.commentsCount ?? 0),
    captions: usable.map((p) => p.caption ?? ''),
    count: usable.length,
    totalLikes,
    avgLikes: Math.round(totalLikes / usable.length),
  };
}
