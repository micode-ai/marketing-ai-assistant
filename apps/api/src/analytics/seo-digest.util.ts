/**
 * Turns tracked keywords and their rank history into the SEO block of the
 * recommendations digest.
 *
 * Rank is a position: **lower is better**, and 1 is the best possible value.
 * Every derived figure here keeps that convention, and `change` is expressed so
 * that a positive number means the keyword moved up. The prompt says the same
 * thing in words, because a model handed raw positions will otherwise read
 * "rank went from 20 to 4" as a decline.
 *
 * A missing rank means "not in the results we checked", which is not the same
 * as a bad rank — it is excluded from averages rather than counted as zero.
 */

export interface KeywordRow {
  id: string;
  keyword: string;
  currentRank: number | null;
  isTracking: boolean;
}

export interface RankHistoryRow {
  keywordId: string;
  rank: number | null;
}

export interface KeywordMover {
  keyword: string;
  rank: number | null;
  /** Positions gained over the period. Negative means the keyword dropped. */
  change: number;
}

export interface SeoDigest {
  keywords: number;
  tracked: number;
  /** Keywords that currently hold a position at all. */
  ranked: number;
  top3: number;
  top10: number;
  top50: number;
  avgRank: number | null;
  improved: number;
  declined: number;
  /** Largest movements over the period, biggest first. */
  topMovers: KeywordMover[];
}

export const EMPTY_SEO_DIGEST: SeoDigest = {
  keywords: 0,
  tracked: 0,
  ranked: 0,
  top3: 0,
  top10: 0,
  top50: 0,
  avgRank: null,
  improved: 0,
  declined: 0,
  topMovers: [],
};

const MAX_MOVERS = 5;

/**
 * `history` must be ordered by date ascending. Rows are grouped per keyword, so
 * the first and last measured rank of each keyword define its movement; a
 * keyword measured once has no movement to report.
 */
export function buildSeoDigest(
  keywords: KeywordRow[],
  history: RankHistoryRow[],
): SeoDigest {
  if (keywords.length === 0) return { ...EMPTY_SEO_DIGEST };

  const ranks = keywords
    .map((k) => k.currentRank)
    .filter((r): r is number => typeof r === 'number');

  const firstRank = new Map<string, number>();
  const lastRank = new Map<string, number>();
  for (const row of history) {
    if (typeof row.rank !== 'number') continue;
    if (!firstRank.has(row.keywordId)) firstRank.set(row.keywordId, row.rank);
    lastRank.set(row.keywordId, row.rank);
  }

  const movers: KeywordMover[] = [];
  for (const keyword of keywords) {
    const first = firstRank.get(keyword.id);
    const last = lastRank.get(keyword.id);
    if (typeof first !== 'number' || typeof last !== 'number') continue;
    if (first === last) continue;
    // Positions gained: dropping from 20 to 4 is +16.
    movers.push({ keyword: keyword.keyword, rank: last, change: first - last });
  }

  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    keywords: keywords.length,
    tracked: keywords.filter((k) => k.isTracking).length,
    ranked: ranks.length,
    top3: ranks.filter((r) => r <= 3).length,
    top10: ranks.filter((r) => r <= 10).length,
    top50: ranks.filter((r) => r <= 50).length,
    avgRank:
      ranks.length === 0
        ? null
        : Number((ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1)),
    improved: movers.filter((m) => m.change > 0).length,
    declined: movers.filter((m) => m.change < 0).length,
    topMovers: movers.slice(0, MAX_MOVERS),
  };
}
