# Plan — TikTok analytics (PR 2)

**Spec:** `docs/superpowers/specs/2026-07-30-tiktok-integration-design.md`
**Issue:** [#149](https://github.com/micode-ai/marketing-ai-assistant/issues/149)
**Branch:** `feat/tiktok-analytics`, stacked on `feat/tiktok-publishing` (PR #150) — it needs the `TIKTOK` enum value, `TikTokTokenService` and the api util from PR 1.

## The constraint that shapes this PR

The Display API returns **lifetime counters only** — no daily series, no completion rate, no traffic-source or audience split. So:

- A `TikTokAccountMetrics` row is a **cumulative snapshot taken that day**, not a per-day delta.
- Summing snapshot rows would double-count. Period figures must be `last − first`, and the trend chart must plot day-over-day **deltas** derived from consecutive snapshots.
- There is **no backfill** — unlike Threads/Instagram, history cannot be fetched retroactively. Day one shows a single point, and that is a platform limit, not a bug. The empty state must say so rather than implying a sync failure.

Deltas can go negative when a video is deleted (the cumulative sum drops), so delta computation clamps at 0.

## Task 1 — Schema

- [ ] `TikTokAccountMetrics`: `socialAccountId`, `date @db.Date`, `followersCount`, `followingCount`, `likesCount`, `videoCount`, `views`, `likes`, `comments`, `shares`, `createdAt`; `@@unique([socialAccountId, date])`, `@@index([socialAccountId])`.
- [ ] `TikTokMedia`: `socialAccountId`, `tiktokVideoId`, `title`, `description`, `coverImageUrl`, `shareUrl`, `embedLink`, `duration`, `timestamp`, `viewCount`, `likeCount`, `commentCount`, `shareCount`, `engagementRate`, `lastSyncedAt`; `@@unique([socialAccountId, tiktokVideoId])`, `@@index([socialAccountId])`.
- [ ] Back-relations on `SocialAccount`, both `onDelete: Cascade`.
- [ ] Hand-written migration `20260730130000_tiktok_analytics`, applied with `db execute` + `migrate resolve` (dev DB has drifted), then `pnpm db:generate`.

## Task 2 — `fetchTikTokVideoList` in `tiktok-api.util.ts`

- [ ] `POST /v2/video/list/?fields=…` with `{ max_count, cursor }` → `{ videos, cursor, hasMore }`, mapping snake_case to camelCase and `create_time` (unix seconds) to a `Date`.
- [ ] Tests: requested `fields` include the counters; cursor is forwarded and returned; an empty response yields `[]` rather than throwing.

## Task 3 — `tiktok-sync.service.ts`

- [ ] `syncAccount(account, withMedia)` — token via `TikTokTokenService.getValidAccessToken` (**not** raw decrypt: 24h tokens must be refreshed), then `fetchTikTokUser` for profile counters, then paginated `fetchTikTokVideoList` (2 pages × 20) upserting `TikTokMedia` with `engagementRate = (likes + comments + shares) / views`.
- [ ] Aggregate the account's stored media into today's snapshot so the totals stay consistent even when a page fetch fails midway.
- [ ] `TikTokAuthError` → account already flipped by the token service; report `TIKTOK_SYNC_FAILED` only for non-auth errors so one cause never sends two emails.
- [ ] `@Cron('15 * * * *')` with the Threads plan throttle: FREE once/day, PRO skip within 6h, ENTERPRISE hourly. Per-video sync on all plans (`planAllowsMedia` → true).
- [ ] Add `'tiktok-sync'` to the `CronName` union with en/pl/ru labels.
- [ ] Tests: snapshot upsert shape; engagement-rate maths; auth error does not double-report; FREE throttle skips a second same-day run.

## Task 4 — `tiktok.service.ts` + `tiktok.controller.ts`

- [ ] `resolveAccount(projectId)` → the project's `TIKTOK` account, org-checked (copy of `ThreadsService`).
- [ ] `getStatus` → `{ connected, accountName, accountId, lastSyncAt, statsGranted }`, where `statsGranted` requires both `user.info.stats` and `video.list` in the granted scopes.
- [ ] `getMetrics(projectId, days)` → `{ account: snapshots, topPosts, worstPosts }`; posts windowed to the period, `worstPosts` excluding anything in `topPosts`. No `periodTotals` — TikTok has no aggregate endpoint, the client derives period figures from snapshots.
- [ ] `triggerSync` with the 10-minute skip-if-recent guard; `generateAdvice` / `getStoredAdvice` on `AiAdvice` channel `'tiktok'`.
- [ ] Controller under `ProjectAccessGuard`: `GET /tiktok/status`, `GET /tiktok/metrics`, `POST /tiktok/sync`, `POST /tiktok/advice`, `GET /tiktok/advice`. Keep the OAuth controller's routes untouched.
- [ ] Tests: `statsGranted` false when `video.list` is missing; `getMetrics` de-duplicates top/worst; disconnected project returns empty rather than throwing.

## Task 5 — ai-agent advice

- [ ] `agents/tiktok-advice-agent.ts` — `buildTikTokAdvicePrompt` (pure) + `generateTikTokAdvice`, mirroring `threads-advice-agent.ts` but TikTok-specific: video-first, hook/retention and posting-cadence advice, and honest about the metrics TikTok does not expose.
- [ ] `routes/tiktok-advice.ts` + registration in `index.ts`.
- [ ] Tests on the prompt builder: uses period deltas rather than summed snapshots; no-data path degrades to best practices.

## Task 6 — Web

- [ ] `tiktok-dashboard-state.ts` — `resolveTikTokView`, `isSyncStale`, plus the honest-numbers helpers `periodDelta(rows, key)` (last − first, single row → its own value) and `deltaSeries(rows, key)` (day-over-day, clamped at 0).
- [ ] `TikTokAnalyticsDashboard.svelte` — KPI strip, followers + daily-views trend chart, top/worst video table with cover thumbnails, AI advice card, drafts-mode-agnostic (publishing is PR 1's concern).
- [ ] Analytics page: `tiktok` channel tab, `/tiktok/status` in `detectSurfaces`, `connected.tiktok` through `AnalyticsOverview`.
- [ ] `overview-summary.ts`: TikTok views card when connected (+ test).
- [ ] i18n `tiktok.*`, `analytics.tabTikTok`, `analytics.tiktokViews`, `hints.metric.tiktokViews` in en/pl/ru.
- [ ] Tests: `tiktok-dashboard-state.test.ts` (view resolution, `periodDelta`, `deltaSeries` incl. the deleted-video case), updated `overview-summary.test.ts`.

## Task 7 — Docs

- [ ] `CLAUDE.md`: TikTok analytics subsection — cumulative snapshots, no backfill, cron schedule.
- [ ] `user_docs/{eng,pl,ru}`: what TikTok analytics shows, and that history starts accumulating from the day the account is connected.

## Verification gate

- [ ] `pnpm --filter @marketing-ai/api test -- src/tiktok src/social`
- [ ] `pnpm --filter @marketing-ai/ai-agent test -- src/agents/tiktok-advice-agent.spec.ts`
- [ ] `cd apps/web && corepack pnpm exec vitest run` (the `test` script is watch mode)
- [ ] `pnpm --filter @marketing-ai/api lint`, `pnpm --filter @marketing-ai/web lint`
- [ ] `pnpm build`
