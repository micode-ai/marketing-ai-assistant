# TikTok Integration — Setup and Internals

## Overview

TikTok is a full channel: content is published from the app and account/video statistics are read back. One OAuth authorization covers both — publishing and analytics share the same token.

Everything on the code side is shipped ([#149](https://github.com/micode-ai/marketing-ai-assistant/issues/149), PRs #150 and #151/#152). What remains is configuration: registering an app in the TikTok Developer Portal, putting its credentials on the server, and — only if public posting is required — passing TikTok's Content Posting audit.

**Architecture sketch:**

```
User
 │
 ├─ /settings/integrations      → TikTokOAuthController  → TikTokOAuthService
 │                                (org-scoped)             → SocialService.upsertOAuthAccount
 │
 ├─ publish / scheduler         → SocialService.publishToAccount
 │                                  → TikTokPublishService → TikTokTokenService
 │                                                         → tiktok-api.util
 │
 └─ /projects/[id]/analytics    → TikTokController → TikTokService → TikTokSyncService
      (TikTokAnalyticsDashboard)   (project-scoped)
```

**Key files:**

| Path | Purpose |
|------|---------|
| `apps/api/src/tiktok/tiktok-api.util.ts` | Pure wrappers over the v2 open API + chunk planning |
| `apps/api/src/tiktok/tiktok-oauth.service.ts` | Authorize URL, code exchange, token refresh |
| `apps/api/src/tiktok/tiktok-token.service.ts` | The only source of a valid access token |
| `apps/api/src/tiktok/tiktok-token-refresh.service.ts` | Daily refresh cron (04:30) |
| `apps/api/src/tiktok/tiktok-publish.service.ts` | Publish state machine |
| `apps/api/src/tiktok/tiktok-oauth.controller.ts` | `auth-url`, `callback`, `capabilities` |
| `apps/api/src/tiktok/tiktok-sync.service.ts` | Hourly analytics sync (:15) |
| `apps/api/src/tiktok/tiktok.service.ts` + `tiktok.controller.ts` | Analytics API |
| `apps/ai-agent/src/agents/tiktok-advice-agent.ts` | AI recommendations |
| `apps/web/src/lib/components/analytics/TikTokAnalyticsDashboard.svelte` | Dashboard |
| `apps/web/src/lib/components/analytics/tiktok-dashboard-state.ts` | Cumulative→period maths (tested) |

**Module split.** `TikTokPublishModule` holds the shared services (OAuth, token, publish) and is imported by `SocialModule`; `TikTokModule` adds the controllers and crons and imports `SocialModule`. The split exists because the OAuth controller needs `SocialService` while `SocialService` needs the publish service — keeping the shared services in a module that does *not* import `SocialModule` avoids a circular dependency and the `forwardRef` it would otherwise require.

---

## Setup

### Step 1 — Register the app

In the [TikTok Developer Portal](https://developers.tiktok.com), create an app and add three products:

| Product | Why |
|---------|-----|
| **Login Kit** | OAuth itself — nothing else works without it |
| **Content Posting API** | The `/v2/post/publish/*` endpoints |
| **Display API** | `/v2/user/info/` and `/v2/video/list/` — the analytics tab |

Enable exactly these scopes — they are what `TIKTOK_SCOPES` requests:

| Scope | Used for |
|-------|----------|
| `user.info.basic` | open_id, display name, avatar at connect time |
| `user.info.profile` | username, used to build the post URL |
| `user.info.stats` | follower / like / video counts |
| `video.list` | video list with lifetime counters |
| `video.publish` | direct posting (post-audit) |
| `video.upload` | upload to the creator's drafts |

A scope that is not enabled on the app makes TikTok reject the **authorization request itself** — the user sees the error on the consent screen, before our callback ever runs.

### Step 2 — Redirect URI

Register exactly:

```
https://emarketingai.pl/api/tiktok/callback
```

This is `API_URL` + `/api/tiktok/callback`. Precision matters twice: TikTok validates the URI on redirect *and* again during the code exchange, because `exchangeCode` sends the same `redirect_uri`. A mismatch of even a trailing slash yields `invalid_grant` **after** the user has already consented, which looks like "it went through but nothing connected".

### Step 3 — Sandbox and target users

Until the app passes review it lives in a sandbox: only TikTok accounts added as *target users* (up to 10) can authorize it. Add the account you intend to publish from, otherwise the Connect step fails with no useful reason. TikTok also requires the integration to be demonstrated in the sandbox before the app can be submitted for review.

### Step 4 — Server configuration

Add to `/opt/marketing-ai/.env.production`:

```
TIKTOK_CLIENT_KEY=<client key from the portal>
TIKTOK_CLIENT_SECRET=<client secret>
TIKTOK_DIRECT_POST_ENABLED=false
```

Recreate the containers:

```bash
cd /opt/marketing-ai && docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d --force-recreate
```

Then verify — the deploy pipeline does **not** health-check the api:

```bash
docker ps                      # marketing-ai-api-prod must be Up, not Restarting
curl -o /dev/null -w '%{http_code}\n' https://emarketingai.pl/api/users/me   # expect 401
```

`GET /tiktok/capabilities` returns `{configured, directPost}`. Before this step it reports `configured: false` and the Connect button surfaces an explanatory 503 rather than a dead redirect.

### Step 5 — Connect the account

`/settings/integrations` → **Connect TikTok** → authorize. On success the account appears with a green "Connected" badge and the project analytics page grows a TikTok tab.

---

## How connecting works

1. `GET /tiktok/auth-url` — checks the caller is OWNER or ADMIN, then signs a `state` with HMAC over `ENCRYPTION_KEY` (10-minute TTL). The state carries the organization id, so the callback cannot be tricked into attaching the account elsewhere.
2. Redirect to `www.tiktok.com/v2/auth/authorize/`.
3. `GET /tiktok/callback` — `@Public()`, because TikTok's redirect carries no bearer token. It verifies the state signature, exchanges the code, fetches the profile, and calls `upsertOAuthAccount`.

The account is stored with the scopes TikTok **actually granted**, not the ones requested. A user can decline individual permissions, and `statsGranted` requires both `user.info.stats` and `video.list` — otherwise the analytics tab shows a reconnect banner instead of empty charts.

Callback failures redirect back with a reason:

| `?tiktok=error&reason=` | Meaning |
|---|---|
| `access_denied` | user pressed Cancel on the consent screen |
| `bad_state` | signature mismatch or older than 10 minutes |
| `no_code` | TikTok returned a state without a code |
| `no_tiktok_account` | open_id could not be determined |
| `exchange_failed` | code exchange failed — usually redirect-URI mismatch or a wrong secret |

### Tokens

Access tokens live **24 hours**, refresh tokens **365 days**. Every call goes through `TikTokTokenService.getValidAccessToken`, which refreshes when less than 5 minutes remain and always persists the returned refresh token — TikTok may rotate it, and keeping the old one breaks the next refresh. A daily cron at 04:30 backstops accounts nobody touched.

When the refresh token itself dies, the account flips to `REAUTH_REQUIRED`, owners and admins get an email (`TIKTOK_TOKEN_EXPIRED`), and the scheduler stops retrying with a dead token.

---

## How publishing works

### 1. Media resolution

`resolvePublishMedia` collects images from the markdown body and `mediaUrls`, resolving relative paths against `WEB_URL`. Video is detected **by extension**: `.mp4`, `.mov`, `.m4v`.

> **Known limitation:** `.webm` is not in that list, so such a file is classified as an image and takes the photo path, where it fails. Use mp4.

### 2. Mandatory pre-flight

`POST /v2/post/publish/creator_info/query/` returns the privacy levels the creator allows and the interactions their settings disable. TikTok rejects a publish whose `privacy_level` is not in that list, so `pickPrivacyLevel` takes `PUBLIC_TO_EVERYONE` when offered, otherwise the first allowed value, otherwise `SELF_ONLY` — it degrades instead of erroring.

### 3a. Video — `FILE_UPLOAD`

The file is downloaded into memory (capped at 500 MB — beyond that a clear error, not an OOM) and sliced: a single chunk up to 64 MB, otherwise 10 MB chunks with the count **rounded down** and the remainder folded into the last one. A `ceil()` here produces an init call TikTok rejects. Each chunk is `PUT` with a `Content-Range` header. No domain verification needed — we hand over the bytes ourselves.

### 3b. Photos — `PULL_FROM_URL`

Photos have no `FILE_UPLOAD` equivalent: we pass up to 35 URLs and TikTok fetches them. Hence two requirements — URLs must be `https://`, and the URL prefix must be verified in the developer portal. Non-HTTPS URLs are rejected up front with an explicit message.

### 4. Polling

`status/fetch` every 2 seconds, up to 60 attempts (2 minutes). Success is `PUBLISH_COMPLETE` for a direct post or `SEND_TO_USER_INBOX` for a draft. `FAILED` raises with TikTok's own `fail_reason`.

The result lands in `ContentPublication`. A direct post gets a `tiktok.com/@username/video/<id>` URL; a draft gets none, because the post does not exist yet — the creator finishes it in the app.

### Drafts vs direct posting

`TIKTOK_DIRECT_POST_ENABLED` (default `false`) selects the mode:

| | `MEDIA_UPLOAD` (default) | `DIRECT_POST` |
|---|---|---|
| Endpoint | `/inbox/video/init/` | `/video/init/` |
| `post_info` | not sent at all | title, privacy, interaction flags |
| Result | lands in the creator's TikTok drafts | published to the profile |
| Audit | not required | required |

Direct posting requires TikTok's Content Posting audit: a recorded demo of the whole flow, a privacy-policy URL, and evidence the integration lives inside a finished product. It takes weeks. Until it is granted TikTok forces every post to `SELF_ONLY` and caps how many users may post per 24 hours, so enabling the flag early is pointless. After approval, flip the variable and recreate the containers — no code changes.

### Publish errors

| Message / code | Cause | Action |
|---|---|---|
| `TikTok requires a video or at least one image` | text-only content | TikTok has no text post type — add media |
| `TikTok photo posts require publicly reachable HTTPS image URLs` | http:// or a local path | host the image on the production domain |
| `url_ownership_unverified` | prefix not verified | verify `https://emarketingai.pl/` in the portal |
| `spam_risk_too_many_posts` | TikTok-side rate limiting | wait; the account is not marked broken |
| `access_token_invalid`, `scope_not_authorized` | access revoked | account flips to `REAUTH_REQUIRED`, email sent, reconnect needed |

Separately: **6 init requests per minute** per user token. The scheduler publishes sequentially so it rarely matters, but publishing a dozen posts manually back-to-back can hit it.

---

## How analytics works

### The constraint

The Display API returns **lifetime counters only** — no daily series, no completion rate, no traffic-source or audience breakdown. Three consequences shape the design:

1. A `TikTokAccountMetrics` row is a **cumulative snapshot dated by day**, not a per-day delta. Summing rows would count the same lifetime views once per snapshot, so period figures are `last − first` and the chart plots day-over-day deltas. That maths lives in `tiktok-dashboard-state.ts` (`periodDelta`, `deltaSeries`, `followerChange`) and is unit-tested — including the case where deleting a video *lowers* the counter, which clamps to 0.
2. **History cannot be backfilled.** Unlike the Threads and Instagram syncs there is no `backfillAccount`, because there is nothing to fetch. A freshly connected account genuinely has one data point; the dashboard says so and the trend chart asks for a second day.
3. Watch time, retention, traffic sources and demographics do not exist in the API. The advice prompt forbids inventing them and points at TikTok Studio instead.

### Data model

```prisma
model TikTokAccountMetrics {   // one cumulative snapshot per account per day
  socialAccountId, date @db.Date
  followersCount, followingCount, likesCount, videoCount
  views, likes, comments, shares
  @@unique([socialAccountId, date])
}

model TikTokMedia {            // latest known state of each video
  socialAccountId, tiktokVideoId
  title, description, coverImageUrl, shareUrl, embedLink, duration, timestamp
  viewCount, likeCount, commentCount, shareCount, engagementRate, lastSyncedAt
  @@unique([socialAccountId, tiktokVideoId])
}
```

Migrations: `20260730120000_add_tiktok_platform` (the `TIKTOK` enum value) and `20260730130000_tiktok_analytics`.

### Sync

`@Cron('15 * * * *')`, plan-throttled: FREE once per day, PRO skipped if synced within 6 hours, ENTERPRISE hourly. Per-video metrics run on every plan — plans differ only in frequency. Videos come from 2 pages × 20.

The snapshot's aggregate counters are summed from **stored** `TikTokMedia` rows rather than the current fetch, so a pagination failure halfway through cannot record a phantom drop.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /tiktok/status` | `{connected, accountName, accountId, lastSyncAt, statsGranted}` |
| `GET /tiktok/metrics?days=` | snapshots + best/worst videos |
| `POST /tiktok/sync` | manual sync (10-minute skip-if-recent guard) |
| `POST /tiktok/advice` | generate AI recommendations |
| `GET /tiktok/advice` | last persisted recommendations |

All of these are project-scoped and sit behind `ProjectAccessGuard`. The OAuth routes (`auth-url`, `callback`, `capabilities`) stay org-scoped in a separate controller.

There is deliberately no `periodTotals` field: TikTok has no aggregate-over-a-window endpoint, and inventing one would mean lying about where the number came from.

---

## Verification checklist

1. **After configuring env vars** — `docker ps` shows the api `Up`; the integrations page shows the drafts-mode hint.
2. **After connecting** — the account is listed as Connected; a TikTok tab appears on the project analytics page.
3. **First publish** — use a post with one mp4. Success means a `PUBLISHED` row in the publication history and a draft waiting in the TikTok app.
4. **Analytics** — fills within the hour (cron at :15). Day one shows a single data point with a note that history accrues from the connection date; this is the platform limit, not a failure.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `TIKTOK_CLIENT_KEY` | — | Client key from the developer portal |
| `TIKTOK_CLIENT_SECRET` | — | Client secret |
| `TIKTOK_DIRECT_POST_ENABLED` | `false` | `true` publishes to the profile; `false` sends to drafts |
