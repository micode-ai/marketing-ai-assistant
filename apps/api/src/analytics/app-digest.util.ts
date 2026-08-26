/**
 * Turns Play Console metrics and store reviews into the app block of the
 * recommendations digest.
 *
 * The row mixes three kinds of number, and they cannot be treated alike:
 *
 * - **Counts** (installs, uninstalls, store listing visitors) are per-day, so
 *   they sum over the period.
 * - **Levels** (active device installs, average rating, total ratings) describe
 *   a state, so the newest measured row is the answer. Summing them would
 *   report an install base thirty times too large.
 * - **Rates** (crash rate, ANR rate, store conversion) are already ratios.
 *   Summing is meaningless; the newest measured value is what matters, since a
 *   crash rate is a property of the current build.
 *
 * That distinction also decides *which rows* each figure may look at, and
 * getting this wrong is what made the block report a zero install base for a
 * live app. A period total is bounded by the window by definition. A level is
 * not: it is the last thing we know, whenever we learned it. So sums read
 * `periodRows` and levels read `levelRows`, which reaches back past the window.
 */

export interface AppMetricsRow {
  /** YYYY-MM-DD; only the level rows need it, to say how old a level is. */
  date?: Date | string | null;
  installs: number;
  uninstalls: number;
  activeDeviceInstalls: number;
  storeListingVisitors: number;
  storeListingConversions: number;
  crashRate: number;
  anrRate: number;
  averageRating: number;
  totalRatings: number;
}

export interface AppReviewRow {
  starRating: number;
  isReplied: boolean;
}

export interface AppDigest {
  connected: boolean;
  installs: number | null;
  uninstalls: number | null;
  /** Installs minus uninstalls over the period. Can be negative. */
  netInstalls: number | null;
  activeDeviceInstalls: number | null;
  storeListingVisitors: number | null;
  storeConversionRate: number | null;
  crashRate: number | null;
  anrRate: number | null;
  averageRating: number | null;
  totalRatings: number | null;
  reviews: {
    total: number;
    unanswered: number;
    avgRating: number | null;
  };
  /**
   * When the levels were last measured, YYYY-MM-DD.
   *
   * A level reaches back past the reporting window to find its last real value
   * (#182), which is right — but it means a figure can be any age. Shipping the
   * date alongside is the same honesty the gsc block gets from `lagDays`: the
   * model can state the number without implying it describes today.
   */
  lastMeasuredAt: string | null;
}

export const EMPTY_APP_DIGEST: AppDigest = {
  connected: false,
  installs: null,
  uninstalls: null,
  netInstalls: null,
  activeDeviceInstalls: null,
  storeListingVisitors: null,
  storeConversionRate: null,
  crashRate: null,
  anrRate: null,
  averageRating: null,
  totalRatings: null,
  reviews: { total: 0, unanswered: 0, avgRating: null },
  lastMeasuredAt: null,
};

/** Newest row where the field carries a real measurement. */
function latest(rows: AppMetricsRow[], field: keyof AppMetricsRow): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const value = rows[i]?.[field];
    // Play exports write 0 for "no data yet" as often as for a true zero. For a
    // level or a rate, a zero surrounded by real values is the reading we want,
    // but a trailing run of zeros before any data exists is not — so scan back
    // for the first non-zero and fall back to zero only if nothing was ever set.
    if (typeof value === 'number' && value !== 0) return value;
  }
  return rows.length > 0 ? 0 : null;
}

function sum(rows: AppMetricsRow[], field: keyof AppMetricsRow): number {
  return rows.reduce((acc, row) => {
    const value = row[field];
    return acc + (typeof value === 'number' ? value : 0);
  }, 0);
}

/** Date of the newest row that carries one, as YYYY-MM-DD. */
function newestDate(rows: AppMetricsRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const raw = rows[i]?.date;
    if (!raw) continue;
    const date = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * `periodRows` are the rows inside the reporting window; `levelRows` are the
 * most recent rows regardless of the window. Both must be ordered by date
 * ascending. Passing the same array for both is valid and means "no history
 * beyond the window".
 */
export function buildAppDigest(args: {
  periodRows: AppMetricsRow[];
  levelRows: AppMetricsRow[];
  reviews: AppReviewRow[];
  connected: boolean;
}): AppDigest {
  const { periodRows, levelRows, reviews, connected } = args;
  if (!connected) return { ...EMPTY_APP_DIGEST, reviews: { total: 0, unanswered: 0, avgRating: null } };

  const ratings = reviews.map((r) => r.starRating).filter((r) => typeof r === 'number');
  const reviewBlock = {
    total: reviews.length,
    unanswered: reviews.filter((r) => !r.isReplied).length,
    avgRating:
      ratings.length === 0
        ? null
        : Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
  };

  if (periodRows.length === 0 && levelRows.length === 0) {
    return { ...EMPTY_APP_DIGEST, connected: true, reviews: reviewBlock };
  }

  // Nothing in the window means no activity in the window — a real, reportable
  // zero — but only if we have measurements at all. With no period rows the
  // sums stay null so the model does not read "no installs this month" out of
  // a gap in the data.
  const measuredPeriod = periodRows.length > 0;
  const installs = measuredPeriod ? sum(periodRows, 'installs') : null;
  const uninstalls = measuredPeriod ? sum(periodRows, 'uninstalls') : null;

  return {
    connected: true,
    installs,
    uninstalls,
    netInstalls: installs !== null && uninstalls !== null ? installs - uninstalls : null,
    activeDeviceInstalls: latest(levelRows, 'activeDeviceInstalls'),
    storeListingVisitors: measuredPeriod ? sum(periodRows, 'storeListingVisitors') : null,
    storeConversionRate: latest(levelRows, 'storeListingConversions'),
    crashRate: latest(levelRows, 'crashRate'),
    anrRate: latest(levelRows, 'anrRate'),
    averageRating: latest(levelRows, 'averageRating'),
    totalRatings: latest(levelRows, 'totalRatings'),
    reviews: reviewBlock,
    lastMeasuredAt: newestDate(levelRows),
  };
}
