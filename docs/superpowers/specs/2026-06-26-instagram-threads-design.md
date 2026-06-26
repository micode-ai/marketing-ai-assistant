# Instagram & Threads — Publishing + Analytics + AI Suggestions

**Status:** Design approved, pending spec review
**Date:** 2026-06-26
**Scope:** Instagram analytics, Instagram publishing (posts/carousels/Reels), Threads publishing — delivered as one feature with a shared Meta OAuth foundation, shipped in phases.

---

## 1. Goal

Add Instagram and Threads to the platform alongside the existing LinkedIn / Facebook / Twitter / Telegram integrations:

1. **Instagram analytics** — connect an Instagram Business/Creator account, sync account- and post/Reel-level metrics on a cron, show a dashboard, and generate AI suggestions.
2. **Instagram publishing** — publish posts, carousels, and Reels via the Content Publishing API.
3. **Threads publishing** — publish text/media via the official Threads API.

All three are Meta platforms and reuse the project's two established patterns: **publishing lives in `social/`** (shared `SocialAccount` + `ContentPublication`), and **analytics lives in a dedicated module with a cron + metrics storage** (`google-play/`, `seo/`).

### Hard constraints / known blockers

- **Meta App Review.** Production access for real users requires Meta App Review on advanced scopes (`instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`, `threads_content_publish`). Until approved, the integration only works for accounts added as app testers/roles. This mirrors the existing unverified-Google-app situation (issue #70). Not a development blocker; it gates production launch.
- **Public HTTPS media.** Meta downloads images/videos from a public HTTPS URL. Production uploads are served publicly — OK. Local dev cannot expose `localhost` to Meta; publishing tests need a tunnel/hosted URL.
- **API rate limits.** Instagram Graph API ≈ 200 calls/hour/user. The sync caps the number of media fetched per run and caches results.

---

## 2. Architecture — module structure

| Concern | Location | Rationale |
|---------|----------|-----------|
| **Meta OAuth (shared)** | new `apps/api/src/meta-oauth/` | One Facebook-Login redirect flow with IG scopes + a separate Threads OAuth. Used by both publishing and analytics — avoids duplication. Mirrors `google-integrations/`. |
| **Instagram publishing** (posts/carousels/Reels) | extend `apps/api/src/social/social.service.ts` | `INSTAGRAM` already in the `SocialPlatform` enum. Add `publishToInstagram()` + switch case. Reuses `SocialAccount` + `ContentPublication`. |
| **Threads publishing** | extend `apps/api/src/social/` | Add `THREADS` to enum + `publishToThreads()`. Container → publish, like IG. |
| **Instagram analytics** | new `apps/api/src/instagram/` (modeled on `google-play/`) | Cron sync, metrics models, insights, controller. Heavier than publishing — owns its module. |
| **Instagram AI advice** | new agent in `apps/ai-agent/` | Modeled on `seo-advice-agent.ts` (analysis + what/when to post) and `generate-reply.ts` (comment replies). |

**Rejected alternatives:**
- *Single `meta/` module* — mixes synchronous publishing (keyed on `SocialAccount`) with cron-driven analytics (separate storage); breaks the project's "social = publishing, separate module = analytics" split.
- *Instagram and Threads as two fully separate from-scratch modules* — duplicates OAuth and publishing; Threads currently needs publishing only.

---

## 3. Data model

### Enums (`schema.prisma` + `packages/shared-types`)
- `SocialPlatform` — add `THREADS` (`INSTAGRAM` already exists).
- `SocialAccountStatus` — reused as-is, including `REAUTH_REQUIRED` (Meta token-expiry logic already written for Facebook).

### Account connection — no new models
Both IG and Threads are rows in the existing `SocialAccount`. Only the encrypted-token payload differs:
- **Instagram:** `{ accessToken, refreshToken, expiresAt, igUserId, pageId }` (long-lived Meta token, auto-refreshed like the Google integration).
- **Threads:** `{ accessToken, expiresAt, threadsUserId }` (separate Threads OAuth).

### Publishing — no new models
Reels/posts flow through the existing `Content` (`mediaUrls[]`, `type`) → `ContentPublication` (`platformPostId`, `platformPostUrl`, `status`). Media type (post / carousel / Reels) is inferred from `mediaUrls` (count + format) with an optional explicit override on the publish input.

### Instagram analytics — new models (modeled on `AppStoreMetrics` / `AppReview`)

```prisma
model InstagramAccountMetrics {   // daily account snapshot — for trend charts
  socialAccountId  String
  date             DateTime
  followersCount   Int?
  reach            Int?
  impressions      Int?
  profileViews     Int?
  websiteClicks    Int?
  // ...
  @@unique([socialAccountId, date])
}

model InstagramMedia {            // post/reel with current metrics — for best/worst lists
  socialAccountId  String
  igMediaId        String
  mediaType        String        // IMAGE | CAROUSEL | REELS | VIDEO
  caption          String?
  permalink        String?
  timestamp        DateTime
  likes            Int?
  comments         Int?
  saved            Int?
  reach            Int?
  impressions      Int?
  videoViews       Int?
  plays            Int?
  engagementRate   Float?
  lastSyncedAt     DateTime
  @@unique([socialAccountId, igMediaId])
}

model InstagramComment {          // comments under posts — for AI replies (like AppReview)
  socialAccountId   String
  igMediaId         String
  igCommentId       String
  username          String?
  text              String
  timestamp         DateTime
  isReplied         Boolean   @default(false)
  aiSuggestedReply  String?
  @@unique([socialAccountId, igCommentId])
}
```

**Deliberately not built now (YAGNI):**
- Per-post daily snapshots — post metrics are largely cumulative; "current value + sync date" suffices. Trends come from `InstagramAccountMetrics`. Add `InstagramMediaMetricHistory` later if per-Reel history is needed.
- Threads analytics models — Threads is publishing-only this round. Add `ThreadsMedia`/`ThreadsMetrics` with the same pattern when Threads analytics lands.

---

## 4. OAuth flow & synchronization

### OAuth (`meta-oauth/`, one-to-one with `google-integrations/`)
- `GET /api/meta/auth-url?projectId=…&platform=INSTAGRAM|THREADS` → `{ url }` (JSON); frontend does `window.location.href`.
- `GET /api/meta/callback` — `@Public()` (Meta redirects without a Bearer token); `state` carries base64 `{ projectId, platform }`.
- **Instagram** (Facebook Login): scopes `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`. After code exchange: short-lived → long-lived token (60 days) → `GET /me/accounts` → find the page's `instagram_business_account` → store `igUserId` + `pageId` in `SocialAccount`.
- **Threads** (its own OAuth on `threads.net` / `graph.threads.net`): scopes `threads_basic`, `threads_content_publish` (+ `threads_manage_replies` / `threads_manage_insights` later). Long-lived token, 60 days.
- **Auto-refresh:** Meta long-lived tokens last 60 days and are refreshable — refresh on schedule and on 401, like `refreshAccessToken()` in the Google integration. On `OAuthException` → status `REAUTH_REQUIRED` (logic already exists from Facebook) + UI "Reconnect" banner.

### Instagram analytics sync (`instagram-sync.service.ts`, modeled on `google-play-sync`)
- Cron `@Cron('0 * * * *')` (hourly), plan throttling: **FREE** — account metrics once/day; **PRO** — account + posts every 6h; **ENTERPRISE** — everything hourly.
- Three parallel sync tasks:
  1. **Account** — `GET /{igUserId}/insights` (reach, impressions, profile_views, …) + `followers_count` → upsert `InstagramAccountMetrics` for the day.
  2. **Posts/Reels** — `GET /{igUserId}/media` → per item `GET /{mediaId}/insights` (likes, comments, saved, reach, plays/video_views) → upsert `InstagramMedia`. Fetch the latest ~25–50 media to respect rate limits.
  3. **Comments** — `GET /{mediaId}/comments` on recent posts → upsert `InstagramComment` for AI replies.
- **On-page auto-sync:** on analytics visit, if data older than ~10 min → `POST /instagram/sync`; periodic refresh every 5 min while the page is open (like `MobileAnalyticsDashboard`).
- **Failure notifications:** wire `instagram-sync` into `CronFailureNotifier` (becomes the 6th monitored cron).

---

## 5. Publishing & AI agents

### Instagram publishing (`publishToInstagram()` in `social.service.ts` + switch)
- **Photo:** `POST /{igUserId}/media` (`image_url`, `caption`) → container → `POST /{igUserId}/media_publish`.
- **Carousel:** child containers (`is_carousel_item=true`) → parent (`media_type=CAROUSEL`, `children=[…]`) → publish.
- **Reels:** `POST /{igUserId}/media` (`media_type=REELS`, `video_url`, `caption`, optional `cover_url`, `share_to_feed=true`) → **poll** `GET /{containerId}?fields=status_code` until `FINISHED` (video processing) → publish.
- **Media type inferred automatically:** video in `mediaUrls` → Reels; multiple photos → carousel; single → post. With an optional explicit override on the publish input. Stories deferred (YAGNI — same container flow, easy later add).
- Caption: strip markdown via existing `content-parser.util`. Respect IG limits (≈2200 chars, ≤30 hashtags).

### Threads publishing (`publishToThreads()` in `social.service.ts` + switch)
- `POST /{threadsUserId}/threads` (`media_type=TEXT|IMAGE|VIDEO`, `text`, `image_url`/`video_url`) → publish `POST /{threadsUserId}/threads_publish`. Video polls like IG. Text limit 500 chars.

### Scheduling — free
Both IG and Threads plug into the existing `social-scheduler` (`ContentPublication` PENDING → cron publishes). Because they live in the shared switch, scheduled posting works immediately.

### AI agents (`apps/ai-agent/`)
1. **`instagram-advice-agent.ts`** (modeled on `seo-advice-agent.ts`) — one agent covers three of the four "suggest" needs since they analyze the same data. Input: account trends + best/worst posts + engagement + post timings. Output: markdown with sections **performance** (what works), **what to post next** (topics/formats/hashtags), **when to post** (timing patterns from post timestamps). Endpoint `POST /generate-instagram-advice`, shown on the dashboard like SEO advice + "continue in chat".
2. **Comment replies** — extend the `generate-reply.ts` pattern → input: comment text + post caption + language → suggested reply. API `POST /instagram/comments/:id/ai-reply` saves to `InstagramComment.aiSuggestedReply` (like the Google Play review AI reply). DM is a separate later phase (Messaging API + webhooks).

---

## 6. Frontend

- **`/settings/integrations`** — Instagram and Threads cards with a "Connect" button → `GET /api/meta/auth-url` → redirect (like Google). Status badge, `REAUTH_REQUIRED` "Reconnect" banner, disconnect.
- **Analytics** — new `InstagramAnalyticsDashboard.svelte` (modeled on `MobileAnalyticsDashboard` / `SearchConsolePanel`), shown when an IG account is connected to the project (not gated by `projectType`). Sections: **Overview** (followers/reach/impressions trends — Chart.js), **Posts & Reels** (best/worst, engagement-rate table), **Comments** (list + AI-reply button), **AI advice** (markdown + "continue in chat"). Auto-sync on staleness + periodic refresh.
- **Publishing** — in the existing publish modal, IG/Threads appear as targets once accounts are connected; for IG the media type is inferred, with an optional small Reels/feed-video selector. Project-account linking already exists.
- **i18n** — `instagram.*` / `threads.*` namespaces in en/pl/ru.

---

## 7. Delivery phases

Each phase = its own GitHub issue (English) + its own PR.

- **Phase 0 — Foundation:** `meta-oauth/` module, `SocialAccount` token payload, `THREADS` enum.
- **Phase 1 — IG publishing:** `publishToInstagram` (posts/carousels/Reels) + publish UI + scheduler.
- **Phase 2 — IG analytics:** `instagram/` module (cron sync, models, controller) + dashboard + `instagram-advice-agent` + comment AI replies.
- **Phase 3 — Threads publishing:** `publishToThreads` + UI.
- **Phase 4 (later):** Threads analytics, IG Stories, IG DM.

---

## 8. Testing

- **api (Jest)** — mock Meta Graph HTTP (nock): container → poll → publish flow for IG/Threads, sync upserts, plan throttling, `OAuthException` → `REAUTH_REQUIRED`.
- **ai-agent (Jest)** — prompt tests for `instagram-advice-agent` and comment replies.
- **web (Vitest)** — dashboard component, branching by connection status.

---

## 9. Environment / config

- Reuse `GOOGLE_CLIENT_ID/SECRET`-style env: `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (already used by Facebook), plus Threads `THREADS_APP_ID` / `THREADS_APP_SECRET`. Redirect URIs registered in the Meta app: `/api/meta/callback`.
- `ENCRYPTION_KEY` (existing) for `SocialAccount` token payloads.
