/**
 * Builds the `ga4` block of the recommendations digest from GA4 report rows.
 *
 * The digest also carries a `web` block from our own tracking script — a
 * different measurement of the same idea. They will not agree: GA4 filters
 * bots, sessionises differently, and only sees pages where its tag is
 * installed. So the two travel side by side under their own names rather than
 * being merged, and the prompt says which is which. Reconciling them silently
 * would produce a figure neither source supports.
 *
 * Every field is nullable because a property can be connected and answer
 * nothing — brand new, tag never installed, or a metric it does not populate.
 */

export interface Ga4Row {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

/** GA4 processes data with a lag; figures for the last day or two move. */
export const GA4_LAG_HOURS = 48;

const MAX_ROWS = 5;
const MAX_DEVICES = 3;

export interface Ga4Digest {
  connected: boolean;
  /** Hours the newest figures are still settling. */
  lagHours: number;
  sessions: number | null;
  users: number | null;
  newUsers: number | null;
  pageViews: number | null;
  /** Percent of engaged sessions. */
  engagementRate: number | null;
  /** Seconds. */
  avgSessionDuration: number | null;
  /** GA4 key events — the closest thing it has to a conversion count. */
  keyEvents: number | null;
  /**
   * False when the property records no key events at all. That is a different
   * statement from "zero conversions this period": it means conversions were
   * never configured, which is itself the recommendation.
   */
  keyEventsConfigured: boolean;
  /** Same figures for the preceding window of equal length. */
  previous: { sessions: number | null; users: number | null; keyEvents: number | null } | null;
  /** Percent change against `previous`; null where it cannot be computed. */
  change: { sessions: number | null; users: number | null; keyEvents: number | null } | null;
  channels: Array<{ channel: string; sessions: number }>;
  /** Real attribution, not the channel grouping. */
  sources: Array<{ source: string; medium: string; sessions: number }>;
  landingPages: Array<{
    page: string;
    sessions: number;
    keyEvents: number | null;
    engagementRate: number | null;
  }>;
  devices: Array<{ device: string; sessions: number; engagementRate: number | null }>;
  events: Array<{ event: string; count: number }>;
  countries: Array<{ country: string; sessions: number }>;
}

export const EMPTY_GA4_DIGEST: Ga4Digest = {
  connected: false,
  lagHours: GA4_LAG_HOURS,
  sessions: null,
  users: null,
  newUsers: null,
  pageViews: null,
  engagementRate: null,
  avgSessionDuration: null,
  keyEvents: null,
  keyEventsConfigured: false,
  previous: null,
  change: null,
  channels: [],
  sources: [],
  landingPages: [],
  devices: [],
  events: [],
  countries: [],
};

const round = (value: number, places: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : 0;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * GA4 writes `(not set)` and `(none)` where it could not resolve a value.
 * Passing those through as if they were a page or a source invites advice about
 * optimising a URL that does not exist.
 */
const UNRESOLVED = new Set(['(not set)', '(none)', '(other)', '']);
const isUnresolved = (value: string) => UNRESOLVED.has(value.trim().toLowerCase()) ||
  UNRESOLVED.has(value.trim());

/** Rows belonging to one date range, when the report compared two. */
function inRange(rows: Ga4Row[], range: 'current' | 'previous'): Ga4Row[] {
  const tagged = rows.filter((r) => r.dimensions?.dateRange !== undefined);
  if (tagged.length === 0) return range === 'current' ? rows : [];
  return tagged.filter((r) => r.dimensions.dateRange === range);
}

function metric(rows: Ga4Row[], name: string): number | null {
  return num(rows[0]?.metrics?.[name]);
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  // From zero any increase is unbounded, so it is reported as "new" by leaving
  // the change null rather than as an invented 100%.
  if (previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

function rows(value: Ga4Row[] | null | undefined): Ga4Row[] {
  return Array.isArray(value) ? value : [];
}

export function buildGa4Digest(args: {
  connected: boolean;
  totals?: Ga4Row[] | null;
  keyEvents?: Ga4Row[] | null;
  channels?: Ga4Row[] | null;
  sources?: Ga4Row[] | null;
  landingPages?: Ga4Row[] | null;
  devices?: Ga4Row[] | null;
  events?: Ga4Row[] | null;
  countries?: Ga4Row[] | null;
}): Ga4Digest {
  if (!args.connected) return { ...EMPTY_GA4_DIGEST };

  const totalsNow = inRange(rows(args.totals), 'current');
  const totalsPrev = inRange(rows(args.totals), 'previous');
  const keyNow = inRange(rows(args.keyEvents), 'current');
  const keyPrev = inRange(rows(args.keyEvents), 'previous');

  const sessions = metric(totalsNow, 'sessions');
  const users = metric(totalsNow, 'totalUsers');
  const keyEvents = metric(keyNow, 'keyEvents');
  const engagement = metric(totalsNow, 'engagementRate');

  const prevSessions = metric(totalsPrev, 'sessions');
  const prevUsers = metric(totalsPrev, 'totalUsers');
  const prevKeyEvents = metric(keyPrev, 'keyEvents');
  const hasPrevious = prevSessions !== null || prevUsers !== null || prevKeyEvents !== null;

  const eventRows = inRange(rows(args.events), 'current');

  return {
    connected: true,
    lagHours: GA4_LAG_HOURS,
    sessions,
    users,
    newUsers: metric(totalsNow, 'newUsers'),
    pageViews: metric(totalsNow, 'screenPageViews'),
    // GA4 returns it as a fraction; every rate in the digest is a percent.
    engagementRate: engagement === null ? null : round(engagement * 100, 1),
    avgSessionDuration: (() => {
      const value = metric(totalsNow, 'averageSessionDuration');
      return value === null ? null : Math.round(value);
    })(),
    keyEvents,
    // A property with key events set up reports them even when the count is
    // zero for a period; one with none configured returns nothing at all.
    keyEventsConfigured: keyEvents !== null,
    previous: hasPrevious
      ? { sessions: prevSessions, users: prevUsers, keyEvents: prevKeyEvents }
      : null,
    change: hasPrevious
      ? {
          sessions: percentChange(sessions, prevSessions),
          users: percentChange(users, prevUsers),
          keyEvents: percentChange(keyEvents, prevKeyEvents),
        }
      : null,
    channels: inRange(rows(args.channels), 'current')
      .map((r) => ({
        channel: r.dimensions?.sessionDefaultChannelGroup ?? '',
        sessions: Math.round(r.metrics?.sessions ?? 0),
      }))
      .filter((r) => !isUnresolved(r.channel))
      .slice(0, MAX_ROWS),
    sources: inRange(rows(args.sources), 'current')
      .map((r) => ({
        source: r.dimensions?.sessionSource ?? '',
        medium: r.dimensions?.sessionMedium ?? '',
        sessions: Math.round(r.metrics?.sessions ?? 0),
      }))
      .filter((r) => !isUnresolved(r.source))
      .slice(0, MAX_ROWS),
    landingPages: inRange(rows(args.landingPages), 'current')
      .map((r) => {
        const rate = num(r.metrics?.engagementRate);
        return {
          page: r.dimensions?.landingPage ?? '',
          sessions: Math.round(r.metrics?.sessions ?? 0),
          keyEvents: num(r.metrics?.keyEvents),
          engagementRate: rate === null ? null : round(rate * 100, 1),
        };
      })
      .filter((r) => !isUnresolved(r.page))
      .slice(0, MAX_ROWS),
    devices: inRange(rows(args.devices), 'current')
      .map((r) => {
        const rate = num(r.metrics?.engagementRate);
        return {
          device: r.dimensions?.deviceCategory ?? '',
          sessions: Math.round(r.metrics?.sessions ?? 0),
          engagementRate: rate === null ? null : round(rate * 100, 1),
        };
      })
      .filter((r) => !isUnresolved(r.device))
      .slice(0, MAX_DEVICES),
    events: eventRows
      .map((r) => ({
        event: r.dimensions?.eventName ?? '',
        count: Math.round(r.metrics?.eventCount ?? 0),
      }))
      .filter((r) => !isUnresolved(r.event))
      .slice(0, MAX_ROWS),
    countries: inRange(rows(args.countries), 'current')
      .map((r) => ({
        country: r.dimensions?.country ?? '',
        sessions: Math.round(r.metrics?.sessions ?? 0),
      }))
      .filter((r) => !isUnresolved(r.country))
      .slice(0, 3),
  };
}
