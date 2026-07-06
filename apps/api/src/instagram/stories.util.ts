/**
 * Pure aggregation helpers for the Instagram Stories analytics block. Kept free
 * of Prisma types so they can be unit-tested without a DB. `getMetrics` maps
 * InstagramStory rows into StoryMetricRow before calling buildStoriesBlock.
 */

export interface StoryMetricRow {
  igStoryId: string;
  mediaType: string;
  permalink: string | null;
  timestamp: Date;
  caption: string | null;
  reach: number | null;
  views: number | null;
  replies: number | null;
  shares: number | null;
  totalInteractions: number | null;
  tapsForward: number | null;
  tapsBack: number | null;
  exits: number | null;
}

export interface StoryListItem extends StoryMetricRow {
  completion: number | null;
}

export interface StoriesBlock {
  list: StoryListItem[];
  summary: {
    count: number;
    avgReach: number;
    avgReplies: number;
    avgCompletion: number | null;
  };
  daily: Array<{ date: string; avgReach: number; count: number }>;
}

/** Story completion ≈ 1 − exits/reach, clamped to [0,1]; null when reach falsy. */
export function storyCompletion(
  reach: number | null,
  exits: number | null,
): number | null {
  if (!reach || reach <= 0) return null;
  const c = 1 - (exits ?? 0) / reach;
  return Math.max(0, Math.min(1, c));
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function buildStoriesBlock(rows: StoryMetricRow[]): StoriesBlock {
  const list: StoryListItem[] = rows.map((r) => ({
    ...r,
    completion: storyCompletion(r.reach, r.exits),
  }));

  const reaches = list.map((r) => r.reach).filter((n): n is number => n != null);
  const replies = list.map((r) => r.replies).filter((n): n is number => n != null);
  const completions = list
    .map((r) => r.completion)
    .filter((n): n is number => n != null);

  const summary = {
    count: list.length,
    avgReach: Math.round(mean(reaches)),
    avgReplies: Math.round(mean(replies)),
    avgCompletion: completions.length ? mean(completions) : null,
  };

  // Group by UTC calendar day of the story timestamp.
  const dayMap = new Map<string, { reaches: number[]; count: number }>();
  for (const r of list) {
    const date = r.timestamp.toISOString().slice(0, 10);
    const bucket = dayMap.get(date) ?? { reaches: [], count: 0 };
    bucket.count++;
    if (r.reach != null) bucket.reaches.push(r.reach);
    dayMap.set(date, bucket);
  }
  const daily = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      avgReach: Math.round(mean(b.reaches)),
      count: b.count,
    }));

  return { list, summary, daily };
}
