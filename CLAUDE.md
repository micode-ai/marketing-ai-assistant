# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Setup
```bash
docker compose up -d                                    # Start PostgreSQL (5437), Redis (6380), MailHog (8025)
NODE_OPTIONS="--max-old-space-size=8192" pnpm install  # Large monorepo — needs extra heap
pnpm db:generate && pnpm db:migrate && pnpm db:seed    # Init database
pnpm dev                                                # Run all apps concurrently
```

### Build / Lint / Test
```bash
pnpm build          # Build all apps (Turbo, respects dependency order)
pnpm lint           # ESLint across all apps
pnpm test           # Jest (api, ai-agent) + Vitest (web)
pnpm test:e2e       # E2E (api)

# Run a single test file:
cd apps/api      && pnpm test -- src/path/to/file.spec.ts
cd apps/web      && pnpm test -- src/path/to/file.test.ts
cd apps/ai-agent && pnpm test -- src/path/to/file.spec.ts
```

### Database
```bash
pnpm db:generate          # prisma generate (run after schema changes)
pnpm db:migrate           # prisma migrate deploy (production)
cd packages/database && pnpm db:migrate:dev  # prisma migrate dev (creates migrations)
pnpm db:seed              # Seed demo user: demo@marketingai.app / demo123456
pnpm db:studio            # Prisma Studio UI
```

> `packages/database/.env` must have `DATABASE_URL` — Prisma CLI does not inherit from root `.env`.

## Architecture

### Monorepo Layout
```
apps/web/          SvelteKit 2 — port 5173
apps/api/          NestJS 10   — port 3000 (env: PORT), prefix /api, Swagger at /api/docs
apps/ai-agent/     Express     — port 3001 (env: AI_AGENT_PORT)
packages/
  shared-types/   TypeScript interfaces & enums (AgentType, ChecklistType, etc.)
  database/       Prisma schema + client singleton + seed
  i18n/           EN/PL/RU locale JSON files
  email-templates/ React Email components
  config/         tsconfig.base.json, eslint.config.js, constants
```

### API (NestJS)
- All routes are JWT-protected by default via a global `JwtAuthGuard`.
- Use `@Public()` decorator on any controller/handler to skip auth (login, register, Stripe webhook, OAuth callbacks).
- `PrismaService` extends `PrismaClient` directly (does not wrap it). Imported from `@prisma/client` directly — **not** from the database workspace package — to avoid pnpm type isolation error TS2742.
- `ConfigModule` loads `['../../.env', '.env']` — root `.env` is not in `apps/api/`, hence the relative path.
- Bull queue (`@nestjs/bull`) bridges API → AI Agent: API creates an `AgentRun` record, the processor calls the AI Agent over HTTP.

### AI Agent (LangChain + LangGraph)
- Express server with three routes: `/health`, `/chat`, `/run`.
- **No** `"type": "module"` in `package.json` — Node.js v24 ESM breaks workspace `.ts` imports; CommonJS (tsx) is used.
- `ChatOpenAI` is instantiated inside a `getModel()` function (not at module level) so `OPENAI_API_KEY` is read after the `.env` file loads.
- Has its own local Prisma singleton at `apps/ai-agent/src/prisma.ts` — agents import from `'../prisma'`, not from `@marketing-ai/database`.
- Agents do **not** import from `@marketing-ai/*` workspace packages — use local copies or inline constants.
- Dev script uses `tsx watch --env-file=../../.env` for Node.js v24 native env loading.

### Web (SvelteKit)
- `src/hooks.server.ts` validates the `accessToken` cookie by calling `GET /api/users/me` and attaches the result to `event.locals.user`.
- i18n: `svelte-i18n` with lazy-loaded JSON files from `@marketing-ai/i18n`. Locale stored in `localStorage`. ICU placeholder syntax: `{variable}` (single braces).
- Svelte aliases: `$lib`, `$stores`, `$components`, `$api`.

### Auth Flow
- JWT access token (15 min) + refresh token (7 days) stored in HttpOnly cookies.
- Google OAuth2 via Passport.
- Register automatically creates an `Organization` + `FREE` `Subscription`.

### Database
- Prisma singleton uses the `globalForPrisma` pattern to prevent multiple client instances in development.
- Schema lives in `packages/database/prisma/schema.prisma`; default output path (no custom `output`) to avoid Node.js v24 ESM directory import issues.
- `packages/database/src/index.ts` exports only `{ prisma }`. Apps that need Prisma types import from `@prisma/client` directly.

### TypeScript Configuration
- Base config: `packages/config/tsconfig.base.json` — strict mode, `Node16` module resolution.
- **No** `exactOptionalPropertyTypes` or `noUncheckedIndexedAccess` — incompatible with Prisma-generated types.
- NestJS (`apps/api`) overrides to `CommonJS` / `Node` module resolution and enables `emitDecoratorMetadata` + `experimentalDecorators`.

### Infrastructure (Docker Compose)
| Service    | Host Port | Notes              |
|------------|-----------|--------------------|
| PostgreSQL  | 5437      | internal 5432      |
| Redis       | 6380      | internal 6379      |
| MailHog SMTP| 1025      |                    |
| MailHog UI  | 8025      | http://localhost:8025 |

### Billing Plans (`PLAN_LIMITS` in shared-types)
| Plan       | Projects | AI Gen/mo | Emails/mo | Team | Docs/mo | Integrations |
|------------|----------|-----------|-----------|------|---------|--------------|
| FREE       | 1        | 50        | 100       | 1    | 3       | 0            |
| PRO        | 5        | 500       | 5 000     | 5    | 30      | 3            |
| ENTERPRISE | ∞        | ∞         | 50 000    | ∞    | ∞       | ∞            |

### Agent Types
`CONTENT`, `CHECKLIST`, `DOCUMENT`, `STRATEGY`, `SEO`, `EMAIL`, `ANALYTICS`, `SUPERVISOR`

Content agent supports **multilingual generation**: pass `languages: ['en', 'pl', 'ru']` in input — agent iterates via LangGraph loop (`loadContext → generateContent → reviewQuality → saveContent → switchLanguage → loop`), creating one Content record per language, all linked by `contentGroupId`.

### Uploads Module (`/uploads`)
- Module: `apps/api/src/uploads/` — 3 endpoints.
- `POST /uploads/image` — multipart upload, accepts jpeg/png/webp, max 5 MB.
- `POST /uploads/generate-image` — DALL-E 3 image generation, rate-limited.
- `DELETE /uploads/image/:filename` — delete file.
- Files stored in `uploads/images/`, served via `ServeStaticModule`.

### Multilingual Content
- `Content` model has `language String?` and `contentGroupId String?` (indexed).
- `SocialAccount` model has `language String?` for language-aware publishing.
- Frontend groups content by `contentGroupId` — each group contains one record per language.
- Create/Generate modals support language selection; publish modal is language-aware.

### MarkdownEditor Component
- `apps/web/src/lib/components/MarkdownEditor.svelte` — split-view editor with toolbar.
- Uses DOMPurify for HTML sanitization.
- Supports drag-and-drop image upload (calls `POST /uploads/image`).
- Used on content detail/edit pages.

### Templates System (`/templates`)
- Templates page uses AI agents to generate checklists/documents (not hardcoded content).
- Checklist templates dispatch `POST /agent/run` with `agentType: 'CHECKLIST'`, `input.type` (e.g., `LAUNCH`, `SEO`), and `input.language`.
- Document templates dispatch `POST /agent/run` with `agentType: 'DOCUMENT'`, `input.type` (e.g., `REPORT`, `MARKETING_PLAN`, `COMPETITIVE_ANALYSIS`).
- Frontend polls `GET /agent/runs/:id` until `COMPLETED`, then redirects to checklists/documents page.
- Checklist agent (`checklist-agent.ts`): generates 25-35 items with detailed descriptions (6-10 sentences each), grouped by sections, personalized to project context and language.
- Document agent (`document-agent.ts`): for `REPORT` type, loads real project data (content, campaigns, subscribers, social accounts, checklists) and instructs AI to use only real data.
- `input.language` comes from `svelte-i18n` `$locale` — all generated content is in the user's language.

### AI Chat Context
- Chat page (`/ai-chat`) shows organization + project context in breadcrumb header.
- When selecting an existing session, `currentProjectStore` is restored from the session's `projectId`.
- "New Chat" shows a scope picker: user chooses organization-level or a specific project.
- Session sidebar shows project name (or "Organization chat") under each session title.
- Delete chat shows confirmation modal.

### Getting Started Steps (Project Overview)
- `ai_strategy`: checks `localStorage` flag, prompt is i18n-localized via `projects.gs.aiStrategyPrompt`.
- `first_content`: checks `summary.contentCountAll > 0` (all statuses, not just PUBLISHED).
- `first_checklist`: checks `summary.checklistCount > 0` (checklist existence, not completed items).
- `share_social`: checks `summary.socialAccountCount > 0` (active social accounts in org).

### Analytics Summary API
`GET /analytics/summary` returns: `contentCount` (published), `campaignCount` (active), `subscriberCount` (active), `checklistItems` (completed), `checklistCount` (total checklists), `contentCountAll` (all statuses), `socialAccountCount` (active social accounts).

### Google Play Analytics (Mobile App Projects)
- Module: `apps/api/src/google-play/` — auth, metrics, reviews, sync services + controller with 12 endpoints.
- `ProjectAccessGuard` on all endpoints except `@Public()` OAuth callback.
- OAuth2 + Service Account auth, credentials encrypted AES-256-CBC in `ProjectApiKey` (platform: `GOOGLE_PLAY`).
- OAuth scopes: `androidpublisher`, `playdeveloperreporting`, `devstorage.read_only`.
- `packageName` must be set after OAuth connection (not auto-detected from callback).
- **Data sources:**
  - Reviews — Android Publisher API v3 (`reviews.list`, `reviews.reply`).
  - Crash/ANR rates — Play Developer Reporting API v1beta1 (`crashRateMetricSet`, `anrRateMetricSet`).
  - Installs, ratings, store listing — Cloud Storage CSV exports from Play Console. User must provide GCS bucket URI (`gs://pubsite_prod_rev_XXXX`). Configured via `POST /google-play/config/bucket`.
- AI reply to reviews via ai-agent `POST /generate-reply`.
- **Sync:** Cron `@Cron('0 * * * *')` hourly. PRO skips if < 6h. FREE disabled. Auto-sync on analytics page visit (if stale > 10 min) + periodic refresh every 5 min while on page.
- Frontend: `MobileAnalyticsDashboard.svelte` — tabs: Overview, Stability, Reviews (always); Installs, Store Listing, Revenue (when GCS bucket configured). Shown when `project.projectType === 'MOBILE_APP'`.
- Settings: Google Play section in project settings (only MOBILE_APP) — OAuth/Service Account connection + GCS bucket URI input.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` required. Production uses `.env.production`.
- Dependencies: `googleapis`, `@google-cloud/storage`, `csv-parse` (in apps/api).

### Cron Failure Notifications
- Shared service: `apps/api/src/common/cron-failure-notifier.service.ts`. Provided by (global) `CommonModule` — any cron can inject it.
- Persistence: `CronFailureNotification` table with `@@unique([organizationId, signature])`. Signature is `<cronName>:<resourceType>:<resourceId>:<errorCode>`.
- Dedup: max one email per 24h per signature per organization. Occurrences are incremented on every report; the counter is included in the email.
- Recipients: `OrganizationMember` rows with `role IN (OWNER, ADMIN)` and `joinedAt != null`. Each recipient gets the mail in their own `User.language` (new column, default `en`).
- Wired into all 5 crons: `social-scheduler`, `agent-schedule`, `analytics` (daily aggregation), `email-sequences`, `google-play-sync`.
- Email template: `apps/api/src/mail/cron-failure-email.ts` renders EN/PL/RU strings inline (no new external template package). Exposed via `MailService.sendCronFailure`.
- `setLocale()` in `apps/web/src/lib/i18n.ts` writes the new value to `PUT /users/me { language }` (best-effort — failures are swallowed so unauthenticated pages still switch locales locally).

### Facebook Token Reauth
- `SocialAccountStatus` has a new `REAUTH_REQUIRED` value.
- `SocialService.publishToAccount` early-skips accounts with `status !== 'ACTIVE'` (returns `{ status: 'FAILED', error: 'Account requires reauthentication' }` without calling Graph API).
- When Facebook Graph returns an `OAuthException` (code 190 or `type === 'OAuthException'`), the service flips the account to `REAUTH_REQUIRED` and emits a `CronFailureNotifier.report` with `errorCode: 'FB_TOKEN_EXPIRED'`. `SocialSchedulerService` then does NOT re-notify for that specific failure to avoid double emails.
- UI: `/settings/integrations` shows an orange "Reconnect required" banner + swaps the "Edit" button text for "Reconnect" when a Facebook account is in `REAUTH_REQUIRED`. i18n keys: `social.reauthRequired.{badge,description,cta}` in all three locales.

### TikTok Publishing
- Modules: `apps/api/src/tiktok/`. `TikTokPublishModule` holds the shared services (OAuth, token, publish) and is imported by `SocialModule`; `TikTokModule` adds the OAuth controller + refresh cron and imports `SocialModule`. The split exists to avoid a circular module dependency.
- OAuth v2: authorize on `www.tiktok.com/v2/auth/authorize/`, token + refresh on `open.tiktokapis.com/v2/oauth/token/` (form-encoded). Access token 24 h, refresh token 365 days, and **a refresh can return a new refresh token** which must replace the stored one.
- `TikTokTokenService.getValidAccessToken` is the only way to get a token: refreshes inside a 5-minute skew window, persists the rotated pair, flips to `REAUTH_REQUIRED` + reports `TIKTOK_TOKEN_EXPIRED` on failure. Daily `@Cron('30 4 * * *')` backstop in `tiktok-token-refresh.service.ts`.
- Endpoints: `GET /tiktok/auth-url` (OWNER/ADMIN), `GET /tiktok/callback` (`@Public()`, HMAC-signed state), `GET /tiktok/capabilities` (`{configured, directPost}` — the web app uses this for the drafts-mode hint).
- Publishing (`tiktok-publish.service.ts`): `creator_info/query` pre-flight → video via `FILE_UPLOAD` (chunked `PUT`, count rounded **down** so the last chunk absorbs the remainder) or photos via `PULL_FROM_URL` → poll `status/fetch` until `PUBLISH_COMPLETE` / `SEND_TO_USER_INBOX`.
- **TikTok has no text-only post type** — content without media fails fast. Photo posts are `PULL_FROM_URL` only, so the media URL prefix must be verified in the developer portal; videos need no verification.
- `TIKTOK_DIRECT_POST_ENABLED` (default off) picks `MEDIA_UPLOAD` (lands in the creator's TikTok drafts, no audit needed) vs `DIRECT_POST` (requires passing TikTok's Content Posting audit — before that TikTok forces `SELF_ONLY` and caps posting at 5 users/24 h). `pickPrivacyLevel` degrades to whatever `creator_info` allows rather than erroring.
- Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_DIRECT_POST_ENABLED`.
- Setup runbook (portal products/scopes, redirect URI, sandbox target users, prod env, verification) + internals: `docs/eng/12-tiktok-integration.md` and `docs/ru/12-tiktok-integration.md`. User-facing docs: "TikTok" sections in `user_docs/*/07-social-publishing.md`.

### TikTok Analytics
- Files: `apps/api/src/tiktok/tiktok-sync.service.ts`, `tiktok.service.ts`, `tiktok.controller.ts` (project-scoped, `ProjectAccessGuard`); the OAuth controller stays org-scoped in the same module.
- Endpoints: `GET /tiktok/status` (`{connected, accountName, accountId, lastSyncAt, statsGranted}`), `GET /tiktok/metrics?days=`, `POST /tiktok/sync`, `POST /tiktok/advice`, `GET /tiktok/advice`.
- **Display API returns LIFETIME counters only** — no daily series, no completion rate, no traffic-source or audience split. So `TikTokAccountMetrics` rows are *cumulative snapshots dated by day*, and period figures must be `last − first`, never a sum of rows. `apps/web/src/lib/components/analytics/tiktok-dashboard-state.ts` owns that maths (`periodDelta`, `deltaSeries`, `followerChange`) and is unit-tested; deltas clamp at 0 because a deleted video lowers the lifetime total.
- **No backfill is possible** — history starts at connection time. The dashboard says so (`tiktok.historyStarts`) instead of looking broken, and the trend chart needs ≥2 snapshots.
- Snapshot aggregate counters are summed from stored `TikTokMedia` rows, not from the current fetch, so a partially failed pagination doesn't show a sudden drop.
- Sync: `@Cron('15 * * * *')`, plan-throttled like Threads (FREE once/day, PRO 6h, ENTERPRISE hourly); per-video metrics on all plans. Videos: 2 pages × 20. Token always via `TikTokTokenService.getValidAccessToken`.
- Cron failure codes: `TIKTOK_SYNC_FAILED` (non-auth) — auth errors are reported once as `TIKTOK_TOKEN_EXPIRED` by the token service.
- AI advice: ai-agent `POST /generate-tiktok-advice` (`tiktok-advice-agent.ts`), persisted in `AiAdvice` with `channel: 'tiktok'`. The prompt states figures are already period growth and forbids inventing watch time / completion rate / demographics.
- Frontend: `TikTokAnalyticsDashboard.svelte` + `tiktok-dashboard-state.ts`; `tiktok` channel tab on the project analytics page; TikTok views card in `AnalyticsOverview`. i18n namespace `tiktok.*`.

### SEO Module
- Files: `apps/api/src/seo/seo.service.ts`, `gsc-sync.service.ts`, `competitor-suggestion.service.ts`, `rank-tracking.cron.ts`, `seo.controller.ts`, `seo.module.ts`.
- Endpoints: `GET/POST/PATCH/DELETE /seo/keywords*`, `GET/POST/DELETE /seo/competitors*`, `POST /seo/keywords/sync-from-gsc`, `POST /seo/keywords/:id/rank`.
- GSC integration lives at `apps/api/src/google-integrations/`.
- Schema: `Keyword` (locale, intent, targetRank, currentRank, isTracking, url), `KeywordRankHistory` (keywordId+date unique, rank nullable), `Competitor` (CompetitorStatus: SUGGESTED/ACTIVE/DISMISSED).
- GSC sync: `GscSyncService.syncProject` — queries GSC `searchanalytics.query` for yesterday, matches by query text + host, upserts history. Falls back to `project.websiteUrl` when `keyword.url` is null.
- Daily cron `@Cron('0 3 * * *')`: FREE → top 5 Mondays only; PRO → top 30 daily; ENTERPRISE → top 90 daily.
- i18n namespace: `seo.*` — see `seo.gscConfig.*`, `seo.recordPosition.*`, `seo.searchConsolePanel.*`, `seo.errors.*`.
- Frontend: `apps/web/src/routes/(app)/projects/[id]/seo/` (list + keyword detail with Chart.js); `SearchConsolePanel.svelte` on Analytics page; GSC settings section in project settings.
- Sync result card persisted to `localStorage` per projectId.
- User docs: "SEO and Keywords" section in `user_docs/*/08-advanced-features.md`; technical docs in `docs/eng/11-seo-rank-tracking.md` and `docs/ru/11-seo-rank-tracking.md`.

### Google Integrations
- Module: `apps/api/src/google-integrations/` — `GoogleIntegrationsController`, `GoogleIntegrationsService`.
- OAuth pattern: `GET /api/google/auth-url?projectId=...` returns `{url}` (JSON) — frontend navigates via `window.location.href`. `GET /api/google/callback` is `@Public()` because Google's redirect carries no Bearer token; `state` param carries base64 `projectId`.
- Token storage: one `ProjectApiKey` row per project with `platform = 'GOOGLE'`, `apiKey` = base64 JSON `{accessToken, refreshToken, expiresAt, siteUrl, propertyId}`. Auto-refreshed on 401 via `refreshAccessToken()`.
- Endpoints: `GET /api/google/auth-url`, `GET /api/google/callback` (`@Public()`), `GET /api/google/integration`, `POST /api/google/config`, `DELETE /api/google/integration`, `GET /api/google/gsc/sites`, `GET /api/google/search-console`, `GET /api/google/search-console/summary`.
- Services exposed: `fetchSearchConsoleData`, `listSearchConsoleSites`, `fetchSearchConsoleSummary` (6 parallel queries, 1h in-memory cache), `fetchGA4Report`.
- Known limitation: OAuth app not yet verified by Google; users see "unverified app" interstitial (tracked in issue #70).

### Help System
- `GET /api/help?lang=ru` — list all docs (slug + title). `@Public()`, no auth required.
- `GET /api/help/:slug?lang=ru` — single doc content (slug, title, content, lang). Falls back to English if locale file missing.
- API reads markdown from `user_docs/{eng,pl,ru}/` filesystem.
- `/help` page: sidebar left (article list) + content right (rendered markdown). URL query `?article=slug` for direct links.
- `HelpDrawer.svelte`: 400px slide-in panel from right, triggered by floating `?` button (bottom-right, all pages except `/help`).
- Context mapping in `+layout.svelte`: route regex → doc slug (e.g., `/checklists` → `03-ai-features`).
- Help link at bottom of Sidebar with `?` icon.

## Claude Code Slash Commands

Custom commands for the team. Use as `/command <args>` in Claude Code.

| Command | Role | Description |
|---------|------|-------------|
| `/api` | Backend Dev | NestJS API — endpoints, modules, DTOs, guards, queues |
| `/web` | Frontend Dev | SvelteKit — pages, components, stores, UI patterns |
| `/agent` | AI Engineer | LangChain/LangGraph agents — prompts, graphs, tools |
| `/db` | Database | Prisma schema, migrations, seed, queries |
| `/deploy` | DevOps | Docker, CI/CD, production deploy, infrastructure |
| `/test` | QA | Jest/Vitest — write tests, run tests, fix failures |
| `/i18n` | Localization | Add/update translations in en/pl/ru |
| `/feature` | Full-Stack | Plan & implement features across all layers |
| `/debug` | Troubleshoot | Diagnose and fix issues systematically |
| `/review` | Code Review | Review changes for quality, security, patterns |

### Usage Examples
```
/api add PATCH endpoint to update content tags
/web create a notification dropdown in the header
/agent add competitor monitoring agent
/db add tags field to Content model
/deploy check why production build is failing
/test write unit tests for social service
/i18n add translations for the new webhooks page
/feature implement a content templates marketplace
/debug API returns 500 when creating email campaign
/review review staged changes before commit
```
