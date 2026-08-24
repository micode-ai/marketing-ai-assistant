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

### The order, and why it looks blocked

The portal makes this feel circular: adding products asks you to complete App details, and App details demands a demo video you cannot record until the products are added. The **sandbox** breaks the loop.

App review is not what makes the integration work — it is what lets strangers use it. The client key and secret exist from the moment the app is created; products and scopes work immediately inside a sandbox for accounts listed as target users; review moves the app out of the sandbox, lifting both the "your own accounts only" limit and the forced `SELF_ONLY` visibility.

The submission form says so itself: "If your app has not been approved before, you are required to use a sandbox environment to demonstrate the integration." TikTok expects the integration to be working *before* you submit.

Hence the order: **sandbox → products and scopes inside it → keys on the server → connect and test-post → record the video → only then App review**. The "Please fill out the required field" errors appearing on every field at once are submit-time validation, not save-time.


### Step 1 — Register the app

In the [TikTok Developer Portal](https://developers.tiktok.com), create an app.

**Basic information — ready-made values:**

| Field | Value |
|-------|-------|
| App name | `eMarketingAI` |
| App icon | 1024 × 1024 px, JPEG/JPG/PNG, up to 5 MB; square, no transparency |
| Category | closest to marketing / business productivity (affects internal classification only) |
| Description | `Plan, create and publish marketing content, then track how your TikTok videos perform - all in one workspace.` — 109 of 120 characters |
| Terms of Service URL | `https://emarketingai.pl/terms` |
| Privacy Policy URL | `https://emarketingai.pl/privacy` |
| Platforms | **Web** only, website `https://emarketingai.pl` |

The description is shown to the user **on the consent screen** — it is what they read while deciding whether to grant access. Both legal URLs are mandatory for apps created after 9 September 2024, and both must open without a login.

Then add three products:

| Product | What to configure inside it | Why it is needed |
|---------|-----------------------------|------------------|
| **Login Kit** | Platform → switch **Web** on, then Redirect URI: `https://emarketingai.pl/api/tiktok/callback` | OAuth itself — nothing else works without it |
| **Content Posting API** | Nothing to fill in. Leave the Direct Post switch, if present, **off** — the app publishes to drafts by default. Domain verification for `https://emarketingai.pl/` is needed only for photo posts | The `/v2/post/publish/*` endpoints |
| **Display API** | No settings — the product is simply added | `/v2/user/info/` and `/v2/video/list/` — the analytics tab |

The portal issues the Client key and Client secret itself — nothing to fill in there; they are copied from here onto the server (step 4).

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

The input field only appears **once the Web toggle is switched on inside the Login Kit block** — before that the portal shows "Turn on Configure for Web to add your redirect URIs" and there is nowhere to paste it.

This is `API_URL` + `/api/tiktok/callback`. Precision matters twice: TikTok validates the URI on redirect *and* again during the code exchange, because `exchangeCode` sends the same `redirect_uri`. A mismatch of even a trailing slash yields `invalid_grant` **after** the user has already consented, which looks like "it went through but nothing connected".

### Step 3 — Sandbox and target users

A sandbox is an environment for trying the integration out without submitting the app for review. Create one and add the account you intend to publish from as a **target user** (up to 10 accounts). Without this the Connect step fails with no useful reason.

A sandbox has **its own App details and its own set of products**, configured separately from the production app and without a demo video. That is why products and scopes are added here rather than in the review form.

Check **which key pair** you put on the server: the sandbox is configured separately and its credentials are not interchangeable with the production ones. The symptom of a mismatch is coming back from TikTok with `?tiktok=error&reason=exchange_failed`.

**Scopes in a sandbox.** Five are granted: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.upload`. **`video.publish` is not available in a sandbox at all.** And TikTok rejects the entire authorize request if it asks for even one scope the app does not have — the consent screen fails with `scope` and no account can be connected. So while working against a sandbox, set on the server:

```
TIKTOK_SCOPES="user.info.basic,user.info.profile,user.info.stats,video.list,video.upload"
```

Remove the variable after approval and all six are requested again. The code is built for this: the callback stores the scopes TikTok actually granted rather than the requested ones, and the analytics tab gates on `user.info.stats` + `video.list`.

**A limitation worth knowing up front:** a sandbox does not offer Content Posting API access for public videos. Direct posting to a profile therefore cannot be demonstrated from it — the recording will show the drafts path (`video.upload`). This does not block submission: the explanation text in step 6 states plainly that `video.publish` only switches on after approval, so the reviewer sees a consistent story.

### Step 4 — Server configuration

Add to `/opt/marketing-ai/.env.production`:

```
TIKTOK_CLIENT_KEY=<client key from the portal>
TIKTOK_CLIENT_SECRET=<client secret>
TIKTOK_DIRECT_POST_ENABLED=false
```

**Editing the file alone changes nothing** — a running container reads its environment only when it is created. Recreate the api service:

```bash
cd /opt/marketing-ai && docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d --force-recreate api
```

Symptom of skipping this: the variables are in the file, but `docker ps` reports `Up 13 days` — the process never saw them and `/tiktok/auth-url` keeps returning 503. Verify the process environment, not the file (the deploy pipeline does **not** health-check the api):

```bash
docker exec marketing-ai-api-prod printenv | grep TIKTOK_   # all three must be here
docker ps                      # marketing-ai-api-prod must be Up, not Restarting
curl -o /dev/null -w '%{http_code}\n' https://emarketingai.pl/api/users/me   # expect 401
```

`GET /tiktok/capabilities` returns `{configured, directPost}`. Before this step it reports `configured: false` and the Connect button surfaces an explanatory 503 rather than a dead redirect.

### Step 5 — Connect the account

`/settings/integrations` → **Connect TikTok** → authorize. On success the account appears with a green "Connected" badge and the project analytics page grows a TikTok tab.

### Step 6 — Submit for review

The last step, and only once the integration actually works in the sandbox: before that there is nothing to record in the demo video.

**Explanation.** The field "Explain how each product and scope works within your app or website" is filled in per product, 1000 characters each. Ready-made texts — the reviewer compares them against the demo video, so each one states which user action triggers the call and exactly which fields are read:

Login Kit (873 characters):

```
Login Kit is how a user connects their own TikTok account to eMarketingAI. In Settings > Integrations the user presses "Connect TikTok" and is redirected to TikTok's authorization page. After they approve, TikTok returns to our callback and we store the resulting tokens encrypted (AES-256).

user.info.basic: we read the open ID to identify the connected account, plus display name and avatar, so the user can see at a glance which TikTok account is linked - in the integrations list and in the analytics header.

user.info.profile: we read the username to build links to published videos (tiktok.com/@username/video/ID), so the user can open a post they published from our app.

We do not use this data for advertising, do not sell it and do not share it with third parties. The user can disconnect at any time in Settings > Integrations, which deletes the stored tokens.
```

Content Posting API (932 characters):

```
Content Posting API publishes content the user has already created in eMarketingAI to their own TikTok account. The user opens a post, presses Publish and selects the connected TikTok account, or schedules it for later. Nothing is ever sent to TikTok without that explicit action.

Before every publish we call creator_info/query and respect what it returns: we only use a privacy level the creator allows, and we mirror their comment, duet and stitch settings instead of overriding them.

video.upload: our default mode - the video is uploaded to the creator's TikTok inbox as a draft, and the creator reviews, finishes and publishes it inside the TikTok app.

video.publish: used only if direct posting is enabled after approval - the post goes to the creator's profile, with the caption taken from the content they wrote in our app.

Videos are uploaded in chunks from our server; photo posts are pulled from our verified domain.
```

Display API (889 characters):

```
Display API powers the TikTok tab on our project analytics page. It shows the user how their own TikTok content performs, alongside the same view for their other connected channels.

user.info.stats: we read follower count, following count, total likes and video count to display account KPIs and follower growth.

video.list: we read the user's own videos with title, cover image, share URL, duration, create time and their view, like, comment and share counts. From these we show best and worst performing videos by engagement rate, and a per-video table.

Because the API returns lifetime totals only, we store one dated snapshot per day and derive growth over a period as the difference between snapshots - without that, no trend could be shown at all. Data is fetched at most once an hour, covers only the account the user connected, and is visible only inside their own organization.
```

**Demo video.** mp4 or mov, up to 50 MB, one to five files. End-to-end flow on the `emarketingai.pl` domain: connect the account → create a post → publish → result in TikTok → analytics tab. The key requirement: **every selected product and scope must be visible in the video** — an unused scope that is never demonstrated delays the review. The six scopes above are chosen so each one is genuinely used and visible in the UI.

---

## How connecting works

1. `GET /tiktok/auth-url` — checks the caller is OWNER or ADMIN, then signs a `state` with HMAC over `ENCRYPTION_KEY` (10-minute TTL). The state carries the organization id, so the callback cannot be tricked into attaching the account elsewhere.
2. Redirect to `www.tiktok.com/v2/auth/authorize/`, always with `disable_auto_auth=1`.
   TikTok's default is to skip the authorization page whenever the browser already
   holds a valid session, which silently binds *that* account — so a user connecting a
   second account would get the first one attached without ever seeing which account or
   which permissions were granted. It also makes the consent screen impossible to
   demonstrate in an App Review recording once the app has been authorized once.
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
| `TIKTOK_SCOPES` | unset | Comma-separated scopes to request. Unset requests all six. Needed for a sandbox, which is not granted `video.publish` |
