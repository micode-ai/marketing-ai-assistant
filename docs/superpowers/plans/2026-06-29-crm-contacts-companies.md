# CRM Phase 1 — Contacts & Companies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each project a clean, de-duplicated book of Contacts (people) and Companies (accounts), auto-populated from existing `TrackedUser`/`EmailSubscriber` data plus manual entry and CSV import, with team ownership, tags, and notes.

**Architecture:** A new NestJS `crm` module (`apps/api/src/crm/`) exposes `ProjectAccessGuard`-protected CRUD + sync + import endpoints over two new Prisma models (`Contact`, `Company`). A `ContactsSyncService` idempotently materializes contacts from subscribers/tracked-users (deduped by email). New SvelteKit pages under `/projects/[id]/crm/` render lists and detail cards. Spec: `docs/superpowers/specs/2026-06-29-crm-contacts-companies-design.md`.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL), Jest (api), SvelteKit 2 + Vitest (web), `csv-parse`, svelte-i18n (en/pl/ru).

## Global Constraints

- IDs are `cuid()`, **not** UUIDs — DTOs use `@IsString() @IsNotEmpty()`, never `@IsUUID()`.
- Every `crm` controller route is `@UseGuards(ProjectAccessGuard)` (class-level), with `projectId` as a query param — mirror `apps/api/src/instagram/instagram.controller.ts`.
- Prisma types import from `@prisma/client` directly (not the database workspace package). `PrismaService` extends `PrismaClient`.
- `PLAN_LIMITS.contacts` (new field, `number | 'unlimited'`): **FREE 100, PRO 2000, ENTERPRISE 'unlimited'**. CSV import is **PRO+** (FREE rejected).
- Contact dedup key: `@@unique([projectId, email])`. `email` is nullable (manual contacts may omit it).
- Source precedence (never downgraded on update): `MANUAL` = `IMPORT` > `SUBSCRIBER` > `TRACKED_USER`. Never overwrite a non-null human field (name/phone/notes/tags/companyId/ownerId) with a null/empty auto value.
- Migration is additive (new tables only). If local Postgres is up: `cd packages/database && corepack pnpm db:migrate:dev --name crm_contacts_companies`. If Docker/Postgres is unavailable, hand-author the migration SQL (Task 1 gives it verbatim) and run `corepack pnpm db:generate` from the repo root — the prod `migrator` service applies SQL files via `prisma migrate deploy`.
- i18n: every new UI string added to **en, pl, ru** together (`packages/i18n/src/locales/{en,pl,ru}.json`), namespace `crm.*`.
- Use `NODE_OPTIONS=--max-old-space-size=4096` for `corepack pnpm build`. Run the relevant app's `lint` before pushing (CI fails on real lint errors; `no-explicit-any` is a warning, not an error).

---

### Task 1: Schema, migration, and plan limit

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (add 2 models, 2 enums, back-relations on `Project` and `User`)
- Create: `packages/database/prisma/migrations/20260629130000_crm_contacts_companies/migration.sql`
- Modify: `packages/shared-types/src/billing.ts` (add `contacts` to `PlanLimits` + 3 plans)

**Interfaces:**
- Produces: Prisma models `Contact` and `Company` with the fields below; `ContactSource` enum (`TRACKED_USER | SUBSCRIBER | MANUAL | IMPORT`); `ContactStatus` enum (`ACTIVE | UNSUBSCRIBED | ARCHIVED`); `PLAN_LIMITS[plan].contacts: number | 'unlimited'`.

- [ ] **Step 1: Add the enums + models to `schema.prisma`** (place after the `TrackedUser` model, before the `EntityLink` section)

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
  ownerId           String?
  source            ContactSource @default(MANUAL)
  status            ContactStatus @default(ACTIVE)
  tags              String[]      @default([])
  notes             String?
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

- [ ] **Step 2: Add back-relations** — in `model Project { ... }` add (next to the other relation lines):

```prisma
  contacts        Contact[]
  companies       Company[]
```

In `model User { ... }` add (next to `entityLinks`):

```prisma
  ownedContacts    Contact[]   @relation("ContactOwner")
  ownedCompanies   Company[]   @relation("CompanyOwner")
```

- [ ] **Step 3: Author the migration SQL** — create `packages/database/prisma/migrations/20260629130000_crm_contacts_companies/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('TRACKED_USER', 'SUBSCRIBER', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "companyId" TEXT,
    "ownerId" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "trackedUserId" TEXT,
    "emailSubscriberId" TEXT,
    "lastSeen" TIMESTAMP(3),
    "firstUtm" JSONB,
    "lastUtm" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_projectId_idx" ON "companies"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_projectId_domain_key" ON "companies"("projectId", "domain");

-- CreateIndex
CREATE INDEX "contacts_projectId_idx" ON "contacts"("projectId");

-- CreateIndex
CREATE INDEX "contacts_ownerId_idx" ON "contacts"("ownerId");

-- CreateIndex
CREATE INDEX "contacts_companyId_idx" ON "contacts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_projectId_email_key" ON "contacts"("projectId", "email");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Add `contacts` to the plan limits** — in `packages/shared-types/src/billing.ts`, add to the `PlanLimits` interface:

```ts
  contacts: number | 'unlimited';
```

and to each plan: `[OrgPlan.FREE]` → `contacts: 100,`, `[OrgPlan.PRO]` → `contacts: 2000,`, `[OrgPlan.ENTERPRISE]` → `contacts: 'unlimited',`.

- [ ] **Step 5: Regenerate the client and typecheck**

Run: `cd /d/Work/micode/marketing-ai-assistant && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm db:generate`
Expected: `Tasks: 1 successful`. Then `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm --filter api build` → succeeds (the new Prisma models compile).

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/shared-types/src/billing.ts
git commit -m "feat(db): Contact + Company models, migration, PLAN_LIMITS.contacts"
```

---

### Task 2: ContactsSyncService.materialize (auto-materialization core)

**Files:**
- Create: `apps/api/src/crm/contacts-sync.service.ts`
- Create: `apps/api/src/crm/contacts-sync.service.spec.ts`

**Interfaces:**
- Consumes: Prisma models from Task 1.
- Produces: `class ContactsSyncService` with `materialize(projectId: string): Promise<{ created: number; updated: number; capped: boolean }>` and `private contactLimit(plan: string): number` (returns `Infinity` for `'unlimited'`).

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/contacts-sync.service.spec.ts`:

```ts
import { ContactsSyncService } from './contacts-sync.service';

function makePrisma() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1' }) },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }),
    },
    emailSubscriber: { findMany: jest.fn().mockResolvedValue([]) },
    trackedUser: { findMany: jest.fn().mockResolvedValue([]) },
    contact: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c', ...data })),
    },
  };
}

describe('ContactsSyncService.materialize', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContactsSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new ContactsSyncService(prisma as any);
  });

  it('creates a contact from a subscriber (source SUBSCRIBER)', async () => {
    prisma.emailSubscriber.findMany.mockResolvedValue([
      { id: 's1', email: 'a@x.com', name: 'Ann', status: 'ACTIVE' },
    ]);

    const res = await service.materialize('p1');

    expect(res.created).toBe(1);
    const arg = prisma.contact.create.mock.calls[0][0].data;
    expect(arg).toMatchObject({ projectId: 'p1', email: 'a@x.com', source: 'SUBSCRIBER', emailSubscriberId: 's1', firstName: 'Ann' });
  });

  it('dedups subscriber + tracked-user with the same email into one contact (update, not 2nd create)', async () => {
    prisma.emailSubscriber.findMany.mockResolvedValue([{ id: 's1', email: 'a@x.com', name: 'Ann', status: 'ACTIVE' }]);
    prisma.trackedUser.findMany.mockResolvedValue([
      { id: 't1', email: 'a@x.com', lastSeen: new Date('2026-06-01'), firstUtm: { s: 'g' }, lastUtm: null },
    ]);
    // After the subscriber pass the contact exists:
    prisma.contact.findUnique
      .mockResolvedValueOnce(null) // subscriber lookup → create
      .mockResolvedValueOnce({ id: 'c1', email: 'a@x.com', source: 'SUBSCRIBER', firstName: 'Ann' }); // tracked lookup → update

    const res = await service.materialize('p1');

    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ created: 1, updated: 1 });
  });

  it('never downgrades source: tracked-user pass does not overwrite MANUAL', async () => {
    prisma.trackedUser.findMany.mockResolvedValue([{ id: 't1', email: 'm@x.com', lastSeen: new Date(), firstUtm: null, lastUtm: null }]);
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', email: 'm@x.com', source: 'MANUAL', firstName: 'Manual Name' });

    await service.materialize('p1');

    const upd = prisma.contact.update.mock.calls[0][0].data;
    expect(upd.source).toBeUndefined();          // source not changed
    expect(upd.firstName).toBeUndefined();        // human name not clobbered
    expect(upd.trackedUserId).toBe('t1');         // snapshot still linked
  });

  it('stops creating once the plan cap is reached (capped=true)', async () => {
    prisma.organization.findUnique.mockResolvedValue({ subscription: { plan: 'FREE' } });
    prisma.contact.count.mockResolvedValue(100); // FREE cap = 100, already full
    prisma.emailSubscriber.findMany.mockResolvedValue([{ id: 's1', email: 'a@x.com', name: 'A', status: 'ACTIVE' }]);

    const res = await service.materialize('p1');

    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.capped).toBe(true);
  });

  it('is idempotent: a second run with the same data updates, never re-creates', async () => {
    prisma.emailSubscriber.findMany.mockResolvedValue([{ id: 's1', email: 'a@x.com', name: 'A', status: 'ACTIVE' }]);
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', email: 'a@x.com', source: 'SUBSCRIBER' });

    const res = await service.materialize('p1');

    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(res.created).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts-sync.service.spec.ts`
Expected: FAIL — `Cannot find module './contacts-sync.service'`.

- [ ] **Step 3: Implement `ContactsSyncService`** — `apps/api/src/crm/contacts-sync.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';

@Injectable()
export class ContactsSyncService {
  private readonly logger = new Logger(ContactsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private contactLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.contacts ?? PLAN_LIMITS.FREE.contacts;
    return limit === 'unlimited' ? Infinity : limit;
  }

  private async resolvePlan(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) return 'FREE';
    const org = await this.prisma.organization.findUnique({
      where: { id: project.organizationId },
      include: { subscription: true },
    });
    return org?.subscription?.plan || 'FREE';
  }

  /**
   * Idempotently materialize contacts from the project's email subscribers and
   * identified (email-bearing) tracked users. Dedups by (projectId, email).
   * Never downgrades an existing contact's source and never overwrites a
   * non-null human field with a null/empty auto value. Stops creating new
   * contacts once the plan's contact cap is reached (existing ones still update).
   */
  async materialize(
    projectId: string,
  ): Promise<{ created: number; updated: number; capped: boolean }> {
    const limit = this.contactLimit(await this.resolvePlan(projectId));
    let count = await this.prisma.contact.count({ where: { projectId } });
    let created = 0;
    let updated = 0;
    let capped = false;

    const upsertByEmail = async (
      email: string,
      createData: Record<string, unknown>,
      updateData: Record<string, unknown>,
    ) => {
      const existing = await this.prisma.contact.findUnique({
        where: { projectId_email: { projectId, email } },
      });
      if (existing) {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: this.mergeUpdate(existing, updateData),
        });
        updated++;
        return;
      }
      if (count >= limit) {
        capped = true;
        return;
      }
      await this.prisma.contact.create({ data: { projectId, email, ...createData } });
      created++;
      count++;
    };

    // 1) Subscribers (active) — source SUBSCRIBER.
    const subscribers = await this.prisma.emailSubscriber.findMany({
      where: { list: { projectId }, status: { not: 'UNSUBSCRIBED' }, email: { not: '' } },
      select: { id: true, email: true, name: true },
    });
    for (const s of subscribers) {
      if (!s.email) continue;
      await upsertByEmail(
        s.email,
        { source: 'SUBSCRIBER', emailSubscriberId: s.id, firstName: s.name ?? null },
        { emailSubscriberId: s.id, firstName: s.name ?? null },
      );
    }

    // 2) Tracked users with an email — source TRACKED_USER + behavioural snapshot.
    const tracked = await this.prisma.trackedUser.findMany({
      where: { projectId, email: { not: null } },
      select: { id: true, email: true, lastSeen: true, firstUtm: true, lastUtm: true },
    });
    for (const t of tracked) {
      if (!t.email) continue;
      const snapshot = {
        trackedUserId: t.id,
        lastSeen: t.lastSeen ?? null,
        firstUtm: t.firstUtm ?? null,
        lastUtm: t.lastUtm ?? null,
      };
      await upsertByEmail(t.email, { source: 'TRACKED_USER', ...snapshot }, snapshot);
    }

    return { created, updated, capped };
  }

  /**
   * Build the update payload: always refresh provenance + behavioural snapshot,
   * but never overwrite a non-null human field (firstName/lastName/phone) with
   * null, and never set `source` (so an existing source is never downgraded).
   */
  private mergeUpdate(
    existing: { firstName: string | null; lastName: string | null; phone: string | null },
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (k === 'source') continue; // never downgrade
      const isHumanField = k === 'firstName' || k === 'lastName' || k === 'phone';
      if (isHumanField && (v === null || v === undefined || v === '')) {
        if ((existing as any)[k]) continue; // keep the existing non-null human value
      }
      out[k] = v;
    }
    return out;
  }
}
```

> Note: `EmailSubscriber` has a single `name` field (no first/last split) and `email` is non-null in its own table; map `name` → `firstName`. The `@marketing-ai/shared-types` import is allowed in `apps/api` (it is **not** the ai-agent). `PrismaService` is imported as `from '../database/prisma.service'` (verified against `instagram.service.ts`) and is provided to the module via `imports: [DatabaseModule]` (see Task 6).

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts-sync.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/crm/contacts-sync.service.ts apps/api/src/crm/contacts-sync.service.spec.ts
git commit -m "feat(crm): ContactsSyncService.materialize (dedup, precedence, cap)"
```

---

### Task 3: ContactsService (CRUD, list filters, cap)

**Files:**
- Create: `apps/api/src/crm/contacts.service.ts`
- Create: `apps/api/src/crm/contacts.service.spec.ts`

**Interfaces:**
- Consumes: Prisma models (Task 1); plan resolution pattern (Task 2).
- Produces: `class ContactsService` with:
  - `list(projectId, opts: { page?: number; pageSize?: number; search?: string; tag?: string; status?: string; ownerId?: string }): Promise<{ items: any[]; total: number; page: number; pageSize: number }>`
  - `get(projectId, id): Promise<any>` (throws `NotFoundException` if missing/foreign)
  - `create(projectId, dto): Promise<any>` (enforces cap → `ForbiddenException` when full)
  - `update(projectId, id, dto): Promise<any>`
  - `remove(projectId, id): Promise<{ deleted: true }>`
  - `private resolvePlan(projectId)` and `private contactLimit(plan)` (duplicate the small helpers from Task 2 here; keep both services standalone — do not introduce a shared base class for two 6-line helpers).

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/contacts.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

function makePrisma() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1' }) },
    organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
  };
}

describe('ContactsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContactsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new ContactsService(prisma as any);
  });

  it('list applies search + status + tag + owner filters and paginates', async () => {
    prisma.contact.count.mockResolvedValue(1);
    prisma.contact.findMany.mockResolvedValue([{ id: 'c1' }]);

    const res = await service.list('p1', { page: 2, pageSize: 10, search: 'ann', status: 'ACTIVE', tag: 'vip', ownerId: 'u1' });

    expect(res).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    const where = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe('p1');
    expect(where.status).toBe('ACTIVE');
    expect(where.tags).toEqual({ has: 'vip' });
    expect(where.ownerId).toBe('u1');
    expect(where.OR).toBeDefined(); // search across email/first/last
    expect(prisma.contact.findMany.mock.calls[0][0].skip).toBe(10); // (page-1)*pageSize
    expect(prisma.contact.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('create enforces the plan cap (ForbiddenException when full)', async () => {
    prisma.organization.findUnique.mockResolvedValue({ subscription: { plan: 'FREE' } });
    prisma.contact.count.mockResolvedValue(100); // FREE cap

    await expect(service.create('p1', { email: 'a@x.com' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('create sets source MANUAL and scopes to project', async () => {
    const res = await service.create('p1', { email: 'a@x.com', firstName: 'A', tags: ['vip'] });
    const data = prisma.contact.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', email: 'a@x.com', source: 'MANUAL', tags: ['vip'] });
    expect(res.id).toBe('c1');
  });

  it('get throws NotFound when the contact is missing or in another project', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    await expect(service.get('p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update/delete are scoped by project (findFirst guard)', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1' });
    await service.update('p1', 'c1', { notes: 'hi' });
    expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { notes: 'hi' } });
    const del = await service.remove('p1', 'c1');
    expect(del).toEqual({ deleted: true });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ContactsService`** — `apps/api/src/crm/contacts.service.ts`:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';

export interface ListContactsOpts {
  page?: number;
  pageSize?: number;
  search?: string;
  tag?: string;
  status?: string;
  ownerId?: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private contactLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.contacts ?? PLAN_LIMITS.FREE.contacts;
    return limit === 'unlimited' ? Infinity : limit;
  }

  private async resolvePlan(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) return 'FREE';
    const org = await this.prisma.organization.findUnique({
      where: { id: project.organizationId },
      include: { subscription: true },
    });
    return org?.subscription?.plan || 'FREE';
  }

  async list(projectId: string, opts: ListContactsOpts) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const where: any = { projectId };
    if (opts.status) where.status = opts.status;
    if (opts.tag) where.tags = { has: opts.tag };
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.search) {
      const q = opts.search;
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { company: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(projectId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, projectId },
      include: { company: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(projectId: string, dto: any) {
    const limit = this.contactLimit(await this.resolvePlan(projectId));
    const count = await this.prisma.contact.count({ where: { projectId } });
    if (count >= limit) {
      throw new ForbiddenException('Contact limit reached for your plan');
    }
    return this.prisma.contact.create({
      data: {
        projectId,
        email: dto.email ?? null,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        companyId: dto.companyId ?? null,
        ownerId: dto.ownerId ?? null,
        tags: dto.tags ?? [],
        notes: dto.notes ?? null,
        source: 'MANUAL',
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.contact.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Contact not found');
    const data: any = {};
    for (const k of ['email', 'firstName', 'lastName', 'phone', 'companyId', 'ownerId', 'tags', 'notes', 'status']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.contact.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.contact.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.contact.delete({ where: { id } });
    return { deleted: true as const };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/crm/contacts.service.ts apps/api/src/crm/contacts.service.spec.ts
git commit -m "feat(crm): ContactsService CRUD + list filters + plan cap"
```

---

### Task 4: CSV import (PRO+)

**Files:**
- Modify: `apps/api/src/crm/contacts.service.ts` (add `importCsv`)
- Modify: `apps/api/src/crm/contacts.service.spec.ts` (add import tests)

**Interfaces:**
- Consumes: `ContactsService` (Task 3), `csv-parse` (already an `apps/api` dependency — see `apps/api/src/google-play/google-play-sync.service.ts` for the `parse` import style).
- Produces: `ContactsService.importCsv(projectId, plan, csvText: string): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>`. **The controller** enforces PRO+ before calling this; the method assumes it may run (but still respects the contact cap).

- [ ] **Step 1: Write the failing test** — append to `contacts.service.spec.ts`:

```ts
describe('ContactsService.importCsv', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContactsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    (prisma.contact as any).findUnique = jest.fn().mockResolvedValue(null);
    (prisma.company as any) = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'co1', name: 'Acme' }),
    };
    service = new ContactsService(prisma as any);
  });

  it('parses headers case-insensitively, upserts by email with source IMPORT, resolves company by name', async () => {
    const csv = 'Email,FirstName,LastName,Company,Tags\na@x.com,Ann,Lee,Acme,"vip,warm"\n';

    const res = await service.importCsv('p1', 'PRO', csv);

    expect(res).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    const data = prisma.contact.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', email: 'a@x.com', firstName: 'Ann', lastName: 'Lee', source: 'IMPORT', companyId: 'co1' });
    expect(data.tags).toEqual(['vip', 'warm']);
  });

  it('skips rows with no email and no name; collects malformed rows into errors without aborting', async () => {
    const csv = 'email,firstName\n,,\nb@x.com,Bob\n';
    const res = await service.importCsv('p1', 'PRO', csv);
    expect(res.created).toBe(1);     // b@x.com
    expect(res.skipped).toBe(1);     // the empty row
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts.service.spec.ts -t importCsv`
Expected: FAIL — `importCsv is not a function`.

- [ ] **Step 3: Implement `importCsv`** — add to `apps/api/src/crm/contacts.service.ts` (and at top: `import { parse } from 'csv-parse/sync';`):

```ts
  async importCsv(
    projectId: string,
    plan: string,
    csvText: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const limit = this.contactLimit(plan);
    let count = await this.prisma.contact.count({ where: { projectId } });

    let rows: Record<string, string>[];
    try {
      rows = parse(csvText, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (e) {
      return { created: 0, updated: 0, skipped: 0, errors: [`CSV parse error: ${e}`] };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const email = (row.email || '').trim() || null;
        const firstName = (row.firstname || '').trim() || null;
        const lastName = (row.lastname || '').trim() || null;
        const phone = (row.phone || '').trim() || null;
        const companyName = (row.company || '').trim();
        const tags = (row.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        if (!email && !firstName && !lastName) {
          skipped++;
          continue;
        }

        let companyId: string | null = null;
        if (companyName) {
          const existingCo = await this.prisma.company.findFirst({
            where: { projectId, name: companyName },
            select: { id: true },
          });
          companyId = existingCo
            ? existingCo.id
            : (await this.prisma.company.create({ data: { projectId, name: companyName } })).id;
        }

        const existing = email
          ? await this.prisma.contact.findUnique({ where: { projectId_email: { projectId, email } } })
          : null;

        if (existing) {
          await this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              firstName: firstName ?? existing.firstName,
              lastName: lastName ?? existing.lastName,
              phone: phone ?? existing.phone,
              companyId: companyId ?? existing.companyId,
              tags: tags.length ? tags : existing.tags,
              source: existing.source === 'MANUAL' ? 'MANUAL' : 'IMPORT',
            },
          });
          updated++;
        } else {
          if (count >= limit) {
            errors.push(`Row ${i + 1}: contact limit reached`);
            skipped++;
            continue;
          }
          await this.prisma.contact.create({
            data: { projectId, email, firstName, lastName, phone, companyId, tags, source: 'IMPORT' },
          });
          created++;
          count++;
        }
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e}`);
      }
    }

    return { created, updated, skipped, errors };
  }
```

> If `csv-parse/sync` is not resolvable, use `import { parse } from 'csv-parse/sync';` — `csv-parse` exposes the sync API at that subpath; confirm against `apps/api/node_modules/csv-parse`. The google-play service uses the async `csv-parse` API; the sync subpath is fine for a one-shot in-memory import.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts.service.spec.ts`
Expected: PASS (all, including import).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/crm/contacts.service.ts apps/api/src/crm/contacts.service.spec.ts
git commit -m "feat(crm): CSV import (upsert by email, company resolve, errors)"
```

---

### Task 5: CompaniesService (CRUD)

**Files:**
- Create: `apps/api/src/crm/companies.service.ts`
- Create: `apps/api/src/crm/companies.service.spec.ts`

**Interfaces:**
- Produces: `class CompaniesService` with `list(projectId, opts: { search?: string })`, `get(projectId, id)`, `create(projectId, dto)`, `update(projectId, id, dto)`, `remove(projectId, id)`. List returns `{ items, total }` where each item includes `_count.contacts`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/companies.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

function makePrisma() {
  return {
    company: {
      findMany: jest.fn().mockResolvedValue([{ id: 'co1', name: 'Acme', _count: { contacts: 3 } }]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'co1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'co1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'co1' }),
    },
  };
}

describe('CompaniesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CompaniesService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new CompaniesService(prisma as any); });

  it('list returns items with contact counts + total', async () => {
    const res = await service.list('p1', {});
    expect(res.total).toBe(1);
    expect(res.items[0]._count.contacts).toBe(3);
    expect(prisma.company.findMany.mock.calls[0][0].where).toEqual({ projectId: 'p1' });
  });

  it('create scopes to project', async () => {
    const res = await service.create('p1', { name: 'Acme', domain: 'acme.com' });
    expect(prisma.company.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p1', name: 'Acme', domain: 'acme.com' });
    expect(res.id).toBe('co1');
  });

  it('get throws NotFound when missing/foreign', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    await expect(service.get('p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/companies.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CompaniesService`** — `apps/api/src/crm/companies.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, opts: { search?: string }) {
    const where: any = { projectId };
    if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: { _count: { select: { contacts: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total };
  }

  async get(projectId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, projectId },
      include: { contacts: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async create(projectId: string, dto: any) {
    return this.prisma.company.create({
      data: {
        projectId,
        name: dto.name,
        domain: dto.domain ?? null,
        website: dto.website ?? null,
        notes: dto.notes ?? null,
        ownerId: dto.ownerId ?? null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.company.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Company not found');
    const data: any = {};
    for (const k of ['name', 'domain', 'website', 'notes', 'ownerId']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.company.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.company.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Company not found');
    await this.prisma.company.delete({ where: { id } });
    return { deleted: true as const };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/companies.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/crm/companies.service.ts apps/api/src/crm/companies.service.spec.ts
git commit -m "feat(crm): CompaniesService CRUD"
```

---

### Task 6: Controllers, DTOs, module wiring

**Files:**
- Create: `apps/api/src/crm/dto/contact.dto.ts`, `apps/api/src/crm/dto/company.dto.ts`
- Create: `apps/api/src/crm/contacts.controller.ts`, `apps/api/src/crm/companies.controller.ts`
- Create: `apps/api/src/crm/crm.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CrmModule`)

**Interfaces:**
- Consumes: `ContactsService`, `CompaniesService`, `ContactsSyncService` (Tasks 2–5); `ProjectAccessGuard` (`../common/guards/project-access.guard`).
- Produces: REST routes from the spec §3. CSV upload uses `@UseInterceptors(FileInterceptor('file'))` (`@nestjs/platform-express` + `multer` — already used by `apps/api/src/uploads/`; mirror its multipart handling).

- [ ] **Step 1: DTOs** — `apps/api/src/crm/dto/contact.dto.ts`:

```ts
import { IsArray, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class UpdateContactDto extends CreateContactDto {
  @IsOptional() @IsIn(['ACTIVE', 'UNSUBSCRIBED', 'ARCHIVED']) status?: string;
}
```

`apps/api/src/crm/dto/company.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString() name!: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}
```

> Note: no `@IsUUID()` anywhere — ids are `cuid()`.

- [ ] **Step 2: ContactsController** — `apps/api/src/crm/contacts.controller.ts`:

```ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ContactsService } from './contacts.service';
import { ContactsSyncService } from './contacts-sync.service';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/contacts')
@UseGuards(ProjectAccessGuard)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly sync: ContactsSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List project contacts (paginated, filterable)' })
  list(
    @Query('projectId') projectId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.contacts.list(projectId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      search, tag, status, ownerId,
    });
  }

  @Post('sync')
  @ApiOperation({ summary: 'Materialize contacts from subscribers + tracked users' })
  syncNow(@Query('projectId') projectId: string) {
    return this.sync.materialize(projectId);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import contacts from a CSV file (PRO+)' })
  async import(
    @Query('projectId') projectId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const plan = await this.resolvePlan(projectId);
    if (plan === 'FREE') throw new ForbiddenException('CSV import requires a paid plan');
    return this.contacts.importCsv(projectId, plan, file.buffer.toString('utf8'));
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.contacts.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.contacts.remove(projectId, id);
  }

  private async resolvePlan(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
    if (!project) return 'FREE';
    const org = await this.prisma.organization.findUnique({ where: { id: project.organizationId }, include: { subscription: true } });
    return org?.subscription?.plan || 'FREE';
  }
}
```

> `PLAN_LIMITS` import is kept for parity even if only `resolvePlan` is used; remove it if the linter flags it as unused (unused imports are a real lint error in this repo).

- [ ] **Step 3: CompaniesController** — `apps/api/src/crm/companies.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/companies')
@UseGuards(ProjectAccessGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@Query('projectId') projectId: string, @Query('search') search?: string) {
    return this.companies.list(projectId, { search });
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.companies.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateCompanyDto) {
    return this.companies.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.companies.remove(projectId, id);
  }
}
```

- [ ] **Step 4: CrmModule + register** — `apps/api/src/crm/crm.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { CompaniesController } from './companies.controller';
import { ContactsService } from './contacts.service';
import { CompaniesService } from './companies.service';
import { ContactsSyncService } from './contacts-sync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContactsController, CompaniesController],
  providers: [ContactsService, CompaniesService, ContactsSyncService, ProjectAccessGuard],
  exports: [ContactsSyncService],
})
export class CrmModule {}
```

(Add the two imports at the top of the file: `import { DatabaseModule } from '../database/database.module';` and `import { ProjectAccessGuard } from '../common/guards/project-access.guard';`.)

> This mirrors `apps/api/src/instagram/instagram.module.ts` exactly: `PrismaService` comes from the imported `DatabaseModule`, and `ProjectAccessGuard` is listed as a provider. `CronFailureNotifierService` (Task 7) comes from the global `CommonModule` — do **not** re-provide it.

In `apps/api/src/app.module.ts`: add `import { CrmModule } from './crm/crm.module';` and add `CrmModule,` to the `imports:` array (next to `InstagramModule`).

- [ ] **Step 5: Verify the module loads** — build the app:

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build`
Expected: succeeds. Then run the whole crm test folder: `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm` → all green.

- [ ] **Step 6: Lint + commit**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm lint` → 0 errors.

```bash
git add apps/api/src/crm/ apps/api/src/app.module.ts
git commit -m "feat(crm): controllers, DTOs, module wiring"
```

---

### Task 7: Daily materialization cron

**Files:**
- Modify: `apps/api/src/crm/contacts-sync.service.ts` (add `handleCron`)
- Modify: `apps/api/src/crm/contacts-sync.service.spec.ts` (add cron tests)
- Modify: `apps/api/src/crm/crm.module.ts` (ensure `CronFailureNotifierService` is injectable — it is provided by the global `CommonModule`; confirm against an existing cron, e.g. `apps/api/src/seo/rank-tracking.cron.ts` or `google-play-sync.service.ts`)

**Interfaces:**
- Consumes: `CronFailureNotifierService` (`apps/api/src/common/cron-failure-notifier.service.ts`), `@Cron` from `@nestjs/schedule`.
- Produces: `ContactsSyncService.handleCron(): Promise<void>` annotated `@Cron('0 4 * * *')` (daily 04:00) that materializes every active project and reports failures via `CronFailureNotifier`.

- [ ] **Step 1: Write the failing test** — append to `contacts-sync.service.spec.ts` (extend `makePrisma` with `project.findMany` and pass a notifier mock):

```ts
describe('ContactsSyncService.handleCron', () => {
  it('materializes each active project and reports per-project failures', async () => {
    const prisma: any = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', organizationId: 'org_1', name: 'P1' },
          { id: 'p2', organizationId: 'org_1', name: 'P2' },
        ]),
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1' }),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
      emailSubscriber: { findMany: jest.fn().mockResolvedValue([]) },
      trackedUser: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const notifier = { report: jest.fn() };
    const service = new ContactsSyncService(prisma, notifier as any);
    jest.spyOn(service, 'materialize').mockResolvedValueOnce({ created: 0, updated: 0, capped: false })
      .mockRejectedValueOnce(new Error('boom'));

    await service.handleCron();

    expect(service.materialize).toHaveBeenCalledTimes(2);
    expect(notifier.report).toHaveBeenCalledTimes(1); // only the failing project
  });
});
```

> This changes the `ContactsSyncService` constructor to take a second arg (`CronFailureNotifierService`). Update the existing `materialize` tests' instantiation to `new ContactsSyncService(prisma as any, { report: jest.fn() } as any)`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/contacts-sync.service.spec.ts -t handleCron`
Expected: FAIL — `handleCron is not a function`.

- [ ] **Step 3: Implement `handleCron`** — modify `contacts-sync.service.ts`: import `Cron` and the notifier, add the constructor param, and the method:

```ts
import { Cron } from '@nestjs/schedule';
import { CronFailureNotifierService } from '../common/cron-failure-notifier.service';
// ...
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: CronFailureNotifierService,
  ) {}

  @Cron('0 4 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily CRM contact materialization');
    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, organizationId: true, name: true },
    });
    for (const project of projects) {
      try {
        await this.materialize(project.id);
      } catch (error) {
        this.logger.error(`CRM materialize failed for project ${project.id}: ${error}`);
        await this.notifier.report({
          organizationId: project.organizationId,
          cronName: 'crm-contacts-sync',
          resourceType: 'Project',
          resourceId: project.id,
          resourceLabel: project.name,
          errorCode: 'CRM_SYNC_FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
```

> Confirm the exact `notifier.report({...})` argument shape against an existing caller (e.g. `instagram-sync.service.ts`) — match its required fields (some accept an `actionUrl`). Register `CrmModule` to receive the notifier the same way other cron-bearing modules do (it comes from the global `CommonModule`; do not re-provide it).

- [ ] **Step 4: Run the tests + build**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm` then `corepack pnpm build`.
Expected: all green; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/crm/
git commit -m "feat(crm): daily materialization cron with failure notifications"
```

---

### Task 8: Web — API client + Contacts list page + sidebar entry + i18n

**Files:**
- Create: `apps/web/src/lib/api/crm.ts`
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/contacts/+page.svelte`
- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte` (add the `crm` project section)
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (add `crm.*` + `nav.orgCrm`)

**Interfaces:**
- Consumes: `api` from `$lib/api/client` (`api.get(endpoint, params)`, `api.post`, `api.patch`, `api.delete`); backend routes from Task 6.
- Produces: `crmApi` with typed helpers used by all CRM pages.

- [ ] **Step 1: API client** — `apps/web/src/lib/api/crm.ts`:

```ts
import { api } from './client';

export interface CrmContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  ownerId: string | null;
  source: string;
  status: string;
  tags: string[];
  notes: string | null;
  lastSeen: string | null;
  firstUtm: unknown;
  lastUtm: unknown;
}

export interface ContactsPage {
  items: CrmContact[];
  total: number;
  page: number;
  pageSize: number;
}

export const crmApi = {
  listContacts: (projectId: string, q: Record<string, string | number | undefined> = {}) =>
    api.get<ContactsPage>('/crm/contacts', { projectId, ...q }),
  getContact: (projectId: string, id: string) => api.get<CrmContact>(`/crm/contacts/${id}`, { projectId }),
  createContact: (projectId: string, body: Partial<CrmContact>) =>
    api.post<CrmContact>(`/crm/contacts?projectId=${projectId}`, body),
  updateContact: (projectId: string, id: string, body: Partial<CrmContact>) =>
    api.patch<CrmContact>(`/crm/contacts/${id}?projectId=${projectId}`, body),
  deleteContact: (projectId: string, id: string) => api.delete(`/crm/contacts/${id}?projectId=${projectId}`),
  syncContacts: (projectId: string) =>
    api.post<{ created: number; updated: number; capped: boolean }>(`/crm/contacts/sync?projectId=${projectId}`),
  // companies
  listCompanies: (projectId: string, search?: string) =>
    api.get<{ items: any[]; total: number }>('/crm/companies', { projectId, search }),
  getCompany: (projectId: string, id: string) => api.get<any>(`/crm/companies/${id}`, { projectId }),
  createCompany: (projectId: string, body: any) => api.post<any>(`/crm/companies?projectId=${projectId}`, body),
  updateCompany: (projectId: string, id: string, body: any) => api.patch<any>(`/crm/companies/${id}?projectId=${projectId}`, body),
  deleteCompany: (projectId: string, id: string) => api.delete(`/crm/companies/${id}?projectId=${projectId}`),
};
```

> CSV upload (multipart) is a follow-up wire-up in this task's UI; use a raw `fetch` to `/api/crm/contacts/import?projectId=...` with `FormData` (the shared `api` client sends JSON). Mirror the multipart upload in `apps/web/src/lib/components/MarkdownEditor.svelte` (it already posts to `/uploads/image`).

- [ ] **Step 2: Contacts list page** — `apps/web/src/routes/(app)/projects/[id]/crm/contacts/+page.svelte`. Follow the existing analytics/seo page conventions (Iris tokens: `bg-surface`, `text-ink`, `border-border`, `.btn`, `.badge`; `$page.params.id` for projectId; **guarded `projectId` watcher**, not onMount-only, per the project-switch refetch gotcha). Script logic:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { crmApi, type CrmContact } from '$lib/api/crm';

  $: projectId = $page.params['id'];

  let items: CrmContact[] = [];
  let total = 0;
  let pageNum = 1;
  const pageSize = 25;
  let search = '';
  let statusFilter = '';
  let loading = false;
  let mounted = false;
  let prevProjectId = '';

  async function load() {
    if (!projectId) return;
    loading = true;
    try {
      const res = await crmApi.listContacts(projectId, {
        page: pageNum, pageSize, search: search || undefined, status: statusFilter || undefined,
      });
      items = res.items; total = res.total;
    } finally { loading = false; }
  }

  async function syncNow() {
    if (!projectId) return;
    await crmApi.syncContacts(projectId);
    await load();
  }

  onMount(() => { mounted = true; prevProjectId = projectId; load(); });
  // project-switch safe refetch (route is reused across [id] changes)
  $: if (mounted && projectId && projectId !== prevProjectId) { prevProjectId = projectId; pageNum = 1; load(); }

  function displayName(c: CrmContact): string {
    const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return n || c.email || $_('crm.contacts.anonymous');
  }
  $: totalPages = Math.max(1, Math.ceil(total / pageSize));
</script>

<!-- Template: header with title + "Sync now" + "Add contact" + "Import CSV";
     search box + status filter; a table (name/email/company/tags/status/lastSeen);
     pagination footer. Reuse the table/markup idioms from the SEO keywords list page. -->
```

Extract `displayName` into a tiny pure module `apps/web/src/lib/api/crm-display.ts` so it can be unit-tested:

```ts
export function contactDisplayName(c: { firstName?: string | null; lastName?: string | null; email?: string | null }, fallback: string): string {
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return n || c.email || fallback;
}
```

- [ ] **Step 3: Unit-test the pure helper** — `apps/web/src/lib/api/crm-display.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contactDisplayName } from './crm-display';

describe('contactDisplayName', () => {
  it('prefers full name', () => {
    expect(contactDisplayName({ firstName: 'Ann', lastName: 'Lee', email: 'a@x.com' }, 'Anon')).toBe('Ann Lee');
  });
  it('falls back to email then to the fallback', () => {
    expect(contactDisplayName({ email: 'a@x.com' }, 'Anon')).toBe('a@x.com');
    expect(contactDisplayName({}, 'Anon')).toBe('Anon');
  });
});
```

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/lib/api/crm-display.test.ts` → PASS.

- [ ] **Step 4: Sidebar entry** — in `apps/web/src/lib/components/layout/Sidebar.svelte`: add `'crm'` to the `orgSections` array (line ~39) and add `{ seg: 'crm', iconKey: 'users', labelKey: 'nav.orgCrm' }` to the project sections list (the array containing `{ seg: 'overview', ... }`, ~line 138). If an `'identification'`/contacts icon is preferred and not present in the `icons` map, reuse `'users'`.

- [ ] **Step 5: i18n** — add to `packages/i18n/src/locales/en.json`, `pl.json`, `ru.json` (all three): `nav.orgCrm` and a `crm` namespace with at least: `crm.contacts.title`, `crm.contacts.add`, `crm.contacts.import`, `crm.contacts.syncNow`, `crm.contacts.search`, `crm.contacts.anonymous`, `crm.contacts.empty`, `crm.contacts.columns.{name,email,company,tags,status,lastSeen}`, `crm.status.{ACTIVE,UNSUBSCRIBED,ARCHIVED}`, `crm.source.{TRACKED_USER,SUBSCRIBER,MANUAL,IMPORT}`. Use the i18n-translator agent to keep en/pl/ru in sync.

- [ ] **Step 6: Build + lint + commit**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build` then `corepack pnpm lint`.
Expected: both succeed (0 lint errors).

```bash
git add apps/web/src/lib/api/crm.ts apps/web/src/lib/api/crm-display.ts apps/web/src/lib/api/crm-display.test.ts \
        apps/web/src/routes/\(app\)/projects/\[id\]/crm/contacts/ apps/web/src/lib/components/layout/Sidebar.svelte \
        packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "feat(web): CRM contacts list page, api client, sidebar entry, i18n"
```

---

### Task 9: Web — Contact detail page

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/contacts/[contactId]/+page.svelte`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (detail-card strings)

**Interfaces:**
- Consumes: `crmApi.getContact/updateContact/deleteContact` (Task 8).

- [ ] **Step 1: Detail page** — load the contact by `$page.params.contactId`, render an editable profile (firstName/lastName/email/phone), a read-only behavioural snapshot (lastSeen, firstUtm, lastUtm), tags (add/remove), owner + company selectors, notes textarea, and Save / Archive / Delete actions. Mirror the edit-form idioms used on the content detail page. Use the guarded `projectId` watcher pattern. Save calls `crmApi.updateContact(projectId, id, patch)`; Delete calls `deleteContact` then `goto('../')`.

- [ ] **Step 2: Build + lint**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint`
Expected: succeed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/crm/contacts/\[contactId\]/ packages/i18n/src/locales/
git commit -m "feat(web): CRM contact detail page"
```

---

### Task 10: Web — Companies list + detail pages

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/companies/+page.svelte`
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/companies/[companyId]/+page.svelte`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.companies.*`)

**Interfaces:**
- Consumes: `crmApi.listCompanies/getCompany/createCompany/updateCompany/deleteCompany` (Task 8).

- [ ] **Step 1: Companies list** — table (name, domain, contact count, owner), search box, "Add company" modal. Guarded `projectId` watcher. Each row links to the company detail.

- [ ] **Step 2: Company detail** — editable fields (name/domain/website/notes/owner), the list of its contacts (each linking to the contact detail), Save / Delete.

- [ ] **Step 3: i18n** — add `crm.companies.{title,add,empty,columns.{name,domain,contacts,owner}}` to en/pl/ru.

- [ ] **Step 4: Build + lint + commit**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → succeed.

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/crm/companies/ packages/i18n/src/locales/
git commit -m "feat(web): CRM companies list + detail pages"
```

---

### Task 11: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: API** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm test -- src/crm && corepack pnpm lint` → build ok, all crm tests pass, 0 lint errors.
- [ ] **Step 2: Web** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint && corepack pnpm test -- src/lib/api/crm-display.test.ts` → all succeed.
- [ ] **Step 3: i18n parity** — confirm every `crm.*` and `nav.orgCrm` key exists in **all three** of en/pl/ru (no missing keys). Use the i18n-translator agent or a quick key-diff.
- [ ] **Step 4: Commit any fixes**, then hand off to the whole-branch review (subagent-driven-development final step) before the PR into `development`.

---

## Notes for the implementer

- **`PrismaService` (verified):** import `from '../database/prisma.service'`; provide it to `CrmModule` via `imports: [DatabaseModule]` (`../database/database.module`), exactly like `instagram.module.ts`.
- **`CronFailureNotifier.report` argument shape**: copy a real call from `instagram-sync.service.ts` so required fields (and any `actionUrl`) match.
- **Anonymous tracked users** (no email) must never become contacts — the `where: { email: { not: null } }` filter enforces this.
- **Plan-cap surfacing**: when `materialize` returns `capped: true` or `create` throws `ForbiddenException`, the UI shows the i18n upgrade message — wire this in Task 8/9 rather than silently swallowing.
- **Deferred to later phases** (do NOT build): deals/pipelines, activities/tasks, AI scoring/next-step/drafts, company auto-grouping by email domain.
