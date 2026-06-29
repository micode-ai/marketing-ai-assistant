# CRM Phase 3 — Activities & Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an activity log (notes/calls/emails/meetings), a task to-do system (due dates, assignee, complete), a merged timeline on contact/deal pages, a "today" tasks dashboard, and a daily email digest of due/overdue tasks.

**Architecture:** Extends `apps/api/src/crm/` with `ActivitiesService`, `TasksService`, `TimelineService`, and a `TaskDigestService` (`@Cron`) over two new Prisma models (`Activity`, `Task`). Controllers are `ProjectAccessGuard`-protected. The digest reuses the global `MailService` + `CronFailureNotifier`. New SvelteKit tasks page + timeline sections on contact/deal detail. Spec: `docs/superpowers/specs/2026-06-29-crm-activities-tasks-design.md`.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL), `@nestjs/schedule`, Jest (api), SvelteKit 2 + Vitest (web), svelte-i18n (en/pl/ru).

## Global Constraints

- IDs are `cuid()` — DTOs use `@IsString() @IsNotEmpty()`, never `@IsUUID()`.
- Every `crm` controller route is `@UseGuards(ProjectAccessGuard)` (class-level), `projectId` as a query param — mirror `apps/api/src/crm/contacts.controller.ts`.
- `PrismaService` is imported `from '../database/prisma.service'`; provided to `CrmModule` via `imports: [DatabaseModule]` (already there). New services go in `CrmModule.providers`, new controllers in `CrmModule.controllers`.
- `MailService` is provided by a `@Global()` `MailModule` — inject it directly (no import needed). `CronFailureNotifier` (global `CommonModule`) and `ScheduleModule.forRoot()` (in `app.module.ts`) are already available — do NOT re-provide them.
- **No plan gating** — activities/tasks are available on all plans (no `PLAN_LIMITS` change).
- **The global ValidationPipe runs `whitelist: true, forbidNonWhitelisted: true`** (`apps/api/src/main.ts`). Web request bodies must send ONLY fields declared in the DTO — any extra key → HTTP 400. (This bit Phase 2; do not repeat it.)
- "Today"/overdue boundaries are computed in **UTC day** terms server-side: `startOfToday = new Date(); startOfToday.setUTCHours(0,0,0,0)`; `startOfTomorrow = startOfToday + 24h`. overdue = `dueDate < startOfToday`; today = `startOfToday <= dueDate < startOfTomorrow`; upcoming = `dueDate >= startOfTomorrow` or null.
- Entity-link FKs (`contactId`/`dealId`/`companyId`/`ownerId`) are `onDelete: SetNull`; `projectId` is `onDelete: Cascade`.
- i18n: every new string added to **en, pl, ru** together (`packages/i18n/src/locales/{en,pl,ru}.json`), namespaces `crm.activities.*` / `crm.tasks.*`, in exact key parity. No raw English in markup (input `placeholder` format-examples tolerated).
- Migration is additive (new tables + enums + FKs only). If local Postgres is up: `cd packages/database && corepack pnpm db:migrate:dev --name crm_activities_tasks`. If Docker/Postgres is unavailable, hand-author the migration SQL (Task 1 gives it) and run `corepack pnpm db:generate` from the repo root; the prod `migrator` applies it via `prisma migrate deploy`.
- Use `NODE_OPTIONS=--max-old-space-size=4096` for `corepack pnpm build`. Run the relevant app's `lint` before pushing.

---

### Task 1: Schema + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (2 models, 2 enums, back-relations)
- Create: `packages/database/prisma/migrations/20260629150000_crm_activities_tasks/migration.sql`

**Interfaces:**
- Produces: Prisma models `Activity` (`id, projectId, type, body, occurredAt, ownerId?, contactId?, dealId?, companyId?`) and `Task` (`id, projectId, title, description?, dueDate?, status, completedAt?, ownerId?, contactId?, dealId?, companyId?`); enums `ActivityType` (`NOTE|CALL|EMAIL|MEETING`), `TaskStatus` (`OPEN|DONE`).

- [ ] **Step 1: Add the enums + models to `schema.prisma`** (after the Phase-2 `Deal` model):

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

- [ ] **Step 2: Add back-relations.** In `model Project { … }` add `activities Activity[]` and `tasks Task[]`. In `model User { … }` add `activities Activity[] @relation("ActivityOwner")` and `tasks Task[] @relation("TaskOwner")`. In `model Contact { … }` add `activities Activity[]` and `tasks Task[]`. In `model Deal { … }` add `activities Activity[]` and `tasks Task[]`. In `model Company { … }` add `activities Activity[]` and `tasks Task[]`.

- [ ] **Step 3: Author the migration SQL** — `packages/database/prisma/migrations/20260629150000_crm_activities_tasks/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_projectId_idx" ON "activities"("projectId");
CREATE INDEX "activities_contactId_idx" ON "activities"("contactId");
CREATE INDEX "activities_dealId_idx" ON "activities"("dealId");
CREATE INDEX "tasks_projectId_status_idx" ON "tasks"("projectId", "status");
CREATE INDEX "tasks_ownerId_dueDate_idx" ON "tasks"("ownerId", "dueDate");
CREATE INDEX "tasks_contactId_idx" ON "tasks"("contactId");
CREATE INDEX "tasks_dealId_idx" ON "tasks"("dealId");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate + typecheck.** `cd /d/Work/micode/marketing-ai-assistant && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm db:generate` → `Tasks: 1 successful`. Then `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm --filter api build` → succeeds.

- [ ] **Step 5: Commit.**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): Activity + Task models and migration"
```

---

### Task 2: ActivitiesService (CRUD + filters)

**Files:**
- Create: `apps/api/src/crm/activities.service.ts`, `apps/api/src/crm/activities.service.spec.ts`

**Interfaces:**
- Produces: `class ActivitiesService` with `list(projectId, { contactId?, dealId?, companyId?, type? })`, `create(projectId, dto)`, `update(projectId, id, dto)`, `remove(projectId, id)`. Constructor `(prisma: PrismaService)`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/activities.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

function makePrisma() {
  return {
    activity: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'a1' }),
    },
  };
}

describe('ActivitiesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ActivitiesService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new ActivitiesService(prisma as any); });

  it('list filters by contactId + type and sorts occurredAt desc', async () => {
    await service.list('p1', { contactId: 'c1', type: 'CALL' });
    const arg = prisma.activity.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ projectId: 'p1', contactId: 'c1', type: 'CALL' });
    expect(arg.orderBy).toEqual({ occurredAt: 'desc' });
  });

  it('create sets projectId + scopes; defaults occurredAt absent → not forced', async () => {
    const res = await service.create('p1', { type: 'NOTE', body: 'hi', contactId: 'c1' });
    const data = prisma.activity.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', type: 'NOTE', body: 'hi', contactId: 'c1' });
    expect(res.id).toBe('a1');
  });

  it('update/remove are project-scoped (NotFound when foreign)', async () => {
    prisma.activity.findFirst.mockResolvedValue(null);
    await expect(service.update('p1', 'x', { body: 'b' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('p1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/activities.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement `ActivitiesService`** — `apps/api/src/crm/activities.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    projectId: string,
    opts: { contactId?: string; dealId?: string; companyId?: string; type?: string },
  ) {
    const where: any = { projectId };
    if (opts.contactId) where.contactId = opts.contactId;
    if (opts.dealId) where.dealId = opts.dealId;
    if (opts.companyId) where.companyId = opts.companyId;
    if (opts.type) where.type = opts.type;
    return this.prisma.activity.findMany({
      where,
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async create(projectId: string, dto: any) {
    return this.prisma.activity.create({
      data: {
        projectId,
        type: dto.type,
        body: dto.body,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        ownerId: dto.ownerId ?? null,
        contactId: dto.contactId ?? null,
        dealId: dto.dealId ?? null,
        companyId: dto.companyId ?? null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.activity.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Activity not found');
    const data: any = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.occurredAt !== undefined) data.occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : null;
    return this.prisma.activity.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.activity.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Activity not found');
    await this.prisma.activity.delete({ where: { id } });
    return { deleted: true as const };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/activities.service.spec.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/activities.service.ts apps/api/src/crm/activities.service.spec.ts
git commit -m "feat(crm): ActivitiesService CRUD + filters"
```

---

### Task 3: TasksService (CRUD, scope queries, complete/reopen, summary)

**Files:**
- Create: `apps/api/src/crm/tasks.service.ts`, `apps/api/src/crm/tasks.service.spec.ts`

**Interfaces:**
- Produces: `class TasksService` with `list(projectId, { status?, ownerId?, scope?, contactId?, dealId?, companyId? })`, `summary(projectId, { ownerId? })` → `{ overdue, today, upcoming }`, `get(projectId, id)`, `create(projectId, dto)`, `update(projectId, id, dto)`, `complete(projectId, id)`, `reopen(projectId, id)`, `remove(projectId, id)`. Static helpers `dayBounds()` → `{ startOfToday, startOfTomorrow }` and `scopeWhere(scope, bounds)`. Constructor `(prisma: PrismaService)`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/tasks.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

function makePrisma() {
  return {
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 't1' }),
    },
  };
}

describe('TasksService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TasksService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new TasksService(prisma as any); });

  it('list scope=overdue → OPEN + dueDate < startOfToday', async () => {
    await service.list('p1', { scope: 'overdue' });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe('p1');
    expect(where.status).toBe('OPEN');
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  it('list scope=today → OPEN + startOfToday <= dueDate < startOfTomorrow', async () => {
    await service.list('p1', { scope: 'today' });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('OPEN');
    expect(where.dueDate.gte).toBeInstanceOf(Date);
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  it('create sets OPEN status + project scope', async () => {
    const res = await service.create('p1', { title: 'Call Bob', dueDate: '2026-07-01', ownerId: 'u1' });
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', title: 'Call Bob', status: 'OPEN', ownerId: 'u1' });
    expect(data.dueDate).toBeInstanceOf(Date);
  });

  it('complete sets DONE + completedAt; reopen clears it; both project-scoped', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't1', projectId: 'p1' });
    await service.complete('p1', 't1');
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'DONE' });
    expect(prisma.task.update.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    await service.reopen('p1', 't1');
    expect(prisma.task.update.mock.calls[1][0].data).toEqual({ status: 'OPEN', completedAt: null });
  });

  it('complete throws NotFound when foreign', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.complete('p1', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('summary returns overdue/today/upcoming counts', async () => {
    prisma.task.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    const s = await service.summary('p1', {});
    expect(s).toEqual({ overdue: 2, today: 1, upcoming: 5 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/tasks.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement `TasksService`** — `apps/api/src/crm/tasks.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

function dayBounds() {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return { startOfToday, startOfTomorrow };
}

function scopeWhere(scope: string | undefined): any {
  const { startOfToday, startOfTomorrow } = dayBounds();
  if (scope === 'overdue') return { status: 'OPEN', dueDate: { lt: startOfToday } };
  if (scope === 'today') return { status: 'OPEN', dueDate: { gte: startOfToday, lt: startOfTomorrow } };
  if (scope === 'upcoming') return { status: 'OPEN', dueDate: { gte: startOfTomorrow } };
  return {};
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    projectId: string,
    opts: { status?: string; ownerId?: string; scope?: string; contactId?: string; dealId?: string; companyId?: string },
  ) {
    const where: any = { projectId, ...scopeWhere(opts.scope) };
    if (opts.status) where.status = opts.status;
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.contactId) where.contactId = opts.contactId;
    if (opts.dealId) where.dealId = opts.dealId;
    if (opts.companyId) where.companyId = opts.companyId;
    return this.prisma.task.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        deal: { select: { id: true, title: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async summary(projectId: string, opts: { ownerId?: string }) {
    const base: any = { projectId };
    if (opts.ownerId) base.ownerId = opts.ownerId;
    const [overdue, today, upcoming] = await Promise.all([
      this.prisma.task.count({ where: { ...base, ...scopeWhere('overdue') } }),
      this.prisma.task.count({ where: { ...base, ...scopeWhere('today') } }),
      this.prisma.task.count({ where: { ...base, ...scopeWhere('upcoming') } }),
    ]);
    return { overdue, today, upcoming };
  }

  async get(projectId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, projectId },
      include: { owner: true, contact: true, deal: true, company: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(projectId: string, dto: any) {
    return this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'OPEN',
        ownerId: dto.ownerId ?? null,
        contactId: dto.contactId ?? null,
        dealId: dto.dealId ?? null,
        companyId: dto.companyId ?? null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    const data: any = {};
    for (const k of ['title', 'description', 'ownerId', 'contactId', 'dealId', 'companyId']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    return this.prisma.task.update({ where: { id }, data });
  }

  async complete(projectId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.update({ where: { id }, data: { status: 'DONE', completedAt: new Date() } });
  }

  async reopen(projectId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.update({ where: { id }, data: { status: 'OPEN', completedAt: null } });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
    return { deleted: true as const };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/tasks.service.spec.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/tasks.service.ts apps/api/src/crm/tasks.service.spec.ts
git commit -m "feat(crm): TasksService CRUD, scope queries, complete/reopen, summary"
```

---

### Task 4: TimelineService (merged activities + tasks)

**Files:**
- Create: `apps/api/src/crm/timeline.service.ts`, `apps/api/src/crm/timeline.service.spec.ts`

**Interfaces:**
- Produces: `class TimelineService` with `timeline(projectId, { contactId?, dealId? }): Promise<TimelineItem[]>` where `TimelineItem = { kind: 'activity' | 'task'; id: string; date: Date; data: any }`, sorted by `date` desc. Constructor `(prisma: PrismaService)`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/timeline.service.spec.ts`:

```ts
import { TimelineService } from './timeline.service';

function makePrisma() {
  return {
    activity: { findMany: jest.fn().mockResolvedValue([]) },
    task: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('TimelineService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TimelineService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new TimelineService(prisma as any); });

  it('merges activities + tasks for a contact and sorts by date desc', async () => {
    prisma.activity.findMany.mockResolvedValue([
      { id: 'a1', occurredAt: new Date('2026-06-10'), type: 'CALL', body: 'rang' },
    ]);
    prisma.task.findMany.mockResolvedValue([
      { id: 't1', dueDate: new Date('2026-06-20'), createdAt: new Date('2026-06-01'), title: 'follow up' },
      { id: 't2', dueDate: null, createdAt: new Date('2026-06-05'), title: 'no due' },
    ]);

    const items = await service.timeline('p1', { contactId: 'c1' });

    expect(items.map((i) => i.id)).toEqual(['t1', 'a1', 't2']); // 06-20, 06-10, 06-05(createdAt fallback)
    expect(items[0]).toMatchObject({ kind: 'task', id: 't1' });
    expect(items[1]).toMatchObject({ kind: 'activity', id: 'a1' });
    // both queries scoped to the contact
    expect(prisma.activity.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'p1', contactId: 'c1' });
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'p1', contactId: 'c1' });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/timeline.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement `TimelineService`** — `apps/api/src/crm/timeline.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface TimelineItem {
  kind: 'activity' | 'task';
  id: string;
  date: Date;
  data: any;
}

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async timeline(
    projectId: string,
    opts: { contactId?: string; dealId?: string },
  ): Promise<TimelineItem[]> {
    const where: any = { projectId };
    if (opts.contactId) where.contactId = opts.contactId;
    if (opts.dealId) where.dealId = opts.dealId;

    const [activities, tasks] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { owner: { select: { id: true, name: true } } },
      }),
      this.prisma.task.findMany({
        where,
        include: { owner: { select: { id: true, name: true } } },
      }),
    ]);

    const items: TimelineItem[] = [
      ...activities.map((a: any) => ({ kind: 'activity' as const, id: a.id, date: new Date(a.occurredAt), data: a })),
      ...tasks.map((t: any) => ({ kind: 'task' as const, id: t.id, date: new Date(t.dueDate ?? t.createdAt), data: t })),
    ];
    items.sort((x, y) => y.date.getTime() - x.date.getTime());
    return items;
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/timeline.service.spec.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/timeline.service.ts apps/api/src/crm/timeline.service.spec.ts
git commit -m "feat(crm): TimelineService — merged activities + tasks"
```

---

### Task 5: Task-digest email renderer + MailService.sendTaskDigest

**Files:**
- Create: `apps/api/src/mail/task-digest-email.ts`, `apps/api/src/mail/task-digest-email.spec.ts`
- Modify: `apps/api/src/mail/mail.service.ts` (+ `sendTaskDigest`)
- Modify: `apps/api/src/mail/cron-failure-email.ts` (add `'crm-task-digest'` to the `CronName` union + a label in each locale's `cronLabels`)

**Interfaces:**
- Produces: `renderTaskDigestEmail(input: TaskDigestEmailInput): { subject: string; html: string }` where `TaskDigestEmailInput = { language: string; projectName: string; overdue: DigestTask[]; today: DigestTask[] }` and `DigestTask = { title: string; dueDate: Date | null; linked?: string | null }`. `MailService.sendTaskDigest(params: { to: string } & TaskDigestEmailInput)`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/mail/task-digest-email.spec.ts`:

```ts
import { renderTaskDigestEmail } from './task-digest-email';

describe('renderTaskDigestEmail', () => {
  const base = {
    projectName: 'Acme',
    overdue: [{ title: 'Call Bob', dueDate: new Date('2026-06-20'), linked: 'Bob Smith' }],
    today: [{ title: 'Email Jane', dueDate: new Date('2026-06-29'), linked: null }],
  };

  it('renders EN subject + includes task titles and section labels', () => {
    const { subject, html } = renderTaskDigestEmail({ language: 'en', ...base });
    expect(subject).toContain('Acme');
    expect(html).toContain('Call Bob');
    expect(html).toContain('Email Jane');
    expect(html.toLowerCase()).toContain('overdue');
  });

  it('falls back to EN for an unknown language and uses RU strings for ru', () => {
    expect(renderTaskDigestEmail({ language: 'zz', ...base }).html).toContain('Call Bob');
    const ru = renderTaskDigestEmail({ language: 'ru', ...base });
    expect(ru.html).toContain('Call Bob'); // titles are user content, unchanged
    expect(ru.subject.length).toBeGreaterThan(0);
  });

  it('omits the overdue section when there are no overdue tasks', () => {
    const { html } = renderTaskDigestEmail({ language: 'en', projectName: 'Acme', overdue: [], today: base.today });
    expect(html).toContain('Email Jane');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/mail/task-digest-email.spec.ts` → FAIL.

- [ ] **Step 3: Implement the renderer** — `apps/api/src/mail/task-digest-email.ts` (mirror `cron-failure-email.ts`'s inline EN/PL/RU structure):

```ts
export interface DigestTask {
  title: string;
  dueDate: Date | null;
  linked?: string | null;
}

export interface TaskDigestEmailInput {
  language: string;
  projectName: string;
  overdue: DigestTask[];
  today: DigestTask[];
}

interface Strings {
  subject: (project: string) => string;
  heading: string;
  overdue: string;
  today: string;
  due: string;
  noDue: string;
}

const STRINGS: Record<string, Strings> = {
  en: {
    subject: (p) => `Your CRM tasks for today — ${p}`,
    heading: 'Tasks needing attention',
    overdue: 'Overdue',
    today: 'Due today',
    due: 'Due',
    noDue: 'No due date',
  },
  pl: {
    subject: (p) => `Twoje zadania CRM na dziś — ${p}`,
    heading: 'Zadania wymagające uwagi',
    overdue: 'Zaległe',
    today: 'Na dziś',
    due: 'Termin',
    noDue: 'Bez terminu',
  },
  ru: {
    subject: (p) => `Ваши задачи CRM на сегодня — ${p}`,
    heading: 'Задачи, требующие внимания',
    overdue: 'Просрочено',
    today: 'На сегодня',
    due: 'Срок',
    noDue: 'Без срока',
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function section(title: string, tasks: DigestTask[], s: Strings): string {
  if (tasks.length === 0) return '';
  const rows = tasks
    .map((t) => {
      const due = t.dueDate ? `${s.due}: ${fmtDate(t.dueDate)}` : s.noDue;
      const linked = t.linked ? ` — ${escapeHtml(t.linked)}` : '';
      return `<li style="margin:6px 0;"><strong>${escapeHtml(t.title)}</strong>${linked} <span style="color:#666;font-size:13px;">(${due})</span></li>`;
    })
    .join('');
  return `<h3 style="color:#333;margin:16px 0 4px;">${title}</h3><ul style="padding-left:18px;">${rows}</ul>`;
}

export function renderTaskDigestEmail(input: TaskDigestEmailInput): { subject: string; html: string } {
  const s = STRINGS[input.language] || STRINGS.en;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color:#333;">${escapeHtml(s.heading)} — ${escapeHtml(input.projectName)}</h2>
      ${section(s.overdue, input.overdue, s)}
      ${section(s.today, input.today, s)}
    </div>
  `;
  return { subject: s.subject(input.projectName), html };
}
```

- [ ] **Step 4: Add `sendTaskDigest` to `MailService`** — in `apps/api/src/mail/mail.service.ts` (mirror `sendCronFailure`):

```ts
  async sendTaskDigest(params: { to: string } & import('./task-digest-email').TaskDigestEmailInput) {
    const { to, ...input } = params;
    const { renderTaskDigestEmail } = await import('./task-digest-email');
    const { subject, html } = renderTaskDigestEmail(input);
    await this.send({ to, subject, html });
  }
```

(If the file already imports from sibling mail modules at the top, use a top-level `import { renderTaskDigestEmail } from './task-digest-email';` instead of the dynamic import — match the existing `cron-failure-email` import style in this file.)

- [ ] **Step 5: Add the cron label** — in `apps/api/src/mail/cron-failure-email.ts`, add `'crm-task-digest'` to the `CronName` union and a label to each locale's `cronLabels` map (EN `'CRM task digest'`, PL `'Podsumowanie zadań CRM'`, RU `'Дайджест задач CRM'`).

- [ ] **Step 6: Run the renderer tests + build** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/mail/task-digest-email.spec.ts` → PASS; `corepack pnpm build` → succeeds.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/mail/task-digest-email.ts apps/api/src/mail/task-digest-email.spec.ts apps/api/src/mail/mail.service.ts apps/api/src/mail/cron-failure-email.ts
git commit -m "feat(mail): task-digest email renderer + sendTaskDigest + cron label"
```

---

### Task 6: TaskDigestService (daily cron)

**Files:**
- Create: `apps/api/src/crm/task-digest.service.ts`, `apps/api/src/crm/task-digest.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `MailService` (global), `CronFailureNotifier` (global), `renderTaskDigestEmail` (Task 5).
- Produces: `class TaskDigestService` with `@Cron('0 7 * * *') handleCron(): Promise<void>`. Constructor `(prisma, mail: MailService, notifier: CronFailureNotifier)`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/task-digest.service.spec.ts`:

```ts
import { TaskDigestService } from './task-digest.service';

describe('TaskDigestService.handleCron', () => {
  it('groups due/overdue OPEN tasks by owner and sends one digest per owner in their language', async () => {
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(startOfToday.getTime() - 3600_000);
    const laterToday = new Date(startOfToday.getTime() + 3600_000);
    const prisma: any = {
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Acme' }]) },
      task: {
        findMany: jest.fn().mockResolvedValue([
          { id: 't1', title: 'Overdue call', dueDate: yesterday, ownerId: 'u1', owner: { id: 'u1', email: 'u1@x.com', language: 'ru', name: 'U1' }, contact: null, deal: null },
          { id: 't2', title: 'Today email', dueDate: laterToday, ownerId: 'u1', owner: { id: 'u1', email: 'u1@x.com', language: 'ru', name: 'U1' }, contact: null, deal: null },
          { id: 't3', title: 'Other owner', dueDate: laterToday, ownerId: 'u2', owner: { id: 'u2', email: 'u2@x.com', language: 'en', name: 'U2' }, contact: null, deal: null },
        ]),
      },
    };
    const mail = { sendTaskDigest: jest.fn().mockResolvedValue(undefined) };
    const notifier = { report: jest.fn() };
    const service = new TaskDigestService(prisma, mail as any, notifier as any);

    await service.handleCron();

    expect(mail.sendTaskDigest).toHaveBeenCalledTimes(2); // u1 + u2
    const u1Call = mail.sendTaskDigest.mock.calls.find((c: any) => c[0].to === 'u1@x.com')[0];
    expect(u1Call.language).toBe('ru');
    expect(u1Call.overdue.map((t: any) => t.title)).toEqual(['Overdue call']);
    expect(u1Call.today.map((t: any) => t.title)).toEqual(['Today email']);
  });

  it('reports a per-project failure via CronFailureNotifier and continues', async () => {
    const prisma: any = {
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Acme', organizationId: 'org_1' }]) },
      task: { findMany: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const mail = { sendTaskDigest: jest.fn() };
    const notifier = { report: jest.fn() };
    const service = new TaskDigestService(prisma, mail as any, notifier as any);
    await service.handleCron();
    expect(notifier.report).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/task-digest.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement `TaskDigestService`** — `apps/api/src/crm/task-digest.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CronFailureNotifier } from '../common/cron-failure-notifier.service';
import type { DigestTask } from '../mail/task-digest-email';

@Injectable()
export class TaskDigestService {
  private readonly logger = new Logger(TaskDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifier: CronFailureNotifier,
  ) {}

  @Cron('0 7 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily CRM task digest');
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, organizationId: true },
    });

    for (const project of projects) {
      try {
        const tasks = await this.prisma.task.findMany({
          where: {
            projectId: project.id,
            status: 'OPEN',
            ownerId: { not: null },
            dueDate: { not: null, lt: startOfTomorrow },
          },
          include: {
            owner: { select: { id: true, email: true, language: true, name: true } },
            contact: { select: { firstName: true, lastName: true } },
            deal: { select: { title: true } },
          },
        });
        if (tasks.length === 0) continue;

        const byOwner = new Map<string, { email: string; language: string; tasks: any[] }>();
        for (const t of tasks) {
          if (!t.owner?.email) continue;
          const g = byOwner.get(t.owner.id) ?? { email: t.owner.email, language: t.owner.language || 'en', tasks: [] };
          g.tasks.push(t);
          byOwner.set(t.owner.id, g);
        }

        for (const [, g] of byOwner) {
          const overdue: DigestTask[] = [];
          const today: DigestTask[] = [];
          for (const t of g.tasks) {
            const linked =
              t.contact ? [t.contact.firstName, t.contact.lastName].filter(Boolean).join(' ') :
              t.deal ? t.deal.title : null;
            const item: DigestTask = { title: t.title, dueDate: t.dueDate, linked };
            if (new Date(t.dueDate) < startOfToday) overdue.push(item);
            else today.push(item);
          }
          await this.mail.sendTaskDigest({
            to: g.email,
            language: g.language,
            projectName: project.name,
            overdue,
            today,
          });
        }
      } catch (error) {
        this.logger.error(`CRM task digest failed for project ${project.id}: ${error}`);
        await this.notifier.report({
          organizationId: project.organizationId,
          cronName: 'crm-task-digest',
          resourceType: 'Project',
          resourceId: project.id,
          resourceLabel: project.name,
          errorCode: 'CRM_TASK_DIGEST_FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
```

> Confirm the `CronFailureNotifier.report({...})` argument shape against an existing caller (e.g. `apps/api/src/crm/contacts-sync.service.ts` from Phase 1) — copy its required fields (it includes `actionUrl` in some callers; add `actionUrl: \`${process.env.WEB_URL}/projects/${project.id}/crm/tasks\`` if the interface requires it, matching how `contacts-sync.service.ts` builds it).

- [ ] **Step 4: Run the tests + build** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/task-digest.service.spec.ts` → PASS; `corepack pnpm build` → succeeds.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/task-digest.service.ts apps/api/src/crm/task-digest.service.spec.ts
git commit -m "feat(crm): daily task-digest cron, grouped by owner with i18n email"
```

---

### Task 7: Controllers, DTOs, module wiring

**Files:**
- Create: `apps/api/src/crm/dto/activity.dto.ts`, `apps/api/src/crm/dto/task.dto.ts`, `apps/api/src/crm/activities.controller.ts`, `apps/api/src/crm/tasks.controller.ts`, `apps/api/src/crm/timeline.controller.ts`
- Modify: `apps/api/src/crm/crm.module.ts`

**Interfaces:**
- Consumes: `ActivitiesService`, `TasksService`, `TimelineService`, `TaskDigestService`; `ProjectAccessGuard`.

- [ ] **Step 1: DTOs** — `apps/api/src/crm/dto/activity.dto.ts`:

```ts
import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const TYPES = ['NOTE', 'CALL', 'EMAIL', 'MEETING'];

export class CreateActivityDto {
  @IsIn(TYPES) type!: string;
  @IsString() @IsNotEmpty() body!: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() companyId?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}
```

`apps/api/src/crm/dto/task.dto.ts`:

```ts
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() companyId?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() companyId?: string;
}
```

- [ ] **Step 2: ActivitiesController** — `apps/api/src/crm/activities.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/activities')
@UseGuards(ProjectAccessGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
  ) {
    return this.activities.list(projectId, { contactId, dealId, companyId, type });
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateActivityDto) {
    return this.activities.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activities.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.activities.remove(projectId, id);
  }
}
```

- [ ] **Step 3: TasksController** — `apps/api/src/crm/tasks.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/tasks')
@UseGuards(ProjectAccessGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('summary')
  summary(@Query('projectId') projectId: string, @Query('ownerId') ownerId?: string) {
    return this.tasks.summary(projectId, { ownerId });
  }

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('scope') scope?: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.tasks.list(projectId, { status, ownerId, scope, contactId, dealId, companyId });
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateTaskDto) {
    return this.tasks.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(projectId, id, dto);
  }

  @Post(':id/complete')
  complete(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.complete(projectId, id);
  }

  @Post(':id/reopen')
  reopen(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.reopen(projectId, id);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.tasks.remove(projectId, id);
  }
}
```

> Route order: `@Get('summary')` is declared BEFORE `@Get(':id')` so `summary` isn't captured as an `:id`.

- [ ] **Step 4: TimelineController** — `apps/api/src/crm/timeline.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { TimelineService } from './timeline.service';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/timeline')
@UseGuards(ProjectAccessGuard)
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  get(
    @Query('projectId') projectId: string,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
  ) {
    return this.timeline.timeline(projectId, { contactId, dealId });
  }
}
```

- [ ] **Step 5: Register in `crm.module.ts`** — add the imports and extend the arrays:

```ts
  controllers: [ /* existing */, ActivitiesController, TasksController, TimelineController ],
  providers: [ /* existing */, ActivitiesService, TasksService, TimelineService, TaskDigestService ],
```

- [ ] **Step 6: Verify** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build` → succeeds; `corepack pnpm test -- src/crm` → all green; `corepack pnpm lint` → 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/crm/
git commit -m "feat(crm): activities/tasks/timeline controllers, DTOs, module wiring"
```

---

### Task 8: Web — Tasks page + api client + sub-nav + i18n

**Files:**
- Create: `apps/web/src/lib/api/crm-tasks.ts`, `apps/web/src/lib/api/crm-tasks-bucket.ts` (+ `.test.ts`)
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/tasks/+page.svelte`
- Modify: CRM sub-nav pill strip (add **Tasks**) on the contacts/companies/deals list pages
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.tasks.*`, `crm.nav.tasks`)

**Interfaces:**
- Consumes: shared `api` client; `crm-owners.ts` (assignee picker). Tasks/activities API from Task 7.
- Produces: `tasksApi` (listTasks/getTask/createTask/updateTask/completeTask/reopenTask/deleteTask/summary; listActivities/createActivity/updateActivity/deleteActivity; timeline).

- [ ] **Step 1: API client** — `apps/web/src/lib/api/crm-tasks.ts`:

```ts
import { api } from './client';

export interface CrmTask {
  id: string; title: string; description: string | null; dueDate: string | null;
  status: 'OPEN' | 'DONE'; completedAt: string | null; ownerId: string | null;
  contactId: string | null; dealId: string | null; companyId: string | null;
  owner?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string | null; lastName: string | null } | null;
  deal?: { id: string; title: string } | null;
}
export interface CrmActivity {
  id: string; type: 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING'; body: string; occurredAt: string;
  ownerId: string | null; contactId: string | null; dealId: string | null; companyId: string | null;
  owner?: { id: string; name: string } | null;
}
export interface TimelineItem { kind: 'activity' | 'task'; id: string; date: string; data: any }

export const tasksApi = {
  listTasks: (projectId: string, q: Record<string, string | undefined> = {}) => api.get<CrmTask[]>('/crm/tasks', { projectId, ...q }),
  summary: (projectId: string, ownerId?: string) => api.get<{ overdue: number; today: number; upcoming: number }>('/crm/tasks/summary', { projectId, ownerId }),
  createTask: (projectId: string, body: any) => api.post<CrmTask>(`/crm/tasks?projectId=${projectId}`, body),
  updateTask: (projectId: string, id: string, body: any) => api.patch<CrmTask>(`/crm/tasks/${id}?projectId=${projectId}`, body),
  completeTask: (projectId: string, id: string) => api.post<CrmTask>(`/crm/tasks/${id}/complete?projectId=${projectId}`),
  reopenTask: (projectId: string, id: string) => api.post<CrmTask>(`/crm/tasks/${id}/reopen?projectId=${projectId}`),
  deleteTask: (projectId: string, id: string) => api.delete(`/crm/tasks/${id}?projectId=${projectId}`),
  listActivities: (projectId: string, q: Record<string, string | undefined> = {}) => api.get<CrmActivity[]>('/crm/activities', { projectId, ...q }),
  createActivity: (projectId: string, body: any) => api.post<CrmActivity>(`/crm/activities?projectId=${projectId}`, body),
  updateActivity: (projectId: string, id: string, body: any) => api.patch<CrmActivity>(`/crm/activities/${id}?projectId=${projectId}`, body),
  deleteActivity: (projectId: string, id: string) => api.delete(`/crm/activities/${id}?projectId=${projectId}`),
  timeline: (projectId: string, q: { contactId?: string; dealId?: string }) => api.get<TimelineItem[]>('/crm/timeline', { projectId, ...q }),
};
```

> **ValidationPipe note:** `createTask`/`createActivity` bodies must contain ONLY DTO fields (Task 7). Do NOT add a `status`, `currency`, or any extra key — the server rejects unknown properties (the Phase-2 bug). Send `dueDate` as an ISO string.

- [ ] **Step 2: Pure bucket helper + test** — `apps/web/src/lib/api/crm-tasks-bucket.ts`:

```ts
export type Bucket = 'overdue' | 'today' | 'upcoming';

export function taskBucket(dueDate: string | null, now: Date): Bucket {
  if (!dueDate) return 'upcoming';
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const d = new Date(dueDate);
  if (d < start) return 'overdue';
  if (d < tomorrow) return 'today';
  return 'upcoming';
}
```

`apps/web/src/lib/api/crm-tasks-bucket.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { taskBucket } from './crm-tasks-bucket';

describe('taskBucket', () => {
  const now = new Date('2026-06-29T12:00:00Z');
  it('overdue / today / upcoming / no-due', () => {
    expect(taskBucket('2026-06-28T10:00:00Z', now)).toBe('overdue');
    expect(taskBucket('2026-06-29T23:00:00Z', now)).toBe('today');
    expect(taskBucket('2026-07-01T00:00:00Z', now)).toBe('upcoming');
    expect(taskBucket(null, now)).toBe('upcoming');
  });
});
```

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/lib/api/crm-tasks-bucket.test.ts` → PASS.

- [ ] **Step 3: Tasks page** — `apps/web/src/routes/(app)/projects/[id]/crm/tasks/+page.svelte`. Mirror the Phase-1/2 CRM list pages (Iris tokens, guarded `projectId` watcher, sub-nav pill strip with Tasks active, toast). Load `tasksApi.listTasks(projectId, { status: 'OPEN' })`, bucket client-side with `taskBucket` (or call the API per-scope), render three groups (Overdue / Today / Upcoming) with a one-click complete checkbox (`completeTask` → reload), a "my tasks" toggle (filters `ownerId` to the current user from `currentUser` store), and an "Add task" modal (title/description/dueDate/owner/contact/deal). Every string i18n'd.

- [ ] **Step 4: Sub-nav + i18n** — add a **Tasks** pill to the CRM sub-nav strip on the contacts/companies/deals list pages → `/projects/{projectId}/crm/tasks`. Add to en/pl/ru in parity: `crm.nav.tasks`, `crm.tasks.{title,add,empty,overdue,today,upcoming,myTasks,complete,reopen,due,noDue,form.title,form.description,form.dueDate,form.owner}`, `crm.activities.{title,log,types.NOTE,types.CALL,types.EMAIL,types.MEETING,occurredAt,body}`.

- [ ] **Step 5: Build + lint + commit** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → 0 errors.

```bash
git add apps/web/src/lib/api/crm-tasks.ts apps/web/src/lib/api/crm-tasks-bucket.ts apps/web/src/lib/api/crm-tasks-bucket.test.ts \
        apps/web/src/routes/\(app\)/projects/\[id\]/crm/tasks/ \
        apps/web/src/routes/\(app\)/projects/\[id\]/crm/contacts/+page.svelte apps/web/src/routes/\(app\)/projects/\[id\]/crm/companies/+page.svelte apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/+page.svelte \
        packages/i18n/src/locales/
git commit -m "feat(web): CRM tasks page, api client, bucket helper, sub-nav, i18n"
```

---

### Task 9: Web — timeline section on contact + deal detail

**Files:**
- Create: `apps/web/src/lib/components/crm/CrmTimeline.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/crm/contacts/[contactId]/+page.svelte` and `.../crm/deals/[dealId]/+page.svelte` (embed the timeline)
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (timeline strings if new)

**Interfaces:**
- Consumes: `tasksApi.timeline/createActivity/createTask/completeTask` (Task 8); `crm-owners.ts`.

- [ ] **Step 1: Timeline component** — `CrmTimeline.svelte` takes props `{ projectId, contactId?, dealId? }`. On mount (guarded), loads `tasksApi.timeline(projectId, { contactId, dealId })`, renders each item date-desc with a type icon (activity type or task), title/body, owner, date; a task item shows a complete checkbox (`completeTask` → reload). Two actions above the list: "Log activity" modal (type select + body + occurredAt) → `createActivity` pre-linked to the contact/deal; "Add task" modal (title + dueDate + owner) → `createTask` pre-linked. Iris tokens; every string i18n'd (reuse `crm.activities.*` / `crm.tasks.*`).

- [ ] **Step 2: Embed** in the contact-detail and deal-detail pages — add `<CrmTimeline {projectId} contactId={contact.id} />` (contact page) and `<CrmTimeline {projectId} dealId={deal.id} />` (deal page) in a "Timeline" section.

- [ ] **Step 3: Build + lint** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → succeed.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/lib/components/crm/CrmTimeline.svelte apps/web/src/routes/\(app\)/projects/\[id\]/crm/contacts/\[contactId\]/ apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/\[dealId\]/ packages/i18n/src/locales/
git commit -m "feat(web): CRM timeline on contact + deal detail"
```

---

### Task 10: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: API** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm test -- src/crm src/mail && corepack pnpm lint` → build ok, all crm + mail tests pass, 0 lint errors.
- [ ] **Step 2: Web** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint && corepack pnpm test -- src/lib/api/crm-tasks-bucket.test.ts` → all succeed.
- [ ] **Step 3: i18n parity** — confirm every `crm.tasks.*` / `crm.activities.*` / `crm.nav.tasks` key exists in all three of en/pl/ru (key-diff).
- [ ] **Step 4:** hand off to the whole-branch review (subagent-driven-development final step) before the PR into `development`.

---

## Notes for the implementer

- **`MailService` / `CronFailureNotifier` are global** — inject them directly; do NOT add `MailModule`/`CommonModule` to `CrmModule` imports. `ScheduleModule.forRoot()` is already in `app.module.ts`, so `@Cron` is picked up.
- **`CronFailureNotifier.report` shape:** copy from `apps/api/src/crm/contacts-sync.service.ts` (Phase 1) — match its required fields incl. `actionUrl` if present.
- **ValidationPipe is whitelist-strict** — web create/update bodies send only DTO fields (the Phase-2 lesson). `dueDate`/`occurredAt` are ISO strings.
- **Do NOT build** (Phase 4 / out of scope): AI scoring/next-step/drafts, auto-captured emails/calls, task priorities/recurrence, per-task individual reminders.
