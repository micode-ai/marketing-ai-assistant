# CRM Phase 2 — Deals & Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sales pipeline to the CRM: deals moving through configurable stages on a Kanban board, a revenue forecast, and won deals that automatically book income into the existing finance module.

**Architecture:** Extends the existing `apps/api/src/crm/` module with `PipelineService` (stages) + `DealsService` (deals, forecast, win/lose with finance booking) behind `ProjectAccessGuard` controllers, over two new Prisma models (`PipelineStage`, `Deal`). Winning a deal creates a linked `FinanceRecord` (INCOME) idempotently via `Deal.financeRecordId`. New SvelteKit Kanban board + deal detail + stage settings under `/projects/[id]/crm/deals/`. Spec: `docs/superpowers/specs/2026-06-29-crm-deals-pipelines-design.md`.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL), Jest (api), SvelteKit 2 + Vitest (web), native HTML5 drag-and-drop (no DnD library), svelte-i18n (en/pl/ru).

## Global Constraints

- IDs are `cuid()` — DTOs use `@IsString() @IsNotEmpty()`, never `@IsUUID()`.
- Every `crm` controller route is `@UseGuards(ProjectAccessGuard)` (class-level), with `projectId` as a query param — mirror `apps/api/src/crm/contacts.controller.ts`.
- `PrismaService` is imported `from '../database/prisma.service'`; provided to `CrmModule` via `imports: [DatabaseModule]` (already there). New services go in `CrmModule.providers`, new controllers in `CrmModule.controllers`.
- `PLAN_LIMITS.deals` (new field, `number | 'unlimited'`): **FREE 50, PRO 1000, ENTERPRISE 'unlimited'**. Cap counts **OPEN** deals only.
- Deal currency = `project.baseCurrency`; `exchangeRate = 1`, `amountInBaseCurrency = value` (single-currency Phase 2).
- Won-deal income category: reuse the finances default INCOME category `name: 'finances.categories.sales'`, `color: '#34d399'`; resolve-or-create per the spec §3. `FinanceRecord` create fields: `{ projectId, scope: 'PROJECT', categoryId, type: 'INCOME', amount, currency, amountInBaseCurrency, exchangeRate, date, description }` (Decimal fields accept JS numbers).
- Won/Lost are `DealStatus` values (`OPEN|WON|LOST`), NOT Kanban columns. Forecast is over OPEN deals only.
- Migration is additive (new tables + enum + FKs only). If local Postgres is up: `cd packages/database && corepack pnpm db:migrate:dev --name crm_deals_pipelines`. If Docker/Postgres is unavailable, hand-author the migration SQL (Task 1 gives it) and run `corepack pnpm db:generate` from the repo root; the prod `migrator` applies SQL via `prisma migrate deploy`.
- i18n: every new string added to **en, pl, ru** together (`packages/i18n/src/locales/{en,pl,ru}.json`), namespaces `crm.deals.*` / `crm.pipeline.*`, in exact key parity. No raw English in markup (input `placeholder` format-examples are the only tolerated exception).
- Use `NODE_OPTIONS=--max-old-space-size=4096` for `corepack pnpm build`. Run the relevant app's `lint` before pushing (CI fails on real lint errors; `no-explicit-any` is a warning, not an error).

---

### Task 1: Schema, migration, and plan limit

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (2 models, `DealStatus` enum, back-relations)
- Create: `packages/database/prisma/migrations/20260629140000_crm_deals_pipelines/migration.sql`
- Modify: `packages/shared-types/src/billing.ts` (`PlanLimits.deals` + 3 plans)

**Interfaces:**
- Produces: Prisma models `PipelineStage` (`id, projectId, name, order, probability, …`) and `Deal` (`id, projectId, title, value, currency, stageId?, status, ownerId?, contactId?, companyId?, expectedCloseDate?, wonAt?, lostAt?, lostReason?, financeRecordId?`); enum `DealStatus` (`OPEN | WON | LOST`); `PLAN_LIMITS[plan].deals: number | 'unlimited'`.

- [ ] **Step 1: Add the enum + models to `schema.prisma`** (place after the `Company` model added in Phase 1):

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
  probability Int      @default(0)
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
  financeRecordId   String?    @unique
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

- [ ] **Step 2: Add back-relations.** In `model Project { … }` add `pipelineStages PipelineStage[]` and `deals Deal[]`. In `model User { … }` add `ownedDeals Deal[] @relation("DealOwner")`. In `model Contact { … }` add `deals Deal[]`. In `model Company { … }` add `deals Deal[]`. In `model FinanceRecord { … }` add `deal Deal? @relation("DealFinanceRecord")`.

- [ ] **Step 3: Author the migration SQL** — `packages/database/prisma/migrations/20260629140000_crm_deals_pipelines/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL,
    "stageId" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "financeRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_stages_projectId_idx" ON "pipeline_stages"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_projectId_order_key" ON "pipeline_stages"("projectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "deals_financeRecordId_key" ON "deals"("financeRecordId");

-- CreateIndex
CREATE INDEX "deals_projectId_idx" ON "deals"("projectId");

-- CreateIndex
CREATE INDEX "deals_projectId_status_idx" ON "deals"("projectId", "status");

-- CreateIndex
CREATE INDEX "deals_stageId_idx" ON "deals"("stageId");

-- CreateIndex
CREATE INDEX "deals_ownerId_idx" ON "deals"("ownerId");

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_financeRecordId_fkey" FOREIGN KEY ("financeRecordId") REFERENCES "finance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Add `deals` to plan limits** — in `packages/shared-types/src/billing.ts`, add to the `PlanLimits` interface `deals: number | 'unlimited';`, and to each plan: FREE `deals: 50,`, PRO `deals: 1000,`, ENTERPRISE `deals: 'unlimited',`.

- [ ] **Step 5: Regenerate + typecheck.** `cd /d/Work/micode/marketing-ai-assistant && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm db:generate` → `Tasks: 1 successful`. Then `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm --filter api build` → succeeds.

- [ ] **Step 6: Commit.**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/shared-types/src/billing.ts
git commit -m "feat(db): Deal + PipelineStage models, migration, PLAN_LIMITS.deals"
```

---

### Task 2: PipelineService (lazy default seed + stage CRUD + delete-reassign)

**Files:**
- Create: `apps/api/src/crm/pipeline.service.ts`, `apps/api/src/crm/pipeline.service.spec.ts`

**Interfaces:**
- Produces: `class PipelineService` with `listStages(projectId): Promise<Stage[]>` (lazy-seeds defaults when none), `createStage(projectId, { name, probability? })`, `updateStage(projectId, id, { name?, probability?, order? })`, `deleteStage(projectId, id): Promise<{ deleted: true }>` (reassigns open deals; blocks last stage), and `firstStageId(projectId): Promise<string | null>` (used by DealsService.create). Default stage constant `DEFAULT_STAGES = [{name:'Lead',probability:10},{name:'Qualified',probability:25},{name:'Proposal',probability:50},{name:'Negotiation',probability:75}]`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/pipeline.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

function makePrisma() {
  return {
    pipelineStage: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 4 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's_new', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 's1' }),
    },
    deal: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((fns: any) => Promise.all(fns)),
  };
}

describe('PipelineService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PipelineService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new PipelineService(prisma as any); });

  it('seeds the 4 default stages when a project has none, then returns them', async () => {
    prisma.pipelineStage.count.mockResolvedValue(0);
    prisma.pipelineStage.findMany
      .mockResolvedValueOnce([]) // pre-seed
      .mockResolvedValueOnce([{ id: 'a', name: 'Lead', order: 0, probability: 10 }]); // post-seed list
    await service.listStages('p1');
    expect(prisma.pipelineStage.createMany).toHaveBeenCalledTimes(1);
    const seeded = prisma.pipelineStage.createMany.mock.calls[0][0].data;
    expect(seeded).toHaveLength(4);
    expect(seeded[0]).toMatchObject({ projectId: 'p1', name: 'Lead', order: 0, probability: 10 });
    expect(seeded[3]).toMatchObject({ name: 'Negotiation', order: 3, probability: 75 });
  });

  it('does NOT seed when stages already exist', async () => {
    prisma.pipelineStage.count.mockResolvedValue(4);
    prisma.pipelineStage.findMany.mockResolvedValue([{ id: 'a', order: 0 }]);
    await service.listStages('p1');
    expect(prisma.pipelineStage.createMany).not.toHaveBeenCalled();
  });

  it('createStage appends at the next order index', async () => {
    prisma.pipelineStage.count.mockResolvedValue(4); // already seeded
    prisma.pipelineStage.findFirst.mockResolvedValue({ order: 3 }); // current max order
    await service.createStage('p1', { name: 'Closing', probability: 90 });
    const data = prisma.pipelineStage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', name: 'Closing', probability: 90, order: 4 });
  });

  it('deleteStage reassigns open deals to the previous stage and is blocked on the last stage', async () => {
    // two stages exist; deleting order-1 reassigns its deals to order-0
    prisma.pipelineStage.findFirst.mockResolvedValueOnce({ id: 's2', order: 1, projectId: 'p1' }); // the target
    prisma.pipelineStage.findMany.mockResolvedValue([{ id: 's1', order: 0 }, { id: 's2', order: 1 }]);
    await service.deleteStage('p1', 's2');
    expect(prisma.deal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stageId: 's2' }, data: { stageId: 's1' } }),
    );
    expect(prisma.pipelineStage.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
  });

  it('deleteStage throws when it is the only/last stage', async () => {
    prisma.pipelineStage.findFirst.mockResolvedValueOnce({ id: 's1', order: 0, projectId: 'p1' });
    prisma.pipelineStage.findMany.mockResolvedValue([{ id: 's1', order: 0 }]);
    await expect(service.deleteStage('p1', 's1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/pipeline.service.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `PipelineService`** — `apps/api/src/crm/pipeline.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_STAGES = [
  { name: 'Lead', probability: 10 },
  { name: 'Qualified', probability: 25 },
  { name: 'Proposal', probability: 50 },
  { name: 'Negotiation', probability: 75 },
];

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async listStages(projectId: string) {
    const count = await this.prisma.pipelineStage.count({ where: { projectId } });
    if (count === 0) {
      await this.prisma.pipelineStage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({
          projectId,
          name: s.name,
          order: i,
          probability: s.probability,
        })),
        skipDuplicates: true,
      });
    }
    return this.prisma.pipelineStage.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async firstStageId(projectId: string): Promise<string | null> {
    const stages = await this.listStages(projectId);
    return stages[0]?.id ?? null;
  }

  async createStage(projectId: string, dto: { name: string; probability?: number }) {
    const last = await this.prisma.pipelineStage.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const order = last ? last.order + 1 : 0;
    return this.prisma.pipelineStage.create({
      data: {
        projectId,
        name: dto.name,
        order,
        probability: this.clampProbability(dto.probability ?? 0),
      },
    });
  }

  async updateStage(
    projectId: string,
    id: string,
    dto: { name?: string; probability?: number; order?: number },
  ) {
    const existing = await this.prisma.pipelineStage.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Stage not found');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.probability !== undefined) data.probability = this.clampProbability(dto.probability);
    if (dto.order !== undefined) data.order = dto.order;
    return this.prisma.pipelineStage.update({ where: { id }, data });
  }

  async deleteStage(projectId: string, id: string): Promise<{ deleted: true }> {
    const target = await this.prisma.pipelineStage.findFirst({ where: { id, projectId } });
    if (!target) throw new NotFoundException('Stage not found');
    const stages = await this.prisma.pipelineStage.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    });
    if (stages.length <= 1) {
      throw new BadRequestException('Cannot delete the last remaining stage');
    }
    // reassign this stage's deals to the previous stage (or the first remaining one)
    const remaining = stages.filter((s) => s.id !== id);
    const prev =
      [...remaining].reverse().find((s) => s.order < target.order) ?? remaining[0];
    await this.prisma.$transaction([
      this.prisma.deal.updateMany({ where: { stageId: id }, data: { stageId: prev.id } }),
      this.prisma.pipelineStage.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  private clampProbability(p: number): number {
    return Math.max(0, Math.min(100, Math.round(p)));
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/pipeline.service.spec.ts` → PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/pipeline.service.ts apps/api/src/crm/pipeline.service.spec.ts
git commit -m "feat(crm): PipelineService — lazy default stages, CRUD, delete-reassign"
```

---

### Task 3: DealsService — CRUD, list filters, forecast, plan cap (no finance yet)

**Files:**
- Create: `apps/api/src/crm/deals.service.ts`, `apps/api/src/crm/deals.service.spec.ts`

**Interfaces:**
- Consumes: `PipelineService.firstStageId` (Task 2); Prisma `Deal` (Task 1).
- Produces: `class DealsService` with `list(projectId, opts)`, `get(projectId, id)`, `create(projectId, dto)` (cap-enforced, default stage = first), `update(projectId, id, dto)`, `remove(projectId, id)`, `forecast(projectId)`. Constructor `(prisma: PrismaService, pipeline: PipelineService)`. Private `resolvePlan`/`dealLimit` helpers (duplicate the tiny helpers from ContactsService — deliberate, no shared base). **Win/lose/reopen and the finance link are added in Task 4 — not here.**

- [ ] **Step 1: Write the failing test** — `apps/api/src/crm/deals.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DealsService } from './deals.service';

function makePrisma() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_1', baseCurrency: 'USD' }) },
    organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
    deal: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
  };
}
const pipeline = { firstStageId: jest.fn().mockResolvedValue('s1') };

describe('DealsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: DealsService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new DealsService(prisma as any, pipeline as any); });

  it('create sets OPEN status, default first stage, project currency, and is project-scoped', async () => {
    const res = await service.create('p1', { title: 'Acme deal', value: 1000 });
    const data = prisma.deal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', title: 'Acme deal', value: 1000, status: 'OPEN', stageId: 's1', currency: 'USD' });
    expect(res.id).toBe('d1');
  });

  it('create enforces the plan cap counting OPEN deals only (ForbiddenException)', async () => {
    prisma.organization.findUnique.mockResolvedValue({ subscription: { plan: 'FREE' } });
    prisma.deal.count.mockResolvedValue(50); // FREE cap
    await expect(service.create('p1', { title: 'x', value: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.deal.count).toHaveBeenCalledWith({ where: { projectId: 'p1', status: 'OPEN' } });
  });

  it('list applies status/stage/owner/search filters', async () => {
    prisma.deal.findMany.mockResolvedValue([{ id: 'd1' }]);
    await service.list('p1', { status: 'OPEN', stageId: 's1', ownerId: 'u1', search: 'acme' });
    const where = prisma.deal.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ projectId: 'p1', status: 'OPEN', stageId: 's1', ownerId: 'u1' });
    expect(where.title).toEqual({ contains: 'acme', mode: 'insensitive' });
  });

  it('forecast computes weighted = sum(value * probability/100) over OPEN deals (no-stage → 0)', async () => {
    prisma.deal.findMany.mockResolvedValue([
      { value: 1000, status: 'OPEN', stage: { probability: 50 } },
      { value: 400, status: 'OPEN', stage: { probability: 25 } },
      { value: 999, status: 'OPEN', stage: null },
    ]);
    prisma.deal.count.mockResolvedValue(3);
    const f = await service.forecast('p1');
    expect(f.weightedValue).toBe(600); // 1000*.5 + 400*.25 + 0
    expect(f.openValue).toBe(2399);
    expect(f.openCount).toBe(3);
  });

  it('update only writes provided fields; remove is project-scoped (NotFound when foreign)', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'OPEN', financeRecordId: null });
    await service.update('p1', 'd1', { title: 'new' });
    expect(prisma.deal.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { title: 'new' } });
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.remove('p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/deals.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement `DealsService`** — `apps/api/src/crm/deals.service.ts`:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLAN_LIMITS } from '@marketing-ai/shared-types';
import { PipelineService } from './pipeline.service';

export interface ListDealsOpts {
  status?: string;
  stageId?: string;
  ownerId?: string;
  search?: string;
}

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
  ) {}

  private dealLimit(plan: string): number {
    const limit = (PLAN_LIMITS as any)[plan]?.deals ?? PLAN_LIMITS.FREE.deals;
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

  private async baseCurrency(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { baseCurrency: true },
    });
    return project?.baseCurrency || 'USD';
  }

  async list(projectId: string, opts: ListDealsOpts) {
    const where: any = { projectId };
    if (opts.status) where.status = opts.status;
    if (opts.stageId) where.stageId = opts.stageId;
    if (opts.ownerId) where.ownerId = opts.ownerId;
    if (opts.search) where.title = { contains: opts.search, mode: 'insensitive' };
    return this.prisma.deal.findMany({
      where,
      include: {
        stage: { select: { id: true, name: true, order: true, probability: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(projectId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, projectId },
      include: { stage: true, contact: true, company: true },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async create(projectId: string, dto: any) {
    const limit = this.dealLimit(await this.resolvePlan(projectId));
    const openCount = await this.prisma.deal.count({ where: { projectId, status: 'OPEN' } });
    if (openCount >= limit) {
      throw new ForbiddenException('Open-deal limit reached for your plan');
    }
    const stageId = dto.stageId ?? (await this.pipeline.firstStageId(projectId));
    const currency = await this.baseCurrency(projectId);
    return this.prisma.deal.create({
      data: {
        projectId,
        title: dto.title,
        value: dto.value ?? 0,
        currency,
        status: 'OPEN',
        stageId: stageId ?? null,
        ownerId: dto.ownerId ?? null,
        contactId: dto.contactId ?? null,
        companyId: dto.companyId ?? null,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
      },
    });
  }

  async update(projectId: string, id: string, dto: any) {
    const existing = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Deal not found');
    const data: any = {};
    for (const k of ['title', 'value', 'stageId', 'ownerId', 'contactId', 'companyId', 'lostReason']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.expectedCloseDate !== undefined) {
      data.expectedCloseDate = dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null;
    }
    return this.prisma.deal.update({ where: { id }, data });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Deal not found');
    await this.prisma.deal.delete({ where: { id } });
    return { deleted: true as const };
  }

  async forecast(projectId: string) {
    const openDeals = await this.prisma.deal.findMany({
      where: { projectId, status: 'OPEN' },
      select: { value: true, stage: { select: { probability: true } } },
    });
    let openValue = 0;
    let weightedValue = 0;
    for (const d of openDeals) {
      const v = Number(d.value);
      openValue += v;
      weightedValue += v * ((d.stage?.probability ?? 0) / 100);
    }
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);
    const wonAgg = await this.prisma.deal.findMany({
      where: { projectId, status: 'WON', wonAt: { gte: since } },
      select: { value: true },
    });
    const wonValuePeriod = wonAgg.reduce((s, d) => s + Number(d.value), 0);
    const lostCount = await this.prisma.deal.count({ where: { projectId, status: 'LOST' } });
    return {
      openCount: openDeals.length,
      openValue,
      weightedValue: Math.round(weightedValue * 100) / 100,
      wonValuePeriod,
      lostCount,
    };
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/deals.service.spec.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/deals.service.ts apps/api/src/crm/deals.service.spec.ts
git commit -m "feat(crm): DealsService — CRUD, list filters, forecast, plan cap"
```

---

### Task 4: DealsService — win / lose / reopen + finance booking

**Files:**
- Modify: `apps/api/src/crm/deals.service.ts` (add win/lose/reopen + finance helpers; augment `update`/`remove` to keep the finance record in sync)
- Modify: `apps/api/src/crm/deals.service.spec.ts` (add finance tests)

**Interfaces:**
- Produces: `DealsService.win(projectId, id)`, `lose(projectId, id, { lostReason? })`, `reopen(projectId, id)`. `update` now re-syncs the linked finance record's amount when a WON deal's `value` changes; `remove` deletes the linked finance record first. Private `resolveIncomeCategory(projectId): Promise<string>` (returns a FinanceCategory id).

- [ ] **Step 1: Write the failing test** — append to `deals.service.spec.ts` (extend `makePrisma` with `financeCategory` + `financeRecord` + `$transaction`):

```ts
function makePrismaWithFinance() {
  const base = makePrisma() as any;
  base.financeCategory = {
    findFirst: jest.fn().mockResolvedValue({ id: 'cat_sales' }),
    create: jest.fn().mockResolvedValue({ id: 'cat_new' }),
  };
  base.financeRecord = {
    create: jest.fn().mockResolvedValue({ id: 'fr1' }),
    update: jest.fn().mockResolvedValue({ id: 'fr1' }),
    delete: jest.fn().mockResolvedValue({ id: 'fr1' }),
  };
  base.$transaction = jest.fn(async (cb: any) => cb(base));
  return base;
}

describe('DealsService win/lose/reopen + finance', () => {
  let prisma: any;
  let service: DealsService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrismaWithFinance(); service = new DealsService(prisma, pipeline as any); });

  it('win creates an INCOME FinanceRecord for the deal value and links it', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'OPEN', value: 1500, financeRecordId: null });
    prisma.project.findUnique.mockResolvedValue({ organizationId: 'org_1', baseCurrency: 'EUR' });
    await service.win('p1', 'd1');
    const rec = prisma.financeRecord.create.mock.calls[0][0].data;
    expect(rec).toMatchObject({ projectId: 'p1', categoryId: 'cat_sales', type: 'INCOME', currency: 'EUR', exchangeRate: 1 });
    expect(Number(rec.amount)).toBe(1500);
    expect(Number(rec.amountInBaseCurrency)).toBe(1500);
    // deal updated to WON with the finance link + wonAt
    const upd = prisma.deal.update.mock.calls.find((c: any) => c[0].data.status === 'WON');
    expect(upd[0].data).toMatchObject({ status: 'WON', financeRecordId: 'fr1' });
    expect(upd[0].data.wonAt).toBeInstanceOf(Date);
  });

  it('win is idempotent — a deal already WON does not create a second record', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', value: 1500, financeRecordId: 'fr1' });
    await service.win('p1', 'd1');
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
  });

  it('reopen removes the linked finance record and clears the link', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', financeRecordId: 'fr1' });
    await service.reopen('p1', 'd1');
    expect(prisma.financeRecord.delete).toHaveBeenCalledWith({ where: { id: 'fr1' } });
    const upd = prisma.deal.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ status: 'OPEN', financeRecordId: null, wonAt: null });
  });

  it('lose sets LOST + lostAt + reason and books no revenue', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'OPEN', financeRecordId: null });
    await service.lose('p1', 'd1', { lostReason: 'budget' });
    const upd = prisma.deal.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ status: 'LOST', lostReason: 'budget' });
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
  });

  it('update re-syncs the finance record amount when a WON deal value changes', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', value: 1000, financeRecordId: 'fr1' });
    await service.update('p1', 'd1', { value: 2000 });
    expect(prisma.financeRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fr1' }, data: expect.objectContaining({ amount: 2000, amountInBaseCurrency: 2000 }) }),
    );
  });

  it('remove deletes the linked finance record first', async () => {
    prisma.deal.findFirst.mockResolvedValue({ id: 'd1', projectId: 'p1', status: 'WON', financeRecordId: 'fr1' });
    await service.remove('p1', 'd1');
    expect(prisma.financeRecord.delete).toHaveBeenCalledWith({ where: { id: 'fr1' } });
    expect(prisma.deal.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/deals.service.spec.ts -t "win/lose/reopen"` → FAIL (`win is not a function`).

- [ ] **Step 3: Implement the finance layer** — add to `deals.service.ts`:

```ts
  private async resolveIncomeCategory(projectId: string): Promise<string> {
    const sales = await this.prisma.financeCategory.findFirst({
      where: { projectId, type: 'INCOME', name: 'finances.categories.sales' },
      select: { id: true },
    });
    if (sales) return sales.id;
    const anyIncome = await this.prisma.financeCategory.findFirst({
      where: { projectId, type: 'INCOME' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (anyIncome) return anyIncome.id;
    const created = await this.prisma.financeCategory.create({
      data: {
        projectId,
        scope: 'PROJECT',
        type: 'INCOME',
        name: 'finances.categories.sales',
        color: '#34d399',
        isDefault: false,
      },
      select: { id: true },
    });
    return created.id;
  }

  async win(projectId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (deal.status === 'WON') return deal; // idempotent
    const categoryId = await this.resolveIncomeCategory(projectId);
    const currency = await this.baseCurrency(projectId);
    const value = Number(deal.value);
    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      const record = await tx.financeRecord.create({
        data: {
          projectId,
          scope: 'PROJECT',
          categoryId,
          type: 'INCOME',
          amount: value,
          currency,
          amountInBaseCurrency: value,
          exchangeRate: 1,
          date: now,
          description: `Deal: ${deal.title}`,
        },
      });
      return tx.deal.update({
        where: { id },
        data: { status: 'WON', wonAt: now, lostAt: null, lostReason: null, financeRecordId: record.id },
      });
    });
  }

  async lose(projectId: string, id: string, dto: { lostReason?: string }) {
    const deal = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.prisma.$transaction(async (tx: any) => {
      if (deal.financeRecordId) {
        await tx.financeRecord.delete({ where: { id: deal.financeRecordId } });
      }
      return tx.deal.update({
        where: { id },
        data: { status: 'LOST', lostAt: new Date(), wonAt: null, financeRecordId: null, lostReason: dto.lostReason ?? null },
      });
    });
  }

  async reopen(projectId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, projectId } });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.prisma.$transaction(async (tx: any) => {
      if (deal.financeRecordId) {
        await tx.financeRecord.delete({ where: { id: deal.financeRecordId } });
      }
      return tx.deal.update({
        where: { id },
        data: { status: 'OPEN', wonAt: null, lostAt: null, lostReason: null, financeRecordId: null },
      });
    });
  }
```

Then **augment `update`**: after computing `data`, if the deal is WON and `dto.value !== undefined` and `existing.financeRecordId`, also update the finance record amount. Replace the final `return this.prisma.deal.update(...)` in `update` with:

```ts
    if (existing.status === 'WON' && dto.value !== undefined && existing.financeRecordId) {
      await this.prisma.financeRecord.update({
        where: { id: existing.financeRecordId },
        data: { amount: dto.value, amountInBaseCurrency: dto.value },
      });
    }
    return this.prisma.deal.update({ where: { id }, data });
```

And **augment `remove`**: before deleting the deal, delete the linked record:

```ts
    if (existing.financeRecordId) {
      await this.prisma.financeRecord.delete({ where: { id: existing.financeRecordId } });
    }
    await this.prisma.deal.delete({ where: { id } });
```

> The Task-3 `update`/`remove` already fetch `existing` via `findFirst` — extend those methods, do not duplicate them. Keep the Task-3 tests green (their `existing` mock now includes `financeRecordId: null`, so the new branches are skipped).

- [ ] **Step 4: Run the full deals spec** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/crm/deals.service.spec.ts` → all pass (Task 3 + Task 4 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/crm/deals.service.ts apps/api/src/crm/deals.service.spec.ts
git commit -m "feat(crm): deal win/lose/reopen + idempotent finance booking"
```

---

### Task 5: Controllers, DTOs, module wiring

**Files:**
- Create: `apps/api/src/crm/dto/deal.dto.ts`, `apps/api/src/crm/dto/pipeline.dto.ts`, `apps/api/src/crm/deals.controller.ts`, `apps/api/src/crm/pipeline.controller.ts`
- Modify: `apps/api/src/crm/crm.module.ts` (register the two services + two controllers)

**Interfaces:**
- Consumes: `DealsService`, `PipelineService`. `ProjectAccessGuard` (`../common/guards/project-access.guard`).

- [ ] **Step 1: DTOs** — `apps/api/src/crm/dto/deal.dto.ts`:

```ts
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDealDto {
  @IsString() title!: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
}

export class UpdateDealDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
}

export class LoseDealDto {
  @IsOptional() @IsString() lostReason?: string;
}
```

`apps/api/src/crm/dto/pipeline.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateStageDto {
  @IsString() name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
}

export class UpdateStageDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsInt() order?: number;
}
```

- [ ] **Step 2: PipelineController** — `apps/api/src/crm/pipeline.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { PipelineService } from './pipeline.service';
import { CreateStageDto, UpdateStageDto } from './dto/pipeline.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/pipeline/stages')
@UseGuards(ProjectAccessGuard)
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  @ApiOperation({ summary: 'List pipeline stages (seeds defaults on first call)' })
  list(@Query('projectId') projectId: string) {
    return this.pipeline.listStages(projectId);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateStageDto) {
    return this.pipeline.createStage(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.pipeline.updateStage(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.pipeline.deleteStage(projectId, id);
  }
}
```

- [ ] **Step 3: DealsController** — `apps/api/src/crm/deals.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { DealsService } from './deals.service';
import { CreateDealDto, UpdateDealDto, LoseDealDto } from './dto/deal.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/deals')
@UseGuards(ProjectAccessGuard)
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  @ApiOperation({ summary: 'List deals (filterable)' })
  list(
    @Query('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('stageId') stageId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
  ) {
    return this.deals.list(projectId, { status, stageId, ownerId, search });
  }

  @Get('forecast')
  forecast(@Query('projectId') projectId: string) {
    return this.deals.forecast(projectId);
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateDealDto) {
    return this.deals.create(projectId, dto);
  }

  @Patch(':id')
  update(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(projectId, id, dto);
  }

  @Post(':id/win')
  win(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.win(projectId, id);
  }

  @Post(':id/lose')
  lose(@Query('projectId') projectId: string, @Param('id') id: string, @Body() dto: LoseDealDto) {
    return this.deals.lose(projectId, id, dto);
  }

  @Post(':id/reopen')
  reopen(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.reopen(projectId, id);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.deals.remove(projectId, id);
  }
}
```

> Route ordering: `@Get('forecast')` is declared BEFORE `@Get(':id')` so `forecast` isn't captured as an `:id`. Keep it in that order.

- [ ] **Step 4: Register in `crm.module.ts`** — add imports for the 4 new files and extend the arrays:

```ts
  controllers: [ContactsController, CompaniesController, DealsController, PipelineController],
  providers: [ContactsService, CompaniesService, ContactsSyncService, DealsService, PipelineService, ProjectAccessGuard],
```

- [ ] **Step 5: Verify** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build` → succeeds; `corepack pnpm test -- src/crm` → all green; `corepack pnpm lint` → 0 errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/crm/
git commit -m "feat(crm): deals + pipeline controllers, DTOs, module wiring"
```

---

### Task 6: Web — deals api client + Kanban board + forecast strip + sidebar + i18n

**Files:**
- Create: `apps/web/src/lib/api/crm-deals.ts`, `apps/web/src/lib/api/crm-forecast.ts` (+ `.test.ts`)
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/deals/+page.svelte`
- Modify: the CRM sub-nav pill strip (add **Deals**) — it lives in `apps/web/src/routes/(app)/projects/[id]/crm/contacts/+page.svelte` and the companies pages (added in Phase 1); add the Deals pill in the same strip on all CRM list pages.
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.deals.*`, `crm.pipeline.*`, `crm.nav.deals`)

**Interfaces:**
- Consumes: the shared `api` client (`api.get/post/patch/delete`); Phase-1 helpers `crmApi` (contacts/companies for the deal's selectors) and `crm-owners.ts` (owner picker); deals API from Task 5.
- Produces: `dealsApi` (listDeals/getDeal/createDeal/updateDeal/winDeal/loseDeal/reopenDeal/deleteDeal/forecast + listStages/createStage/updateStage/deleteStage).

- [ ] **Step 1: API client** — `apps/web/src/lib/api/crm-deals.ts`:

```ts
import { api } from './client';

export interface DealStage { id: string; name: string; order: number; probability: number }
export interface Deal {
  id: string; title: string; value: number | string; currency: string;
  stageId: string | null; status: 'OPEN' | 'WON' | 'LOST';
  ownerId: string | null; contactId: string | null; companyId: string | null;
  expectedCloseDate: string | null; financeRecordId: string | null;
  stage?: DealStage | null;
  contact?: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
  company?: { id: string; name: string } | null;
}
export interface Forecast { openCount: number; openValue: number; weightedValue: number; wonValuePeriod: number; lostCount: number }

export const dealsApi = {
  listStages: (projectId: string) => api.get<DealStage[]>('/crm/pipeline/stages', { projectId }),
  createStage: (projectId: string, body: { name: string; probability?: number }) => api.post<DealStage>(`/crm/pipeline/stages?projectId=${projectId}`, body),
  updateStage: (projectId: string, id: string, body: any) => api.patch<DealStage>(`/crm/pipeline/stages/${id}?projectId=${projectId}`, body),
  deleteStage: (projectId: string, id: string) => api.delete(`/crm/pipeline/stages/${id}?projectId=${projectId}`),
  listDeals: (projectId: string, q: Record<string, string | undefined> = {}) => api.get<Deal[]>('/crm/deals', { projectId, ...q }),
  getDeal: (projectId: string, id: string) => api.get<Deal>(`/crm/deals/${id}`, { projectId }),
  createDeal: (projectId: string, body: any) => api.post<Deal>(`/crm/deals?projectId=${projectId}`, body),
  updateDeal: (projectId: string, id: string, body: any) => api.patch<Deal>(`/crm/deals/${id}?projectId=${projectId}`, body),
  winDeal: (projectId: string, id: string) => api.post<Deal>(`/crm/deals/${id}/win?projectId=${projectId}`),
  loseDeal: (projectId: string, id: string, body: { lostReason?: string }) => api.post<Deal>(`/crm/deals/${id}/lose?projectId=${projectId}`, body),
  reopenDeal: (projectId: string, id: string) => api.post<Deal>(`/crm/deals/${id}/reopen?projectId=${projectId}`),
  deleteDeal: (projectId: string, id: string) => api.delete(`/crm/deals/${id}?projectId=${projectId}`),
  forecast: (projectId: string) => api.get<Forecast>('/crm/deals/forecast', { projectId }),
};
```

- [ ] **Step 2: Pure helper + test** — `apps/web/src/lib/api/crm-forecast.ts`:

```ts
export function formatMoney(value: number | string, currency: string, locale = 'en'): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `${Math.round(n || 0)} ${currency}`;
  }
}

export function columnTotal(deals: Array<{ value: number | string }>): number {
  return deals.reduce((s, d) => s + (typeof d.value === 'string' ? parseFloat(d.value) : d.value || 0), 0);
}
```

`apps/web/src/lib/api/crm-forecast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatMoney, columnTotal } from './crm-forecast';

describe('crm-forecast helpers', () => {
  it('formatMoney formats a number in the given currency', () => {
    expect(formatMoney(1000, 'USD', 'en')).toMatch(/\$1,000|US\$1,000|\$1000/);
  });
  it('formatMoney falls back for an unknown currency code', () => {
    expect(formatMoney(500, 'XYZ', 'en')).toContain('500');
  });
  it('columnTotal sums numeric + string values', () => {
    expect(columnTotal([{ value: 100 }, { value: '250.5' }])).toBe(350.5);
  });
});
```

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test -- src/lib/api/crm-forecast.test.ts` → PASS.

- [ ] **Step 3: Kanban board page** — `apps/web/src/routes/(app)/projects/[id]/crm/deals/+page.svelte`. Mirror the Phase-1 CRM list pages for shell/Iris tokens/guarded `projectId` watcher/sub-nav pill strip. Core script:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { _, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { dealsApi, type Deal, type DealStage, type Forecast } from '$lib/api/crm-deals';
  import { formatMoney, columnTotal } from '$lib/api/crm-forecast';

  $: projectId = $page.params['id'];
  let stages: DealStage[] = [];
  let deals: Deal[] = [];
  let forecast: Forecast | null = null;
  let currency = 'USD';
  let loading = false;
  let mounted = false;
  let prevProjectId = '';
  let dragDealId: string | null = null;

  async function load() {
    if (!projectId) return;
    loading = true;
    try {
      const [s, d, f] = await Promise.all([
        dealsApi.listStages(projectId),
        dealsApi.listDeals(projectId, { status: 'OPEN' }),
        dealsApi.forecast(projectId),
      ]);
      stages = s; deals = d; forecast = f;
      currency = d[0]?.currency || currency;
    } finally { loading = false; }
  }

  $: dealsByStage = (stageId: string) => deals.filter((x) => x.stageId === stageId);

  async function onDrop(stageId: string) {
    if (!dragDealId) return;
    const id = dragDealId; dragDealId = null;
    const deal = deals.find((x) => x.id === id);
    if (!deal || deal.stageId === stageId) return;
    const prev = deal.stageId;
    deal.stageId = stageId; deals = deals;            // optimistic
    try { await dealsApi.updateDeal(projectId, id, { stageId }); await refreshForecast(); }
    catch { deal.stageId = prev; deals = deals; }      // revert
  }
  async function refreshForecast() { if (projectId) forecast = await dealsApi.forecast(projectId); }

  async function win(id: string) { await dealsApi.winDeal(projectId, id); await load(); }
  async function lose(id: string, reason: string) { await dealsApi.loseDeal(projectId, id, { lostReason: reason }); await load(); }

  onMount(() => { mounted = true; prevProjectId = projectId; load(); });
  $: if (mounted && projectId && projectId !== prevProjectId) { prevProjectId = projectId; load(); }
</script>

<!-- Template: sub-nav pills (Contacts | Companies | Deals — Deals active); forecast strip
     (weighted pipeline, open value+count, won period) using formatMoney(..., currency, $locale);
     a horizontally-scrollable row of stage columns. Each column header shows the stage name,
     deal count, and columnTotal(dealsByStage(stage.id)). Each card is `draggable`
     (on:dragstart sets dragDealId), the column is a drop target
     (on:dragover|preventDefault, on:drop={() => onDrop(stage.id)}). Card shows title,
     formatMoney(value), company/contact, owner; click → goto(`./deals/${deal.id}`).
     Win/Lost actions on the card. "+ Add deal" opens a modal (title/value/stage/contact/company/
     owner/expectedCloseDate → dealsApi.createDeal). A "Manage stages" button opens the stage
     settings (Task 8). All strings via $_(...). Loading + empty states. -->
```

- [ ] **Step 4: Sidebar / sub-nav** — add a **Deals** pill to the CRM sub-nav strip on the contacts and companies list pages (the `Contacts | Companies` strip from Phase 1), linking to `/projects/{projectId}/crm/deals`. Add `crm.nav.deals` to all three locales. (The sidebar `crm` entry still points at contacts; the pill strip is the in-CRM nav.)

- [ ] **Step 5: i18n** — add to en/pl/ru in parity: `crm.nav.deals`, and `crm.deals.{title,add,empty,value,stage,owner,contact,company,expectedClose,win,lose,reopen,lostReasonPrompt,status.OPEN,status.WON,status.LOST}`, `crm.pipeline.{forecast.weighted,forecast.open,forecast.won,manageStages}`. Use the i18n-translator subagent to keep parity.

- [ ] **Step 6: Build + lint + commit.** `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → 0 errors.

```bash
git add apps/web/src/lib/api/crm-deals.ts apps/web/src/lib/api/crm-forecast.ts apps/web/src/lib/api/crm-forecast.test.ts \
        apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/ apps/web/src/routes/\(app\)/projects/\[id\]/crm/contacts/+page.svelte \
        apps/web/src/routes/\(app\)/projects/\[id\]/crm/companies/+page.svelte packages/i18n/src/locales/
git commit -m "feat(web): CRM deals Kanban board, forecast strip, api client, i18n"
```

---

### Task 7: Web — deal detail page

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/deals/[dealId]/+page.svelte`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.deal.*`)

**Interfaces:**
- Consumes: `dealsApi` (Task 6), `crm-owners.ts`, `crmApi` (contacts/companies for selectors).

- [ ] **Step 1: Detail page** — load the deal via `dealsApi.getDeal($page.params.id, $page.params.dealId)`. Editable fields: title, value, stage (`<select>` from `listStages`), expectedCloseDate, owner (owner picker), contact, company. Save → `dealsApi.updateDeal` with only changed fields (a `computePatch` like the contact detail page). Status badge + actions: Win / Lose (with reason prompt) / Reopen → call the API + reload. When `financeRecordId` is set, show an "income booked" indicator + a link to the finances page. Delete via a custom confirm modal (no native dialog) → `deleteDeal` → `goto('../')`. Guarded `projectId` watcher; loading + not-found states; Iris tokens. **Every string i18n'd in en/pl/ru (`crm.deal.*`)** — follow the Phase-1 contact-detail page's i18n discipline exactly.

- [ ] **Step 2: Build + lint** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → succeed.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/\[dealId\]/ packages/i18n/src/locales/
git commit -m "feat(web): CRM deal detail page"
```

---

### Task 8: Web — stage settings UI

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/crm/deals/stages/+page.svelte` (or a modal opened from the board — a page is simpler to test/route)
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json` (`crm.pipeline.*` stage-settings strings)

**Interfaces:**
- Consumes: `dealsApi.listStages/createStage/updateStage/deleteStage`.

- [ ] **Step 1: Stage settings page** — list stages ordered; each row: name (inline-editable), probability (number input 0–100), reorder up/down (PATCH `order` swap with neighbour), delete (confirm modal warning that open deals move to the previous stage; on the last stage the API returns an error → surface it as a toast). "Add stage" (name + probability). All persist via `dealsApi`. Guarded `projectId` watcher; Iris tokens; every string i18n'd in en/pl/ru. A back link to the board.

- [ ] **Step 2: Build + lint** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint` → succeed.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/\(app\)/projects/\[id\]/crm/deals/stages/ packages/i18n/src/locales/
git commit -m "feat(web): CRM pipeline stage settings"
```

---

### Task 9: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: API** — `cd apps/api && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm test -- src/crm && corepack pnpm lint` → build ok, all crm tests pass, 0 lint errors.
- [ ] **Step 2: Web** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm build && corepack pnpm lint && corepack pnpm test -- src/lib/api/crm-forecast.test.ts` → all succeed.
- [ ] **Step 3: i18n parity** — confirm every `crm.deals.*` / `crm.pipeline.*` / `crm.deal.*` / `crm.nav.deals` key exists in all three of en/pl/ru (key-diff).
- [ ] **Step 4:** hand off to the whole-branch review (subagent-driven-development final step) before the PR into `development`.

---

## Notes for the implementer

- **`FinanceRecord` Decimal fields** accept JS numbers in Prisma create/update; the finances service reads them back via `Number(...)`. Passing `amount: value` (a number) is correct.
- **Win atomicity:** the `$transaction(async (tx) => …)` callback form is used so the finance-record create and the deal update commit together; the category-resolve runs **before** the transaction (it may create a category, which is fine to keep even if the win is retried).
- **Forecast number precision:** `weightedValue` is rounded to cents; `Number(Decimal)` is used for `value` everywhere (Prisma returns `Decimal` objects).
- **Drag-and-drop:** native HTML5 only (`draggable`, `dragstart`, `dragover|preventDefault`, `drop`) — do NOT add a DnD dependency. Optimistic move with revert-on-error.
- **Do NOT build** (later phases): multiple pipelines, multi-currency deals, activities/tasks (Phase 3), AI scoring/drafts (Phase 4), and finance→deal reverse sync.
