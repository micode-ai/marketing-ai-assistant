---
id: instagram-publishing
title: 'Instagram publishing support'
status: idea
priority: P2
created_at: 2026-05-22
jira_ticket:
---

# Instagram publishing support

## User story
As a social media marketer, I want to publish content directly to Instagram from the platform, so that I can manage all my social channels in one place instead of switching apps.

## Value hypothesis
Instagram is already listed in the platform dropdown in the content publish modal, but the backend throws "not yet supported". Users who select it get a silent failure or an error. Instagram is the highest-traffic visual platform for most marketing teams — supporting it removes a major gap versus competitors.

## Sketch
- Add `INSTAGRAM` case to `social.service.ts` `publishToAccount()` using the Instagram Graph API (requires a Facebook Business account and a connected Instagram Professional account).
- OAuth flow: reuse the existing Facebook OAuth infrastructure (`/social/auth/facebook`) — Instagram auth tokens are obtained via the same Facebook app with `instagram_basic` + `instagram_content_publish` scopes.
- Store `instagramUserId` + access token in `ProjectApiKey` (same AES-256-CBC pattern as Facebook).
- Support single-image posts and carousel posts (for multilingual content variants).
- Add `INSTAGRAM` to the integrations settings page with connect/disconnect card.

## Open questions
- Instagram content publishing API requires image URLs (not uploads) — need to pre-upload to a CDN or use the existing `uploads/images/` serve path.
- Does the Facebook Business account need to be verified/approved for the Graph API scope?
- Story publishing requires a separate API endpoint — scope to feed posts first?

## Cost estimate
4–6 days: OAuth wiring (reusing Facebook path), Graph API integration, UI update, i18n.
