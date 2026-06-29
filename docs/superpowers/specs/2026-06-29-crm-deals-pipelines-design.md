# CRM Module — Phase 2: Deals & Pipelines — Design

**Date:** 2026-06-29
**Status:** Approved design — ready for implementation planning
**Scope owner:** `packages/database` (schema), `apps/api` (crm module — deals + pipeline + forecast + finance link), `apps/web` (Kanban board, deal detail, stage settings), `packages/i18n`

## Context

Phase 1 (PR #128, live) shipped the CRM foundation: `Contact` + `Company` models, the `apps/api/src/crm/` module, sidebar CRM section with contacts/companies pages, and the owner picker (#130). Phase 2 adds the **sales pipeline**: deals moving through configurable stages, a Kanban board, a revenue forecast, and — the payoff of the whole "help with sales" goal — **won deals automatically book revenue** into the existing finance module so the marketing→sales→revenue loop closes.

This is Phase 2 of the phased CRM (Phase 3 = activities & tasks, Phase 4 = AI sales layer — both out of scope here).

## Approved decisions

| Decision | Choice |
|---|---|
| Pipeline model | **One pipeline per project**, with **customizable stages** (add / rename / reorder / delete, each with a win-probability %). A default stage set is seeded lazily on first access. |
| Won → revenue | **Won deal auto-creates a `FinanceRecord` (INCOME)** for the deal value, via an idempotent `Deal.financeRecordId` link (un-win / delete / value-edit keep it in sync). |
| Won/Lost modelling | **Statuses** (`OPEN`/`WON`/`LOST`), not Kanban columns — so the forecast is computed cleanly over OPEN deals only. |
| Deal currency | Single currency = `project.baseCurrency` (multi-currency deals deferred). |
| Plan gating | `PLAN_LIMITS.deals`: FREE 50 / PRO 1000 / ENTERPRISE unlimited (consistent with `contacts`). |

## Non-goals (Phase 2)

- Multiple pipelines per project.
- Multi-currency deals (value is in the project base currency; `exchangeRate = 1`).
- Activities / tasks / reminders (Phase 3) and AI scoring / next-step / drafts (Phase 4).
- Editing the auto-booked `FinanceRecord` from the finance UI re-syncing back to the deal (the deal is the source of truth; the finance record is a derived projection).

---

## 1. Data model (`packages/database/prisma/schema.prisma`)

Two new models + one enum + a back-relation from `Contact`/`Company`/`User`/`Project`/`FinanceRecord`. Migration is **additive**.

```prisma
enum DealStatus {
  OPEN
  WON
  LOST
}

model PipelineStage {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  order       Int
  probability Int      @default(0) // 0..100, used for the weighted forecast
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  deals   Deal[]

  @@unique([projectId, order])
  @@index([projectId])
  @@map("pipeline_stages")
}

model Deal {
  id                String     @id @default(cuid())
  projectId         String
  title             String
  value             Decimal    @default(0) @db.Decimal(12, 2)
  currency          String     @db.VarChar(3)
  stageId           String?
  status            DealStatus @default(OPEN)
  ownerId           String?
  contactId         String?
  companyId         String?
  expectedCloseDate DateTime?
  wonAt             DateTime?
  lostAt            DateTime?
  lostReason        String?
  financeRecordId   String?    @unique // idempotent link to the auto-booked income
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  project       Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  stage         PipelineStage? @relation(fields: [stageId], references: [id], onDelete: SetNull)
  owner         User?          @relation("DealOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  contact       Contact?       @relation(fields: [contactId], references: [id], onDelete: SetNull)
  company       Company?       @relation(fields: [companyId], references: [id], onDelete: SetNull)
  financeRecord FinanceRecord? @relation("DealFinanceRecord", fields: [financeRecordId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([projectId, status])
  @@index([stageId])
  @@index([ownerId])
  @@map("deals")
}
```

Back-relations to add: `Project` (`pipelineStages PipelineStage[]`, `deals Deal[]`), `User` (`ownedDeals Deal[] @relation("DealOwner")`), `Contact` (`deals Deal[]`), `Company` (`deals Deal[]`), `FinanceRecord` (`deal Deal? @relation("DealFinanceRecord")`).

**Notes**
- `Deal.stageId` is nullable + `onDelete: SetNull` so deleting a stage never cascades-deletes deals (the service reassigns first; SetNull is the backstop).
- `financeRecordId` is `@unique` (one deal ↔ at most one income record) with `onDelete: SetNull` so manually deleting the finance record doesn't break the deal.
- Forecast uses `stage.probability`; Won/Lost are read from `status`, independent of `stageId`.

## 2. Default stages (lazy seed)

When `GET /crm/pipeline/stages` (or the board/forecast) is first requested for a project that has **zero** stages, the service seeds a default set in one transaction:

| order | name | probability |
|---|---|---|
| 0 | Lead | 10 |
| 1 | Qualified | 25 |
| 2 | Proposal | 50 |
| 3 | Negotiation | 75 |

(Names are seeded in English; the user renames them. The default-set values are constants in the service.) Seeding is idempotent — guarded by a `count === 0` check inside a transaction so concurrent first-loads don't double-seed.

## 3. Won → revenue (`FinanceRecord`) integration

`FinanceRecord` requires `projectId`, `categoryId` (FK to a `FinanceCategory` of `type INCOME`), `type`, `amount`, `currency`, `amountInBaseCurrency`, `exchangeRate`, `date`. The deal-win flow:

- **Resolve the income category:** find a project `FinanceCategory` named `"Sales"` with `type: INCOME`; if absent, create it (`scope: PROJECT`, `type: INCOME`, `isDefault: false`, a fixed `color`). One-time per project.
- **On `OPEN → WON`** (`POST /crm/deals/:id/win`): set `status: WON`, `wonAt: now`, and create a `FinanceRecord` `{ projectId, scope: PROJECT, categoryId, type: INCOME, amount: value, currency: project.baseCurrency, amountInBaseCurrency: value, exchangeRate: 1, date: now, description: "Deal: <title>" }`; store its id in `deal.financeRecordId`.
- **On `WON → OPEN/LOST`, or deal delete:** if `financeRecordId` is set, delete that `FinanceRecord` and clear the link.
- **On value edit while `WON`:** update the linked `FinanceRecord`'s `amount`/`amountInBaseCurrency` to the new value.
- **Atomicity:** the status change and its finance write happen together in a Prisma `$transaction`, so a finance failure rolls the win back (no half-state) and the user sees an error rather than a won deal with no booked revenue. The category-resolve (find-or-create "Sales") runs before the transaction. Winning an already-`WON` deal is a no-op (idempotent — never books a second record).

> The deal is the **source of truth**; the finance record is a derived projection. Editing the record in the finance UI does not sync back (documented non-goal).

## 4. API (`apps/api/src/crm/`)

New `PipelineService`, `DealsService`, `DealsController`, `PipelineController` (or fold pipeline routes into the deals controller). All routes `@UseGuards(ProjectAccessGuard)` (class-level), `projectId` as a query param — mirror the Phase 1 controllers. DTOs use `class-validator` with `@IsString()` for ids (never `@IsUUID()` — ids are cuid).

**Pipeline stages**
| Method | Path | Notes |
|---|---|---|
| GET | `/crm/pipeline/stages` | lazily seeds defaults; returns ordered stages |
| POST | `/crm/pipeline/stages` | `{ name, probability? }` → appended at the next order |
| PATCH | `/crm/pipeline/stages/:id` | `{ name?, probability?, order? }`; reordering renumbers within the project |
| DELETE | `/crm/pipeline/stages/:id` | open deals on it are reassigned to the previous stage (or the first remaining); blocked if it is the last stage |

**Deals**
| Method | Path | Notes |
|---|---|---|
| GET | `/crm/deals` | filters: `status`, `stageId`, `ownerId`, `search`; returns deals (+ stage/contact/company/owner summaries). Board mode groups by stage on the client. |
| GET | `/crm/deals/forecast` | `{ openCount, openValue, weightedValue, wonValuePeriod, lostCount }` over the project |
| GET | `/crm/deals/:id` | full deal |
| POST | `/crm/deals` | create (cap-enforced); `status: OPEN`, default `stageId` = first stage |
| PATCH | `/crm/deals/:id` | edit fields incl. `stageId` (move), `value` (re-syncs finance if WON) |
| POST | `/crm/deals/:id/win` | OPEN→WON + finance booking |
| POST | `/crm/deals/:id/lose` | OPEN→LOST `{ lostReason? }` |
| POST | `/crm/deals/:id/reopen` | WON/LOST→OPEN (removes the finance record if any) |
| DELETE | `/crm/deals/:id` | removes the linked finance record too |

**Plan cap:** `DealsService.create` enforces `PLAN_LIMITS[plan].deals` (`'unlimited'` → `Infinity`), counting **OPEN** deals (closed deals don't count against the cap). FREE 50 / PRO 1000 / ENTERPRISE unlimited. New `PlanLimits.deals: number | 'unlimited'` added to `packages/shared-types/src/billing.ts`.

**Forecast computation:** `weightedValue = Σ(value × stage.probability / 100)` over OPEN deals (deals with no stage contribute 0); `openValue = Σ value` over OPEN; `wonValuePeriod = Σ value` over WON in a default window (e.g. last 90 days, by `wonAt`); counts as named.

## 5. Web (`apps/web`, SvelteKit, Iris tokens)

- **Sidebar:** add a **Deals** entry to the CRM section (alongside the existing Contacts/Companies sub-nav).
- **Kanban board** `/projects/[id]/crm/deals/+page.svelte`:
  - Columns = ordered pipeline stages; cards = OPEN deals in each stage (title, value formatted in `baseCurrency`, company/contact, owner). Per-column total at the head.
  - Drag-and-drop a card to another column → `PATCH /crm/deals/:id { stageId }` (optimistic update + revert on error). Use a lightweight, dependency-free DnD (HTML5 drag events) to avoid adding a library.
  - "+ Add deal" modal (title, value, stage, contact, company, owner, expectedCloseDate).
  - Card actions: Win / Lost (Lost asks for an optional reason).
  - **Forecast strip** at the top: weighted pipeline, open value + count, won (period).
  - A Won/Lost view (tab or filter) lists closed deals (not on the board).
  - Guarded `projectId` watcher (project-switch safe).
- **Deal detail** `/projects/[id]/crm/deals/[dealId]/+page.svelte`: editable fields (title, value, stage, expectedCloseDate, owner, contact, company); status + Win/Lost/Reopen actions; an indicator + link when revenue has been booked (the linked finance record); Delete (confirm modal).
- **Stage settings** — a modal or `/crm/deals/stages` panel: list stages with name + probability, add, inline-rename, reorder (up/down), delete (with the reassign warning).
- Reuse the Phase 1 owner picker helper (`$lib/api/crm-owners.ts`) and the contacts/companies lookups for the deal's contact/company selectors. Money formatting uses the project `baseCurrency`.

## 6. i18n (`packages/i18n`)

New `crm.deals.*` and `crm.pipeline.*` namespaces in **en / pl / ru** (all three in parity): board/columns, deal fields, statuses (Open/Won/Lost), win/lose/reopen, lost-reason, stage settings, forecast labels, plan-limit/upgrade message, empty/loading states. Numeric/plural strings use ICU.

## 7. Testing & verification

- **API unit (Jest, mocked Prisma):**
  - `PipelineService`: lazy default seed only when count === 0 (idempotent); add/rename/reorder; delete reassigns open deals to the previous/first stage and is blocked when it is the last stage.
  - `DealsService`: create scoped + cap-enforced (counts OPEN only); list filters; move stage; **forecast math** (weighted = Σ value×prob/100; no-stage → 0; open vs won windows).
  - **Win/finance:** win creates a `FinanceRecord` (INCOME, amount=value, currency=baseCurrency, rate=1) + sets `financeRecordId`; resolves/creates the "Sales" income category once; reopen/lose/delete removes the record; value edit while WON updates it; a finance failure does not corrupt deal state. Assert idempotency (winning an already-won deal does not create a second record).
  - Controller `ProjectAccessGuard` on every route; DTOs reject `@IsUUID()` (none present).
- **Web (Vitest):** pure helpers extracted and tested — the forecast/column-total formatter and the weighted-value display helper.
- **Build/lint:** `corepack pnpm --filter api build`, `--filter api test -- src/crm`, `--filter api lint`, `--filter web build`, `--filter web lint`. Run the relevant app lint before pushing.
- **Migration:** authored under `packages/database/prisma/migrations/`, additive (new tables + enum + the `deals.financeRecordId` unique + FKs); applied in prod by the `migrator` on deploy.
- **Manual (after deploy):** open a project → CRM → Deals → default stages appear → add a deal → drag across stages → Win → confirm an income `FinanceRecord` appears in the finance module for the deal value, and the forecast strip updates; Reopen → the income record disappears; delete a stage → its open deals move to the previous stage.

## 8. File inventory

Create:
- `packages/database/prisma/migrations/<ts>_crm_deals_pipelines/migration.sql`
- `apps/api/src/crm/pipeline.service.ts`, `deals.service.ts`, `pipeline.controller.ts`, `deals.controller.ts`, DTOs, `*.spec.ts`
- `apps/web/src/routes/(app)/projects/[id]/crm/deals/+page.svelte` (+ `[dealId]/+page.svelte`), stage-settings UI
- web pure-helper modules + Vitest tests (forecast/format)

Modify:
- `packages/database/prisma/schema.prisma` (2 models, `DealStatus` enum, back-relations on Project/User/Contact/Company/FinanceRecord)
- `apps/api/src/crm/crm.module.ts` (register the new services/controllers)
- `packages/shared-types/src/billing.ts` (`PLAN_LIMITS.deals`)
- CRM sidebar / sub-nav (Deals entry)
- `packages/i18n` en/pl/ru (`crm.deals.*`, `crm.pipeline.*`)
