/**
 * Builds the `ga4` block of the recommendations digest from GA4 report rows.
 *
 * The digest already carries a `web` block, and that one comes from our own
 * tracking script — a different measurement of the same idea. They will not
 * agree: GA4 filters bots, sessionises differently, and only sees pages where
 * its tag is installed. So the two travel side by side under their own names
 * rather than being merged into one number, and the prompt says which is which.
 * Reconciling them silently would produce a figure neither source supports.
 *
 * Every field is nullable because a GA4 property can be connected and still
 * answer nothing — a brand-new property, a tag that was never installed, or a
 * metric this property does not populate.
 */

export interface Ga4Row {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

export interface Ga4Digest {
  connected: boolean;
  sessions: number | null;
  users: number | null;
  newUsers: number | null;
  pageViews: number | null;
  /** Percent of engaged sessions. */
  engagementRate: number | null;
  /** GA4 key events — the closest thing it has to a conversion count. */
  keyEvents: number | null;
  /** Where the sessions came from, biggest first. */
  topSources: Array<{ source: string; sessions: number }>;
  /** Where people landed, biggest first. */
  topLandingPages: Array<{ page: string; sessions: number }>;
}

export const EMPTY_GA4_DIGEST: Ga4Digest = {
  connected: false,
  sessions: null,
  users: null,
  newUsers: null,
  pageViews: null,
  engagementRate: null,
  keyEvents: null,
  topSources: [],
  topLandingPages: [],
};

const MAX_ROWS = 5;

const round = (value: number, places: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : 0;

/** Reads a metric out of a totals row, or null when it was not returned. */
function metric(rows: Ga4Row[], name: string): number | null {
  const value = rows[0]?.metrics?.[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Top N rows of a one-dimension breakdown, largest metric first. */
function breakdown(
  rows: Ga4Row[],
  dimension: string,
  metricName: string,
): Array<{ key: string; sessions: number }> {
  return rows
    .map((row) => ({
      key: row.dimensions?.[dimension] ?? '',
      sessions: Math.round(row.metrics?.[metricName] ?? 0),
    }))
    .filter((row) => row.key !== '')
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, MAX_ROWS);
}

export function buildGa4Digest(args: {
  connected: boolean;
  totals?: Ga4Row[] | null;
  keyEvents?: Ga4Row[] | null;
  sources?: Ga4Row[] | null;
  landingPages?: Ga4Row[] | null;
}): Ga4Digest {
  if (!args.connected) return { ...EMPTY_GA4_DIGEST };

  const totals = args.totals ?? [];
  const engagement = metric(totals, 'engagementRate');

  return {
    connected: true,
    sessions: metric(totals, 'sessions'),
    users: metric(totals, 'totalUsers'),
    newUsers: metric(totals, 'newUsers'),
    pageViews: metric(totals, 'screenPageViews'),
    // GA4 returns it as a fraction; the digest states every rate as a percent.
    engagementRate: engagement === null ? null : round(engagement * 100, 1),
    // Fetched separately: `keyEvents` is not populated on every property, and a
    // rejected metric fails the whole report rather than one column.
    keyEvents: metric(args.keyEvents ?? [], 'keyEvents'),
    topSources: breakdown(
      args.sources ?? [],
      'sessionDefaultChannelGroup',
      'sessions',
    ).map(({ key, sessions }) => ({ source: key, sessions })),
    topLandingPages: breakdown(args.landingPages ?? [], 'landingPage', 'sessions').map(
      ({ key, sessions }) => ({ page: key, sessions }),
    ),
  };
}
