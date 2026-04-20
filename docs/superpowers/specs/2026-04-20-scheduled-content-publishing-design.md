---
title: Scheduled Content Publishing to Pre-Selected Social Accounts
date: 2026-04-20
status: draft
---

# Scheduled Content Publishing — Design

## Goal

Let users schedule a content post at creation time. At the chosen date and time, the system auto-publishes that post to a list of social accounts the user pre-selected in the same modal.

## Non-Goals (v1)

- Rescheduling UI after creation (delete + recreate is acceptable for v1)
- Per-language `scheduledAt` (one schedule covers the whole language group)
- Recurring posts
- Automatic retries on failure (single attempt; failure is recorded and surfaced)

## Background

Existing infrastructure that we reuse:

- `Content.scheduledAt: DateTime?` — already in schema; currently only consumed by the calendar view for visualization.
- `ContentPublication { contentId, socialAccountId, platform, status, platformPostId, platformPostUrl, error, publishedAt }` — already used by the immediate `POST /social/publish` flow; supports `PENDING / PUBLISHED / FAILED`.
- Platform strategies in `apps/api/src/social/strategies/` for LinkedIn / Twitter / Facebook / Telegram.
- Project-attached account set, retrievable via `GET /social/project-accounts`.
- Multilingual content grouping via `Content.contentGroupId` and `SocialAccount.language`.
- NestJS `@Cron` already wired (see `agent-schedule.processor.ts`, `email-sequences.service.ts`).

Gap: there is no scheduler that consumes `scheduledAt` to actually publish, and no UI to attach social accounts at content creation time.

## Schema Changes

Single migration:

```diff
 enum ContentStatus {
   DRAFT
   REVIEW
   APPROVED
+  SCHEDULED
   PUBLISHED
   REJECTED
 }
```

No new tables, no new columns. We rely on the existence of `PENDING` rows in `ContentPublication` — joined with `Content.scheduledAt` — to identify work for the scheduler.

## Backend

### `POST /content` — extension

DTO additions (optional fields):

```ts
scheduledAt?: Date;                       // already present
scheduledPublicationAccountIds?: string[]; // new
```

Service behavior when both are provided:

1. Persist content rows as today (one per language for multilingual groups, sharing `contentGroupId`).
2. Set `Content.status = 'SCHEDULED'` on every persisted Content row in the group.
3. For each `socialAccountId` in `scheduledPublicationAccountIds`:
   - Look up the account's `language` (default `'en'` if null).
   - Find the matching Content row in the group whose `language` equals the account's; fallback to the originally created Content if no match (mirrors current `POST /social/publish` logic).
   - Create a `ContentPublication` row with `status = 'PENDING'`, `platform = account.platform`, no `platformPostId/Url` yet.

Validation:
- Reject if `scheduledAt` is set without account IDs (or vice versa).
- Reject if `scheduledAt <= now()` — must be in the future.
- Reject if any `socialAccountId` is not attached to the project (re-use `GET /social/project-accounts` filter logic).

### Scheduler — `apps/api/src/social/social-scheduler.service.ts`

```
@Cron('* * * * *')   // every minute
async processScheduled() {
  const due = await prisma.contentPublication.findMany({
    where: {
      status: 'PENDING',
      content: { scheduledAt: { lte: new Date() } },
    },
    include: { content: true, socialAccount: true },
    take: 50,                     // bound per-tick work
  });

  // Group by contentId → publish in batches per content
  for (const pub of due) {
    try {
      const result = await this.platformStrategies[pub.platform].publish(pub.content, pub.socialAccount);
      await prisma.contentPublication.update({
        where: { id: pub.id },
        data: { status: 'PUBLISHED', platformPostId: result.id, platformPostUrl: result.url, publishedAt: new Date() },
      });
    } catch (err) {
      await prisma.contentPublication.update({
        where: { id: pub.id },
        data: { status: 'FAILED', error: String(err?.message ?? err) },
      });
    }
  }

  // After each Content's PENDING set is drained: if any PUBLISHED, set Content.status='PUBLISHED' + publishedAt; else leave SCHEDULED.
}
```

Notes:
- Single attempt per cron tick. A row that errors transitions to `FAILED` — no automatic retry. Future: a retry policy can re-queue by resetting status to PENDING.
- We bound work per tick (`take: 50`) to avoid runaway batches; remaining due items are picked up the next minute.
- The cron runs in the API process — no new infra. Acceptable for current scale; if it grows we move it to a Bull queue.

### `DELETE /social/publications/:id`

- Auth: organization-scoped (verify the publication's content belongs to the caller's org).
- Only allowed when `status = 'PENDING'`.
- Deletes the row.
- After deletion, if no `PENDING` rows remain for the content AND no `PUBLISHED` rows exist either, set `Content.status = 'DRAFT'`. (If at least one PUBLISHED exists, leave it alone.)

## Frontend

### Create Content modal — `projects/[id]/content/+page.svelte`

Add below the language tabs / body:

- A toggle: **Schedule for later** (off by default).
- When ON, render:
  - `<input type="datetime-local">` bound to local time; convert to ISO/UTC on submit.
  - A multi-select list of project-attached accounts loaded once via `GET /social/project-accounts`. Each item: platform icon, account name, language badge.
  - Hint line: "Will publish to N selected account(s) at <local time>."
- Disable the submit button if scheduled but no accounts selected.

Submit payload (only when toggle is on):

```ts
{
  ...existingFields,
  scheduledAt: <ISO string>,
  scheduledPublicationAccountIds: [...],
}
```

### Content list

- Add a status pill / badge for `SCHEDULED`: clock icon + localized scheduled time.
- "Cancel" button on the badge → opens a confirmation, calls `DELETE /social/publications/:id` for each PENDING publication of that content, then refreshes.

### Calendar

No changes — already renders content by `scheduledAt`.

### i18n

New keys under `content.schedule.*` in `en/pl/ru`:
- `scheduleForLater`
- `scheduledAt`
- `selectAccounts`
- `mustBeFuture`
- `noAccountsSelected`
- `cancelScheduled`
- `cancelConfirm`
- `willPublishAt`

## Data Flow

```
User submits Create Content
        │
        ▼
POST /content { scheduledAt, scheduledPublicationAccountIds }
        │
        ▼
  - create Content rows (per language)  status=SCHEDULED
  - create ContentPublication rows      status=PENDING (language-matched)
        │
        ▼
   ⏱ minute cron tick
        │
        ▼
  find PENDING publications where content.scheduledAt <= now (limit 50)
        │
        ▼
  for each: platform strategy publish → PUBLISHED or FAILED
        │
        ▼
  per content: if any PUBLISHED → Content.status='PUBLISHED', publishedAt set
```

## Error Handling

| Case                                   | Behavior                                                         |
|----------------------------------------|------------------------------------------------------------------|
| `scheduledAt` in the past at submit    | API rejects with 400.                                            |
| Account not attached to project        | API rejects with 400.                                            |
| Account disconnected before fire time  | Strategy throws → row marked FAILED with error message.          |
| Platform API error                     | Row marked FAILED with error message.                            |
| Partial group success (LinkedIn ok, Twitter fails) | Each row independent; Content.status becomes PUBLISHED if any succeeded. UI shows per-row outcome. |
| Two cron ticks racing on same row      | Update is conditional on `status='PENDING'`; second update is no-op. |

## Testing

- Unit: `social-scheduler.service.spec.ts` — pending-row pickup, status transitions, error path.
- Unit: `content.service.spec.ts` — DTO validation, language-matched ContentPublication creation.
- E2E: schedule a content for 1 minute in the future against MailHog/dev social mocks, assert PUBLISHED after one tick.

## Open Questions (resolved)

- Q: New `SCHEDULED` status or rely on `scheduledAt + PENDING` only? → **A: add SCHEDULED status** for cleaner UI queries and badge logic.
- Q: How are accounts selected? → **Q1=A: in the Create Content modal alongside date/time.**
- Q: Multilingual scheduling? → **Q2=A: one `scheduledAt` for the whole group, per-account language matching at publish time.**
