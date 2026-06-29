# CRM Module — Phase 1: Contacts & Companies — Design

**Date:** 2026-06-29
**Status:** Approved design — ready for implementation planning
**Scope owner:** `packages/database` (schema), `apps/api` (new `crm` module), `apps/web` (project CRM pages), `packages/i18n`

## Context

The app already captures audience and behaviour (`TrackedUser`, `EmailSubscriber`), runs channels (content, email, social, SEO) and analytics (web/IG/Threads/GSC/app, funnels, A/B), and tracks money (`FinanceRecord`). What is missing is a **sales layer**: a place to manage the people and accounts you sell to and move them toward a deal.

The user chose to build a **full CRM module** (deals, contacts, companies, custom pipelines, activities, AI sales layer). A full CRM is too large for one spec, so it is decomposed into phases, each its own spec → plan → implementation:

- **Phase 1 — Contacts & Companies (this spec)** — the foundation everything else builds on.
- **Phase 2 — Deals & Pipelines** — deals, customizable pipelines/stages, Kanban, revenue forecast.
- **Phase 3 — Activities & Tasks** — activity log, reminders, timelines, "today" dashboard.
- **Phase 4 — AI sales layer** — lead/deal scoring, next-step recommendation, AI-drafted outreach, hot-deal prioritization.

This document specifies **Phase 1 only**. Phases 2–4 are out of scope here and are referenced solely so the data model leaves room for them.

## Goal

Give each project a clean, de-duplicated book of **Contacts** (people) and **Companies** (accounts), populated automatically from data the app already collects (identified `TrackedUser` + `EmailSubscriber`) and editable by hand, with team ownership, tags, notes, and CSV import.

## Approved decisions

| Decision | Choice |
|---|---|
| CRM shape | Full CRM, built in phases; this spec = Phase 1 foundation |
| Lead/contact source | Auto from existing data **+** manual **+** CSV import |
| Auto-materialization rule | **Identified only**: `TrackedUser` with an email + all `EmailSubscriber`; dedup by email |
| Company auto-grouping by domain | **Deferred** (Phase 1 companies are manual) |

## Non-goals (Phase 1)

- Deals, pipelines, stages, Kanban (Phase 2).
- Activities, tasks, reminders, timelines (Phase 3).
- AI scoring / next-step / drafted outreach (Phase 4).
- Auto-creating companies from email domains (later nicety).
- Web lead-capture forms / new tracking surfaces.
- Anonymous (no-email) `TrackedUser` rows do **not** become contacts; they surface only once an email is associated.

---

## 1. Data model (`packages/database/prisma/schema.prisma`)

Two new models + two enums. Migration is **additive** (new tables only).

```prisma
enum ContactSource {
  TRACKED_USER
  SUBSCRIBER
  MANUAL
  IMPORT
}

enum ContactStatus {
  ACTIVE
  UNSUBSCRIBED
  ARCHIVED
}

model Contact {
  id                String        @id @default(cuid())
  projectId         String
  email             String?
  firstName         String?
  lastName          String?
  phone             String?
  companyId         String?
  ownerId           String?       // assignee — a User (team member)
  source            ContactSource @default(MANUAL)
  status            ContactStatus @default(ACTIVE)
  tags              String[]      @default([])
  notes             String?
  // behavioural snapshot, copied from the linked TrackedUser when materialized
  trackedUserId     String?
  emailSubscriberId String?
  lastSeen          DateTime?
  firstUtm          Json?
  lastUtm           Json?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  owner   User?    @relation("ContactOwner", fields: [ownerId], references: [id], onDelete: SetNull)

  @@unique([projectId, email])
  @@index([projectId])
  @@index([ownerId])
  @@index([companyId])
  @@map("contacts")
}

model Company {
  id        String   @id @default(cuid())
  projectId String
  name      String
  domain    String?
  website   String?
  notes     String?
  ownerId   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  owner    User?     @relation("CompanyOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  contacts Contact[]

  @@unique([projectId, domain])
  @@index([projectId])
  @@map("companies")
}
```

Back-relations added to `Project` (`contacts Contact[]`, `companies Company[]`) and `User` (`ownedContacts Contact[] @relation("ContactOwner")`, `ownedCompanies Company[] @relation("CompanyOwner")`).

**Notes on the schema**
- `email` is nullable so manual contacts without an email are allowed. Postgres treats `NULL`s as distinct under a unique index, so multiple null-email manual contacts coexist; the `@@unique([projectId, email])` only collapses **real** emails — exactly the dedup we want.
- `@@unique([projectId, domain])` likewise allows many null-domain companies; it dedups only real domains.
- The behavioural snapshot (`lastSeen`/`firstUtm`/`lastUtm`) is **denormalized** onto the contact at materialization time so the contact card renders without a live join back to `TrackedUser`. `trackedUserId`/`emailSubscriberId` keep the provenance link.

## 2. Auto-materialization (`ContactsSyncService`)

`materialize(projectId): Promise<{ created: number; updated: number }>` — idempotent, safe to re-run.

Algorithm (one pass each, both upserting by `(projectId, email)`):

1. **Subscribers:** for every `EmailSubscriber` of the project's email lists with a non-empty `email` and `status` not `UNSUBSCRIBED`, upsert a contact:
   - `create`: `{ email, source: SUBSCRIBER, emailSubscriberId, status: ACTIVE }` (+ name fields if the subscriber carries them).
   - `update`: set `emailSubscriberId`; **do not** overwrite `source` if it is already `MANUAL` or `IMPORT`; **do not** clobber a non-null `firstName`/`lastName`/`phone` with null.
2. **Tracked users:** for every `TrackedUser` of the project with a non-empty `email`, upsert a contact:
   - copy the behavioural snapshot (`lastSeen`, `firstUtm`, `lastUtm`, `trackedUserId`);
   - `create` uses `source: TRACKED_USER`; `update` refreshes the snapshot but never downgrades `source` from `MANUAL`/`IMPORT`/`SUBSCRIBER`.

**Source precedence** (highest wins, never downgraded on update): `MANUAL` = `IMPORT` > `SUBSCRIBER` > `TRACKED_USER`. Rationale: a human-entered or imported record is authoritative over an auto-derived one.

**Merge rule:** never overwrite a non-null human field (name/phone/notes/tags/companyId/ownerId) with a null/empty auto value. Behavioural snapshot fields are always refreshed from the latest `TrackedUser`.

**Triggers:**
- On-demand: `POST /crm/contacts/sync` (called by the contacts page when its data is stale, mirroring the analytics auto-sync staleness pattern).
- Scheduled: a daily `@Cron` in `ContactsSyncService` iterating active projects, wrapped with `CronFailureNotifier.report` on failure (same pattern as the analytics / google-play crons).

## 3. API (`apps/api/src/crm/`)

New module `CrmModule` with `ContactsController`, `CompaniesController`, `ContactsService`, `CompaniesService`, `ContactsSyncService`. Every route is `@UseGuards(ProjectAccessGuard)` (class-level) with `projectId` as a query param, matching the instagram/threads/analytics controllers.

**Contacts**
| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/crm/contacts` | `projectId`, `page?`, `pageSize?`, `search?`, `tag?`, `status?`, `ownerId?` | `{ items: Contact[], total, page, pageSize }` |
| GET | `/crm/contacts/:id` | `projectId` | `Contact` (with `company`) |
| POST | `/crm/contacts` | `{ email?, firstName?, lastName?, phone?, companyId?, ownerId?, tags?, notes? }` | created `Contact` |
| PATCH | `/crm/contacts/:id` | partial of the above + `status?` | updated `Contact` |
| DELETE | `/crm/contacts/:id` | `projectId` | `{ deleted: true }` |
| POST | `/crm/contacts/sync` | `projectId` | `{ created, updated }` |
| POST | `/crm/contacts/import` | multipart CSV, `projectId` | `{ created, updated, skipped, errors: string[] }` |

**Companies**
| Method | Path | Returns |
|---|---|---|
| GET | `/crm/companies` | `{ items: Company[], total, ... }` (with contact counts) |
| GET | `/crm/companies/:id` | `Company` (with `contacts`) |
| POST | `/crm/companies` | created `Company` |
| PATCH | `/crm/companies/:id` | updated `Company` |
| DELETE | `/crm/companies/:id` | `{ deleted: true }` |

**DTO validation:** class-validator DTOs; ids are `cuid()` → use `@IsString() @IsNotEmpty()`, never `@IsUUID()`. `email` validated with `@IsEmail()` when present (optional). `tags` `@IsArray()` of strings.

**CSV import:** parse with `csv-parse` (already an `apps/api` dependency). Expected columns (case-insensitive headers): `email, firstName, lastName, phone, company, tags`. Per row: resolve/create the company by name (within the project), upsert the contact by `(projectId, email)` with `source: IMPORT`, accumulate `created`/`updated`/`skipped` (skipped = no email and no name). Malformed rows are collected into `errors` without aborting the batch.

**Plan gating (`PLAN_LIMITS` in `packages/shared-types`):**
- Contacts cap: **FREE 100, PRO 2 000, ENTERPRISE ∞** — enforced in `ContactsService.create`, `import`, and `materialize` (materialize stops creating new contacts once the cap is hit; existing ones still update; a soft warning is returned).
- **CSV import is PRO+** (FREE returns a `403`/upgrade-required style error from the controller).
- New `PLAN_LIMITS` field: `contacts` (number, `Infinity` for ENTERPRISE). Wire into the existing plan-limit constant and any limits UI the same way other caps are surfaced.

## 4. Web (`apps/web`, SvelteKit, Iris tokens)

- **Sidebar:** add a **CRM** entry in the project navigation (contextual sidebar), pointing to the contacts list.
- **Routes** under `src/routes/(app)/projects/[id]/crm/`:
  - `contacts/+page.svelte` — paginated table (name, email, company, tags, owner, status, last seen), search box, filters (tag / status / owner), "Add contact" modal, "Import CSV" action, "Sync now" button. Uses the project-switch-safe `projectId` watcher pattern (guarded `$:` on `projectId`, not onMount-only) per the documented refetch gotcha.
  - `contacts/[contactId]/+page.svelte` — contact detail: profile fields (editable), behavioural snapshot (visits / first+last UTM from the tracking link), tags, owner, company, notes; archive/delete.
  - `companies/+page.svelte` — company list (name, domain, contact count, owner) + add/edit modal.
  - `companies/[companyId]/+page.svelte` — company detail + its contacts.
- **API client:** add `crm` calls to `$lib/api` alongside the existing per-domain clients.

## 5. i18n (`packages/i18n`)

New `crm.*` namespace in **en / pl / ru** (all three updated together): list/column labels, filters, modal fields, statuses, sources, import result strings, empty states, plan-limit/upgrade messages.

## 6. Testing & verification

- **API unit (Jest, mocked Prisma):**
  - `ContactsSyncService.materialize`: dedups by email; idempotent (second run yields the same rows, `created: 0`); never downgrades `source`; never clobbers a non-null human field with null; refreshes the behavioural snapshot; respects the plan cap.
  - `ContactsService`: create/patch/delete scoped to project; list filters (search/tag/status/owner) and pagination; cap enforcement on create.
  - CSV import: parses headers case-insensitively, upserts by email, resolves company by name, collects malformed rows into `errors`, FREE plan rejected.
  - Controller `ProjectAccessGuard` present on every route.
- **Web (Vitest):** a small unit test for any non-trivial list/table transform (e.g. display-name / filter helper) extracted into a pure function.
- **Build/lint:** `corepack pnpm --filter api build`, `corepack pnpm --filter api test -- src/crm`, `corepack pnpm --filter api lint`, `corepack pnpm --filter web build`, `corepack pnpm --filter web lint`. Run the relevant `lint` before pushing (CI fails on real lint errors).
- **Migration:** generated/authored under `packages/database/prisma/migrations/`, applied in prod by the `migrator` service on deploy; additive table creation only.
- **Manual (after deploy):** open a project → CRM → contacts auto-populate from existing subscribers/tracked-users (deduped by email); add a manual contact; import a small CSV; create a company and assign contacts; confirm FREE cap + PRO-only import behave as specified.

## 7. File inventory

Create:
- `packages/database/prisma/migrations/<ts>_crm_contacts_companies/migration.sql`
- `apps/api/src/crm/` — `crm.module.ts`, `contacts.controller.ts`, `companies.controller.ts`, `contacts.service.ts`, `companies.service.ts`, `contacts-sync.service.ts`, DTOs, `*.spec.ts`
- `apps/web/src/routes/(app)/projects/[id]/crm/contacts/+page.svelte` (+ `[contactId]/+page.svelte`), `.../crm/companies/+page.svelte` (+ `[companyId]/+page.svelte`)
- `apps/web/src/lib/api/crm.ts` (or fold into the existing client)

Modify:
- `packages/database/prisma/schema.prisma` (2 models, 2 enums, `Project` + `User` back-relations)
- `apps/api/src/app.module.ts` (register `CrmModule`)
- `packages/shared-types` (`PLAN_LIMITS.contacts`)
- project sidebar navigation component (CRM entry)
- `packages/i18n` en/pl/ru locale files (`crm.*`)
