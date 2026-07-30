# Plan — TikTok connection + publishing (PR 1)

**Spec:** `docs/superpowers/specs/2026-07-30-tiktok-integration-design.md`
**Issue:** [#149](https://github.com/micode-ai/marketing-ai-assistant/issues/149)
**Branch:** `feat/tiktok-publishing`

Analytics (metrics tables, sync cron, dashboard, AI advice) is PR 2 and deliberately absent here.

## Task 1 — Schema: `TIKTOK` platform

- [x] Add `TIKTOK` to `enum SocialPlatform` in `packages/database/prisma/schema.prisma`.
- [x] Hand-write `packages/database/prisma/migrations/20260730120000_tiktok_platform/migration.sql`:
      `ALTER TYPE "SocialPlatform" ADD VALUE 'TIKTOK';`
- [x] Apply non-destructively: `prisma db execute --file … --schema …`, then `prisma migrate resolve --applied 20260730120000_tiktok_platform`, then `pnpm db:generate`.

Verify: `pnpm db:generate` succeeds and `TIKTOK` appears in the generated client enum.

## Task 2 — `tiktok-api.util.ts` (pure, tested first)

- [x] `TIKTOK_OPEN_API = 'https://open.tiktokapis.com'`, `TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/'`.
- [x] `TikTokApiError` carrying TikTok's `error.code`, `message` and `log_id`.
- [x] `parseTikTokResponse(json)` — TikTok returns `{ data, error: { code: 'ok' | … } }`; `code !== 'ok'` throws `TikTokApiError`.
- [x] `queryCreatorInfo(token)` → `{ privacyLevelOptions, commentDisabled, duetDisabled, stitchDisabled, maxVideoPostDurationSec, nickname }`.
- [x] `initVideoUpload(token, { videoSize, chunkSize, totalChunkCount, postInfo })` → `{ publishId, uploadUrl }`.
- [x] `initPhotoPost(token, { photoUrls, coverIndex, postMode, postInfo })` → `{ publishId }`.
- [x] `fetchPublishStatus(token, publishId)` → `{ status, publiclyAvailablePostId, failReason }`.
- [x] `planVideoChunks(videoSize)` → `{ chunkSize, totalChunkCount }`: one chunk under 64 MB, otherwise 10 MB chunks with the remainder folded into the last.
- [x] `fetchTikTokUser(token)` → `open_id`, `username`, `display_name`, `avatar_url` via `GET /v2/user/info/`.

Tests (`tiktok-api.util.spec.ts`, mocked `fetch`): `error.code !== 'ok'` throws with the code preserved; `planVideoChunks` for 10 MB / 64 MB / 150 MB; `initVideoUpload` sends `source_info.source = 'FILE_UPLOAD'`; `initPhotoPost` sends `media_type: 'PHOTO'` and `PULL_FROM_URL`; `queryCreatorInfo` maps snake_case to camelCase.

## Task 3 — `tiktok-oauth.service.ts`

- [x] `creds()` reads `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, throws when absent.
- [x] `getAuthUrl(redirectUri, state)` with scopes `user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload`.
- [x] `exchangeCode(code, redirectUri)` → `POST /v2/oauth/token/` (form-encoded), returns access + refresh tokens, `open_id`, `scope`, both expiries.
- [x] `refreshToken(refreshToken)` → same endpoint with `grant_type=refresh_token`; the returned refresh token replaces the stored one.

Tests: form body contains `client_key`/`client_secret`/`grant_type`; a TikTok error response throws; `scope` is split into an array.

## Task 4 — `tiktok-token.service.ts`

- [x] `getValidAccessToken(account)` — decrypt, return as-is when the access token has more than 5 minutes left, otherwise refresh, re-encrypt, persist `expiresAt`, return the new token.
- [x] On refresh failure: flip `status` to `REAUTH_REQUIRED`, `CronFailureNotifier.report({ cronName: 'tiktok-token-refresh', errorCode: 'TIKTOK_TOKEN_EXPIRED', actionUrl: WEB_URL/settings/integrations })`, rethrow.
- [x] `tiktok-token-refresh.service.ts`: `@Cron('30 4 * * *')` over `platform: 'TIKTOK', status: 'ACTIVE', expiresAt <= now + 7 days`, per-account try/catch.

Tests: fresh token is returned without a network call; expired token triggers refresh and persists the rotated refresh token; failure flips `REAUTH_REQUIRED` and reports once.

## Task 5 — `tiktok-oauth.controller.ts`

- [x] `GET /tiktok/auth-url` — OWNER/ADMIN check, 503 when credentials are missing, HMAC-signed state (reuse the `meta-oauth.controller.ts` sign/verify pair).
- [x] `GET /tiktok/callback` — `@Public()`; verify state, exchange code, fetch the user, `socialService.upsertOAuthAccount` with the scopes TikTok actually returned, redirect to `/settings/integrations?tiktok=connected` (or `?tiktok=error&reason=…`).

Tests: bad state redirects with `reason=bad_state`; success upserts with `platform: 'TIKTOK'` and the returned scopes; missing credentials returns 503.

## Task 6 — `tiktok-publish.service.ts`

- [x] `publish(content, account)`:
      1. `getValidAccessToken`
      2. `resolvePublishMedia` → no media ⇒ `Error('TikTok requires a video or at least one image')`
      3. `queryCreatorInfo`
      4. video ⇒ download the file (local path or URL) → `planVideoChunks` → `initVideoUpload` → `PUT` each chunk with `Content-Range`
         photos ⇒ `initPhotoPost` with absolute URLs (max 35)
      5. poll `fetchPublishStatus` (2 s interval, 60 attempts) until `PUBLISH_COMPLETE`, throwing on `FAILED`
      6. return `{ postId, postUrl }` — `postUrl` empty in draft mode
- [x] `resolvePostMode()` returns `DIRECT_POST` only when `TIKTOK_DIRECT_POST_ENABLED` is truthy.
- [x] `pickPrivacyLevel(options)` — `PUBLIC_TO_EVERYONE` when offered, else the first option, else `SELF_ONLY`.
- [x] Caption: `stripMarkdown(content.body)` truncated to 2200 for video, `title` 90 / `description` 4000 for photos.

Tests: no-media rejection; video path issues init then one `PUT` per chunk; photo path sends `PULL_FROM_URL`; `pickPrivacyLevel` degradation; draft mode omits `post_info`; a `FAILED` status throws with TikTok's `fail_reason`.

## Task 7 — Wire into `social.service.ts`

- [x] Add `TIKTOK` to the `supported` array and a `publishToTikTok` branch delegating to `TikTokPublishService`.
- [x] Extend the reauth detection: TikTok errors carrying `access_token_invalid` / `scope_not_authorized` flip `REAUTH_REQUIRED` and report `TIKTOK_TOKEN_EXPIRED`.
- [x] `TikTokModule` exports the publish service; `SocialModule` imports it (watch for a circular import — TikTok's OAuth controller already imports `SocialModule`, so the publish service must live in a module that does **not** import `SocialModule`, or use `forwardRef`).
- [x] Register `TikTokModule` in `app.module.ts`.
- [x] Add `'tiktok-token-refresh'` to the `CronName` union in `apps/api/src/mail/cron-failure-email.ts` with en/pl/ru labels.
- [x] `publishToAccount` now returns `reported: true` when it already emailed about a token failure, and `SocialSchedulerService` honours that flag. Without it a TikTok (or mid-publish Meta) token error produced two emails, because the existing guard only matched the fixed early-skip message.

Tests: a TikTok publish delegates to the service; a TikTok `access_token_invalid` flips the account and reports; a non-auth TikTok failure does not; the scheduler does not re-notify when `reported` is set.

## Task 8 — Frontend + i18n

- [x] `/settings/integrations`: TikTok card with connect/reconnect, account list, language edit via `PUT /social/accounts/:id` (never `POST`), `?tiktok=connected|error` toast handling, plus the drafts-mode hint when direct post is off.
- [x] `platformIcon` / `platformColor` entries for `TIKTOK`.
- [x] `social.tiktok.{connect,description,draftsMode}` in en/pl/ru.

Verify: `corepack pnpm --filter @marketing-ai/web lint` and `corepack pnpm --filter @marketing-ai/web test`.

## Task 9 — Docs + env

- [x] `.env.example`: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_DIRECT_POST_ENABLED`.
- [x] `CLAUDE.md`: a TikTok subsection under the social integrations notes.
- [x] `user_docs/{eng,pl,ru}`: connecting TikTok and the drafts-vs-public distinction.

## Verification gate before the PR

- [x] `corepack pnpm --filter @marketing-ai/api test -- src/tiktok src/social`
- [x] `corepack pnpm --filter @marketing-ai/api lint`
- [x] `corepack pnpm --filter @marketing-ai/web lint && corepack pnpm --filter @marketing-ai/web test`
- [x] `corepack pnpm build`
- [x] No runtime *value* import of `@marketing-ai/shared-types` anywhere in the new API code (it crash-loops the compiled api).
