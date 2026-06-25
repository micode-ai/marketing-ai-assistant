---
id: social-service-god-class
title: 'SocialService handles four platforms in one 624-line class'
status: open
priority: P3
module: 'apps/api'
created_at: 2026-05-12
---

# SocialService handles four platforms in one 624-line class

## What's wrong

`apps/api/src/social/social.service.ts` (624 lines) contains platform-specific publish logic for LinkedIn, Twitter/X, Facebook, and Telegram in a single service class. Each platform has its own OAuth dance, credential decryption, API client setup, and error handling — all interleaved in one file. The class also handles account connection/disconnection and publication history queries.

## Why it matters

Adding a fifth platform (Instagram, YouTube, etc.) means editing an already large file and risking regressions in the other four. The Facebook `OAuthException` reauth-required path (added later for token expiry) had to be woven into the same publish method that handles all platforms. Unit-testing a single platform requires loading the full service with all four platform dependencies mocked. The file will keep growing as platform-specific edge cases accumulate.

## Proposed fix

- Extract a `PlatformPublisher` interface with a `publish(account, content): Promise<PublishResult>` method.
- Create one class per platform: `LinkedInPublisher`, `TwitterPublisher`, `FacebookPublisher`, `TelegramPublisher` in `apps/api/src/social/publishers/`.
- Keep `SocialService` as an orchestrator that delegates to the right publisher based on `account.platform`.
- Move OAuth/callback helpers into platform-specific auth services or keep them in `SocialService` (they are less volatile than publish logic).
- This split also makes it straightforward to add retry or rate-limit logic per platform without a giant switch statement.

## Files involved

- `apps/api/src/social/social.service.ts`
- `apps/api/src/social/social.module.ts`
- `apps/api/src/social/social.controller.ts`
