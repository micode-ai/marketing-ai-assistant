# CRM Module — Phase 3: Activities & Tasks — Design

**Date:** 2026-06-29
**Status:** Approved design — ready for implementation planning
**Scope owner:** `packages/database` (schema), `apps/api` (crm module — activities + tasks + timeline + digest cron + mail), `apps/web` (timeline section, tasks page), `packages/i18n`

## Context

Phases 1–2 (live) shipped the CRM foundation (`Contact`/`Company`, PR #128) and the sales pipeline (`Deal`/`PipelineStage` + won→revenue, PR #132). Phase 3 adds the **activity log and tasks**: a timeline of what happened with each contact/deal (notes, calls, emails, meetings) and a real to-do list with due dates, an assignee, a "today" view, and a daily email digest so reps actually get reminded.

This is Phase 3 of the phased CRM (Phase 4 = AI sales layer — out of scope here).

## Approved decisions

| Decision | Choice |
|---|---|
| Model | **Two entities** — `Activity` (immutable log: note/call/email/meeting) + `Task` (to-do: title, due date, assignee, status). |
| Reminders | **UI "today/overdue" views + a daily email digest** to the assignee (reusing the existing `MailService` + `@Cron` + `CronFailureNotifier`). |
| Plan gating | **None** — activities/tasks are core CRM and cheap; available on all plans. |
| Entity links | `Activity`/`Task` optionally link to a contact, deal, and/or company (`onDelete: SetNull` — the log survives if the linked entity is deleted). |

## Non-goals (Phase 3)

- Auto-capturing real emails/calls (no inbox/telephony integration — activities are logged manually).
- Task priorities, recurring tasks, sub-tasks, reminders at arbitrary times (only the daily due/overdue digest).
- The AI sales layer (Phase 4).
- Per-task individual reminder emails (the cron sends one daily digest per assignee, not one email per task).

---

## 1. Data model (`packages/database/prisma/schema.prisma`)

Two new models + two enums + back-relations. Migration is **additive**. (`Activity` and `Task` model names + the `activities`/`tasks` table names are confirmed free.)

```prisma
enum ActivityType {
  NOTE
  CALL
  EMAIL
  MEETING
}

enum TaskStatus {
  OPEN
  DONE
}

model Activity {
  id         String       @id @default(cuid())
  projectId  String
  type       ActivityType
  body       String
  occurredAt DateTime     @default(now())
  ownerId    String?
  contactId  String?
  dealId     String?
  companyId  String?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  owner   User?    @relation("ActivityOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  contact Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)
  deal    Deal?    @relation(fields: [dealId], references: [id], onDelete: SetNull)
  company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([contactId])
  @@index([dealId])
  @@map("activities")
}

model Task {
  id          String     @id @default(cuid())
  projectId   String
  title       String
  description String?
  dueDate     DateTime?
  status      TaskStatus @default(OPEN)
  completedAt DateTime?
  ownerId     String?
  contactId   String?
  dealId      String?
  companyId   String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  owner   User?    @relation("TaskOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  contact Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)
  deal    Deal?    @relation(fields: [dealId], references: [id], onDelete: SetNull)
  company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)

  @@index([projectId, status])
  @@index([ownerId, dueDate])
  @@index([contactId])
  @@index([dealId])
  @@map("tasks")
}
```

Back-relations to add: `Project` (`activities Activity[]`, `tasks Task[]`), `User` (`activities Activity[] @relation("ActivityOwner")`, `tasks Task[] @relation("TaskOwner")`), `Contact` (`activities Activity[]`, `tasks Task[]`), `Deal` (`activities Activity[]`, `tasks Task[]`), `Company` (`activities Activity[]`, `tasks Task[]`).

## 2. Timeline (contact + deal detail)

`GET /crm/timeline?contactId=<id>` (or `?dealId=<id>`) returns a single merged, date-descending list combining the entity's `Activity` rows and `Task` rows. Each item is normalized to `{ kind: 'activity' | 'task', id, date, … }` where `date` = the activity's `occurredAt` or the task's `dueDate ?? createdAt`. The web renders this as a timeline section on the contact-detail and deal-detail pages, each item showing its type icon, body/title, owner, and date. Computed in the service (two queries + merge/sort), not in the DB.

## 3. "Today" tasks dashboard

A CRM page `/crm/tasks` shows the **current project's** tasks the user cares about, grouped:
- **Overdue** — `status: OPEN`, `dueDate < startOfToday`.
- **Today** — `status: OPEN`, `dueDate` within today.
- **Upcoming** — `status: OPEN`, `dueDate > endOfToday` (or no due date, listed last).

Each row supports a one-click **complete** (sets `status: DONE`, `completedAt: now`). A filter toggles "my tasks" (`ownerId = me`) vs all project tasks. `GET /crm/tasks/summary` returns `{ overdue, today, upcoming }` counts for a badge. "Today" boundaries are computed in UTC day terms server-side (consistent with the analytics/cron code).

## 4. Daily email digest (`@Cron`)

A daily cron (e.g. `@Cron('0 7 * * *')`) in a `TaskDigestService`:
- Iterate `ACTIVE` projects. For each, load OPEN tasks that are **due today or overdue** (`dueDate <= endOfToday`) with a non-null `ownerId`.
- Group by `ownerId`; for each owner with ≥1 such task, send a digest email to that user (`User.email`) in their `User.language`, listing overdue + today tasks (title, due date, linked contact/deal name).
- Reuse `MailService` — add `sendTaskDigest({ to, language, overdue, today, projectName })`. The email body is rendered inline for EN/PL/RU by a new `apps/api/src/mail/task-digest-email.ts` (mirrors `cron-failure-email.ts`'s `renderCronFailureEmail`). No new external template package.
- Wrap per-project work in try/catch; report cron failures via `CronFailureNotifier.report` (`cronName: 'crm-task-digest'`, add it to the `CronName` union + EN/PL/RU labels in `cron-failure-email.ts`).
- Idempotency: the digest is a once-daily summary keyed on the cron schedule — no per-task dedup needed; a project/owner with no due/overdue tasks gets no email.

## 5. API (`apps/api/src/crm/`)

New `ActivitiesService`, `TasksService`, `TaskDigestService`, `ActivitiesController`, `TasksController`, `TimelineController` (or fold timeline into one of them). All routes `@UseGuards(ProjectAccessGuard)` (class-level), `projectId` query param — mirror the Phase 1/2 controllers. DTOs use `class-validator`, `@IsString()`/`@IsNotEmpty()` for ids and required strings (never `@IsUUID()` — ids are cuid).

**Activities**
| Method | Path | Notes |
|---|---|---|
| GET | `/crm/activities` | filters: `contactId`, `dealId`, `companyId`, `type`; date-desc |
| POST | `/crm/activities` | `{ type, body, occurredAt?, ownerId?, contactId?, dealId?, companyId? }` |
| PATCH | `/crm/activities/:id` | edit body/type/occurredAt |
| DELETE | `/crm/activities/:id` | |

**Tasks**
| Method | Path | Notes |
|---|---|---|
| GET | `/crm/tasks` | filters: `status`, `ownerId`, `scope` (`overdue`/`today`/`upcoming`), `contactId`/`dealId`/`companyId` |
| GET | `/crm/tasks/summary` | `{ overdue, today, upcoming }` counts (optional `ownerId`) |
| POST | `/crm/tasks` | `{ title, description?, dueDate?, ownerId?, contactId?, dealId?, companyId? }` |
| PATCH | `/crm/tasks/:id` | edit fields |
| POST | `/crm/tasks/:id/complete` | `status: DONE`, `completedAt: now` |
| POST | `/crm/tasks/:id/reopen` | `status: OPEN`, `completedAt: null` |
| DELETE | `/crm/tasks/:id` | |

**Timeline**
| Method | Path | Notes |
|---|---|---|
| GET | `/crm/timeline` | `?contactId=` or `?dealId=` → merged activities + tasks, date-desc |

All list/get/mutation methods are project-scoped (`where: { …, projectId }`; `findFirst({ id, projectId })` guard before update/delete; `NotFoundException` on miss).

## 6. Web (`apps/web`, SvelteKit, Iris tokens)

- **Timeline section** on the contact-detail (`crm/contacts/[contactId]`) and deal-detail (`crm/deals/[dealId]`) pages: renders `GET /crm/timeline`, with "Log activity" (type + body + occurredAt) and "Add task" (title + dueDate + owner) modals; activities/tasks created here are pre-linked to that contact/deal. A task row shows a complete checkbox.
- **Tasks page** `/projects/[id]/crm/tasks/+page.svelte`: Overdue / Today / Upcoming groups, "my tasks" toggle, one-click complete, "Add task" modal. A "Tasks" pill in the CRM sub-nav (alongside Contacts/Companies/Deals).
- Reuse the Phase-1 owner picker (`crm-owners.ts`) for assignee selectors and the Phase-1/2 contact/company/deal lookups for entity links. Date formatting via the existing locale. Guarded `projectId` watchers on every page.

## 7. i18n (`packages/i18n`)

New `crm.activities.*` / `crm.tasks.*` namespaces in **en / pl / ru** (exact parity): activity types, task statuses, scope labels (overdue/today/upcoming), timeline labels, modal fields, complete/reopen, the digest-email subject/body strings (added to the inline email renderer, not the JSON, but kept consistent), empty/loading states. The cron-failure label `crm-task-digest` is added in all three locales.

## 8. Testing & verification

- **API unit (Jest, mocked Prisma):**
  - `ActivitiesService`: project-scoped CRUD; list filters (contact/deal/company/type); date-desc.
  - `TasksService`: CRUD; `scope` query → correct `dueDate`/`status` where-clauses for overdue/today/upcoming (UTC day boundaries); `complete` sets `DONE`+`completedAt`; `reopen` clears it; `summary` counts; project scoping.
  - **Timeline**: merges activities + tasks for a contact/deal and sorts date-desc; normalizes each item's `date`.
  - **`TaskDigestService` cron**: groups due/overdue OPEN tasks by `ownerId`; sends one digest per owner in `User.language`; owners with no due tasks get no email; a per-project failure is caught and reported via `CronFailureNotifier`.
  - Controller `ProjectAccessGuard` on every route; DTOs reject `@IsUUID()` (none present).
- **Web (Vitest):** a pure helper for the timeline merge/sort and the task-bucket (overdue/today/upcoming) classification, unit-tested.
- **Build/lint:** `corepack pnpm --filter api build`, `--filter api test -- src/crm`, `--filter api lint`, `--filter web build`, `--filter web lint`. Run the relevant app lint before pushing.
- **Migration:** authored under `packages/database/prisma/migrations/`, additive (2 tables + 2 enums + FKs); applied in prod by the `migrator` on deploy.
- **Manual (after deploy):** open a contact/deal → log a note + add a task with a due date → see them in the timeline; the Tasks page shows the task under Today/Overdue; complete it → it drops off; (next morning) the assignee receives a digest email for any due/overdue tasks.

## 9. File inventory

Create:
- `packages/database/prisma/migrations/<ts>_crm_activities_tasks/migration.sql`
- `apps/api/src/crm/activities.service.ts`, `tasks.service.ts`, `task-digest.service.ts`, `activities.controller.ts`, `tasks.controller.ts`, `timeline.controller.ts`, DTOs, `*.spec.ts`
- `apps/api/src/mail/task-digest-email.ts` (inline EN/PL/RU renderer)
- `apps/web/src/routes/(app)/projects/[id]/crm/tasks/+page.svelte`
- web timeline component(s) + pure-helper modules + Vitest tests

Modify:
- `packages/database/prisma/schema.prisma` (2 models, 2 enums, back-relations on Project/User/Contact/Deal/Company)
- `apps/api/src/crm/crm.module.ts` (register the new services/controllers)
- `apps/api/src/mail/mail.service.ts` (+ `sendTaskDigest`) and `cron-failure-email.ts` (`crm-task-digest` `CronName` + labels)
- contact-detail + deal-detail pages (timeline section)
- CRM sub-nav (Tasks entry)
- `packages/i18n` en/pl/ru (`crm.activities.*`, `crm.tasks.*`)
