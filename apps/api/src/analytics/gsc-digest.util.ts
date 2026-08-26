/**
 * Turns a Search Console summary into the `gsc` block of the recommendations
 * digest.
 *
 * Three things about this data shape the code:
 *
 * - **CTR arrives as a fraction** (0.0432), while every other percentage in the
 *   digest is a percent. It is converted here so the model is not comparing
 *   0.04 against an engagement rate of 4.3.
 * - **Position is a rank**, so lower is better — the same convention as the seo
 *   block, and the prompt states it for both.
 * - **The window ends two days ago.** Search Console does not report the last
 *   couple of days, so `lagDays` travels with the figures; without it a model
 *   comparing GSC clicks against same-day website visitors reads the gap as a
 *   collapse in search traffic.
 */

export interface GscSummaryLike {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  topPages?: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

/**
 * The insights the SEO page already computes. Named and quantified, which is
 * the point: "average position 25.1" cannot be acted on, "you lose 40 clicks a
 * month on this query" can.
 */
export interface GscInsightsLike {
  strikingDistance: Array<{ key: string; clicks: number; impressions: number; position: number }>;
  lowCtr: Array<{ key: string; clicks: number; impressions: number; position: number; missedClicks: number }>;
  cannibalization: Array<{
    query: string;
    totalImpressions: number;
    pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
  }>;
  moversQueries: {
    gainers: Array<{ key: string; clicks: number; positionDelta?: number; clicksDelta?: number }>;
    losers: Array<{ key: string; clicks: number; positionDelta?: number; clicksDelta?: number }>;
  };
}

export interface GscQueryDigest {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface GscDigest {
  connected: boolean;
  clicks: number | null;
  impressions: number | null;
  /** Percent, not a fraction. */
  ctr: number | null;
  /** Average position — lower is better. */
  avgPosition: number | null;
  topQueries: GscQueryDigest[];
  topPages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
  /** Queries at 11-20: a ranking win that needs a nudge, not a new page. */
  strikingDistance: Array<{ query: string; impressions: number; position: number }>;
  /** Top-10 queries earning fewer clicks than the position should give. */
  lowCtr: Array<{ query: string; position: number; missedClicks: number }>;
  /** Queries where our own pages compete with each other. */
  cannibalization: Array<{ query: string; pages: string[] }>;
  movers: {
    gainers: Array<{ query: string; clicks: number }>;
    losers: Array<{ query: string; clicks: number }>;
  };
  /** Days the reporting window stops short of today. */
  lagDays: number;
}

export const GSC_LAG_DAYS = 2;
const MAX_QUERIES = 5;

export const EMPTY_GSC_DIGEST: GscDigest = {
  connected: false,
  clicks: null,
  impressions: null,
  ctr: null,
  avgPosition: null,
  topQueries: [],
  topPages: [],
  strikingDistance: [],
  lowCtr: [],
  cannibalization: [],
  movers: { gainers: [], losers: [] },
  lagDays: GSC_LAG_DAYS,
};

const round = (value: number, places: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : 0;

/**
 * `summary` is null when the integration exists but the figures could not be
 * fetched — a Google outage or a timeout. That case stays `connected: true`
 * with null figures, so the model can still recommend using the channel
 * without inventing numbers for it.
 */
export function buildGscDigest(
  summary: GscSummaryLike | null,
  connected: boolean,
  insights?: GscInsightsLike | null,
): GscDigest {
  if (!connected) return { ...EMPTY_GSC_DIGEST };
  if (!summary) return { ...EMPTY_GSC_DIGEST, connected: true, ...insightBlock(insights) };

  return {
    ...insightBlock(insights),
    connected: true,
    clicks: Math.round(summary.totals.clicks ?? 0),
    impressions: Math.round(summary.totals.impressions ?? 0),
    ctr: round((summary.totals.ctr ?? 0) * 100, 2),
    avgPosition: round(summary.totals.position ?? 0, 1),
    topQueries: (summary.topQueries ?? []).slice(0, MAX_QUERIES).map((row) => ({
      query: row.query,
      clicks: Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      position: round(row.position ?? 0, 1),
    })),
    // Already in the summary response — it was being fetched and discarded.
    topPages: (summary.topPages ?? []).slice(0, MAX_QUERIES).map((row) => ({
      page: row.page,
      clicks: Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      position: round(row.position ?? 0, 1),
    })),
    lagDays: GSC_LAG_DAYS,
  };
}

/**
 * Trims the insights to what a prompt can carry. Each list is capped hard: the
 * value is in naming two or three specific things, and a long list only makes
 * the model summarise instead of pick.
 */
function insightBlock(insights?: GscInsightsLike | null): Pick<
  GscDigest,
  'strikingDistance' | 'lowCtr' | 'cannibalization' | 'movers'
> {
  if (!insights) {
    return { strikingDistance: [], lowCtr: [], cannibalization: [], movers: { gainers: [], losers: [] } };
  }

  return {
    strikingDistance: (insights.strikingDistance ?? []).slice(0, 3).map((r) => ({
      query: r.key,
      impressions: Math.round(r.impressions ?? 0),
      position: round(r.position ?? 0, 1),
    })),
    lowCtr: (insights.lowCtr ?? []).slice(0, 3).map((r) => ({
      query: r.key,
      position: round(r.position ?? 0, 1),
      missedClicks: Math.round(r.missedClicks ?? 0),
    })),
    cannibalization: (insights.cannibalization ?? []).slice(0, 2).map((r) => ({
      query: r.query,
      // Page URLs only: the per-page click split is detail the model does not
      // need to name the problem.
      pages: (r.pages ?? []).slice(0, 3).map((p) => p.page),
    })),
    movers: {
      gainers: (insights.moversQueries?.gainers ?? []).slice(0, 3).map((r) => ({
        query: r.key,
        clicks: Math.round(r.clicks ?? 0),
      })),
      losers: (insights.moversQueries?.losers ?? []).slice(0, 3).map((r) => ({
        query: r.key,
        clicks: Math.round(r.clicks ?? 0),
      })),
    },
  };
}
