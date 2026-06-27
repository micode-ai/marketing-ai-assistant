# Threads Analytics — Design

**Date:** 2026-06-27
**Status:** Approved design — ready for implementation planning
**Scope owner:** `apps/api` (new `threads` module), `apps/ai-agent`, `apps/web`, `packages/database`, `packages/i18n`

## Goal

Give Threads the same analytics experience Instagram already has: pull account- and post-level insights from the Threads Graph API on a plan-throttled schedule, store them, and render a dashboard (KPIs, trend, best/worst posts, AI suggestions) on the project analytics page. Threads is currently **publish-only**; this adds the analytics half.

## Approach

A new, self-contained `apps/api/src/threads/` module that **mirrors `apps/api/src/instagram/` 1:1**. We do **not** refactor the working Instagram module into a shared abstraction (that would risk regressing live IG analytics for no user-facing gain). The two modules stay parallel; differences are only in the Graph endpoints, metric names, and DB columns.

Reference implementation to mirror (read completely before writing each counterpart):
- `apps/api/src/instagram/{instagram-graph.util,instagram-sync.service,instagram.service,instagram.controller,instagram.module}.ts`
- `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte` + `instagram-dashboard-state.ts` (+ its `.test.ts`)
- `packages/database/prisma/schema.prisma` models `InstagramAccountMetrics`, `InstagramMedia`
- ai-agent route `POST /generate-instagram-advice`

## Locked decisions

| Decision | Choice |
|---|---|
| Metrics depth | Account-level **and** per-post (top/worst) — full IG mirror |
| Sync / plan gating | Mirror IG: hourly `@Cron`, FREE → account-only ≤1/day, PRO → account+media skip<6h, ENTERPRISE → hourly; auto-sync on page when stale >10min |
| AI suggestions | Included (mirror IG "AI suggestions") |
| Module shape | Separate `threads` module (no IG refactor) |
| Insights scope | `threads_manage_insights`; reconnect required for existing accounts |

## Non-goals

- Refactoring Instagram + Threads into one shared "meta insights" module.
- Fixing the pre-existing "hardcoded granted scopes instead of reading Meta's actually-granted permissions" issue (shared IG/Threads tech debt; tracked separately).
- Follower demographics / audience breakdowns.
- Org-level (all-projects) Threads rollups.

---

## 1. Meta OAuth scope

- **`apps/api/src/meta-oauth/meta-oauth.service.ts`**: add `'threads_manage_insights'` to `THREADS_SCOPES`.
- **`apps/api/src/meta-oauth/meta-oauth.controller.ts`** (Threads callback, ~line 134): add `'threads_manage_insights'` to the hardcoded `scopes` array stored on the account.
- `insightsGranted` is derived as `scopes?.includes('threads_manage_insights') ?? false` (mirrors IG `instagram_business_manage_insights`).
- **Migration impact:** existing Threads accounts were stored with only `['threads_basic','threads_content_publish']`. They will show the reconnect banner until the user reconnects (intended — same UX as IG). No data migration.
- **Meta App Review caveat (document in code + spec):** `threads_manage_insights` is only granted to non-admin users after Meta App Review. For the app admin/testers it works immediately. The banner + status logic handle the not-granted case gracefully.

## 2. Database (`packages/database/prisma/schema.prisma`)

Two new models + a relation on `SocialAccount`, then `prisma migrate dev` (creates migration) — run from `packages/database` per CLAUDE.md.

```prisma
model ThreadsAccountMetrics {
  id              String   @id @default(cuid())
  socialAccountId String
  date            DateTime @db.Date
  followersCount  Int?
  views           Int?
  likes           Int?
  replies         Int?
  reposts         Int?
  quotes          Int?
  createdAt       DateTime @default(now())

  socialAccount SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)

  @@unique([socialAccountId, date])
  @@index([socialAccountId])
  @@map("threads_account_metrics")
}

model ThreadsMedia {
  id              String   @id @default(cuid())
  socialAccountId String
  threadsMediaId  String
  mediaType       String
  text            String?  @db.Text
  permalink       String?
  timestamp       DateTime
  views           Int?
  likes           Int?
  replies         Int?
  reposts         Int?
  quotes          Int?
  shares          Int?
  engagementRate  Float?
  lastSyncedAt    DateTime

  socialAccount SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)

  @@unique([socialAccountId, threadsMediaId])
  @@index([socialAccountId])
  @@map("threads_media")
}
```

Add to `model SocialAccount` (alongside the existing `instagramAccountMetrics` / `instagramMedia` back-relations):
```prisma
  threadsAccountMetrics ThreadsAccountMetrics[]
  threadsMedia          ThreadsMedia[]
```

**Engagement rate:** `engagementRate = (likes+replies+reposts+quotes+shares) / max(views, 1)` (Threads has no "reach"; `views` is the denominator). Computed at sync time, stored on `ThreadsMedia`.

## 3. Threads Graph API (`apps/api/src/threads/threads-graph.util.ts`)

Base `https://graph.threads.net`. All calls use the per-account long-lived token (decrypted from `SocialAccount.encryptedTokens.accessToken`, with `threadsUserId` also stored there). Mirror `instagram-graph.util.ts`'s per-metric tolerance (try the batch, fall back to per-metric so one unavailable metric doesn't fail the whole sync).

- **Profile:** `GET /me?fields=username,followers_count,threads_profile_picture_url` → `{ username, followersCount, profilePictureUrl }`.
- **Account insights:** `GET /{threadsUserId}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count&since=&until=` → returns time-series for `views/likes/replies/reposts/quotes` and a `total_value` for `followers_count`. Reduce to `{ followersCount, views, likes, replies, reposts, quotes }` for "today".
- **Media list:** `GET /{threadsUserId}/threads?fields=id,media_type,text,permalink,timestamp&limit=25` → recent posts.
- **Media insights:** `GET /{mediaId}/insights?metric=views,likes,replies,reposts,quotes,shares` → `{ views, likes, replies, reposts, quotes, shares }`.

Notes: `threads_insights` account metrics require `since`/`until` within allowed window; `views` for account is supported. Use the same defensive parsing as IG (newer responses use `total_value`, older use `values[]`).

## 4. Backend services (`apps/api/src/threads/`)

### `threads-sync.service.ts` (mirror `instagram-sync.service.ts`)
- `@Cron('0 * * * *')` `handleCron`: select ACTIVE Threads accounts; per-account try/catch; plan throttle:
  - FREE → `syncAccount(account, withMedia=false)`, skip if synced within ~24h.
  - PRO → `syncAccount(account, true)`, skip if synced within 6h (`SIX_HOURS_MS`).
  - ENTERPRISE → `syncAccount(account, true)` hourly.
- `syncAccount(account, withMedia)`: decrypt token; fetch profile + account insights; upsert `ThreadsAccountMetrics` for `today` (`@@unique([socialAccountId, date])`); when `withMedia`, fetch media list + per-media insights, compute `engagementRate`, upsert `ThreadsMedia`. Returns `{ accountSynced, mediaSynced }`.
- On auth error (Threads OAuth error / 190-equivalent) → flip account to `REAUTH_REQUIRED` + `CronFailureNotifier.report({ cronName: 'threads-sync', errorCode: 'THREADS_TOKEN_EXPIRED', ... })`.
- `planAllowsMedia(plan)` → `plan !== 'FREE'`.

### `threads.service.ts` (mirror `instagram.service.ts`)
- `resolveAccount(projectId)` → the `THREADS` `SocialAccount` linked to the project via `ProjectSocialAccount`, org-filtered.
- `getStatus(projectId)` → `{ connected, accountName, accountId, lastSyncAt, insightsGranted }` (`insightsGranted = scopes.includes('threads_manage_insights')`).
- `getMetrics(projectId, days)` → `{ account: [...daily rows], topPosts, worstPosts }`. Top = 5 by `engagementRate desc`; worst = bottom 5 excluding top ids (same dedupe as IG).
- `triggerSync(projectId)` → skip-if-recent (`SKIP_IF_RECENT_MS` 10min) + plan throttle, then `syncAccount`.
- `generateAdvice(projectId, language)` → POST ai-agent `${AI_AGENT_URL}/generate-threads-advice` with `{ language, projectName, industry, account, topPosts, worstPosts }`; return `{ advice, contextSummary }`.
- `getLastSyncAt(socialAccountId)` → max(`ThreadsAccountMetrics.createdAt`, `ThreadsMedia.lastSyncedAt`).

### `threads.controller.ts` (mirror `instagram.controller.ts`)
`@UseGuards(ProjectAccessGuard)`; endpoints:
- `GET /threads/status?projectId=`
- `GET /threads/metrics?projectId=&days=` (clamp days like IG)
- `POST /threads/sync?projectId=`
- `POST /threads/advice?projectId=` body `{ language }`

### `threads.module.ts`
`imports: [DatabaseModule]`, `controllers: [ThreadsController]`, `providers: [ThreadsService, ThreadsSyncService, ProjectAccessGuard]`, `exports: [ThreadsService]`. Register in `apps/api/src/app.module.ts`.

## 5. AI agent (`apps/ai-agent`)

Add route `POST /generate-threads-advice` mirroring `/generate-instagram-advice`: same request/response shape (`{ advice, contextSummary }`), prompt adapted to Threads metrics (views/likes/replies/reposts/quotes/shares, no reach/saves). Reuse the existing advice handler structure; only the prompt copy + metric field names change.

## 6. Frontend (`apps/web`)

- **`src/lib/components/analytics/threads-dashboard-state.ts`** — pure helpers `resolveThreadsView({loading,status})` (`loading|hidden|reconnect|connected`) + `isSyncStale(lastSyncAt)` + `ThreadsStatus` interface. Mirror `instagram-dashboard-state.ts`.
- **`src/lib/components/analytics/threads-dashboard-state.test.ts`** — Vitest mirroring the IG test (the loading/hidden/reconnect/connected matrix).
- **`src/lib/components/analytics/ThreadsAnalyticsDashboard.svelte`** — mirror `InstagramAnalyticsDashboard.svelte`: `loading|hidden|reconnect|connected` states; KPI cards (followers, views, likes, replies, reposts, quotes); trend chart; best/worst posts; "AI suggestions" button → `POST /threads/advice`; auto-sync on mount when stale; reconnect banner (CTA → `/settings/integrations`). Built on the new **Iris** tokens (`bg-surface`, `text-ink`, `bg-brand`, badges) consistent with the redesigned IG dashboard.
- **`src/routes/(app)/projects/[id]/analytics/+page.svelte`** — render `<ThreadsAnalyticsDashboard projectId={projectId} />` directly after `<InstagramAnalyticsDashboard ... />`. Self-hides when no Threads account is linked.

## 7. i18n (`packages/i18n/src/locales/{en,pl,ru}.json`)

New `threads.*` namespace mirroring `instagram.*`: KPI labels (followers/views/likes/replies/reposts/quotes), `noData`, `posts`/`bestPosts`/`worstPosts`/`noPosts`, `reconnectTitle`/`reconnectDescription`/`reconnectCta`, `advice`/`adviceLoading`/`adviceError`, etc. All three locales updated together (use i18n-translator).

## 8. Testing & verification

- **Unit (api):** `threads-sync.service.spec.ts` and `threads.service.spec.ts` mirroring the IG specs — getStatus connected/insightsGranted matrix; syncAccount upserts; plan throttle; advice request shape (mock fetch). Run `cd apps/api && pnpm test -- src/threads`.
- **Unit (web):** `threads-dashboard-state.test.ts` (Vitest). (Note: `vitest` must be installed in the run environment — it was absent during the redesign work; ensure deps are present before claiming web tests pass.)
- **Build/lint:** `pnpm --filter api build`, `pnpm --filter web build`, `pnpm lint`.
- **DB:** `pnpm db:generate` after schema change; migration created via `cd packages/database && pnpm db:migrate:dev`.
- **Manual:** with a Threads account that granted insights, open project analytics → Threads dashboard renders; trigger sync; AI suggestions returns text. Verify reconnect banner when scope missing.

## 9. Risks & mitigations

- **`threads_manage_insights` needs Meta App Review** for public users → same graceful reconnect/hidden states as IG; documented.
- **Threads insights metric availability / windows** differ from IG → per-metric tolerant fetch (one missing metric doesn't fail the batch), same as IG.
- **Existing Threads accounts lack the new scope** → reconnect banner guides them; no data migration.
- **`vitest` absent in some envs** → ensure install before asserting web tests pass (lesson from the Iris redesign).
- **AI agent route addition** → additive; mirror the IG advice handler to avoid divergence.

## 10. File inventory

Create:
- `apps/api/src/threads/{threads.module,threads.controller,threads.service,threads-sync.service,threads-graph.util}.ts`
- `apps/api/src/threads/{threads.service.spec,threads-sync.service.spec}.ts`
- `apps/web/src/lib/components/analytics/{ThreadsAnalyticsDashboard.svelte,threads-dashboard-state.ts,threads-dashboard-state.test.ts}`
- `packages/database/prisma/migrations/<ts>_threads_analytics/` (generated)
- ai-agent: new `generate-threads-advice` route file (mirror IG advice route location)

Modify:
- `packages/database/prisma/schema.prisma` (2 models + SocialAccount relations)
- `apps/api/src/meta-oauth/meta-oauth.service.ts` (+ scope), `meta-oauth.controller.ts` (+ stored scope)
- `apps/api/src/app.module.ts` (register `ThreadsModule`)
- `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte` (render dashboard)
- `packages/i18n/src/locales/{en,pl,ru}.json` (`threads.*`)
