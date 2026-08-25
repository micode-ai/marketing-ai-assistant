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
): GscDigest {
  if (!connected) return { ...EMPTY_GSC_DIGEST };
  if (!summary) return { ...EMPTY_GSC_DIGEST, connected: true };

  return {
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
    lagDays: GSC_LAG_DAYS,
  };
}
