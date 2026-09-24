// Pure aggregator for the cross-channel analytics overview strip.
// No DOM/fetch dependencies — fully unit-testable.

import { pickTotal } from './pick-total';

export interface SummaryCard {
  key: string;
  labelKey: string;
  hintKey: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  channel: 'site' | 'gsc' | 'instagram' | 'threads' | 'tiktok';
}

export interface BuildSummaryCardsInput {
  totals: {
    total: { visitors: number; conversions: number };
    change: { visitors: number; conversions: number };
    trend?: { visitors?: string; conversions?: string };
  };
  gsc: { connected: boolean; clicks?: number; clicksChange?: number };
  instagram: { connected: boolean; followers?: number; followersChange?: number };
  threads: { connected: boolean; engagement?: number; engagementChange?: number };
  /** Optional so existing callers that predate the TikTok channel still compile. */
  tiktok?: { connected: boolean; views?: number; viewsChange?: number };
}

function deriveTrend(provided: string | undefined, change: number): 'up' | 'down' | 'stable' {
  if (provided === 'up') return 'up';
  if (provided === 'down') return 'down';
  if (provided === 'stable') return 'stable';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'stable';
}

export function buildSummaryCards(input: BuildSummaryCardsInput): SummaryCard[] {
  const cards: SummaryCard[] = [];

  // Always-present site KPIs
  cards.push({
    key: 'visitors',
    labelKey: 'analytics.visitors',
    hintKey: 'hints.metric.visitors',
    value: input.totals.total.visitors,
    change: input.totals.change.visitors,
    trend: deriveTrend(input.totals.trend?.visitors, input.totals.change.visitors),
    channel: 'site',
  });

  cards.push({
    key: 'conversions',
    labelKey: 'analytics.conversions',
    hintKey: 'hints.metric.conversions',
    value: input.totals.total.conversions,
    change: input.totals.change.conversions,
    trend: deriveTrend(input.totals.trend?.conversions, input.totals.change.conversions),
    channel: 'site',
  });

  // Conditional channel cards
  if (input.gsc.connected) {
    cards.push({
      key: 'gscClicks',
      labelKey: 'analytics.gscClicks',
      hintKey: 'hints.metric.gscClicks',
      value: input.gsc.clicks ?? 0,
      change: input.gsc.clicksChange ?? 0,
      trend: deriveTrend(undefined, input.gsc.clicksChange ?? 0),
      channel: 'gsc',
    });
  }

  if (input.instagram.connected) {
    cards.push({
      key: 'igFollowers',
      labelKey: 'analytics.igFollowers',
      hintKey: 'hints.metric.igFollowers',
      value: input.instagram.followers ?? 0,
      change: input.instagram.followersChange ?? 0,
      trend: deriveTrend(undefined, input.instagram.followersChange ?? 0),
      channel: 'instagram',
    });
  }

  if (input.threads.connected) {
    cards.push({
      key: 'threadsEngagement',
      labelKey: 'analytics.threadsEngagement',
      hintKey: 'hints.metric.threadsEngagement',
      value: input.threads.engagement ?? 0,
      change: input.threads.engagementChange ?? 0,
      trend: deriveTrend(undefined, input.threads.engagementChange ?? 0),
      channel: 'threads',
    });
  }

  if (input.tiktok?.connected) {
    cards.push({
      key: 'tiktokViews',
      labelKey: 'analytics.tiktokViews',
      hintKey: 'hints.metric.tiktokViews',
      value: input.tiktok.views ?? 0,
      change: input.tiktok.viewsChange ?? 0,
      trend: deriveTrend(undefined, input.tiktok.viewsChange ?? 0),
      channel: 'tiktok',
    });
  }

  return cards;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- raw endpoint bodies */

/**
 * GET /google/search-console/summary → the clicks card and the chart series.
 * The body is `{ totals: { clicks }, byDate: [{ date, clicks }] }`.
 */
export function readGscSummary(body: any): {
  clicks: number;
  daily: { date: string; clicks: number }[] | null;
} {
  const clicks = typeof body?.totals?.clicks === 'number' ? body.totals.clicks : 0;
  const daily = Array.isArray(body?.byDate)
    ? body.byDate.map((d: any) => ({ date: d.date, clicks: d.clicks ?? 0 }))
    : null;
  return { clicks, daily };
}

const THREADS_ENGAGEMENT_KEYS = ['likes', 'replies', 'reposts', 'quotes'] as const;

/**
 * GET /threads/metrics → interactions over the period: likes + replies +
 * reposts + quotes. Each metric is the period total when Threads gave one,
 * else the sum of the daily rows — the same rule the Threads tab uses, so the
 * two never disagree. Views are reach, not engagement, and are left out.
 */
export function readThreadsEngagement(body: any): number {
  const rows: any[] = Array.isArray(body?.account) ? body.account : [];
  const totals = body?.periodTotals ?? {};
  return THREADS_ENGAGEMENT_KEYS.reduce(
    (sum, key) =>
      sum + pickTotal(totals[key], rows.reduce((s, r) => s + (r?.[key] ?? 0), 0)),
    0,
  );
}
