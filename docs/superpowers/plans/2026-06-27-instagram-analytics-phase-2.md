# Instagram Analytics + AI Suggestions (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Tracking issue:** #92 (Phase 2) · **Design spec:** `docs/superpowers/specs/2026-06-26-instagram-threads-design.md`

**Goal:** Collect Instagram account- and post/Reel-level metrics on a cron, show a dashboard on the project Analytics page, and generate AI suggestions ("performance / what to post / when to post").

**Architecture:** New `apps/api/src/instagram/` module (modeled on `google-play/`): a sync service that pulls insights from `graph.instagram.com` using the per-account long-lived token stored in `SocialAccount`, persists daily account snapshots + per-media metrics in Prisma, throttled by plan on an hourly cron. A new `instagram-advice-agent` in `apps/ai-agent` mirrors `seo-advice-agent`. Frontend `InstagramAnalyticsDashboard.svelte` mirrors `MobileAnalyticsDashboard` / `SearchConsolePanel`.

**Scope of 2a:** account + media metrics + dashboard + AI advice. **Deferred to 2b:** comment fetch + AI comment replies (needs `instagram_business_manage_comments`), Stories, DMs.

## Global Constraints

- **Instagram Login API only.** All Graph calls use base `https://graph.instagram.com` and the account's long-lived token from `SocialAccount.encryptedTokens` (`{ accessToken, igUserId }`, set by the Phase-1 OAuth callback). No Facebook Page, no `graph.facebook.com`.
- **New OAuth scope required:** `instagram_business_manage_insights` must be added to the OAuth request (Task 1). Existing connected accounts must RECONNECT to grant it; until then sync returns no insights (handle gracefully, surface a "reconnect for analytics" state).
- **Metric volatility:** Meta deprecated several insight metrics in Jan 2025 (Graph v21): `impressions` (use `reach`/`views`), time-series `profile_views`, `website_clicks`, etc. The sync must request a conservative valid set and **tolerate per-metric failures** (a 400 on one metric must not fail the whole sync — request metrics individually or in small groups and skip failures, logging which were dropped).
- **Token storage** stays AES-256-CBC via the existing `SocialService` decrypt path; the instagram module reads accounts via Prisma + decrypts with the shared crypto util.
- **Plan throttling** (mirror google-play): FREE → account metrics once/day; PRO → account + media every 6h; ENTERPRISE → hourly.
- **Cron failure notifications:** wire the sync into `CronFailureNotifier` (becomes the next monitored cron).
- **i18n:** `instagram.*` namespace in en/pl/ru, structurally identical.
- **GitHub artefacts in English.**

## File Structure

- Modify `apps/api/src/meta-oauth/meta-oauth.service.ts` + controller + specs — add `instagram_business_manage_insights` scope.
- `packages/database/prisma/schema.prisma` — `InstagramAccountMetrics`, `InstagramMedia` models + migration.
- `apps/api/src/instagram/instagram.module.ts`
- `apps/api/src/instagram/instagram-sync.service.ts` — pull + persist (cron lives here or in a `.cron.ts`).
- `apps/api/src/instagram/instagram.service.ts` — read metrics for the API, trigger manual sync, generate advice (calls ai-agent).
- `apps/api/src/instagram/instagram.controller.ts` — `GET /instagram/status`, `GET /instagram/metrics`, `POST /instagram/sync`, `POST /instagram/advice`.
- `apps/api/src/instagram/instagram-graph.util.ts` — thin `graph.instagram.com` client (account insights, media list, media insights) with per-metric tolerance.
- `apps/ai-agent/src/agents/instagram-advice-agent.ts` + route wired into the express server.
- `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte` + placement on the project analytics page (shown when an IG account is linked to the project).
- `packages/i18n/src/locales/{en,pl,ru}.json` — `instagram.*`.

---

### Task 1: Add the insights scope to OAuth

**Files:** `apps/api/src/meta-oauth/meta-oauth.service.ts`, `meta-oauth.controller.ts`, both specs.

- [ ] Add `instagram_business_manage_insights` to `INSTAGRAM_SCOPES` in `meta-oauth.service.ts`.
- [ ] Update the controller callback's stored `scopes` array to include it.
- [ ] Update `meta-oauth.service.spec.ts` scope assertion to expect `instagram_business_manage_insights`.
- [ ] Run `cd apps/api && pnpm test -- src/meta-oauth`; commit `feat(meta-oauth): request instagram_business_manage_insights scope`.

> Manual (Meta side, documented in PR body): enable this permission under the app's "Permissions and features"; connected users must reconnect to grant it.

---

### Task 2: Prisma models for IG analytics

**Files:** `packages/database/prisma/schema.prisma`, migration.

- [ ] Add models (then `cd packages/database && pnpm db:migrate:dev --name instagram_analytics`; `pnpm db:generate`):

```prisma
model InstagramAccountMetrics {
  id              String   @id @default(cuid())
  socialAccountId String
  date            DateTime @db.Date
  followersCount  Int?
  reach           Int?
  views           Int?           // replaces deprecated "impressions"
  accountsEngaged Int?
  totalInteractions Int?
  createdAt       DateTime @default(now())
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  @@unique([socialAccountId, date])
  @@index([socialAccountId])
  @@map("instagram_account_metrics")
}

model InstagramMedia {
  id              String   @id @default(cuid())
  socialAccountId String
  igMediaId       String
  mediaType       String   // IMAGE | CAROUSEL_ALBUM | VIDEO | REELS
  caption         String?  @db.Text
  permalink       String?
  timestamp       DateTime
  likeCount       Int?
  commentsCount   Int?
  reach           Int?
  saved           Int?
  shares          Int?
  views           Int?
  engagementRate  Float?
  lastSyncedAt    DateTime
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  @@unique([socialAccountId, igMediaId])
  @@index([socialAccountId])
  @@map("instagram_media")
}
```
- [ ] Add the back-relations on `SocialAccount` (`instagramMetrics InstagramAccountMetrics[]`, `instagramMedia InstagramMedia[]`).
- [ ] Commit `feat(db): Instagram analytics models`.

---

### Task 3: `instagram-graph.util.ts` — graph.instagram.com client

Pure-ish functions with their own unit tests (mock `fetch`). Per-metric tolerance is the key behavior.

- [ ] `fetchAccountProfile(igUserId, token)` → `GET /{id}?fields=followers_count,media_count` → `{ followersCount, mediaCount }`.
- [ ] `fetchAccountInsights(igUserId, token)` → `GET /{id}/insights?metric=reach,views,accounts_engaged,total_interactions&period=day&metric_type=total_value` → returns a partial `{ reach?, views?, accountsEngaged?, totalInteractions? }`; on a non-ok response for the batch, retry metrics one-by-one and skip the failing ones (log dropped metric names). Returns `{}` if all fail.
- [ ] `fetchMediaList(igUserId, token, limit=25)` → `GET /{id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=…`.
- [ ] `fetchMediaInsights(mediaId, token, mediaType)` → `GET /{mediaId}/insights?metric=reach,saved,shares,views` (metrics vary by type — tolerate failures). 
- [ ] Tests assert: correct URLs/params, per-metric fallback skips a failing metric and keeps the rest. Commit `feat(instagram): graph.instagram.com client util with per-metric tolerance`.

---

### Task 4: `instagram-sync.service.ts` + cron

Mirror `google-play-sync.service.ts`.

- [ ] For each org's INSTAGRAM `SocialAccount` (status ACTIVE), decrypt `{ accessToken, igUserId }`; if missing the insights scope or a 401/OAuthException → flip to `REAUTH_REQUIRED` + `CronFailureNotifier.report` (errorCode `IG_TOKEN_EXPIRED`), skip.
- [ ] Account sync: profile + insights → upsert `InstagramAccountMetrics` for today (`@@unique[socialAccountId,date]`).
- [ ] Media sync (PRO/ENTERPRISE): list latest ~25 → per media insights → upsert `InstagramMedia` (+ compute `engagementRate = (likeCount+commentsCount+saved)/reach`).
- [ ] Cron `@Cron('0 * * * *')` with plan throttling (FREE daily account-only; PRO 6h; ENTERPRISE hourly). Skip-if-recent like google-play.
- [ ] Unit test: mocks the graph util + Prisma; asserts upserts + REAUTH handling + plan throttle. Commit `feat(instagram): hourly metrics sync with plan throttling`.

---

### Task 5: `instagram.service.ts` + `instagram.controller.ts` + module

- [ ] `GET /instagram/status?projectId` → `{ connected, accountName, lastSyncAt, insightsGranted }` (insightsGranted = scope present on the account).
- [ ] `GET /instagram/metrics?projectId&days=28` → account daily series + top/bottom media by engagement.
- [ ] `POST /instagram/sync?projectId` → manual sync (rate-limited / skip-if-recent).
- [ ] `POST /instagram/advice?projectId` → calls ai-agent (Task 6).
- [ ] `ProjectAccessGuard` on all; resolve the IG `SocialAccount` linked to the project via `ProjectSocialAccount`.
- [ ] Register `InstagramModule` in `app.module.ts`. Controller spec for status/metrics shape. Commit `feat(instagram): analytics module endpoints`.

---

### Task 6: `instagram-advice-agent.ts` (ai-agent)

Mirror `seo-advice-agent.ts`.

- [ ] Input: `{ project, period, account: {followers, reach, views, growth}, topPosts[], worstPosts[], postingTimes[], language }`.
- [ ] Output markdown: **Performance**, **What to post next** (topics/formats/hashtags from what worked), **When to post** (from post timestamps + engagement). If no data → say so plainly.
- [ ] Express route `POST /generate-instagram-advice`; `instagram.service` calls it. Prompt test. Commit `feat(ai-agent): instagram advice agent`.

---

### Task 7: `InstagramAnalyticsDashboard.svelte` + analytics page placement

Mirror `MobileAnalyticsDashboard` / `SearchConsolePanel`.

- [ ] Shown on the project Analytics page when an IG account is linked (not gated by projectType).
- [ ] Sections: Overview (followers/reach/views trend — Chart.js), Posts & Reels (best/worst, engagement table), AI advice card (markdown + "continue in chat"). Auto-sync if stale; period selector 7/28/90.
- [ ] "Reconnect for analytics" banner when `insightsGranted=false`.
- [ ] i18n `instagram.*` en/pl/ru. Vitest for connection-state branching. Commit `feat(web): Instagram analytics dashboard`.

---

## Out of scope / manual

- Comment fetch + AI replies (`instagram_business_manage_comments`) → Phase 2b.
- Meta App Review for the insights permission before non-test users get data.
- Live verification: reconnect a real IG Business account (with insights granted) and confirm metrics populate — mocked tests can't validate live metric names given Meta's churn.

## Verification

- `cd apps/api && pnpm test -- src/instagram src/meta-oauth` green; api + web build clean.
- Manual: reconnect IG with insights scope → `POST /instagram/sync` → dashboard shows account trend + posts + AI advice.
