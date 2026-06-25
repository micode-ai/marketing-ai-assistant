import { GSCQueryRow } from './google-integrations.service';

export const STRIKING_MIN_IMPRESSIONS = 10;
export const LOWCTR_MIN_IMPRESSIONS = 20;
export const CANNIBAL_MIN_IMPRESSIONS = 5;
export const MOVERS_MIN_IMPRESSIONS = 20;
export const INSIGHT_LIMIT = 50;
export const MOVERS_LIMIT = 25;

const EXPECTED_CTR: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06,
  6: 0.05, 7: 0.04, 8: 0.03, 9: 0.028, 10: 0.025,
};

export function expectedCtr(position: number): number {
  const p = Math.min(10, Math.max(1, Math.round(position)));
  return EXPECTED_CTR[p] ?? 0.02;
}

export interface InsightRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function toInsightRow(r: GSCQueryRow): InsightRow {
  return { key: r.keys?.[0] ?? '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
}

export function strikingDistance(rows: GSCQueryRow[]): InsightRow[] {
  return rows
    .filter((r) => r.position > 10 && r.position <= 20 && r.impressions >= STRIKING_MIN_IMPRESSIONS)
    .map(toInsightRow)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, INSIGHT_LIMIT);
}

export interface LowCtrRow extends InsightRow {
  missedClicks: number;
}

export function lowCtr(rows: GSCQueryRow[]): LowCtrRow[] {
  return rows
    .filter((r) => r.position <= 10 && r.impressions >= LOWCTR_MIN_IMPRESSIONS)
    .map((r) => ({ row: r, raw: r.impressions * Math.max(0, expectedCtr(r.position) - r.ctr) }))
    .filter((x) => x.raw > 0)
    .map((x) => ({ ...toInsightRow(x.row), missedClicks: Math.max(1, Math.round(x.raw)) }))
    .sort((a, b) => b.missedClicks - a.missedClicks)
    .slice(0, INSIGHT_LIMIT);
}

export interface CannibalRow {
  query: string;
  totalImpressions: number;
  pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
}

export function cannibalization(rows: GSCQueryRow[]): CannibalRow[] {
  const byQuery = new Map<string, CannibalRow['pages']>();
  for (const r of rows) {
    if (r.impressions < CANNIBAL_MIN_IMPRESSIONS) continue;
    const query = r.keys?.[0] ?? '';
    const list = byQuery.get(query) ?? [];
    list.push({ page: r.keys?.[1] ?? '', clicks: r.clicks, impressions: r.impressions, position: r.position });
    byQuery.set(query, list);
  }
  const result: CannibalRow[] = [];
  for (const [query, pages] of byQuery) {
    if (pages.length >= 2) {
      result.push({
        query,
        totalImpressions: pages.reduce((s, p) => s + p.impressions, 0),
        pages: pages.sort((a, b) => b.impressions - a.impressions),
      });
    }
  }
  return result.sort((a, b) => b.totalImpressions - a.totalImpressions).slice(0, INSIGHT_LIMIT);
}

export interface MoverRow {
  key: string;
  clicks: number;
  impressions: number;
  position: number;
  deltaClicks: number;
  deltaPosition: number;
}

export function movers(current: GSCQueryRow[], previous: GSCQueryRow[]): { gainers: MoverRow[]; losers: MoverRow[] } {
  const prev = new Map<string, GSCQueryRow>();
  for (const r of previous) prev.set(r.keys?.[0] ?? '', r);
  const moves: MoverRow[] = [];
  const seen = new Set<string>();
  for (const r of current) {
    const key = r.keys?.[0] ?? '';
    seen.add(key);
    const p = prev.get(key);
    if (Math.max(r.impressions, p?.impressions ?? 0) < MOVERS_MIN_IMPRESSIONS) continue;
    moves.push({
      key,
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
      deltaClicks: r.clicks - (p?.clicks ?? 0),
      deltaPosition: p ? Number((r.position - p.position).toFixed(1)) : 0,
    });
  }
  // Previous-only keys: dropped off the current period entirely.
  for (const p of previous) {
    const key = p.keys?.[0] ?? '';
    if (seen.has(key) || p.impressions < MOVERS_MIN_IMPRESSIONS) continue;
    moves.push({ key, clicks: 0, impressions: 0, position: 0, deltaClicks: -p.clicks, deltaPosition: 0 });
  }
  const gainers = [...moves].sort((a, b) => b.deltaClicks - a.deltaClicks).slice(0, MOVERS_LIMIT);
  const losers = [...moves].sort((a, b) => a.deltaClicks - b.deltaClicks).slice(0, MOVERS_LIMIT);
  return { gainers, losers };
}

export interface MergedRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevClicks: number;
  prevImpressions: number;
  prevCtr: number;
  prevPosition: number | null;
}

export function mergePreviousMetrics(current: GSCQueryRow[], previous: GSCQueryRow[]): MergedRow[] {
  const prev = new Map<string, GSCQueryRow>();
  // GSC omits `keys` entirely for a no-dimension (site totals) query — guard it.
  for (const r of previous) prev.set((r.keys ?? []).join('|'), r);
  return current.map((r) => {
    const p = prev.get((r.keys ?? []).join('|'));
    return {
      keys: r.keys ?? [],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      prevClicks: p?.clicks ?? 0,
      prevImpressions: p?.impressions ?? 0,
      prevCtr: p?.ctr ?? 0,
      prevPosition: p?.position ?? null,
    };
  });
}
