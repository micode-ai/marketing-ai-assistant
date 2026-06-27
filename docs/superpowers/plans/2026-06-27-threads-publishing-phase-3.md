# Threads Publishing (Phase 3) Implementation Plan

> SUB-SKILL: superpowers:subagent-driven-development. Part of #92. Design spec: `docs/superpowers/specs/2026-06-26-instagram-threads-design.md`.

**Goal:** Connect a Threads account via OAuth and publish text/image/video posts through the existing `social/` publishing pipeline.

**Architecture:** Mirror the Instagram-Login flow exactly, on Threads endpoints. Extend `meta-oauth` to handle the `THREADS` platform (separate app credentials + threads.net OAuth). Extend `SocialService` with `publishToThreads`. Threads appears automatically in the per-project "Social Networks" selector and the content publish flow. Add a Threads connect card to `/settings/integrations`.

## Global Constraints
- **Threads API:** OAuth authorize `https://threads.net/oauth/authorize` (scope `threads_basic,threads_content_publish`, `response_type=code`); token exchange `POST https://graph.threads.net/oauth/access_token` (returns `{access_token, user_id}`, short-lived 1h); long-lived `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=…&access_token=…` (60 days); profile `GET https://graph.threads.net/me?fields=id,username,threads_profile_picture_url`; publish create `POST https://graph.threads.net/{userId}/threads` (`media_type=TEXT|IMAGE|VIDEO`, `text`, `image_url`/`video_url`) then `POST https://graph.threads.net/{userId}/threads_publish` (`creation_id`). Video needs status polling like IG.
- **Credentials:** `THREADS_APP_ID` / `THREADS_APP_SECRET` (the Threads use-case app id/secret in the Meta app, distinct from FACEBOOK_* and INSTAGRAM_*). Clean 503 when unconfigured.
- **`THREADS` enum** already exists (PR #93) — no migration.
- **Token payload:** `{ accessToken, threadsUserId }`; accountId = threadsUserId, accountName = username.
- **Text limit** 500 chars; Threads ALLOWS text-only posts (unlike Instagram).
- **OAuth state** HMAC-signed (existing); `state.platform` drives the callback branch. OWNER/ADMIN gate (existing).
- GitHub artefacts English.

## Tasks
1. **MetaOAuthService Threads methods** — `getThreadsAuthUrl`, `exchangeThreadsCode` (→`{access_token,user_id}`), `getThreadsLongLivedToken`, `getThreadsUser` (→`{threadsUserId,username,profilePictureUrl}`), reading `THREADS_APP_ID/SECRET`; auth-error throwing like the IG methods. Service spec.
2. **Controller** — `getAuthUrl` accepts `platform ∈ {INSTAGRAM, THREADS}`; per-platform unconfigured guard; `callback` branches on `state.platform`: THREADS → exchangeThreadsCode → getThreadsLongLivedToken → getThreadsUser → `upsertOAuthAccount(platform:'THREADS', tokens:{accessToken, threadsUserId}, scopes:['threads_basic','threads_content_publish'])`. Controller spec.
3. **social.service `publishToThreads`** — add `'THREADS'` to supported list + switch; container→(poll if video)→publish; text from `stripMarkdown` capped 500; image/video from `resolvePublishMedia`; postUrl from `permalink` (GET `/{id}?fields=permalink`). Generalize the Meta token-expiry catch to include `THREADS`. Tests (text post, image post, reauth).
4. **Frontend** — Threads connect card on `/settings/integrations` (mirror Instagram card; `connectThreads()` → `GET /meta/auth-url?platform=THREADS`), `platformIcon/Color['THREADS']`, `?threads=connected|error` toast handling, i18n `social.threads.*` en/pl/ru.

## Out of scope / manual
- Threads analytics (`/threads_insights`) — later.
- Meta-side: get Threads app id/secret, add OAuth redirect URI `https://emarketingai.pl/api/meta/callback` under the Threads use case, App Review for production.

## Verify
- api meta-oauth + social tests green; api + web build clean.
- Live: connect Threads (test user) → publish a text post.
