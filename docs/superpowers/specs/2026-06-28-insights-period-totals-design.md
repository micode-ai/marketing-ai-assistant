# Instagram / Threads Period-Total Headline Metrics — Design

**Date:** 2026-06-28
**Status:** Approved design — ready for implementation planning
**Scope owner:** `apps/api` (instagram + threads), `apps/web` (analytics dashboards)

## Goal

Make the analytics headline KPIs ("Total Views", "Total Reach", engagement) match the Instagram/Threads app by computing them from a **single `metric_type=total_value` insights call over the selected period**, instead of summing daily rows. Two confirmed problems with daily-summing:

- **Views undercounts** — after the 90-day backfill (PR #118), `reach` backfilled (total 829) but `views` stayed **61** (= 47+14, the only 2 days). Confirmed live: Instagram exposes `views` **only** as `total_value`, with no per-day time-series, so per-day backfill can't populate it.
- **Reach overcounts** — `reach` is a **deduplicated** metric (unique people). Summing daily reach double-counts people who visited on multiple days, so 829 is inflated; the real period reach is a single `total_value` (what the IG app shows).

## Approach

Add a period-total call (`metric_type=total_value` over the selected `days`) to the backend; the dashboard prefers it for headline KPIs and falls back to the daily sum when a metric's period-total is unavailable. The trend chart keeps using daily rows (unchanged). Mirror for Threads.

## Non-goals

- Changing the trend chart (it stays daily; `reach` daily series is now backfilled).
- Storing period totals in the DB (computed live per metrics fetch).
- Changing `currentFollowers` (still the latest day's `followersCount`).
- Media/post metrics (unchanged).

---

## 1. Graph util — period-total fetch

The existing `fetchAccountInsights` uses `metric_type=total_value` with `period=day` (today only). Add a range variant:

- IG `instagram-graph.util.ts`: `fetchAccountInsightsTotals(igUserId, token, sinceUnix, untilUnix): Promise<{ reach?: number; views?: number; accountsEngaged?: number; totalInteractions?: number }>`.
  - `GET ${GRAPH}/${igUserId}/insights?metric=reach,views,accounts_engaged,total_interactions&period=day&metric_type=total_value&since=<s>&until=<u>&access_token=<token>` → parse each `data[].total_value.value` into the matching field via `ACCOUNT_METRIC_KEYS`.
  - **Per-metric tolerance (reuse the existing `fetchInsightsWithTolerance` pattern):** if the whole batch fails (e.g. one metric exceeds Meta's max window for a 90-day range — `reach` total_value is capped at ~30 days), retry each metric individually and keep those that succeed; a metric that still fails is omitted (field `undefined`). Auth errors (401/code-190/OAuthException) throw the existing auth error (propagate REAUTH).
- Threads `threads-graph.util.ts`: `fetchThreadsAccountInsightsTotals(threadsUserId, token, sinceUnix, untilUnix)` analogous against `threads_insights`, metrics `views,likes,replies,reposts,quotes`, `metric_type=total_value`.

> Note: Meta caps some metrics' `total_value` window (notably `reach` ~30 days). The per-metric tolerance means a 90-day request returns `views` (no cap) but may omit `reach` for 90d → the dashboard then falls back to the daily-sum for reach at 90d (imperfect but no worse than today; at 7/28d reach total_value works and is exact). Document the observed caps during implementation via the live check.

## 2. api — `periodTotals` in getMetrics

- `instagram.service.ts` `getMetrics(projectId, days)`: after building `account`/`topPosts`/`worstPosts`, resolve the account token + igUserId (same decrypt as the sync) and call `fetchAccountInsightsTotals(igUserId, token, since, until)` where `until = startOfDay(now)`, `since = until - days*86400`. Add `periodTotals: { reach?, views?, accountsEngaged?, totalInteractions? }` to the return. On any failure (auth/other) → `periodTotals: {}` (the dashboard falls back to daily sums); never throw from this addition (wrap in try/catch, log).
- `threads.service.ts` `getMetrics`: add `periodTotals: { views?, likes?, replies?, reposts?, quotes? }` analogously.
- Return shape becomes `{ account, topPosts, worstPosts, periodTotals }` (additive — existing consumers unaffected).

## 3. web — prefer period-total for headline KPIs

- `InstagramAnalyticsDashboard.svelte`: change the headline reactive totals to prefer `periodTotals`:
  - `$: totalReach = metrics.periodTotals?.reach ?? metrics.account.reduce((s,d) => s + (d.reach ?? 0), 0);`
  - `$: totalViews = metrics.periodTotals?.views ?? metrics.account.reduce((s,d) => s + (d.views ?? 0), 0);`
  - (and any other headline totals that exist, e.g. engagement, using the same `periodTotals.X ?? sum` pattern).
  - `currentFollowers` unchanged.
- Extract the tiny preference into a pure helper `pickTotal(periodTotal: number | null | undefined, dailySum: number): number` (returns `periodTotal` when it is a finite number, else `dailySum`) in a `*-dashboard-state.ts`-style file, and unit-test it. Use it for each headline KPI.
- `ThreadsAnalyticsDashboard.svelte`: same pattern for its headline KPIs (views + the engagement totals it shows), preferring `periodTotals`.
- The `Metrics` TS interfaces in both dashboards gain an optional `periodTotals?` field.

## 4. Testing & verification

- **Unit (graph util):** `fetchAccountInsightsTotals` requests `metric_type=total_value` over the range and maps `data[].total_value.value` to fields; a per-metric failure (mock one metric erroring) is tolerated and that field omitted (mock `fetch`). Same for Threads.
- **Unit (web):** `pickTotal(periodTotal, dailySum)` returns the period-total when finite, the daily sum when `null`/`undefined`/`NaN`.
- **Build/test/lint:** `corepack pnpm --filter api build`, `corepack pnpm --filter api test -- src/instagram src/threads`, `corepack pnpm --filter api lint`, `corepack pnpm --filter web build`, `corepack pnpm --filter web lint`, `corepack pnpm --filter web exec vitest run <pickTotal test>`.
- **Manual (after deploy):** IG analytics "Total Views (90d)" now shows the period total_value (matches the IG app, no longer 61); "Total Reach (90d)" is the deduplicated total (≤ 829) or, if Meta caps reach at 30d, the 30d total / daily-sum fallback — verify which and log it. Trend chart still renders daily reach/views.

## 5. Risks & mitigations

- **Meta `total_value` window caps** (reach ~30d) → per-metric tolerance + dashboard daily-sum fallback for the capped metric/window; log observed caps.
- **Extra API call per metrics fetch** → one additional insights request; acceptable. (Could be cached later; out of scope.)
- **Auth error in the totals call** → caught, `periodTotals: {}`, dashboard falls back; REAUTH is already handled by the sync path.
- **Backward compat** → `periodTotals` is additive; absent → dashboard behaves as today (daily sum).

## 6. File inventory

Modify:
- `apps/api/src/instagram/instagram-graph.util.ts` (+ `fetchAccountInsightsTotals`)
- `apps/api/src/instagram/instagram.service.ts` (`getMetrics` → `periodTotals`)
- `apps/api/src/threads/threads-graph.util.ts` (+ `fetchThreadsAccountInsightsTotals`)
- `apps/api/src/threads/threads.service.ts` (`getMetrics` → `periodTotals`)
- `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte` (+ `Metrics.periodTotals`, headline KPIs via `pickTotal`)
- `apps/web/src/lib/components/analytics/ThreadsAnalyticsDashboard.svelte` (same)

Create:
- `apps/web/src/lib/components/analytics/pick-total.ts` + `.test.ts` (pure helper)
- graph-util spec cases for the totals fetch (extend existing `*-graph.util.spec.ts`)
