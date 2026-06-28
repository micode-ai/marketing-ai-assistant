// Pure aggregator for the cross-channel analytics overview strip.
// No DOM/fetch dependencies — fully unit-testable.

export interface SummaryCard {
  key: string;
  labelKey: string;
  hintKey: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  channel: 'site' | 'gsc' | 'instagram' | 'threads';
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

  return cards;
}
