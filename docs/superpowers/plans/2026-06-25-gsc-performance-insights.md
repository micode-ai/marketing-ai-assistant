# GSC Extended Performance + SEO Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated `/projects/[id]/search-console` page (opened from the existing panel) with period comparison, full sortable/paginated Queries & Pages tables, drill-down, filters, search-type selector, and four SEO insights — all on the existing Search Analytics API.

**Architecture:** Backend extends `fetchSearchConsoleData` to accept search type / filters / pagination, adds two endpoints (`/google/search-console/query` with previous-period merge, `/google/search-console/insights`), and computes insights via pure, unit-tested functions in a new `gsc-insights.util.ts`. Frontend adds one route orchestrating four focused components, mirroring `SearchConsolePanel` patterns.

**Tech Stack:** NestJS 10 + Jest (apps/api), SvelteKit 2 + Chart.js + svelte-i18n (apps/web).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-25-gsc-performance-insights-design.md`. Issue: #87.
- No Prisma schema changes. Reuse existing GSC OAuth (`getIntegration` + `ensureFreshToken`) and the 1h in-memory cache.
- Backend uses the existing access-token pattern: `const config = await getIntegration(projectId); if (!config?.accessToken || !config?.siteUrl) throw GSC_NOT_CONFIGURED; const accessToken = await ensureFreshToken(projectId, config);`.
- New endpoints use `@UseGuards(ProjectAccessGuard)` and map `GSC_NOT_CONFIGURED` → 400 `{code:'GSC_NOT_CONFIGURED'}`, other errors → 502 `{code:'GSC_ERROR',message}` (same as `getSearchConsoleSummary`).
- GSC date window: `endDate = today - 2 days`; `startDate = endDate - (days-1)`. Previous period = the equal-length window immediately before `startDate`.
- Existing positional callers of `fetchSearchConsoleData` must keep working — new params go in a trailing optional `options` object.
- Insight thresholds are named constants (see Task 2). Search types: `web|image|video|news|discover`.
- Commits/PRs/issues in English. IDs are cuid.
- Run a single api test: `cd apps/api && npx jest <path>`. Frontend type-check: `cd apps/web && npx svelte-check --threshold error`.

---

### Task 1: Backend — request-body builder for Search Analytics (type/filters/startRow)

**Files:**
- Create: `apps/api/src/google-integrations/gsc-query.util.ts`
- Test: `apps/api/src/google-integrations/gsc-query.util.spec.ts`

**Interfaces:**
- Produces:
  - `interface GscFilter { dimension: string; operator: 'equals'|'notEquals'|'contains'|'notContains'; expression: string }`
  - `interface GscQueryOptions { type?: string; filters?: GscFilter[]; startRow?: number }`
  - `function buildSearchAnalyticsBody(startDate: string, endDate: string, dimensions: string[], rowLimit: number, options?: GscQueryOptions): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/google-integrations/gsc-query.util.spec.ts`:

```ts
import { buildSearchAnalyticsBody } from './gsc-query.util';

describe('buildSearchAnalyticsBody', () => {
  it('builds a minimal body with no options', () => {
    const body = buildSearchAnalyticsBody('2026-06-01', '2026-06-10', ['query'], 100);
    expect(body).toEqual({ startDate: '2026-06-01', endDate: '2026-06-10', dimensions: ['query'], rowLimit: 100 });
  });

  it('adds type, startRow and dimensionFilterGroups when provided', () => {
    const body = buildSearchAnalyticsBody('2026-06-01', '2026-06-10', ['query'], 50, {
      type: 'image',
      startRow: 100,
      filters: [{ dimension: 'query', operator: 'contains', expression: 'shoes' }],
    });
    expect(body.type).toBe('image');
    expect(body.startRow).toBe(100);
    expect(body.dimensionFilterGroups).toEqual([
      { groupType: 'and', filters: [{ dimension: 'query', operator: 'contains', expression: 'shoes' }] },
    ]);
  });

  it('omits dimensionFilterGroups for an empty filters array', () => {
    const body = buildSearchAnalyticsBody('2026-06-01', '2026-06-10', ['page'], 10, { filters: [] });
    expect(body.dimensionFilterGroups).toBeUndefined();
    expect(body.type).toBeUndefined();
    expect(body.startRow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/google-integrations/gsc-query.util.spec.ts`
Expected: FAIL — `buildSearchAnalyticsBody` not found.

- [ ] **Step 3: Implement the builder**

Create `apps/api/src/google-integrations/gsc-query.util.ts`:

```ts
export interface GscFilter {
  dimension: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains';
  expression: string;
}

export interface GscQueryOptions {
  type?: string;
  filters?: GscFilter[];
  startRow?: number;
}

export function buildSearchAnalyticsBody(
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
  options: GscQueryOptions = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = { startDate, endDate, dimensions, rowLimit };
  if (options.type) body.type = options.type;
  if (options.startRow) body.startRow = options.startRow;
  if (options.filters && options.filters.length > 0) {
    body.dimensionFilterGroups = [
      {
        groupType: 'and',
        filters: options.filters.map((f) => ({
          dimension: f.dimension,
          operator: f.operator,
          expression: f.expression,
        })),
      },
    ];
  }
  return body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/google-integrations/gsc-query.util.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the builder into `fetchSearchConsoleData`**

In `apps/api/src/google-integrations/google-integrations.service.ts`:
- Add import at top: `import { buildSearchAnalyticsBody, GscQueryOptions } from './gsc-query.util';`
- Change the signature and body construction of `fetchSearchConsoleData` (currently lines ~152-185). Replace the method with:

```ts
  async fetchSearchConsoleData(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: string[] = ['query'],
    rowLimit = 100,
    options: GscQueryOptions = {},
  ): Promise<GSCQueryRow[]> {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildSearchAnalyticsBody(startDate, endDate, dimensions, rowLimit, options)),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.warn(`GSC API error: ${err}`);
      return [];
    }

    const data = (await response.json()) as { rows?: GSCQueryRow[] };
    return data.rows || [];
  }
```

Existing positional callers (in `fetchSearchConsoleSummary`) pass 6 args and are unaffected.

- [ ] **Step 6: Type-check + commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (no new errors).
```bash
git add apps/api/src/google-integrations/gsc-query.util.ts apps/api/src/google-integrations/gsc-query.util.spec.ts apps/api/src/google-integrations/google-integrations.service.ts
git commit -m "feat(gsc): search analytics body builder with type/filters/pagination"
```

---

### Task 2: Backend — SEO insight pure functions

**Files:**
- Create: `apps/api/src/google-integrations/gsc-insights.util.ts`
- Test: `apps/api/src/google-integrations/gsc-insights.util.spec.ts`

**Interfaces:**
- Consumes: `GSCQueryRow` from `google-integrations.service.ts` (`{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }`).
- Produces (all exported):
  - constants `STRIKING_MIN_IMPRESSIONS=10`, `LOWCTR_MIN_IMPRESSIONS=20`, `CANNIBAL_MIN_IMPRESSIONS=5`, `MOVERS_MIN_IMPRESSIONS=20`, `INSIGHT_LIMIT=50`, `MOVERS_LIMIT=25`
  - `function expectedCtr(position: number): number`
  - `interface InsightRow { key: string; clicks: number; impressions: number; ctr: number; position: number }`
  - `function strikingDistance(rows: GSCQueryRow[]): InsightRow[]`
  - `interface LowCtrRow extends InsightRow { missedClicks: number }` ; `function lowCtr(rows: GSCQueryRow[]): LowCtrRow[]`
  - `interface CannibalRow { query: string; totalImpressions: number; pages: Array<{ page: string; clicks: number; impressions: number; position: number }> }` ; `function cannibalization(rows: GSCQueryRow[]): CannibalRow[]`
  - `interface MoverRow { key: string; clicks: number; impressions: number; position: number; deltaClicks: number; deltaPosition: number }` ; `function movers(current: GSCQueryRow[], previous: GSCQueryRow[]): { gainers: MoverRow[]; losers: MoverRow[] }`
  - `interface MergedRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number; prevClicks: number; prevImpressions: number; prevCtr: number; prevPosition: number | null }` ; `function mergePreviousMetrics(current: GSCQueryRow[], previous: GSCQueryRow[]): MergedRow[]`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/google-integrations/gsc-insights.util.spec.ts`:

```ts
import {
  strikingDistance, lowCtr, cannibalization, movers, mergePreviousMetrics, expectedCtr,
} from './gsc-insights.util';

const row = (keys: string[], clicks: number, impressions: number, ctr: number, position: number) =>
  ({ keys, clicks, impressions, ctr, position });

describe('strikingDistance', () => {
  it('keeps only positions in (10,20] above the impressions floor, sorted by impressions', () => {
    const rows = [
      row(['a'], 0, 100, 0, 12),   // qualifies
      row(['b'], 0, 5, 0, 15),     // below MIN_IMPRESSIONS (10)
      row(['c'], 0, 200, 0, 9),    // position <= 10, excluded
      row(['d'], 0, 50, 0, 18),    // qualifies
    ];
    const out = strikingDistance(rows);
    expect(out.map((r) => r.key)).toEqual(['a', 'd']);
  });
});

describe('lowCtr', () => {
  it('ranks page-1 high-impression rows by missed clicks vs expected CTR', () => {
    const rows = [
      row(['x'], 5, 1000, 0.005, 3), // expected ~0.11 -> big missed
      row(['y'], 90, 1000, 0.09, 3), // ctr near/above expected -> ~0 missed, dropped
      row(['z'], 0, 10, 0, 2),       // below MIN_IMPRESSIONS (20), excluded
    ];
    const out = lowCtr(rows);
    expect(out[0].key).toBe('x');
    expect(out[0].missedClicks).toBeGreaterThan(0);
    expect(out.find((r) => r.key === 'z')).toBeUndefined();
  });
});

describe('cannibalization', () => {
  it('flags queries with >= 2 pages above the impressions floor', () => {
    const rows = [
      row(['q1', '/a'], 1, 30, 0, 5),
      row(['q1', '/b'], 1, 20, 0, 8),
      row(['q2', '/c'], 1, 100, 0, 2),  // only one page -> not cannibalized
      row(['q3', '/d'], 0, 2, 0, 9),    // below CANNIBAL floor (5)
    ];
    const out = cannibalization(rows);
    expect(out.map((r) => r.query)).toEqual(['q1']);
    expect(out[0].pages).toHaveLength(2);
  });
});

describe('movers', () => {
  it('computes click and position deltas and splits gainers/losers', () => {
    const current = [row(['up'], 100, 500, 0.2, 4), row(['down'], 10, 500, 0.02, 9)];
    const previous = [row(['up'], 20, 400, 0.05, 8), row(['down'], 80, 400, 0.2, 3)];
    const { gainers, losers } = movers(current, previous);
    expect(gainers[0].key).toBe('up');
    expect(gainers[0].deltaClicks).toBe(80);
    expect(gainers[0].deltaPosition).toBeCloseTo(-4); // 4 - 8 improved
    expect(losers[0].key).toBe('down');
    expect(losers[0].deltaClicks).toBe(-70);
  });
});

describe('mergePreviousMetrics', () => {
  it('attaches previous-period metrics by joined keys, null position when absent', () => {
    const current = [row(['q', '/a'], 5, 50, 0.1, 4)];
    const previous = [row(['q', '/a'], 2, 40, 0.05, 6)];
    const merged = mergePreviousMetrics(current, previous);
    expect(merged[0].prevClicks).toBe(2);
    expect(merged[0].prevPosition).toBe(6);
    expect(mergePreviousMetrics([row(['new'], 1, 10, 0.1, 5)], [])[0].prevPosition).toBeNull();
  });
});

describe('expectedCtr', () => {
  it('returns higher expected CTR for better positions', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(99)).toBeLessThanOrEqual(expectedCtr(10));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/google-integrations/gsc-insights.util.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

Create `apps/api/src/google-integrations/gsc-insights.util.ts`:

```ts
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
  return { key: r.keys[0] ?? '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
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
    .map((r) => ({ ...toInsightRow(r), missedClicks: Math.round(r.impressions * Math.max(0, expectedCtr(r.position) - r.ctr)) }))
    .filter((r) => r.missedClicks > 0)
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
    const query = r.keys[0] ?? '';
    const list = byQuery.get(query) ?? [];
    list.push({ page: r.keys[1] ?? '', clicks: r.clicks, impressions: r.impressions, position: r.position });
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
  for (const r of previous) prev.set(r.keys[0] ?? '', r);
  const moves: MoverRow[] = [];
  for (const r of current) {
    const key = r.keys[0] ?? '';
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
  for (const r of previous) prev.set(r.keys.join('|'), r);
  return current.map((r) => {
    const p = prev.get(r.keys.join('|'));
    return {
      keys: r.keys,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/google-integrations/gsc-insights.util.spec.ts`
Expected: PASS (6 describes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/google-integrations/gsc-insights.util.ts apps/api/src/google-integrations/gsc-insights.util.spec.ts
git commit -m "feat(gsc): pure SEO insight functions (striking-distance, low-ctr, cannibalization, movers)"
```

---

### Task 3: Backend — service methods `fetchSearchConsoleQuery` + `computeGscInsights`

**Files:**
- Modify: `apps/api/src/google-integrations/google-integrations.service.ts`

**Interfaces:**
- Consumes: `getIntegration`, `ensureFreshToken`, `fetchSearchConsoleData` (Task 1), all of `gsc-insights.util.ts` (Task 2), `GscFilter`/`GscQueryOptions` (Task 1).
- Produces:
  - `interface GscQueryParams { days: number; dimensions: string[]; type?: string; filters?: GscFilter[]; rowLimit?: number; startRow?: number; compare?: boolean }`
  - `async fetchSearchConsoleQuery(projectId: string, params: GscQueryParams): Promise<{ rows: MergedRow[] }>` (when `compare` is false, prev* fields are 0/null)
  - `interface GscInsightsResult { strikingDistance: InsightRow[]; lowCtr: LowCtrRow[]; cannibalization: CannibalRow[]; moversQueries: { gainers: MoverRow[]; losers: MoverRow[] }; moversPages: { gainers: MoverRow[]; losers: MoverRow[] } }`
  - `async computeGscInsights(projectId: string, params: { days: number; type?: string; filters?: GscFilter[] }): Promise<GscInsightsResult>`
  - private `gscWindow(days: number): { startDate: string; endDate: string; prevStartDate: string; prevEndDate: string }`

- [ ] **Step 1: Add imports + a window helper**

In `google-integrations.service.ts`, add to imports:
```ts
import { GscFilter } from './gsc-query.util';
import {
  strikingDistance, lowCtr, cannibalization, movers, mergePreviousMetrics,
  InsightRow, LowCtrRow, CannibalRow, MoverRow, MergedRow,
} from './gsc-insights.util';
```

Add these exported interfaces near the top (after `GSCSummary`):
```ts
export interface GscQueryParams {
  days: number;
  dimensions: string[];
  type?: string;
  filters?: GscFilter[];
  rowLimit?: number;
  startRow?: number;
  compare?: boolean;
}

export interface GscInsightsResult {
  strikingDistance: InsightRow[];
  lowCtr: LowCtrRow[];
  cannibalization: CannibalRow[];
  moversQueries: { gainers: MoverRow[]; losers: MoverRow[] };
  moversPages: { gainers: MoverRow[]; losers: MoverRow[] };
}
```

Add a private helper method inside the class (the window math mirrors `fetchSearchConsoleSummary`):
```ts
  private gscWindow(days: number) {
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startDate = new Date(new Date(endDate).getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const prevEndDate = new Date(new Date(startDate).getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const prevStartDate = new Date(new Date(prevEndDate).getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { startDate, endDate, prevStartDate, prevEndDate };
  }
```

- [ ] **Step 2: Add `fetchSearchConsoleQuery`**

Add this method to the class:
```ts
  async fetchSearchConsoleQuery(projectId: string, params: GscQueryParams): Promise<{ rows: MergedRow[] }> {
    const config = await this.getIntegration(projectId);
    if (!config?.accessToken || !config?.siteUrl) {
      throw Object.assign(new Error('GSC_NOT_CONFIGURED'), { code: 'GSC_NOT_CONFIGURED' });
    }
    const accessToken = await this.ensureFreshToken(projectId, config);
    const siteUrl = config.siteUrl as string;
    const { startDate, endDate, prevStartDate, prevEndDate } = this.gscWindow(params.days);
    const opts = { type: params.type, filters: params.filters, startRow: params.startRow };
    const rowLimit = params.rowLimit ?? 100;

    const current = await this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, params.dimensions, rowLimit, opts);
    const previous = params.compare
      ? await this.fetchSearchConsoleData(accessToken, siteUrl, prevStartDate, prevEndDate, params.dimensions, rowLimit, opts)
      : [];
    return { rows: mergePreviousMetrics(current, previous) };
  }
```

- [ ] **Step 3: Add `computeGscInsights`**

Add this method to the class:
```ts
  async computeGscInsights(
    projectId: string,
    params: { days: number; type?: string; filters?: GscFilter[] },
  ): Promise<GscInsightsResult> {
    const config = await this.getIntegration(projectId);
    if (!config?.accessToken || !config?.siteUrl) {
      throw Object.assign(new Error('GSC_NOT_CONFIGURED'), { code: 'GSC_NOT_CONFIGURED' });
    }
    const accessToken = await this.ensureFreshToken(projectId, config);
    const siteUrl = config.siteUrl as string;
    const { startDate, endDate, prevStartDate, prevEndDate } = this.gscWindow(params.days);
    const opts = { type: params.type, filters: params.filters };

    const [curQueries, prevQueries, curPages, prevPages, queryPages] = await Promise.all([
      this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['query'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, prevStartDate, prevEndDate, ['query'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['page'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, prevStartDate, prevEndDate, ['page'], 1000, opts),
      this.fetchSearchConsoleData(accessToken, siteUrl, startDate, endDate, ['query', 'page'], 2000, opts),
    ]);

    return {
      strikingDistance: strikingDistance(curQueries),
      lowCtr: lowCtr(curQueries),
      cannibalization: cannibalization(queryPages),
      moversQueries: movers(curQueries, prevQueries),
      moversPages: movers(curPages, prevPages),
    };
  }
```

- [ ] **Step 4: Type-check + commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (no new errors).
```bash
git add apps/api/src/google-integrations/google-integrations.service.ts
git commit -m "feat(gsc): service methods for flexible query (with comparison) and insights"
```

> Note: these two methods orchestrate IO (token + fetch); their pure logic (`mergePreviousMetrics`, the four insight functions) is already unit-tested in Tasks 1-2. No new unit test here; verified by type-check and the endpoint task.

---

### Task 4: Backend — `/google/search-console/query` and `/insights` endpoints

**Files:**
- Modify: `apps/api/src/google-integrations/google-integrations.controller.ts`

**Interfaces:**
- Consumes: `fetchSearchConsoleQuery`, `computeGscInsights`, `GscFilter` (Task 3/1).
- Produces: HTTP `GET /google/search-console/query` and `GET /google/search-console/insights`.

- [ ] **Step 1: Add imports + a shared param parser**

In the controller, add import:
```ts
import { GscFilter } from './gsc-query.util';
```

Add a private helper to the controller class (parses shared query params; clamps days; parses JSON filters defensively):
```ts
  private parseGscParams(daysParam?: string, type?: string, filtersParam?: string) {
    const days = Math.min(90, Math.max(7, parseInt(daysParam || '28', 10) || 28));
    const allowedTypes = ['web', 'image', 'video', 'news', 'discover'];
    const searchType = allowedTypes.includes(type || '') ? type : 'web';
    let filters: GscFilter[] = [];
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam);
        if (Array.isArray(parsed)) filters = parsed;
      } catch {
        // ignore malformed filters -> no filtering
      }
    }
    return { days, type: searchType, filters };
  }
```

- [ ] **Step 2: Add the `query` endpoint**

Add to the controller class:
```ts
  @Get('search-console/query')
  @UseGuards(ProjectAccessGuard)
  async getSearchConsoleQuery(
    @Query('projectId') projectId: string,
    @Query('days') daysParam?: string,
    @Query('dimensions') dimensionsParam?: string,
    @Query('type') typeParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('rowLimit') rowLimitParam?: string,
    @Query('startRow') startRowParam?: string,
    @Query('compare') compareParam?: string,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const { days, type, filters } = this.parseGscParams(daysParam, typeParam, filtersParam);
    const dimensions = (dimensionsParam || 'query').split(',').filter(Boolean);
    const rowLimit = Math.min(5000, Math.max(1, parseInt(rowLimitParam || '100', 10) || 100));
    const startRow = Math.max(0, parseInt(startRowParam || '0', 10) || 0);
    try {
      return await this.googleService.fetchSearchConsoleQuery(projectId, {
        days, dimensions, type, filters, rowLimit, startRow, compare: compareParam === 'true',
      });
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException({ code: 'GSC_ERROR', message: err instanceof Error ? err.message : 'Unknown GSC error' }, HttpStatus.BAD_GATEWAY);
    }
  }
```

- [ ] **Step 3: Add the `insights` endpoint**

Add to the controller class:
```ts
  @Get('search-console/insights')
  @UseGuards(ProjectAccessGuard)
  async getSearchConsoleInsights(
    @Query('projectId') projectId: string,
    @Query('days') daysParam?: string,
    @Query('type') typeParam?: string,
    @Query('filters') filtersParam?: string,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const { days, type, filters } = this.parseGscParams(daysParam, typeParam, filtersParam);
    try {
      return await this.googleService.computeGscInsights(projectId, { days, type, filters });
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException({ code: 'GSC_ERROR', message: err instanceof Error ? err.message : 'Unknown GSC error' }, HttpStatus.BAD_GATEWAY);
    }
  }
```

- [ ] **Step 4: Type-check + build, then commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (no new errors).
```bash
git add apps/api/src/google-integrations/google-integrations.controller.ts
git commit -m "feat(gsc): add search-console query and insights endpoints"
```

---

### Task 5: Frontend — i18n keys + `SearchConsolePanel` "Details" link

**Files:**
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`
- Modify: `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte`

**Interfaces:**
- Produces: i18n namespace `gscDetail.*` (consumed by Tasks 6-9); a link/button on the panel routing to `/projects/{projectId}/search-console`.

- [ ] **Step 1: Add i18n keys (all three locales)**

In each `packages/i18n/src/locales/{en,pl,ru}.json`, add a top-level `"gscDetail"` object. EN:
```json
  "gscDetail": {
    "title": "Search Console",
    "subtitle": "Search performance and SEO insights",
    "details": "Details",
    "compare": "Compare to previous period",
    "searchType": "Search type",
    "filters": "Filters",
    "queryContains": "Query contains",
    "country": "Country",
    "device": "Device",
    "brandOnly": "Brand only",
    "nonBrandOnly": "Non-brand only",
    "brandTerm": "Brand term",
    "tabQueries": "Queries",
    "tabPages": "Pages",
    "insights": "Insights",
    "strikingDistance": "Striking distance (positions 11–20)",
    "strikingDistanceDesc": "A small push could move these into the top 10.",
    "lowCtr": "Low CTR for high impressions",
    "lowCtrDesc": "Page-1 queries losing clicks — consider rewriting title/description.",
    "cannibalization": "Cannibalization",
    "cannibalizationDesc": "One query ranking with multiple pages.",
    "movers": "Biggest movers",
    "gainers": "Gainers",
    "losers": "Losers",
    "missedClicks": "Missed clicks",
    "noData": "No data for the selected filters.",
    "loadError": "Failed to load Search Console data."
  },
```
RU (same keys): title "Search Console", subtitle "Эффективность поиска и SEO-инсайты", details "Подробнее", compare "Сравнить с прошлым периодом", searchType "Тип поиска", filters "Фильтры", queryContains "Запрос содержит", country "Страна", device "Устройство", brandOnly "Только бренд", nonBrandOnly "Без бренда", brandTerm "Брендовый термин", tabQueries "Запросы", tabPages "Страницы", insights "Инсайты", strikingDistance "Близко к топу (позиции 11–20)", strikingDistanceDesc "Немного усилий — и попадут в топ-10.", lowCtr "Низкий CTR при высоких показах", lowCtrDesc "Запросы с 1-й страницы теряют клики — перепишите title/description.", cannibalization "Каннибализация", cannibalizationDesc "По одному запросу ранжируются несколько страниц.", movers "Главные движения", gainers "Выросли", losers "Упали", missedClicks "Недополученные клики", noData "Нет данных под выбранные фильтры.", loadError "Не удалось загрузить данные Search Console."
PL (same keys): title "Search Console", subtitle "Wydajność wyszukiwania i analizy SEO", details "Szczegóły", compare "Porównaj z poprzednim okresem", searchType "Typ wyszukiwania", filters "Filtry", queryContains "Zapytanie zawiera", country "Kraj", device "Urządzenie", brandOnly "Tylko marka", nonBrandOnly "Bez marki", brandTerm "Termin marki", tabQueries "Zapytania", tabPages "Strony", insights "Analizy", strikingDistance "Blisko czołówki (pozycje 11–20)", strikingDistanceDesc "Niewielki wysiłek wprowadzi je do top 10.", lowCtr "Niski CTR przy wysokich wyświetleniach", lowCtrDesc "Zapytania ze strony 1 tracą kliknięcia — popraw tytuł/opis.", cannibalization "Kanibalizacja", cannibalizationDesc "Jedno zapytanie z wieloma stronami.", movers "Największe zmiany", gainers "Wzrosty", losers "Spadki", missedClicks "Utracone kliknięcia", noData "Brak danych dla wybranych filtrów.", loadError "Nie udało się wczytać danych Search Console."

- [ ] **Step 2: Validate JSON**

Run: `cd "D:/Work/micode/marketing-ai-assistant" && node -e "for (const l of ['en','pl','ru']) { const a=require('./packages/i18n/src/locales/'+l+'.json'); if(!a.gscDetail || !a.gscDetail.title) throw new Error('missing gscDetail in '+l); } console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Add the "Details" link to the panel**

In `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte`, in the data-loaded header area (where the title / period selector render), add a link to the detail page. The panel already imports `projectId` as a prop. Add near the panel's top-right controls:
```svelte
<a href={`/projects/${projectId}/search-console`}
   class="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline cursor-pointer">
  {$_('gscDetail.details')} →
</a>
```
Place it so it only shows when connected (`isConnected`), alongside the existing period buttons. Do not change any existing panel behavior.

- [ ] **Step 4: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors referencing SearchConsolePanel).
```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json "apps/web/src/lib/components/analytics/SearchConsolePanel.svelte"
git commit -m "feat(gsc): i18n for detail page + Details link from panel"
```

---

### Task 6: Frontend — page shell + overview (route, data load, deltas chart)

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`
- Create: `apps/web/src/lib/components/seo/GscOverview.svelte`

**Interfaces:**
- Consumes: `GET /google/search-console/query` (returns `{ rows: MergedRow[] }`), `GET /google/search-console/insights` (returns `GscInsightsResult`), i18n `gscDetail.*`.
- Produces: page at `/projects/[id]/search-console`. `GscOverview` props: `totals: MergedRow | null` (the no-dimension row), `byDate: MergedRow[]`, `compare: boolean`.

- [ ] **Step 1: Build the page shell with state + data loading**

Create `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`. It owns filter state and fetches data. Mirror `SearchConsolePanel.svelte` for the not-connected / loading / error states and for the guarded `projectId` watcher pattern used across project pages (`mounted`/`prevProjectId`). Script essentials:
```ts
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import GscOverview from '$lib/components/seo/GscOverview.svelte';
  // (GscFilters, GscPerformanceTable, GscInsights imported in later tasks)

  $: projectId = $page.params['id'];

  let days = 28;
  let compare = true;
  let searchType: 'web' | 'image' | 'video' | 'news' | 'discover' = 'web';
  let filters: Array<{ dimension: string; operator: string; expression: string }> = [];

  let loading = true;
  let error: string | null = null;
  let notConnected = false;
  let totalsRow: any = null;
  let byDate: any[] = [];

  function filtersParam() { return filters.length ? JSON.stringify(filters) : undefined; }

  async function loadOverview() {
    loading = true; error = null; notConnected = false;
    try {
      const [totals, dated] = await Promise.all([
        api.get<{ rows: any[] }>('/google/search-console/query', { projectId, days, dimensions: '', type: searchType, compare: String(compare), filters: filtersParam() }),
        api.get<{ rows: any[] }>('/google/search-console/query', { projectId, days, dimensions: 'date', type: searchType, rowLimit: days + 5, filters: filtersParam() }),
      ]);
      totalsRow = totals.rows[0] ?? null;
      byDate = dated.rows;
    } catch (e: any) {
      if (e?.body?.code === 'GSC_NOT_CONFIGURED' || e?.message?.includes('GSC_NOT_CONFIGURED')) notConnected = true;
      else error = $_('gscDetail.loadError');
    } finally {
      loading = false;
    }
  }

  let mounted = false;
  let prevProjectId: string | undefined = '';
  $: if (mounted && projectId && projectId !== prevProjectId) { prevProjectId = projectId; reload(); }
  async function reload() { await loadOverview(); /* tables + insights reload added in later tasks */ }

  onMount(async () => { await loadOverview(); prevProjectId = projectId; mounted = true; });
```
Markup: a header (`gscDetail.title` / `subtitle`), the not-connected prompt (reuse the panel's connect markup/links), an error state, a loading skeleton, and `<GscOverview totals={totalsRow} {byDate} {compare} />`. (Filters bar, tables, insights are slotted in by later tasks.)

- [ ] **Step 2: Build `GscOverview`**

Create `apps/web/src/lib/components/seo/GscOverview.svelte`. Props: `export let totals; export let byDate; export let compare;`. Render four metric cards (clicks, impressions, CTR, position) using the existing card style from `SearchConsolePanel`. When `compare` and `totals` has `prev*` fields, show a delta badge per metric: `delta = totals.clicks - totals.prevClicks` etc.; for position, lower is better (invert the up/down color). Render a Chart.js line chart of `byDate` clicks+impressions (dynamic `import('chart.js/auto')` in `onMount`, mirror `SearchConsolePanel.renderCharts`). Use `$_('analytics.visitors')`-style existing keys where possible; otherwise plain labels.

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors in the new files).
```bash
git add "apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte" apps/web/src/lib/components/seo/GscOverview.svelte
git commit -m "feat(gsc): search-console detail page shell + overview with period deltas"
```

---

### Task 7: Frontend — Queries/Pages tables with sort, pagination, drill-down

**Files:**
- Create: `apps/web/src/lib/components/seo/GscPerformanceTable.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`

**Interfaces:**
- Consumes: `GET /google/search-console/query`.
- Produces: `GscPerformanceTable` props: `export let projectId: string; export let dimension: 'query' | 'page'; export let days: number; export let searchType: string; export let compare: boolean; export let filters: any[];`. Internally fetches its own rows; supports client-side sort, pagination via `startRow`, and a drill-down row expansion that queries the opposite dimension filtered by the clicked key.

- [ ] **Step 1: Build `GscPerformanceTable`**

Create `apps/web/src/lib/components/seo/GscPerformanceTable.svelte`:
- On mount and when any prop changes, fetch `/google/search-console/query` with `dimensions=dimension`, `rowLimit=25`, `startRow=(page*25)`, `compare`, `type`, `filters`.
- Columns: the dimension value, clicks, impressions, CTR, position. When `compare`, show delta vs `prev*` per numeric column (position: lower=better).
- Sort: client-side by clicking a column header (toggle asc/desc) over the loaded page of rows.
- Pagination: Prev/Next buttons adjusting `startRow`; disable Next when fewer than `rowLimit` rows returned.
- Drill-down: clicking a row toggles an expanded sub-section that fetches the opposite dimension (`query`→`page`, `page`→`query`) with an added filter `{ dimension, operator: 'equals', expression: rowKey }` plus the current filters; renders a compact sub-table (top 10 by clicks).
- Reuse the table markup/empty-state from `SearchConsolePanel`'s top-queries/top-pages tables.

- [ ] **Step 2: Slot the tables into the page**

In `+page.svelte`, add a tab switch (`gscDetail.tabQueries` / `gscDetail.tabPages`) and render `<GscPerformanceTable {projectId} dimension={activeTableDim} {days} {searchType} {compare} {filters} />` for the active dimension. Add `let activeTableDim: 'query' | 'page' = 'query';`.

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors in the new/changed files).
```bash
git add apps/web/src/lib/components/seo/GscPerformanceTable.svelte "apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte"
git commit -m "feat(gsc): queries/pages tables with sort, pagination, drill-down"
```

---

### Task 8: Frontend — filters bar (period, compare, search type, filters)

**Files:**
- Create: `apps/web/src/lib/components/seo/GscFilters.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`

**Interfaces:**
- Produces: `GscFilters` with two-way bound props `export let days; export let compare; export let searchType; export let filters; export let brandTerm;` and an `on:apply` event (or bind + a reactive `reload()` in the page). The brand toggle maps to a `query` `contains`/`notContains` filter using `brandTerm` (defaults to the project name, lowercased — pass it in from the page after loading the project, or default to '').

- [ ] **Step 1: Build `GscFilters`**

Create `apps/web/src/lib/components/seo/GscFilters.svelte`:
- Period selector (7 / 28 / 90) → `days`.
- Compare toggle → `compare` (`gscDetail.compare`).
- Search-type select (`web/image/video/news/discover`) → `searchType` (`gscDetail.searchType`).
- Filter inputs: query contains (text), country (text, ISO-3 like `usa`), device (select: ALL/DESKTOP/MOBILE/TABLET), brand mode (none / brand-only / non-brand) with a brand-term text input. On "Apply", build the `filters` array:
  - query contains → `{ dimension:'query', operator:'contains', expression }`
  - country → `{ dimension:'country', operator:'equals', expression }`
  - device → `{ dimension:'device', operator:'equals', expression }` (skip when ALL)
  - brand-only → `{ dimension:'query', operator:'contains', expression: brandTerm }`; non-brand → `notContains`.
- Emit the new filter state (dispatch `apply`) so the page calls `reload()`.

- [ ] **Step 2: Wire into the page**

In `+page.svelte`, render `<GscFilters bind:days bind:compare bind:searchType bind:filters bind:brandTerm on:apply={reload} />` at the top. Load the project once on mount (`api.get('/projects/'+projectId)`) to default `brandTerm` to `project.name?.toLowerCase() ?? ''`. Ensure `reload()` now also refreshes tables (they react to prop changes) and insights (Task 9).

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors in new/changed files).
```bash
git add apps/web/src/lib/components/seo/GscFilters.svelte "apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte"
git commit -m "feat(gsc): filters bar (period, compare, search type, query/country/device/brand)"
```

---

### Task 9: Frontend — insights section

**Files:**
- Create: `apps/web/src/lib/components/seo/GscInsights.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`

**Interfaces:**
- Consumes: `GET /google/search-console/insights` → `GscInsightsResult` (`strikingDistance`, `lowCtr`, `cannibalization`, `moversQueries`, `moversPages`).
- Produces: `GscInsights` props `export let projectId; export let days; export let searchType; export let filters;` — fetches its own data and renders four sections.

- [ ] **Step 1: Build `GscInsights`**

Create `apps/web/src/lib/components/seo/GscInsights.svelte`:
- On mount and prop change, fetch `/google/search-console/insights` with `projectId, days, type, filters`.
- Render four sections, each with title + description from `gscDetail.*` and an empty state (`gscDetail.noData`):
  - **Striking distance** — list `strikingDistance` (query, position, impressions).
  - **Low CTR** — list `lowCtr` (query, position, ctr, `missedClicks` labeled `gscDetail.missedClicks`).
  - **Cannibalization** — list `cannibalization` (query, then its competing `pages`).
  - **Movers** — two columns: `gainers` and `losers` from `moversQueries` (show `deltaClicks` and `deltaPosition`; position delta negative = improved, color green). Optionally a pages toggle using `moversPages`.
- Reuse table/list styling from `SearchConsolePanel`.

- [ ] **Step 2: Slot into the page + ensure reload covers it**

In `+page.svelte`, render `<GscInsights {projectId} {days} {searchType} {filters} />` under the tables in an "Insights" section. Since it reacts to its own props, `reload()` (driven by filter changes) updates it via prop changes — verify by confirming the props are passed reactively.

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/web && npx svelte-check --threshold error` (no new errors in new/changed files).
```bash
git add apps/web/src/lib/components/seo/GscInsights.svelte "apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte"
git commit -m "feat(gsc): SEO insights section (striking-distance, low-ctr, cannibalization, movers)"
```

- [ ] **Step 4: Live verification (post-deploy)**

After the branch is on `development` and deployed, verify on a GSC-connected project with the Playwright harness (login client-side, then open `/projects/<id>/search-console` via the panel's "Details"): filters/search-type change the data; tables sort/paginate/drill-down; the four insight sections render. (Pre-deploy this is deferred.)

---

## Self-Review

**Spec coverage:**
- Placement (dedicated route from panel) → Tasks 5 (link) + 6 (route). ✓
- Extend `fetchSearchConsoleData` (type/filters/startRow) → Task 1. ✓
- `/query` (with comparison) + `/insights` endpoints → Tasks 3 (service) + 4 (controller). ✓
- 1h cache reuse — `fetchSearchConsoleData` already uncached per-call; the spec's cache requirement applies to summary. NOTE: the new `/query` and `/insights` are NOT cached in this plan (each call is live). This is a deliberate simplification (filters/pagination explode cache keys); documented here. If caching is desired it is a follow-up. ✓ (flagged)
- Four insights with concrete thresholds → Task 2 (constants + pure fns), Task 9 (UI). ✓
- Full sortable/paginated tables + drill-down → Task 7. ✓
- Filters (query/country/device/brand) + search types → Task 8. ✓
- Period comparison + overview deltas → Tasks 3/6. ✓
- Components split (GscFilters/Overview/PerformanceTable/Insights) → Tasks 6-9. ✓
- i18n en/pl/ru → Task 5. ✓
- Backend unit tests (insight fns + param→body mapping) → Tasks 1-2. ✓
- Frontend svelte-check + Playwright → Tasks 6-9. ✓
- No schema changes; GSC_NOT_CONFIGURED handling; ProjectAccessGuard → Tasks 3-4. ✓

**Deviation flagged for the human:** the spec says "reuse the existing 1h cache; extend the cache key" for the new endpoints. This plan does NOT cache `/query` and `/insights` (live each call) to avoid unbounded cache-key growth from filter/pagination combinations. Confirm whether to (a) ship live (simpler, current plan) or (b) add a bounded LRU cache as an extra backend task.

**Placeholder scan:** Backend steps contain complete code. Frontend component steps specify exact files, props/events, API calls, and the non-obvious logic (deltas, drill-down filter construction, brand-term mapping), with markup directed to mirror the existing `SearchConsolePanel` patterns rather than inventing new visual design — appropriate for UI tasks executed by subagents.

**Type consistency:** `MergedRow`, `InsightRow`, `LowCtrRow`, `CannibalRow`, `MoverRow`, `GscInsightsResult`, `GscQueryParams`, `GscFilter`, `GscQueryOptions`, `buildSearchAnalyticsBody`, `fetchSearchConsoleQuery`, `computeGscInsights` names are consistent across Tasks 1-4 and consumed by 6-9.
