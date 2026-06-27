# Threads Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Threads account- and post-level analytics (plan-throttled sync, dashboard, AI suggestions) by mirroring the existing Instagram analytics module.

**Architecture:** A new self-contained `apps/api/src/threads/` module mirroring `apps/api/src/instagram/` 1:1 (Graph util → sync service → service → controller), backed by two new Prisma models, an ai-agent advice route, and a `ThreadsAnalyticsDashboard` Svelte component rendered on the project analytics page. No refactor of the working Instagram module.

**Tech Stack:** NestJS 10 + Prisma (api), Express/tsx (ai-agent), SvelteKit 2 + Tailwind/Iris tokens + Vitest (web), svelte-i18n (en/pl/ru).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-threads-analytics-design.md`.
- Insights scope string: **`threads_manage_insights`**. `insightsGranted = scopes.includes('threads_manage_insights')`.
- Threads Graph base: `https://graph.threads.net`. Token + `threadsUserId` live in `SocialAccount.encryptedTokens` (`{ accessToken, threadsUserId }`).
- Account metrics columns: `followersCount, views, likes, replies, reposts, quotes`. Media adds `shares`.
- `engagementRate = (likes+replies+reposts+quotes+shares) / max(views, 1)`.
- Plan throttle (mirror IG): FREE → account-only, ≤1/day; PRO → account+media, skip if synced <6h; ENTERPRISE → account+media hourly. Cron `@Cron('0 * * * *')`.
- Cron failure: `cronName: 'threads-sync'`, `errorCode: 'THREADS_TOKEN_EXPIRED'`, flip account to `REAUTH_REQUIRED`.
- DB workflow: edit schema → `pnpm db:generate`; migration via `cd packages/database && pnpm db:migrate:dev`. `packages/database/.env` needs `DATABASE_URL`.
- Build via `corepack pnpm --filter <app> build`; `NODE_OPTIONS=--max-old-space-size=4096`. `vitest` must be installed before claiming web tests pass.
- GitHub artifacts English. Branch `feat/threads-analytics` (already created off `origin/development`).
- Mirror references (read fully before writing each): `apps/api/src/instagram/{instagram-graph.util,instagram-sync.service,instagram.service,instagram.controller,instagram.module}.ts`, `apps/ai-agent/src/{routes/instagram-advice.ts,agents/instagram-advice-agent.ts,index.ts}`, `apps/web/src/lib/components/analytics/{InstagramAnalyticsDashboard.svelte,instagram-dashboard-state.ts,instagram-dashboard-state.test.ts}`.

---

## Phase A — Data + scope foundation

### Task 1: Prisma models + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1:** Add the two models (verbatim from spec §2) after `model InstagramMedia`:

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

- [ ] **Step 2:** In `model SocialAccount`, add back-relations next to the existing `instagramAccountMetrics` / `instagramMedia` lines:

```prisma
  threadsAccountMetrics ThreadsAccountMetrics[]
  threadsMedia          ThreadsMedia[]
```

- [ ] **Step 3: Create migration + regenerate client.**

Run: `cd packages/database && pnpm db:migrate:dev` (name it `threads_analytics`), then from repo root `pnpm db:generate`.
Expected: migration folder `packages/database/prisma/migrations/<ts>_threads_analytics/` created; client regenerated with `ThreadsAccountMetrics`/`ThreadsMedia` delegates.

- [ ] **Step 4: Verify** `cd apps/api && corepack pnpm build` compiles (types resolve `prisma.threadsAccountMetrics`).

- [ ] **Step 5: Commit:** `git add packages/database && git commit -m "feat(db): Threads analytics models (account metrics + media)"`

### Task 2: Threads insights scope

**Files:**
- Modify: `apps/api/src/meta-oauth/meta-oauth.service.ts`
- Modify: `apps/api/src/meta-oauth/meta-oauth.controller.ts` (~line 134)

**Interfaces:**
- Produces: stored `scopes` now contains `threads_manage_insights` for newly-connected Threads accounts.

- [ ] **Step 1:** In `meta-oauth.service.ts`, change `THREADS_SCOPES`:

```ts
const THREADS_SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_insights'];
```

- [ ] **Step 2:** In `meta-oauth.controller.ts` Threads callback, update the stored scopes:

```ts
          scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_insights'],
```

- [ ] **Step 3:** Update `meta-oauth.service.spec.ts` Threads auth-URL assertion to expect `threads_manage_insights` in the scope param (mirror the IG assertion at spec line ~40).
- [ ] **Step 4: Verify:** `cd apps/api && corepack pnpm test -- src/meta-oauth` passes.
- [ ] **Step 5: Commit:** `git commit -am "feat(meta-oauth): request + store threads_manage_insights scope"`

---

## Phase B — Backend module

### Task 3: Threads Graph util

**Files:**
- Create: `apps/api/src/threads/threads-graph.util.ts`

**Interfaces (Produces — used by Task 4):**
- `fetchThreadsProfile(threadsUserId, token): Promise<{ username?: string; followersCount?: number; profilePictureUrl?: string }>`
- `fetchThreadsAccountInsights(threadsUserId, token): Promise<{ followersCount?: number; views?: number; likes?: number; replies?: number; reposts?: number; quotes?: number }>`
- `fetchThreadsMediaList(threadsUserId, token, limit): Promise<Array<{ id: string; mediaType: string; text?: string; permalink?: string; timestamp: string }>>`
- `fetchThreadsMediaInsights(mediaId, token): Promise<{ views?: number; likes?: number; replies?: number; reposts?: number; quotes?: number; shares?: number }>`

- [ ] **Step 1:** Read `apps/api/src/instagram/instagram-graph.util.ts` completely. Mirror it with `GRAPH = 'https://graph.threads.net'` and these endpoints:
  - profile: `GET {GRAPH}/me?fields=username,followers_count,threads_profile_picture_url&access_token=…`
  - account insights: `GET {GRAPH}/{threadsUserId}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count&access_token=…` — parse both `total_value.value` (followers_count) and time-series `values[]` (sum/last per metric for "today"); use the same per-metric tolerant fallback as IG (`fetchWithTolerance`) so one unavailable metric doesn't fail the batch.
  - media list: `GET {GRAPH}/{threadsUserId}/threads?fields=id,media_type,text,permalink,timestamp&limit={limit}&access_token=…`
  - media insights: `GET {GRAPH}/{mediaId}/insights?metric=views,likes,replies,reposts,quotes,shares&access_token=…`
- [ ] **Step 2:** Map Threads JSON → the return shapes above. Threads insight rows look like `{ name, period, values: [{ value }], total_value: { value } }` — reuse IG's reducer (prefer `total_value.value`, else last/sum of `values`).
- [ ] **Step 3: Verify** `cd apps/api && corepack pnpm build` compiles.
- [ ] **Step 4: Commit:** `git commit -am "feat(threads): Threads Graph insights util"`

### Task 4: Threads sync service

**Files:**
- Create: `apps/api/src/threads/threads-sync.service.ts`
- Create: `apps/api/src/threads/threads-sync.service.spec.ts`

**Interfaces:**
- Consumes: Task 3 fetchers; `decryptData`, `CronFailureNotifier`, `ConfigService`, `PrismaService`.
- Produces: `syncAccount(account, withMedia=true): Promise<{ accountSynced: boolean; mediaSynced: number }>`, `planAllowsMedia(plan): boolean`, `@Cron handleCron()`.

- [ ] **Step 1:** Read `instagram-sync.service.ts` completely. Mirror it. Token fields: `tokens.accessToken` + `tokens.threadsUserId` (not igUserId). Constants `SIX_HOURS_MS = 6*60*60*1000`.
- [ ] **Step 2:** `syncAccount`: fetch `fetchThreadsProfile` + `fetchThreadsAccountInsights`; upsert `prisma.threadsAccountMetrics` for `today` keyed by `socialAccountId_date` with `{ followersCount, views, likes, replies, reposts, quotes }`. When `withMedia`: `fetchThreadsMediaList(threadsUserId, token, 25)`, for each `fetchThreadsMediaInsights`, compute:

```ts
const interactions = (likes ?? 0) + (replies ?? 0) + (reposts ?? 0) + (quotes ?? 0) + (shares ?? 0);
const engagementRate = views && views > 0 ? interactions / views : null;
```

  then upsert `prisma.threadsMedia` keyed by `socialAccountId_threadsMediaId` with `{ mediaType, text, permalink, timestamp: new Date(ts), views, likes, replies, reposts, quotes, shares, engagementRate, lastSyncedAt: new Date() }`.
- [ ] **Step 3:** Auth-error path: mirror IG `isAuthError`/`handleAuthError` — flip `status: 'REAUTH_REQUIRED'` and `notifier.report({ cronName: 'threads-sync', resourceType: 'SocialAccount', errorCode: 'THREADS_TOKEN_EXPIRED', actionUrl: `${WEB_URL}/settings/integrations`, ... })`.
- [ ] **Step 4:** `@Cron('0 * * * *') handleCron`: select `platform: 'THREADS', status: 'ACTIVE'` accounts with org+subscription; throttle FREE (account-only, skip if synced <24h) / PRO (skip <6h) / ENTERPRISE (hourly); per-account try/catch.
- [ ] **Step 5: Tests** (`threads-sync.service.spec.ts`, mirror IG spec): (a) `syncAccount` upserts account metrics + media with computed `engagementRate`; (b) `planAllowsMedia('FREE') === false`, `'PRO'/'ENTERPRISE' === true`; (c) auth error flips REAUTH_REQUIRED + reports. Mock the graph util fetchers + PrismaService.
- [ ] **Step 6: Verify:** `cd apps/api && corepack pnpm test -- src/threads/threads-sync` passes.
- [ ] **Step 7: Commit:** `git commit -am "feat(threads): plan-throttled sync service + tests"`

### Task 5: Threads service (status/metrics/sync/advice)

**Files:**
- Create: `apps/api/src/threads/threads.service.ts`
- Create: `apps/api/src/threads/threads.service.spec.ts`

**Interfaces:**
- Consumes: `ThreadsSyncService` (`syncAccount`, `planAllowsMedia`), `PrismaService`, `ConfigService`.
- Produces: `getStatus(projectId)`, `getMetrics(projectId, days)`, `triggerSync(projectId)`, `generateAdvice(projectId, language)`.

- [ ] **Step 1:** Read `instagram.service.ts` completely. Mirror it. `INSIGHTS_SCOPE = 'threads_manage_insights'`; `resolveAccount` filters `platform === 'THREADS'`.
- [ ] **Step 2:** `getStatus` → `{ connected, accountName, accountId, lastSyncAt, insightsGranted: scopes.includes('threads_manage_insights') }`. `getLastSyncAt` = max(`threadsAccountMetrics.createdAt`, `threadsMedia.lastSyncedAt`).
- [ ] **Step 3:** `getMetrics(projectId, days)` → `{ account: rows mapped to {date, followersCount, views, likes, replies, reposts, quotes}, topPosts, worstPosts }`. Top = 5 `threadsMedia` by `engagementRate desc` within window; worst = bottom 5 excluding top `threadsMediaId`s (mirror IG dedupe).
- [ ] **Step 4:** `triggerSync` → skip-if-recent (`SKIP_IF_RECENT_MS = 10*60*1000`) + plan throttle, then `syncAccount`.
- [ ] **Step 5:** `generateAdvice(projectId, language)` → POST `${AI_AGENT_URL}/generate-threads-advice` with `{ language, projectName, industry, account, topPosts, worstPosts }`; return `{ advice, contextSummary }`. Mirror IG error handling (BadRequestException on fetch fail / non-OK).
- [ ] **Step 6: Tests** (`threads.service.spec.ts`, mirror IG spec): getStatus connected=false when no account; connected + `insightsGranted` true/false by scope; getMetrics top/worst split. Mock Prisma.
- [ ] **Step 7: Verify:** `cd apps/api && corepack pnpm test -- src/threads/threads.service` passes.
- [ ] **Step 8: Commit:** `git commit -am "feat(threads): status/metrics/sync/advice service + tests"`

### Task 6: Controller + module + registration

**Files:**
- Create: `apps/api/src/threads/threads.controller.ts`
- Create: `apps/api/src/threads/threads.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1:** `threads.controller.ts` mirror `instagram.controller.ts`: `@Controller('threads')`, `@UseGuards(ProjectAccessGuard)`; `GET status`, `GET metrics` (clamp `days`), `POST sync`, `POST advice` (body `{ language }`).
- [ ] **Step 2:** `threads.module.ts`: `imports: [DatabaseModule]`, `controllers: [ThreadsController]`, `providers: [ThreadsService, ThreadsSyncService, ProjectAccessGuard]`, `exports: [ThreadsService]`.
- [ ] **Step 3:** Register `ThreadsModule` in `app.module.ts` imports (next to `InstagramModule`).
- [ ] **Step 4: Verify:** `cd apps/api && corepack pnpm build` compiles; `corepack pnpm test -- src/threads` green.
- [ ] **Step 5: Commit:** `git commit -am "feat(threads): controller + module wiring"`

### Task 7: ai-agent advice route

**Files:**
- Create: `apps/ai-agent/src/routes/threads-advice.ts`
- Create: `apps/ai-agent/src/agents/threads-advice-agent.ts`
- Modify: `apps/ai-agent/src/index.ts` (register route)

- [ ] **Step 1:** Read `apps/ai-agent/src/routes/instagram-advice.ts` + `agents/instagram-advice-agent.ts` completely. Mirror them: route `POST /generate-threads-advice` → `threadsAdviceAgent({ language, projectName, industry, account, topPosts, worstPosts })` → `{ advice, contextSummary }`.
- [ ] **Step 2:** Adapt the prompt to Threads metrics: account `views/likes/replies/reposts/quotes/followers`, posts `views/likes/replies/reposts/quotes/shares/engagementRate` (drop IG-only reach/saves). Keep output JSON shape identical.
- [ ] **Step 3:** Register in `index.ts` the same way `instagram-advice` is wired.
- [ ] **Step 4: Verify:** `cd apps/ai-agent && corepack pnpm build` (or `tsc --noEmit`) compiles; if an IG advice agent spec exists, mirror a minimal one and run it.
- [ ] **Step 5: Commit:** `git commit -am "feat(ai-agent): generate-threads-advice route + agent"`

---

## Phase C — Frontend + i18n

### Task 8: Dashboard view-state helper + test

**Files:**
- Create: `apps/web/src/lib/components/analytics/threads-dashboard-state.ts`
- Create: `apps/web/src/lib/components/analytics/threads-dashboard-state.test.ts`

**Interfaces (Produces — used by Task 9):**
- `interface ThreadsStatus { connected: boolean; accountName?: string; accountId?: string; lastSyncAt?: string|Date|null; insightsGranted: boolean }`
- `resolveThreadsView({loading, status}): 'loading'|'hidden'|'reconnect'|'connected'`
- `isSyncStale(lastSyncAt, now?): boolean`

- [ ] **Step 1: Write the failing test** (`threads-dashboard-state.test.ts`), mirror IG test:

```ts
import { describe, it, expect } from 'vitest';
import { resolveThreadsView, isSyncStale, type ThreadsStatus } from './threads-dashboard-state';

describe('resolveThreadsView', () => {
  it('loading when loading', () => {
    expect(resolveThreadsView({ loading: true, status: null })).toBe('loading');
  });
  it('hidden when not connected', () => {
    const s: ThreadsStatus = { connected: false, insightsGranted: false };
    expect(resolveThreadsView({ loading: false, status: s })).toBe('hidden');
    expect(resolveThreadsView({ loading: false, status: null })).toBe('hidden');
  });
  it('reconnect when connected but no insights', () => {
    const s: ThreadsStatus = { connected: true, insightsGranted: false };
    expect(resolveThreadsView({ loading: false, status: s })).toBe('reconnect');
  });
  it('connected when insights granted', () => {
    const s: ThreadsStatus = { connected: true, insightsGranted: true };
    expect(resolveThreadsView({ loading: false, status: s })).toBe('connected');
  });
});
```

- [ ] **Step 2: Run, verify it fails** (module not found). `cd apps/web && corepack pnpm test -- src/lib/components/analytics/threads-dashboard-state` → FAIL.
- [ ] **Step 3: Implement** `threads-dashboard-state.ts` by copying `instagram-dashboard-state.ts` and renaming Instagram→Threads (same logic, `STALE_MS = 10*60*1000`).
- [ ] **Step 4: Run, verify pass.** Expected: PASS. (If `vitest` is missing, install web deps first.)
- [ ] **Step 5: Commit:** `git commit -am "feat(web): Threads dashboard view-state helper + test"`

### Task 9: ThreadsAnalyticsDashboard + analytics page

**Files:**
- Create: `apps/web/src/lib/components/analytics/ThreadsAnalyticsDashboard.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`

- [ ] **Step 1:** Read `InstagramAnalyticsDashboard.svelte` completely. Mirror it: fetch `/threads/status` + `/threads/metrics`, `resolveThreadsView`, auto-sync on mount when `isSyncStale`, `POST /threads/sync`, AI suggestions via `POST /threads/advice`. KPI cards: Followers, Views, Likes, Replies, Reposts, Quotes. Best/worst posts use `text`/`permalink`/`engagementRate`. Use **Iris tokens** (`bg-surface`, `text-ink`, `border-border`, `bg-brand`, `.badge*`) — match the redesigned IG dashboard's classes.
- [ ] **Step 2:** i18n keys under `threads.*` (created in Task 10) — use the same key names as `instagram.*` but under `threads`.
- [ ] **Step 3:** In `analytics/+page.svelte`, import and render `<ThreadsAnalyticsDashboard projectId={projectId ?? ''} />` immediately after `<InstagramAnalyticsDashboard ... />`.
- [ ] **Step 4: Verify:** `cd apps/web && corepack pnpm build` compiles; dev server route `/projects/:id/analytics` renders without runtime error (self-hides if no Threads account).
- [ ] **Step 5: Commit:** `git commit -am "feat(web): ThreadsAnalyticsDashboard on project analytics"`

### Task 10: i18n `threads.*`

**Files:**
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`

- [ ] **Step 1:** Add a `threads` namespace mirroring the `instagram` namespace keys: `followers, reach?→(drop), views, likes, replies, reposts, quotes, currentFollowers, totalViews, engagement, noData, posts, bestPosts, worstPosts, noPosts, caption→text, type, viewPost, reconnectTitle, reconnectDescription, reconnectCta, advice, adviceLoading, adviceError, subtitle, title`. EN baseline; PL/RU translated. Adapt wording to Threads (e.g. "reposts", "quotes"). Use the i18n-translator agent to keep all three in sync.
- [ ] **Step 2: Verify:** `corepack pnpm --filter web build`; the dashboard labels resolve (no raw keys shown).
- [ ] **Step 3: Commit:** `git commit -am "i18n: threads analytics namespace (en/pl/ru)"`

---

## Finalization

- [ ] **Full build/lint:** `corepack pnpm --filter api build && corepack pnpm --filter web build && corepack pnpm --filter ai-agent build && corepack pnpm lint`.
- [ ] **Tests:** `cd apps/api && corepack pnpm test -- src/threads`; `cd apps/web && corepack pnpm test -- src/lib/components/analytics/threads-dashboard-state` (ensure vitest installed).
- [ ] **Migration present** under `packages/database/prisma/migrations/` and `pnpm db:generate` ran.
- [ ] **GitHub issue + PR** (English) targeting `development`; PR body links spec + plan; note existing Threads accounts must reconnect for insights.

## Self-Review notes (coverage vs spec)

- Spec §1 scope → Task 2. §2 schema → Task 1. §3 graph util → Task 3. §4 sync/service/controller/module → Tasks 4-6. §5 ai-agent → Task 7. §6 frontend → Tasks 8-9. §7 i18n → Task 10. §8 testing → per-task tests + Finalization. §9 risks: per-metric tolerance (Task 3), reconnect for existing (Task 2 note), vitest presence (Task 8/Finalization).
- Type consistency: `threadsUserId` (tokens), `threadsMediaId` (model + upsert key), `engagementRate` formula identical in Task 4 & spec, `insightsGranted` scope string identical across Tasks 2/5. Account metric columns identical in Tasks 1/4/5.
- Deferred per spec non-goals: IG/Threads shared refactor, hardcoded-scopes fix, demographics, org rollups.
