# TikTok Integration — Design

**Date:** 2026-07-30
**Issue:** [#149](https://github.com/micode-ai/marketing-ai-assistant/issues/149)
**Status:** approved

## Goal

Make TikTok a first-class channel: publish content from the app, read per-post statistics, and show account analytics — matching what Instagram and Threads already do.

## Constraints imposed by TikTok's API

These are platform facts, verified 2026-07-30. They shape most of the design.

| Constraint | Consequence for us |
|---|---|
| A TikTok post always needs video or photos. Text-only is impossible. | `publishToTikTok` fails fast with a clear message when `resolvePublishMedia` returns nothing. |
| Until the API client passes TikTok's Content Posting audit, every post is forced to `SELF_ONLY` and only 5 users may post per 24 h. | Two post modes. `MEDIA_UPLOAD` (drafts) is the default and needs no audit; `DIRECT_POST` is enabled by `TIKTOK_DIRECT_POST_ENABLED` once the audit clears. No code change needed to flip. |
| Photo posts support `PULL_FROM_URL` only — no `FILE_UPLOAD`. | Photo posting requires verifying the `emarketingai.pl` URL prefix in the developer portal. Video uses `FILE_UPLOAD`, which needs no verification and works with locally stored uploads. |
| `creator_info/query/` must be called before publishing and returns the allowed `privacy_level` values plus disabled interactions. | Pre-flight call on every publish; we intersect our desired privacy level with what the creator allows. |
| Access token lives 24 h; refresh token 365 days; a refresh may return a **new** refresh token. | Refresh-on-demand before each API call plus a daily cron. The stored refresh token is always replaced with the newly returned one. |
| Display API exposes only current counters — no daily series, no retention/completion rate, no traffic-source or audience breakdown. | Daily history is accumulated on our side: one snapshot row per account per day, exactly like `InstagramAccountMetrics`. |
| Init endpoints are limited to 6 requests/min per user token. | Publishing is already sequential per account; no extra work, but the sync loop must not fan out per video. |

`TikTok API for Business` (audience demographics, Video Insights Daily) is out of scope: separate portal, separate authorization, business accounts only, 24–48 h lag.

## Architecture

Two vertical slices, one PR each. Both follow the existing Instagram/Threads shape so the code reads like its neighbours.

### Data model

`SocialPlatform` gains `TIKTOK`. The connection itself reuses `SocialAccount` — no new table:

- `accountId` = TikTok `open_id`
- `accountName` = `username`
- `encryptedTokens` = AES-256-CBC `{ accessToken, refreshToken, openId, expiresAt, refreshExpiresAt }`
- `expiresAt` = access-token expiry (24 h), which the refresh cron selects on
- `scopes` = the scope list TikTok actually returned from the token exchange (not a hardcoded list — that mistake cost us the IG/Threads language-wipe incident)

Analytics adds two tables in PR 2:

```prisma
model TikTokAccountMetrics {   // one row per account per day
  socialAccountId, date @db.Date
  followersCount, followingCount, likesCount, videoCount   // profile counters
  views, likes, comments, shares                           // summed over that day's videos
  @@unique([socialAccountId, date])
}

model TikTokMedia {            // latest known state of each video
  socialAccountId, tiktokVideoId
  title, description, coverImageUrl, shareUrl, embedLink, duration, timestamp
  viewCount, likeCount, commentCount, shareCount, engagementRate, lastSyncedAt
  @@unique([socialAccountId, tiktokVideoId])
}
```

Migrations are hand-written and applied with `prisma db execute` + `migrate resolve`, because the shared dev DB has drifted and `migrate dev` wants a reset.

### API — `apps/api/src/tiktok/`

| File | Responsibility |
|---|---|
| `tiktok-oauth.service.ts` | Authorize URL, code exchange, token refresh. Owns the `client_key`/`client_secret` lookup and throws a clear error when unconfigured. |
| `tiktok-api.util.ts` | Pure `fetch` wrappers over the Display + Content Posting endpoints, each taking an explicit access token. Unit-testable with a mocked `fetch`, mirroring `threads-graph.util.ts`. |
| `tiktok-token.service.ts` | `getValidAccessToken(account)` — decrypts, refreshes when the access token is expired or within the skew window, persists the new token pair, flips to `REAUTH_REQUIRED` + reports on failure. Every caller goes through this. |
| `tiktok-token-refresh.service.ts` | Daily cron for accounts whose token expires soon, so a long-idle account is still alive when the user returns. |
| `tiktok-oauth.controller.ts` | `GET /tiktok/auth-url` (OWNER/ADMIN only), `GET /tiktok/callback` (`@Public()`, HMAC-signed `state` with a 10-minute TTL — copied from `meta-oauth.controller.ts`). |
| `tiktok-publish.service.ts` | The publish state machine: `creator_info` → init → upload/poll → resolve share URL. Kept out of `social.service.ts`, which only holds a thin `publishToTikTok` branch, because the flow is materially longer than the Meta ones. |
| `tiktok.service.ts` + `tiktok.controller.ts` | PR 2: `status`, `metrics`, `sync`, `advice` — same signatures as `ThreadsService`. |
| `tiktok-sync.service.ts` | PR 2: hourly cron, plan throttling, snapshot upsert. |

### Publish flow

```
resolvePublishMedia(content)
  ├─ videos[0] present → POST /v2/post/publish/video/init/  (FILE_UPLOAD)
  │                       → PUT chunks to upload_url
  ├─ images present    → POST /v2/post/publish/content/init/ (PHOTO, PULL_FROM_URL)
  └─ neither           → throw "TikTok requires a video or at least one image"
                       ↓
             poll POST /v2/post/publish/status/fetch/ until PUBLISH_COMPLETE
                       ↓
   DIRECT_POST → share URL from the status response; MEDIA_UPLOAD → no URL, post is a draft
```

`post_mode` comes from `TIKTOK_DIRECT_POST_ENABLED`. For `DIRECT_POST` the requested `privacy_level` is `PUBLIC_TO_EVERYONE` when `creator_info` lists it, otherwise the first allowed value — so an unaudited client degrades to `SELF_ONLY` instead of erroring. `MEDIA_UPLOAD` omits `post_info` entirely.

Chunking follows TikTok's rules: a single chunk when the file is under 64 MB, otherwise 10 MB chunks with the remainder folded into the last one. The upload URL is valid one hour, which the sequential publish path never approaches.

### Error handling

One place decides what an error means: `tiktok-api.util.ts` returns TikTok's `error.code` verbatim, and callers map it.

- `access_token_invalid` / `scope_not_authorized` → `REAUTH_REQUIRED` + `CronFailureNotifier.report({ errorCode: 'TIKTOK_TOKEN_EXPIRED' })`, and `social-scheduler` skips re-notifying, exactly as it does for `FB_TOKEN_EXPIRED`.
- `spam_risk_too_many_posts` / `spam_risk_user_banned_from_posting` → surfaced as the publication's `error` string; not a reauth condition.
- `url_ownership_unverified` (photo posts) → explicit message naming the portal verification step, since no amount of retrying fixes it.
- Everything else → the publication row records TikTok's message.

### Frontend

- `/settings/integrations`: a TikTok section mirroring the Threads one, plus the `REAUTH_REQUIRED` reconnect banner that already exists for Facebook. When the server has no TikTok credentials the connect button surfaces the 503 message instead of a dead redirect.
- Project analytics: a `TikTok` tab, shown only when `GET /tiktok/status` reports `connected` — the same gating the Instagram and Threads tabs use.
- `TikTokAnalyticsDashboard.svelte` renders a KPI strip, a views trend chart, and a per-video table. All derivation logic lives in `tiktok-dashboard-state.ts` so it is unit-tested without mounting a component, following `threads-dashboard-state.ts`.
- When `TIKTOK_DIRECT_POST_ENABLED` is off, the publish modal labels TikTok as "sent to drafts" so the user is not left waiting for a post that never appears publicly.
- i18n: `social.tiktok.*` and `tiktok.*` in en/pl/ru.

### Testing

- `tiktok-api.util.spec.ts` — request shapes and error mapping against a mocked `fetch`, including the chunk-count arithmetic.
- `tiktok-token.service.spec.ts` — refresh-on-expiry, refresh-token rotation, `REAUTH_REQUIRED` on failure.
- `tiktok-publish.service.spec.ts` — video path, photo path, no-media rejection, privacy-level degradation, draft mode.
- `social.service.spec.ts` — a TikTok case alongside the existing platform cases.
- `tiktok-sync.service.spec.ts` and `tiktok-dashboard-state.test.ts` in PR 2.

## Out of scope

Comment management, TikTok Shop, ads, the Research API, and TikTok API for Business organic insights.

## Operational follow-ups

1. Register the TikTok app; set `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` in `.env.production`.
2. Verify the `emarketingai.pl` URL prefix in the developer portal — required for photo posts.
3. Submit the client for the Content Posting audit, then set `TIKTOK_DIRECT_POST_ENABLED=true`.
