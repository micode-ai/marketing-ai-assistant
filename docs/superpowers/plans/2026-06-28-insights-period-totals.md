# Instagram / Threads Period-Total Headline Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the analytics headline KPIs (Total Views / Total Reach / engagement) from a single `metric_type=total_value` insights call over the selected period so they match the Instagram/Threads app, falling back to the daily sum when a metric's period-total is unavailable.

**Architecture:** Add a period-total fetch to each graph util; `getMetrics` returns an additive `periodTotals`; the dashboards prefer `periodTotals` via a tiny `pickTotal` helper and keep the daily-sum fallback. Trend charts unchanged.

**Tech Stack:** NestJS 10 + Prisma (api), SvelteKit 2 (web), Jest (api), Vitest (web), Instagram/Threads Graph API.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-28-insights-period-totals-design.md`.
- Period-total fetch uses `metric_type=total_value` with `period=day` + `since`/`until` over the selected `days`; per-metric tolerant (Meta caps some metrics' window — notably `reach` ~30 days — so a 90-day request may omit `reach`; never fail the whole call for one metric). Auth errors propagate (REAUTH).
- `getMetrics` return is **additive**: `{ account, topPosts, worstPosts, periodTotals }`. On any failure of the totals call → `periodTotals: {}` (never throw from this addition; wrap in try/catch + log).
- `periodTotals` shape — IG: `{ reach?, views?, accountsEngaged?, totalInteractions? }`; Threads: `{ views?, likes?, replies?, reposts?, quotes? }`.
- Dashboard headline KPIs use `pickTotal(periodTotals?.X, dailySum)`: return the period-total when it is a finite number, else the daily sum. `currentFollowers` unchanged (latest day's `followersCount`).
- Build/test/lint gates: `corepack pnpm --filter api build` + `test -- src/instagram src/threads` + `lint`; `corepack pnpm --filter web build` + `lint` + `exec vitest run <pickTotal test>`. Avoid DOM-only types (`RequestInit`) in specs; `no-explicit-any` is a warning. `NODE_OPTIONS=--max-old-space-size=4096`; pnpm only via `corepack`.
- GitHub artifacts English. Branch `fix/insights-period-totals` (already off `origin/development`).
- Mirror references (read fully): `apps/api/src/instagram/instagram-graph.util.ts` (`fetchInsightsWithTolerance`, `fetchAccountInsights`, `ACCOUNT_METRIC_KEYS`, `readInsightValue`, auth-error throw), `instagram.service.ts` `getMetrics` (returns `{ account, topPosts, worstPosts }`; account decrypt pattern in the sync), the equivalents under `apps/api/src/threads/`, and `InstagramAnalyticsDashboard.svelte` (`$: totalReach/totalViews = reduce(...)`, the `Metrics` interface).

---

### Task 1: `pickTotal` pure helper + test

**Files:**
- Create: `apps/web/src/lib/components/analytics/pick-total.ts`
- Create: `apps/web/src/lib/components/analytics/pick-total.test.ts`

**Interfaces:**
- Produces: `export function pickTotal(periodTotal: number | null | undefined, dailySum: number): number` — returns `periodTotal` when it is a finite number, else `dailySum`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test** (`pick-total.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { pickTotal } from './pick-total';

describe('pickTotal', () => {
  it('prefers a finite period total over the daily sum', () => {
    expect(pickTotal(900, 61)).toBe(900);
    expect(pickTotal(0, 61)).toBe(0);          // a real zero total is still preferred
  });
  it('falls back to the daily sum when the period total is missing', () => {
    expect(pickTotal(undefined, 61)).toBe(61);
    expect(pickTotal(null, 61)).toBe(61);
    expect(pickTotal(NaN, 61)).toBe(61);
  });
});
```

- [ ] **Step 2: Run, verify fail:** `cd apps/web && corepack pnpm exec vitest run src/lib/components/analytics/pick-total` → FAIL (module not found).
- [ ] **Step 3: Implement `pick-total.ts`:**

```ts
/** Prefer a period total_value when present and finite; else the summed daily rows. */
export function pickTotal(periodTotal: number | null | undefined, dailySum: number): number {
  return typeof periodTotal === 'number' && Number.isFinite(periodTotal) ? periodTotal : dailySum;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit:** `feat(web): pickTotal helper for period-total headline metrics`

### Task 2: Instagram backend — period-total fetch + getMetrics

**Files:**
- Modify: `apps/api/src/instagram/instagram-graph.util.ts`
- Modify: `apps/api/src/instagram/instagram.service.ts`
- Modify: `apps/api/src/instagram/instagram-graph.util.spec.ts`
- Modify: `apps/api/src/instagram/instagram.service.spec.ts`

**Interfaces:**
- Produces: `fetchAccountInsightsTotals(igUserId: string, token: string, sinceUnix: number, untilUnix: number): Promise<{ reach?: number; views?: number; accountsEngaged?: number; totalInteractions?: number }>`; `getMetrics` now returns `{ account, topPosts, worstPosts, periodTotals }`. Consumed by Task 4 (`metrics.periodTotals`).

- [ ] **Step 1: Read** `instagram-graph.util.ts` (`fetchInsightsWithTolerance`, `readInsightValue`, `ACCOUNT_METRIC_KEYS`, the auth-error throw) and `instagram.service.ts` `getMetrics` + how the sync decrypts the token/igUserId.
- [ ] **Step 2: Write the failing test** (`instagram-graph.util.spec.ts`) for `fetchAccountInsightsTotals`, mocking `global.fetch`:

```ts
import { fetchAccountInsightsTotals } from './instagram-graph.util';

describe('fetchAccountInsightsTotals', () => {
  it('reads metric_type=total_value over the range into per-metric totals', async () => {
    global.fetch = (jest.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ data: [
        { name: 'views', total_value: { value: 5000 } },
        { name: 'reach', total_value: { value: 800 } },
      ] }),
    })) as unknown as typeof fetch);
    const t = await fetchAccountInsightsTotals('ig1', 'tok', 1, 2);
    expect(t.views).toBe(5000);
    expect(t.reach).toBe(800);
  });
});
```

- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement `fetchAccountInsightsTotals`** in `instagram-graph.util.ts`: build params `metric=reach,views,accounts_engaged,total_interactions`, `period=day`, `metric_type=total_value`, `since`, `until`, `access_token`; GET `${GRAPH}/${igUserId}/insights?...`. Reuse the per-metric tolerant approach (try the batch; on failure retry each metric individually keeping successes; auth → throw the existing auth error). Map `data[].name` → field via `ACCOUNT_METRIC_KEYS`, reading `total_value.value` (via `readInsightValue` or `row.total_value?.value`). Return the object (omit metrics with no value).
- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Wire into `getMetrics`** in `instagram.service.ts`: after computing `account`/`topPosts`/`worstPosts`, compute `periodTotals`:

```ts
let periodTotals: { reach?: number; views?: number; accountsEngaged?: number; totalInteractions?: number } = {};
try {
  const tokens = /* decrypt account.encryptedTokens like the sync does */;
  if (tokens?.accessToken && tokens?.igUserId) {
    const until = Math.floor(startOfUtcDay(new Date()).getTime() / 1000);
    const since = until - days * 86400;
    periodTotals = await fetchAccountInsightsTotals(tokens.igUserId, tokens.accessToken, since, until);
  }
} catch (e) {
  this.logger.warn(`IG periodTotals failed for project ${projectId}: ${e}`);
  periodTotals = {};
}
return { account: account.map(...), topPosts, worstPosts, periodTotals };
```
  (Use the service's existing account resolution + decrypt helper; `startOfUtcDay` = the same date-truncation the sync uses. Do NOT let a totals failure break `getMetrics`.)
- [ ] **Step 7: Test** (`instagram.service.spec.ts`): mock `fetchAccountInsightsTotals` → `getMetrics` includes `periodTotals` in the return; a thrown totals call → `periodTotals: {}` and the rest of the payload still returned.
- [ ] **Step 8: Verify:** `cd apps/api && corepack pnpm build` + `test -- src/instagram` + `lint` (0 errors).
- [ ] **Step 9: Commit:** `feat(instagram): period-total (metric_type=total_value) in getMetrics`

### Task 3: Threads backend — period-total fetch + getMetrics (mirror)

**Files:**
- Modify: `apps/api/src/threads/threads-graph.util.ts`
- Modify: `apps/api/src/threads/threads.service.ts`
- Modify: `apps/api/src/threads/threads-graph.util.spec.ts`
- Modify: `apps/api/src/threads/threads.service.spec.ts`

**Interfaces:**
- Produces: `fetchThreadsAccountInsightsTotals(threadsUserId, token, sinceUnix, untilUnix): Promise<{ views?, likes?, replies?, reposts?, quotes? }>`; Threads `getMetrics` returns `{ account, topPosts, worstPosts, periodTotals }`.

- [ ] **Step 1: Read** the Threads graph util + `getMetrics` (mirror of IG) and the just-written IG implementation in this branch.
- [ ] **Step 2: Write the failing test** (`threads-graph.util.spec.ts`) for `fetchThreadsAccountInsightsTotals` — same structure as Task 2 Step 2 but endpoint `threads_insights`, metrics `views,likes,replies,reposts,quotes`, asserting `total_value` mapping + per-metric tolerance.
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement `fetchThreadsAccountInsightsTotals`**: `GET ${GRAPH}/${threadsUserId}/threads_insights?metric=views,likes,replies,reposts,quotes&period=day&metric_type=total_value&since=<s>&until=<u>&access_token=<token>`, per-metric tolerant, map `total_value.value`.
- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Wire into Threads `getMetrics`** (mirror Task 2 Step 6) → `periodTotals: { views?, likes?, replies?, reposts?, quotes? }`; try/catch → `{}`; use `tokens.threadsUserId`.
- [ ] **Step 7: Test** (`threads.service.spec.ts`): `getMetrics` includes `periodTotals`; thrown totals → `{}` + rest returned.
- [ ] **Step 8: Verify:** `cd apps/api && corepack pnpm build` + `test -- src/threads` + `lint`.
- [ ] **Step 9: Commit:** `feat(threads): period-total (metric_type=total_value) in getMetrics`

### Task 4: Dashboards — prefer periodTotals for headline KPIs

**Files:**
- Modify: `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte`
- Modify: `apps/web/src/lib/components/analytics/ThreadsAnalyticsDashboard.svelte`

**Interfaces:**
- Consumes: `pickTotal` (Task 1); `metrics.periodTotals` (Tasks 2/3).

- [ ] **Step 1 (Instagram):** add `periodTotals?: { reach?: number; views?: number; accountsEngaged?: number; totalInteractions?: number }` to the `Metrics` interface. Import `pickTotal` from `./pick-total`. Change the headline reactives:

```svelte
$: totalReach = pickTotal(metrics.periodTotals?.reach, metrics.account.reduce((s, d) => s + (d.reach ?? 0), 0));
$: totalViews = pickTotal(metrics.periodTotals?.views, metrics.account.reduce((s, d) => s + (d.views ?? 0), 0));
```
  Apply the same `pickTotal(periodTotals?.X, sum)` to any other headline total the dashboard shows (e.g. engagement/interactions). Leave `currentFollowers` and the trend chart unchanged.
- [ ] **Step 2 (Threads):** add `periodTotals?: { views?; likes?; replies?; reposts?; quotes? }` to the Threads `Metrics` interface, import `pickTotal`, and switch its headline KPIs (views + engagement totals) to `pickTotal(metrics.periodTotals?.X, sum(daily))`.
- [ ] **Step 3: Verify:** `cd apps/web && corepack pnpm build` + `lint` pass; in `pnpm dev`, IG analytics "Total Views" now uses the period total (no longer the 2-day sum) when the backend provides it.
- [ ] **Step 4: Commit:** `feat(web): headline IG/Threads KPIs use period totals via pickTotal`

---

## Finalization

- [ ] **Full build/test/lint:** `corepack pnpm --filter api build && corepack pnpm --filter api test -- src/instagram src/threads && corepack pnpm --filter api lint && corepack pnpm --filter web build && corepack pnpm --filter web lint && corepack pnpm --filter web exec vitest run src/lib/components/analytics/pick-total`.
- [ ] **Manual (after deploy):** IG analytics "Total Views (90d)" reflects the `total_value` (matches the IG app, not 61); "Total Reach" is the deduplicated total (≤ 829) — and if Meta caps `reach` total_value at 30d, confirm the 90d view falls back to the daily sum and **log the observed cap**. Trend chart still renders.
- [ ] **GitHub issue + PR** (English) → `development`; PR links spec + plan; note the observed reach window cap.

## Self-Review notes (coverage vs spec)

- Spec §1 totals fetch → Tasks 2/3 Steps 2-5. §2 getMetrics periodTotals → Tasks 2/3 Step 6. §3 dashboard pickTotal → Tasks 1 + 4. §4 testing → per-task + Finalization. §5 risks: per-metric tolerance (Task 2 Step 4), graceful `{}` (Step 6 try/catch), fallback (Task 1 `pickTotal`).
- Type consistency: `fetchAccountInsightsTotals` (IG) / `fetchThreadsAccountInsightsTotals` (Threads); `periodTotals` shapes match the dashboard interfaces; `pickTotal(periodTotal, dailySum)` signature identical across Tasks 1 & 4; `getMetrics` additive return consistent.
- Deferred per spec non-goals: trend chart, DB storage of totals, currentFollowers, media metrics.
