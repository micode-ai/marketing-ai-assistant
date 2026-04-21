# Cron Failure Notifications + Facebook Token Reauth

**Date:** 2026-04-21
**Status:** Design
**Scope:** `apps/api`, `packages/database`, `packages/i18n`, `apps/web`

## Problem

Two related issues surfaced on production:

1. **Facebook publishing silently fails.** The scheduled `social-scheduler` cron attempts to publish to a Facebook page, Graph API returns `OAuthException` (code 190 — "An active access token must be used to query information about the current user"), the publication is marked `FAILED`, and the user is never told. The scheduler keeps retrying every minute, spamming the Facebook API with a dead token.
2. **Silent cron failures everywhere.** The user has no visibility into whether any of the 5 background cron jobs succeeded or failed:
   - `social-scheduler` (publish queued content, every minute)
   - `agent-schedule.processor` (scheduled AI agent runs)
   - `analytics.service`
   - `email-sequences.service`
   - `google-play-sync.service`

We need a unified notification mechanism that (a) emails org admins in their preferred language when a cron job fails, (b) deduplicates so a stuck error doesn't produce 1,440 emails per day, and (c) marks Facebook accounts with expired tokens as requiring reauth so the scheduler stops hammering Graph.

## Goals

- Per-user email language preference (persisted).
- Central `CronFailureNotifier` service usable from any cron handler.
- Deduplicated notifications (one email per 24h per unique error signature per organization).
- Facebook token-expired errors are detected and the affected `SocialAccount` is marked `REAUTH_REQUIRED`; the scheduler skips such accounts instead of retrying.
- UI surfaces the "reauth required" state in `/settings/integrations`.
- All 5 existing cron jobs wire up the notifier.

## Non-goals

- Full Facebook OAuth2 flow (separate future issue).
- In-app notifications / webhooks — email only for v1.
- Per-user notification toggle — all OWNER/ADMIN users receive notifications (opt-out can come later).

## Design

### 1. Data model changes (`packages/database/prisma/schema.prisma`)

**New field on `User`:**
```prisma
model User {
  // ...existing fields
  language String @default("en")  // values: "en" | "pl" | "ru"
}
```

Default `en`. Web client writes to `User.language` when the user changes locale (existing locale persistence to `localStorage` is supplemented with a PATCH to `/users/me`).

**New table `CronFailureNotification`:**
```prisma
model CronFailureNotification {
  id              String       @id @default(cuid())
  organizationId  String
  signature       String       // "<cronName>:<resourceType>:<resourceId>:<errorCode>"
  errorSample     String       // last error text, max 2000 chars
  occurrences     Int          @default(1)
  firstSeenAt     DateTime     @default(now())
  lastSeenAt      DateTime     @default(now())
  lastSentAt      DateTime?
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, signature])
  @@index([organizationId])
}
```

**Enum extension `SocialAccountStatus`:**
```prisma
enum SocialAccountStatus {
  CONNECTED
  DISCONNECTED
  EXPIRED            // existing, kept for back-compat
  REAUTH_REQUIRED    // new
}
```

Single migration: `add_user_language_and_cron_failure_notifications`.

### 2. `CronFailureNotifier` service

Location: `apps/api/src/common/cron-failure-notifier.service.ts`. Exported from `CommonModule` and imported by each cron-owning module.

```ts
interface ReportFailureInput {
  organizationId: string;
  cronName: 'social-scheduler' | 'agent-schedule' | 'analytics' | 'email-sequences' | 'google-play-sync';
  resourceType: string;     // 'SocialAccount' | 'AgentRun' | 'Project' | ...
  resourceId: string;
  resourceLabel: string;    // human-readable, e.g. "Facebook: MiCode Page"
  errorCode: string;        // stable token for dedup; e.g. 'FB_TOKEN_EXPIRED'
  error: string;            // full error message
  actionUrl: string;        // deep link users can follow to fix
  projectId?: string;       // if applicable, used for language fallback
}

class CronFailureNotifier {
  async report(input: ReportFailureInput): Promise<void>
}
```

**Behavior:**

1. Build `signature = "<cronName>:<resourceType>:<resourceId>:<errorCode>"`.
2. `upsert` on `CronFailureNotification` with `@@unique([organizationId, signature])`:
   - On insert: `occurrences = 1`, `firstSeenAt = now`, `lastSeenAt = now`, `lastSentAt = null`, `errorSample = error.substring(0, 2000)`.
   - On update: `occurrences = { increment: 1 }`, `lastSeenAt = now`, `errorSample = error.substring(0, 2000)` (always updated to last seen).
3. Decide whether to send:
   - Send if `lastSentAt == null` OR `now - lastSentAt >= 24h`.
4. If sending:
   - Fetch recipients: `User` where membership in `organizationId` has `role IN (OWNER, ADMIN)`.
   - For each recipient: `mail.sendCronFailure({ to, language, ...payload })`.
   - Update `lastSentAt = now`.

Errors inside the notifier itself (mail send failure, DB hiccup) are logged via `Logger` but never thrown — a broken notifier must not cascade into the original cron failing.

### 3. Facebook token-expired detection (`apps/api/src/social/social.service.ts`)

Graph API returns `400` with body shape:
```json
{ "error": { "code": 190, "type": "OAuthException", "message": "...", "error_subcode": 463 } }
```

**In `publishToAccount`:**
```ts
catch (err: any) {
  const data = err?.response?.data;
  const fbErrorCode = data?.error?.code;
  const isTokenExpired = fbErrorCode === 190 || data?.error?.type === 'OAuthException';

  if (isTokenExpired && account.platform === 'FACEBOOK') {
    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: 'REAUTH_REQUIRED' },
    });
    await this.notifier.report({
      organizationId: account.organizationId,
      cronName: 'social-scheduler',
      resourceType: 'SocialAccount',
      resourceId: account.id,
      resourceLabel: `${account.platform}: ${account.accountName || account.accountId}`,
      errorCode: 'FB_TOKEN_EXPIRED',
      error: data?.error?.message || err.message,
      actionUrl: `${WEB_URL}/settings/integrations`,
    });
  }
  // ... existing FAILED return
}
```

**Early skip at the top of `publishToAccount`:** if `account.status !== 'CONNECTED'`, return `{ status: 'FAILED', error: 'Account requires reauthentication' }` without calling Graph. Prevents the scheduler from calling a dead endpoint every minute.

### 4. Email template

Inline HTML in `MailService.sendCronFailure` (matches the style of `sendTeamInvite`). One template, three language variants embedded via a simple `const strings = { en: {...}, pl: {...}, ru: {...} }` map.

Fields rendered:
- Title: "<Cron name> failed" (localized)
- Resource label (e.g. "Facebook: MiCode Page")
- Error message (error sample from DB, monospace block)
- Occurrence count and time of first occurrence
- CTA button → `actionUrl`
- Footer: "You are receiving this because you are an admin of <org>."

### 5. Web changes

- `apps/web/src/lib/i18n.ts`: on locale change, call `PATCH /users/me { language }`.
- `/settings/integrations` account card: when `account.status === 'REAUTH_REQUIRED'`, render orange banner with "Reconnect" CTA (opens existing manual-credentials modal pre-filled with the account's non-secret fields).

### 6. Integration points

| Cron | File | Where |
|---|---|---|
| `social-scheduler` | `apps/api/src/social/social-scheduler.service.ts` | per FAILED pub in the loop |
| `agent-schedule` | `apps/api/src/agent/agent-schedule.processor.ts` | `catch` in job handler |
| `analytics` | `apps/api/src/analytics/analytics.service.ts` | `catch` in cron handler |
| `email-sequences` | `apps/api/src/email-sequences/email-sequences.service.ts` | `catch` in cron handler |
| `google-play-sync` | `apps/api/src/google-play/google-play-sync.service.ts` | `catch` in per-project sync |

Each cron determines its own `resourceType` / `resourceLabel` / `errorCode` based on what failed.

### 7. Testing

- **Unit:** `cron-failure-notifier.service.spec.ts` — signature, upsert, 24h dedup window, recipient filtering (OWNER/ADMIN only).
- **Unit:** extend `social.service.spec.ts` — FB OAuthException → status becomes `REAUTH_REQUIRED`, notifier is called.
- **Unit:** `social-scheduler.service.spec.ts` — if account `status !== CONNECTED`, publication is FAILED and Graph API is NOT called.
- **Manual:** trigger a failure in each cron and confirm one email arrives; trigger twice in a row and confirm no second email until 24h elapses.

### 8. Rollout

Single PR. Migration is additive and safe to apply without downtime. No feature flag — the feature improves observability for everyone.

## Risks

- **Mail cost/volume:** dedup window + OWNER/ADMIN-only scope means per stuck error we send at most 1 email × N admins per 24h. For a typical org with 1–2 admins this is ~2 emails/day/issue — fine.
- **User language drift:** if a user never switches locale, `User.language` stays at default `en`. Acceptable; they can get English notifications until they change preference.
- **Migration of existing `SocialAccount` rows:** no data migration needed — existing rows keep `CONNECTED`; only new FB OAuth failures flip rows to `REAUTH_REQUIRED`.

## Out of scope / follow-ups

- Full Facebook OAuth2 reconnect flow (separate issue — manual page token flow will be documented for now).
- In-app notification center / UI listing of `CronFailureNotification` rows.
- Per-user opt-out from notification types.
