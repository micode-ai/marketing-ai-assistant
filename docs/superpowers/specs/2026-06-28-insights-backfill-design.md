# Instagram / Threads Insights Backfill — Design

**Date:** 2026-06-28
**Status:** Approved design — ready for implementation planning
**Scope owner:** `apps/api` (instagram + threads modules)

## Goal

Fix the analytics undercount where "Total Views" shows **61** (sum of 2 synced days) while the real Instagram number is much higher. The daily sync stores one row per day and never backfills history, so a freshly-connected account has almost no data. **Backfill up to 90 days** of daily account insights on connect / when history is thin, so the period totals (and trend) reflect real history. Apply the same to Threads (identical pattern).

## Confirmed facts (from prod)

- IG account `micode.development` has exactly **2** `instagram_account_metrics` rows: 2026-06-27 (views 47) + 2026-06-28 (views 14) = **61** — matching the dashboard's `totalViews = sum(daily views)`.
- The account only started syncing correctly on 2026-06-27 (after the language-wipe fix + reconnect).
- **Data retention:** daily rows live in OUR DB permanently (one row per `socialAccountId + date`). The 90-day limit is only how far back we can pull from Meta; once stored, days are never purged on a rolling window. The hourly cron keeps appending new days.

## Approved decisions

| Decision | Choice |
|---|---|
| Backfill window | **90 days** |
| Trigger | **Self-healing**: during a normal sync (cron + page auto-sync), if the account has **< 7 days** of stored metrics, run a one-time 90-day backfill; else the normal daily sync |
| Scope | Instagram **and** Threads (mirror) |
| Surface | Backend-only (no frontend change) |

## Non-goals

- Frontend changes (the dashboard already sums daily rows + shows a trend; backfill just populates the rows).
- Media/post backfill (only account-level metrics: views/reach/accountsEngaged/totalInteractions/followersCount for IG; views/likes/replies/reposts/quotes/followers for Threads).
- New DB models (reuse `instagram_account_metrics` / `threads_account_metrics`).

---

## 1. Graph util — time-series range fetch

The current `fetchAccountInsights` (IG) / `fetchThreadsAccountInsights` use `period=day` + `metric_type=total_value`, which returns a **single** aggregated value. Backfill needs **per-day** values over a date range.

- IG: add `fetchAccountInsightsRange(igUserId, token, sinceUnix, untilUnix): Promise<{ date: string; reach?: number; views?: number; accountsEngaged?: number; totalInteractions?: number }[]>` in `instagram-graph.util.ts`.
  - Request `GET /{igUserId}/insights?metric=<...>&period=day&since=<sinceUnix>&until=<untilUnix>` **without** `metric_type=total_value` (time-series form). Parse `data[].values[]` — each entry is `{ value, end_time }`; map `end_time` (ISO) → a `YYYY-MM-DD` date, accumulate per-metric per-date into rows.
  - Per-metric tolerance (mirror `fetchInsightsWithTolerance`): if one metric 401s → throw `InstagramAuthError` (propagate for REAUTH); if a metric returns an error/empty (unsupported in time-series) → skip it (that field stays `undefined`), do NOT fail the whole range.
- Threads: add `fetchThreadsAccountInsightsRange(threadsUserId, token, sinceUnix, untilUnix)` analogously against `threads_insights` (per-day `values[]`).
- **Meta window cap:** a single insights request spans at most ~30 days. `fetchAccountInsightsRange` splits the 90-day window into **30-day chunks** internally and concatenates the per-day rows.

## 2. Sync service — backfill

- IG `instagram-sync.service.ts`: add `backfillAccount(account, days = 90): Promise<{ daysWritten: number }>`:
  - Decrypt token + igUserId (same as `syncAccount`).
  - `since = startOfDay(now - days)`, `until = startOfDay(now)` (UTC).
  - `rows = await fetchAccountInsightsRange(igUserId, token, sinceUnix, untilUnix)`.
  - Upsert each row into `instagram_account_metrics` by `socialAccountId_date` (idempotent — re-running never duplicates or corrupts already-synced days; only overwrites the same date's values). Fields absent for a given day stay `null`.
  - On auth error → reuse the existing `handleAuthError` (REAUTH_REQUIRED + notify). Other errors → log + return whatever was written (partial success is fine).
- Threads `threads-sync.service.ts`: add `backfillAccount(account, days = 90)` analogously into `threads_account_metrics`.

## 3. Self-healing trigger

- In the normal sync path (the `@Cron` handler AND the manual `triggerSync` used by the page auto-sync), before/instead of the daily `syncAccount`:
  - Count existing `*_account_metrics` rows for the account (`prisma.count` by `socialAccountId`).
  - If `count < BACKFILL_THRESHOLD_DAYS` (7), call `backfillAccount(account, 90)` once, then continue with the normal `syncAccount` (to capture today's media etc. per plan throttle). The idempotent upsert means a later cron tick that still sees < 7 (e.g. a 5-follower account with little history) would re-backfill harmlessly, but in practice a successful 90-day backfill writes ≥ the available days, clearing the threshold.
  - Plan gating: backfill is account-level only (cheap-ish); allow it for all plans that already sync (FREE included, since it's a one-time catch-up) — OR keep it behind the same `status==='ACTIVE'` filter. (Account-only, no media; reuse the existing ACTIVE filter.)
- The user's existing 2-row account will backfill on the next analytics page visit (auto-sync) or the next hourly cron.

## 4. Headline-accuracy guarantee (API risk)

The newer IG/Threads metrics (`views`, `accounts_engaged`, `total_interactions`) may **not** support per-day time-series (Meta exposes some only as `metric_type=total_value`). If `fetchAccountInsightsRange` finds a metric returns no per-day `values[]`:

- The backfill stores per-day values only for metrics that DO support time-series (e.g. `reach`), leaving the others `null` per day — so the trend for those metrics stays sparse.
- **Decision rule (one path, decided by the live API):** implement the per-day backfill first and inspect the live response shape during manual testing.
  - If `views` returns per-day `values[]` → the backfill alone fixes the headline (summing 90 real days ≈ the IG-app figure). Done.
  - If `views` only supports `metric_type=total_value` (no per-day series) → add a read-time period-total: `getMetrics` returns a `periodTotals` object computed from a single `metric_type=total_value` call over the selected `days`, and the dashboard's "Total Views/Reach" KPIs read `periodTotals` instead of summing daily rows (the trend chart still uses the daily rows).
  - **Log which path was taken.** Primary expectation: time-series works in the IG-Login API and the backfill alone suffices.

> Guardrail, not two builds: only the second bullet's read-path is conditional on the live finding; everything else (the per-day backfill) ships regardless.

## 5. Testing & verification

- **Unit (IG + Threads graph util):** `fetchAccountInsightsRange` splits a 90-day window into 30-day chunks (assert request count/params) and maps a sample time-series `data[].values[]` response into per-day rows keyed by `end_time`'s date (mock `fetch`).
- **Unit (sync):** `backfillAccount` upserts one row per returned day with the right `socialAccountId_date` key and field values; idempotent (running twice yields the same rows); auth error → REAUTH path.
- **Unit (trigger):** a sync where `count < 7` calls `backfillAccount`; `count >= 7` does not.
- **Build/test:** `corepack pnpm --filter api build` + `corepack pnpm --filter api test -- src/instagram src/threads`. Run api `lint` too (CI fails on real lint errors).
- **Manual (after deploy):** visit the project analytics → IG/Threads auto-sync triggers backfill → "Total Views (90d)" reflects ~90 days and matches the Instagram app's figure for the same window; verify per-day trend populated (or, per §4, headline corrected if time-series is unavailable). Confirm the existing account's 2 rows expand.

## 6. Risks & mitigations

- **Per-day time-series unsupported for `views`** → §4 guardrail (verify live; period-total read path as fallback). Log the chosen path.
- **Meta 30-day-per-request window** → chunk the 90-day range into 30-day requests.
- **API rate / cost** → backfill is one-time (gated by `< 7 days` history) and account-level only.
- **Idempotency** → upsert by `socialAccountId_date`; re-runs are safe.
- **Auth errors mid-backfill** → reuse `handleAuthError` (REAUTH_REQUIRED + notify); partial data kept.

## 7. File inventory

Modify:
- `apps/api/src/instagram/instagram-graph.util.ts` (+ `fetchAccountInsightsRange`)
- `apps/api/src/instagram/instagram-sync.service.ts` (+ `backfillAccount`, trigger in cron + `triggerSync`)
- `apps/api/src/threads/threads-graph.util.ts` (+ `fetchThreadsAccountInsightsRange`)
- `apps/api/src/threads/threads-sync.service.ts` (+ `backfillAccount`, trigger)
- Specs: add `*.spec.ts` cases for the range fetch + backfill + trigger (extend existing `instagram-sync.service.spec.ts` / `threads-sync.service.spec.ts`).
