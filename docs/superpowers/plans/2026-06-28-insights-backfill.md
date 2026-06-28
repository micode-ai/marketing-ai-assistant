# Instagram / Threads Insights Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill up to 90 days of daily account insights for Instagram and Threads so analytics period-totals reflect real history instead of only the days synced since connect.

**Architecture:** Add a time-series range fetch to each graph util (per-day values over a date range, 30-day-chunked) and a `backfillAccount` to each sync service that idempotently upserts one row per day; a self-healing trigger runs the backfill once when an account has fewer than 7 days of stored metrics.

**Tech Stack:** NestJS 10 + Prisma (api), Jest, Instagram/Threads Graph API.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-28-insights-backfill-design.md`.
- Backfill window **90 days**; chunk each insights request into **≤ 30-day** spans (Meta per-request cap).
- Trigger threshold: backfill once when `count(*_account_metrics for account) < 7` (`BACKFILL_THRESHOLD_DAYS = 7`).
- Idempotent: upsert by `socialAccountId_date`; re-running never duplicates/corrupts already-synced days. Missing metrics for a day stay `null`.
- Time-series fetch uses `period=day` WITHOUT `metric_type=total_value`, parses `data[].values[]` (`{ value, end_time }`) → map each `end_time` ISO to a `YYYY-MM-DD` date. Per-metric tolerant: auth error (401/code-190/OAuthException) → throw the existing auth error to propagate REAUTH; a metric with no/empty series → skip it (field `undefined`), do not fail the range.
- Auth errors during backfill reuse the existing `handleAuthError` (REAUTH_REQUIRED + CronFailureNotifier). Partial success is kept.
- Backend-only; no frontend change. No new Prisma models (`instagram_account_metrics` / `threads_account_metrics`).
- Build/test gates: `corepack pnpm --filter api build`, `corepack pnpm --filter api test -- src/instagram src/threads`, AND `corepack pnpm --filter api lint` (CI fails on real lint errors — avoid DOM-only types like `RequestInit` in specs; `no-explicit-any` is a warning). `NODE_OPTIONS=--max-old-space-size=4096`; pnpm only via `corepack`.
- GitHub artifacts English. Branch `feat/insights-backfill` (already off `origin/development`).
- Mirror references (read fully): `apps/api/src/instagram/{instagram-graph.util,instagram-sync.service}.ts` + their `.spec.ts`; `apps/api/src/threads/{threads-graph.util,threads-sync.service}.ts` + specs. Note the existing `fetchInsightsWithTolerance` (reads a single value via `readInsightValue`) — the range fetch needs a DIFFERENT parser that reads ALL `values[]` entries.

---

### Task 1: Instagram backfill (range fetch + backfillAccount + trigger)

**Files:**
- Modify: `apps/api/src/instagram/instagram-graph.util.ts`
- Modify: `apps/api/src/instagram/instagram-sync.service.ts`
- Modify: `apps/api/src/instagram/instagram-sync.service.spec.ts`
- Test: `apps/api/src/instagram/instagram-graph.util.spec.ts` (create if absent)

**Interfaces:**
- Produces: `fetchAccountInsightsRange(igUserId: string, token: string, sinceUnix: number, untilUnix: number): Promise<DailyInsightRow[]>` where `DailyInsightRow = { date: string; reach?: number; views?: number; accountsEngaged?: number; totalInteractions?: number }`; `InstagramSyncService.backfillAccount(account, days?: number): Promise<{ daysWritten: number }>` (default 90).

- [ ] **Step 1: Read** `instagram-graph.util.ts` (the `GRAPH` base, `ACCOUNT_METRIC_KEYS`, `fetchInsightsWithTolerance`, the auth-error throw) and `instagram-sync.service.ts` (`syncAccount` token-decrypt, `handleAuthError`, the `@Cron` handler, `truncateToDate`).
- [ ] **Step 2: Write the failing test** for the range fetch (`instagram-graph.util.spec.ts`), mocking `global.fetch`:

```ts
import { fetchAccountInsightsRange } from './instagram-graph.util';

describe('fetchAccountInsightsRange', () => {
  it('chunks a 90-day window into <=30-day requests and maps values[] to per-day rows', async () => {
    const calls: string[] = [];
    global.fetch = (jest.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ data: [
        { name: 'reach', period: 'day', values: [
          { value: 10, end_time: '2026-06-01T07:00:00+0000' },
          { value: 20, end_time: '2026-06-02T07:00:00+0000' },
        ] },
        { name: 'views', period: 'day', values: [
          { value: 100, end_time: '2026-06-01T07:00:00+0000' },
          { value: 200, end_time: '2026-06-02T07:00:00+0000' },
        ] },
      ] }) };
    }) as any);

    const until = Math.floor(Date.UTC(2026, 8, 1) / 1000); // 90 days span
    const since = until - 90 * 86400;
    const rows = await fetchAccountInsightsRange('ig1', 'tok', since, until);

    expect(calls.length).toBeGreaterThanOrEqual(3);        // 90d / 30d -> >=3 chunks
    expect(calls.every((u) => !u.includes('total_value'))).toBe(true); // time-series form
    const d1 = rows.find((r) => r.date === '2026-06-01');
    expect(d1).toMatchObject({ reach: 10, views: 100 });
  });
});
```

- [ ] **Step 3: Run, verify fail:** `cd apps/api && corepack pnpm test -- src/instagram/instagram-graph.util` → FAIL (not exported).
- [ ] **Step 4: Implement `fetchAccountInsightsRange`** in `instagram-graph.util.ts`:
  - Split `[sinceUnix, untilUnix]` into spans of ≤ `30 * 86400` seconds.
  - For each span: `GET ${GRAPH}/${igUserId}/insights?metric=reach,views,accounts_engaged,total_interactions&period=day&since=<s>&until=<u>&access_token=<token>` (NO `metric_type`). On `!res.ok` → reuse the util's auth-error check (throw `InstagramAuthError`/the existing error on 401/code-190); otherwise skip that span's failures gracefully.
  - Parse `json.data` (array of `{ name, values: [{ value, end_time }] }`). For each metric row, map `name` → the `DailyInsightRow` field via `ACCOUNT_METRIC_KEYS` (reach→reach, views→views, accounts_engaged→accountsEngaged, total_interactions→totalInteractions). For each `values[]` entry, derive `date = new Date(end_time).toISOString().slice(0,10)` and accumulate into a `Map<date, DailyInsightRow>`.
  - Return the rows sorted by `date`.
- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Implement `backfillAccount`** in `instagram-sync.service.ts`:
  - Decrypt token + igUserId (same pattern as `syncAccount`; bail `{ daysWritten: 0 }` if missing).
  - `const until = Math.floor(this.truncateToDate(new Date()).getTime() / 1000); const since = until - days * 86400;`
  - `try { rows = await fetchAccountInsightsRange(igUserId, token, since, until); } catch (e) { if (isAuthError(e)) await this.handleAuthError(account, e); throw e; }` (mirror syncAccount's auth handling — or wrap so a non-auth error logs + returns partial).
  - For each row: `await this.prisma.instagramAccountMetrics.upsert({ where: { socialAccountId_date: { socialAccountId: account.id, date: new Date(row.date) } }, create: { socialAccountId: account.id, date: new Date(row.date), reach: row.reach ?? null, views: row.views ?? null, accountsEngaged: row.accountsEngaged ?? null, totalInteractions: row.totalInteractions ?? null }, update: { reach: row.reach ?? null, views: row.views ?? null, accountsEngaged: row.accountsEngaged ?? null, totalInteractions: row.totalInteractions ?? null } });`
  - Return `{ daysWritten: rows.length }`. Log `Backfilled IG account ${account.id} (${rows.length} days)`.
- [ ] **Step 7: Wire the self-healing trigger.** Add `static readonly BACKFILL_THRESHOLD_DAYS = 7;`. In BOTH the `@Cron` per-account loop AND `InstagramService.triggerSync` path (whichever calls `syncAccount`), before the daily sync: `const have = await this.prisma.instagramAccountMetrics.count({ where: { socialAccountId: account.id } }); if (have < InstagramSyncService.BACKFILL_THRESHOLD_DAYS) { await this.backfillAccount(account, 90); }` then continue with the normal `syncAccount`. (If `triggerSync` lives in `instagram.service.ts` and calls `syncService.syncAccount`, add the same count+backfill there using the injected sync service — expose `backfillAccount` publicly.)
- [ ] **Step 8: Tests** (`instagram-sync.service.spec.ts`): (a) `backfillAccount` upserts one row per returned day with correct `socialAccountId_date` keys + values (mock `fetchAccountInsightsRange` + prisma); (b) running it twice issues upserts for the same dates (idempotent — assert no error + same keys); (c) trigger: `count < 7` → `backfillAccount` called; `count >= 7` → not called. Use a 64-hex `ENCRYPTION_KEY` config stub.
- [ ] **Step 9: Verify:** `cd apps/api && corepack pnpm build`, `corepack pnpm test -- src/instagram`, `corepack pnpm lint` (0 errors) all pass.
- [ ] **Step 10: Commit:** `feat(instagram): 90-day insights backfill + self-healing trigger`

### Task 2: Threads backfill (mirror Task 1)

**Files:**
- Modify: `apps/api/src/threads/threads-graph.util.ts`
- Modify: `apps/api/src/threads/threads-sync.service.ts`
- Modify: `apps/api/src/threads/threads-sync.service.spec.ts`
- Test: `apps/api/src/threads/threads-graph.util.spec.ts` (create if absent)

**Interfaces:**
- Produces: `fetchThreadsAccountInsightsRange(threadsUserId, token, sinceUnix, untilUnix): Promise<DailyThreadsInsightRow[]>` where `DailyThreadsInsightRow = { date: string; views?; likes?; replies?; reposts?; quotes? }`; `ThreadsSyncService.backfillAccount(account, days?: number): Promise<{ daysWritten: number }>`.

- [ ] **Step 1: Read** `threads-graph.util.ts` (`GRAPH`, the `threads_insights` endpoint, `fetchThreadsAccountInsights`, `ThreadsAuthError`) and `threads-sync.service.ts` (token decrypt = `tokens.threadsUserId`, `handleAuthError`, `@Cron`).
- [ ] **Step 2: Write the failing test** (`threads-graph.util.spec.ts`) — same structure as Task 1 Step 2 but endpoint `threads_insights`, metrics `views,likes,replies,reposts,quotes`, asserting chunking + per-day mapping.
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement `fetchThreadsAccountInsightsRange`** in `threads-graph.util.ts`: `GET ${GRAPH}/${threadsUserId}/threads_insights?metric=views,likes,replies,reposts,quotes&period=day&since=<s>&until=<u>&access_token=<token>` (NO `metric_type`), 30-day chunks, parse `data[].values[]` → per-day rows via the threads metric map; `ThreadsAuthError` on auth failure; skip unsupported metrics.
- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Implement `ThreadsSyncService.backfillAccount`** mirroring Task 1 Step 6: upsert into `threadsAccountMetrics` by `socialAccountId_date` with `{ views, likes, replies, reposts, quotes }` (followersCount stays null for backfilled days unless the range returns it). Use `tokens.threadsUserId`.
- [ ] **Step 7: Wire the trigger** (`BACKFILL_THRESHOLD_DAYS = 7`) in the Threads cron + `triggerSync` path: `count(threadsAccountMetrics) < 7 → backfillAccount(account, 90)` then normal sync.
- [ ] **Step 8: Tests** (`threads-sync.service.spec.ts`): backfill upserts per-day; idempotent; trigger count gate — mirror Task 1 Step 8.
- [ ] **Step 9: Verify:** `cd apps/api && corepack pnpm build`, `corepack pnpm test -- src/threads`, `corepack pnpm lint` pass.
- [ ] **Step 10: Commit:** `feat(threads): 90-day insights backfill + self-healing trigger`

---

## Finalization

- [ ] **Full build/test/lint:** `corepack pnpm --filter api build && corepack pnpm --filter api test -- src/instagram src/threads && corepack pnpm --filter api lint`.
- [ ] **Live-API check (spec §4 decision rule):** after deploy, on a real project, trigger an IG sync (visit analytics) and inspect the api log / DB — confirm `fetchAccountInsightsRange` returned **per-day `views`** rows (not just `reach`). 
  - If per-day `views` populated → the backfill alone fixes "Total Views"; done.
  - If `views` has NO per-day series (only `total_value` is supported by Meta) → open a follow-up to add the read-time period-total path described in spec §4 (a `periodTotals` field in `getMetrics` computed from a single `metric_type=total_value` call, consumed by the dashboard's Total KPIs). **Log which path was observed.**
- [ ] **Verify the user's existing account:** the IG account with 2 rows expands to up to 90 after the trigger fires; "Total Views (90d)" now matches the Instagram app for that window.
- [ ] **GitHub issue + PR** (English) → `development`; PR links spec + plan; note the §4 live-check outcome.

## Self-Review notes (coverage vs spec)

- Spec §1 range fetch → Tasks 1/2 Steps 2-5. §2 backfillAccount → Steps 6. §3 trigger → Steps 7. §4 guardrail → Finalization live-API check (conditional follow-up, not a build now). §5 testing → per-task Steps 8 + Finalization. §6 risks: chunking (Step 4), idempotency (Step 8b), auth (Step 6).
- Type consistency: `fetchAccountInsightsRange`/`DailyInsightRow` (IG) and `fetchThreadsAccountInsightsRange`/`DailyThreadsInsightRow` (Threads); `backfillAccount(account, days=90)` both services; `BACKFILL_THRESHOLD_DAYS = 7`; upsert key `socialAccountId_date` matches the existing models; `time-series` request omits `metric_type` consistently.
- Deferred per spec non-goals: frontend, media backfill, new models, the §4 period-total read path (only if live-API check requires it).
