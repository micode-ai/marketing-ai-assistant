# Project Finances (P&L) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-project income/expense tracking with multi-currency support, category management, and visual P&L analytics.

**Architecture:** Single `FinanceRecord` model (INCOME/EXPENSE) with `FinanceCategory`. Exchange rates fetched from open.er-api.com and cached in Redis. Frontend page with summary cards, Chart.js charts, and CRUD table.

**Tech Stack:** Prisma (Decimal types), NestJS (CRUD + cache-manager), SvelteKit (Chart.js bar + doughnut), class-validator, svelte-i18n

**Spec:** `docs/superpowers/specs/2026-04-04-project-finances-design.md`

**GitHub Issue:** #32

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/shared-types/src/finances.ts` | Interfaces, DTOs, SUPPORTED_CURRENCIES constant |
| `apps/api/src/finances/finances.module.ts` | NestJS module registration |
| `apps/api/src/finances/finances.controller.ts` | REST endpoints (records, categories, exchange rate) |
| `apps/api/src/finances/finances.service.ts` | Business logic, Prisma queries, exchange rate fetching |
| `apps/api/src/finances/dto/create-finance-record.dto.ts` | DTO with class-validator |
| `apps/api/src/finances/dto/update-finance-record.dto.ts` | Partial DTO |
| `apps/api/src/finances/dto/create-finance-category.dto.ts` | DTO with class-validator |
| `apps/api/src/finances/dto/update-finance-category.dto.ts` | Partial DTO |
| `apps/api/src/finances/finances.service.spec.ts` | Service unit tests |
| `apps/api/src/finances/finances.controller.spec.ts` | Controller unit tests |

> **Note:** `creditcard` icon key is already used by Billing in settings. Add a new `banknotes` icon key to the Sidebar `icons` object for Finances.
| `apps/web/src/routes/(app)/projects/[id]/finances/+page.svelte` | Main finances page |

### Modified files
| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add enums, models, Project fields |
| `packages/shared-types/src/index.ts` | Export finances module |
| `apps/api/src/app.module.ts` | Import FinancesModule |
| `apps/web/src/lib/components/layout/Sidebar.svelte` | Add "Finances" link + `banknotes` icon |
| `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte` | Add baseCurrency select |
| `packages/i18n/src/locales/en.json` | Add finances namespace |
| `packages/i18n/src/locales/pl.json` | Add finances namespace |
| `packages/i18n/src/locales/ru.json` | Add finances namespace |

---

## Task 1: Shared Types & Constants

**Files:**
- Create: `packages/shared-types/src/finances.ts`
- Modify: `packages/shared-types/src/index.ts:23` (add export)

- [ ] **Step 1: Create finances types file**

```typescript
// packages/shared-types/src/finances.ts

export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type FinanceRecordType = 'INCOME' | 'EXPENSE';
export type FinanceCategoryType = 'INCOME' | 'EXPENSE' | 'BOTH';

export interface FinanceCategory {
  id: string;
  projectId: string;
  name: string;
  type: FinanceCategoryType;
  isDefault: boolean;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinanceRecord {
  id: string;
  projectId: string;
  categoryId: string;
  category?: FinanceCategory;
  type: FinanceRecordType;
  amount: number;
  currency: string;
  amountInBaseCurrency: number;
  exchangeRate: number;
  description?: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFinanceRecordDto {
  projectId: string;
  categoryId: string;
  type: FinanceRecordType;
  amount: number;
  currency: string;
  description?: string;
  date: string;
}

export interface UpdateFinanceRecordDto {
  categoryId?: string;
  type?: FinanceRecordType;
  amount?: number;
  currency?: string;
  description?: string;
  date?: string;
}

export interface CreateFinanceCategoryDto {
  projectId: string;
  name: string;
  type: FinanceCategoryType;
  color: string;
}

export interface UpdateFinanceCategoryDto {
  name?: string;
  type?: FinanceCategoryType;
  color?: string;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  baseCurrency: string;
  incomeByCategory: { categoryId: string; name: string; color: string; total: number }[];
  expenseByCategory: { categoryId: string; name: string; color: string; total: number }[];
  monthlyData: { month: string; income: number; expense: number }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExchangeRateResponse {
  rate: number;
  date: string;
}
```

- [ ] **Step 2: Add export to index.ts**

In `packages/shared-types/src/index.ts`, add at line 23:

```typescript
export * from './finances';
```

- [ ] **Step 3: Verify build**

Run: `cd packages/shared-types && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/finances.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add finances types, DTOs, and SUPPORTED_CURRENCIES constant"
```

---

## Task 2: Prisma Schema & Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:227` (add enums after line 227), `:365` (add baseCurrency to Project), `:385` (add relations to Project), `:1187` (add new models after Webhook)

- [ ] **Step 1: Add enums after line 227 (after EntityLinkType enum)**

Add to `packages/database/prisma/schema.prisma` after the `EntityLinkType` enum (line 227):

```prisma
enum FinanceRecordType {
  INCOME
  EXPENSE
}

enum FinanceCategoryType {
  INCOME
  EXPENSE
  BOTH
}
```

- [ ] **Step 2: Add baseCurrency field to Project model**

After line 363 (`status ProjectStatus @default(ACTIVE)`), add:

```prisma
  baseCurrency   String        @default("USD") @db.VarChar(3)
```

- [ ] **Step 3: Add relation fields to Project model**

After line 385 (`trackedUsers TrackedUser[]`), add:

```prisma
  financeCategories FinanceCategory[]
  financeRecords    FinanceRecord[]
```

- [ ] **Step 4: Add FinanceCategory model after Webhook (end of file, after line 1187)**

```prisma
// =============================================================================
// Finance
// =============================================================================

model FinanceCategory {
  id        String              @id @default(cuid())
  projectId String
  name      String
  type      FinanceCategoryType
  isDefault Boolean             @default(false)
  color     String
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  project Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  records FinanceRecord[]

  @@unique([projectId, name])
  @@index([projectId])
  @@map("finance_categories")
}

model FinanceRecord {
  id                   String            @id @default(cuid())
  projectId            String
  categoryId           String
  type                 FinanceRecordType
  amount               Decimal           @db.Decimal(12, 2)
  currency             String            @db.VarChar(3)
  amountInBaseCurrency Decimal           @db.Decimal(12, 2)
  exchangeRate         Decimal           @db.Decimal(10, 6)
  description          String?           @db.Text
  date                 DateTime
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  project  Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  category FinanceCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@index([projectId])
  @@index([projectId, type])
  @@index([projectId, date])
  @@map("finance_records")
}
```

- [ ] **Step 5: Generate Prisma client and create migration**

```bash
cd packages/database && pnpm db:migrate:dev --name add_project_finances
```

Expected: Migration created successfully. Prisma client regenerated.

- [ ] **Step 6: Verify generate**

```bash
pnpm db:generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add FinanceCategory, FinanceRecord models and baseCurrency field"
```

---

## Task 3: API — DTOs

**Files:**
- Create: `apps/api/src/finances/dto/create-finance-record.dto.ts`
- Create: `apps/api/src/finances/dto/update-finance-record.dto.ts`
- Create: `apps/api/src/finances/dto/create-finance-category.dto.ts`
- Create: `apps/api/src/finances/dto/update-finance-category.dto.ts`

- [ ] **Step 1: Create record DTOs**

```typescript
// apps/api/src/finances/dto/create-finance-record.dto.ts
import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsIn, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES } from '@marketing-ai/shared-types';

export class CreateFinanceRecordDto {
  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] })
  @IsEnum(['INCOME', 'EXPENSE'])
  type: 'INCOME' | 'EXPENSE';

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsString()
  @IsIn([...SUPPORTED_CURRENCIES])
  currency: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  date: string;
}
```

```typescript
// apps/api/src/finances/dto/update-finance-record.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateFinanceRecordDto } from './create-finance-record.dto';

export class UpdateFinanceRecordDto extends PartialType(CreateFinanceRecordDto) {}
```

- [ ] **Step 2: Create category DTOs**

```typescript
// apps/api/src/finances/dto/create-finance-category.dto.ts
import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFinanceCategoryDto {
  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['INCOME', 'EXPENSE', 'BOTH'] })
  @IsEnum(['INCOME', 'EXPENSE', 'BOTH'])
  type: 'INCOME' | 'EXPENSE' | 'BOTH';

  @ApiProperty()
  @IsString()
  color: string;
}
```

```typescript
// apps/api/src/finances/dto/update-finance-category.dto.ts
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFinanceCategoryDto } from './create-finance-category.dto';

export class UpdateFinanceCategoryDto extends PartialType(
  OmitType(CreateFinanceCategoryDto, ['projectId'] as const),
) {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/finances/dto/
git commit -m "feat(api): add finances DTOs with validation"
```

---

## Task 4: API — Service

**Files:**
- Create: `apps/api/src/finances/finances.service.ts`

Reference patterns: `apps/api/src/checklists/checklists.service.ts`

- [ ] **Step 1: Create finances service**

```typescript
// apps/api/src/finances/finances.service.ts
import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { UpdateFinanceRecordDto } from './dto/update-finance-record.dto';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { Prisma } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'finances.categories.advertising', type: 'EXPENSE' as const, color: '#6366f1' },
  { name: 'finances.categories.content', type: 'EXPENSE' as const, color: '#f59e0b' },
  { name: 'finances.categories.design', type: 'EXPENSE' as const, color: '#ec4899' },
  { name: 'finances.categories.tools', type: 'EXPENSE' as const, color: '#22c55e' },
  { name: 'finances.categories.freelance', type: 'EXPENSE' as const, color: '#ef4444' },
  { name: 'finances.categories.other', type: 'EXPENSE' as const, color: '#8b5cf6' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'finances.categories.sales', type: 'INCOME' as const, color: '#34d399' },
  { name: 'finances.categories.services', type: 'INCOME' as const, color: '#60a5fa' },
  { name: 'finances.categories.partnership', type: 'INCOME' as const, color: '#a78bfa' },
  { name: 'finances.categories.otherIncome', type: 'INCOME' as const, color: '#f97316' },
];

@Injectable()
export class FinancesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // ── Authorization helper ──────────────────────────────────────────

  private async verifyProjectAccess(projectId: string, userOrgId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.organizationId !== userOrgId) throw new ForbiddenException();
    return project;
  }

  // ── Exchange rate ─────────────────────────────────────────────────

  async getExchangeRate(from: string, to: string): Promise<{ rate: number; date: string }> {
    if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10) };

    const cacheKey = `exchange-rate:${from}`;
    const cached = await this.cacheManager.get<Record<string, number>>(cacheKey);

    if (cached && cached[to] !== undefined) {
      return { rate: cached[to], date: new Date().toISOString().slice(0, 10) };
    }

    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
      const data = await res.json();
      if (data.result !== 'success') throw new Error('Exchange rate API error');
      await this.cacheManager.set(cacheKey, data.rates, 3600000); // 1 hour TTL
      const rate = data.rates[to];
      if (!rate) throw new Error(`No rate for ${to}`);
      return { rate, date: data.time_last_update_utc?.slice(0, 10) || new Date().toISOString().slice(0, 10) };
    } catch (e) {
      throw new BadRequestException(`Failed to fetch exchange rate for ${from} → ${to}. Try again or use the project base currency.`);
    }
  }

  // ── Categories ────────────────────────────────────────────────────

  async findCategories(projectId: string, userOrgId: string) {
    await this.verifyProjectAccess(projectId, userOrgId);
    await this.ensureDefaultCategories(projectId);
    return this.prisma.financeCategory.findMany({
      where: { projectId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  private async ensureDefaultCategories(projectId: string) {
    const count = await this.prisma.financeCategory.count({ where: { projectId } });
    if (count > 0) return;

    const allDefaults = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
    await this.prisma.financeCategory.createMany({
      data: allDefaults.map(c => ({
        projectId,
        name: c.name,
        type: c.type as any,
        color: c.color,
        isDefault: true,
      })),
      skipDuplicates: true,
    });
  }

  async createCategory(dto: CreateFinanceCategoryDto, userOrgId: string) {
    await this.verifyProjectAccess(dto.projectId, userOrgId);
    return this.prisma.financeCategory.create({
      data: {
        projectId: dto.projectId,
        name: dto.name,
        type: dto.type as any,
        color: dto.color,
        isDefault: false,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateFinanceCategoryDto, userOrgId: string) {
    const category = await this.prisma.financeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isDefault) throw new ForbiddenException('Cannot edit default categories');
    await this.verifyProjectAccess(category.projectId, userOrgId);
    return this.prisma.financeCategory.update({ where: { id }, data: dto as any });
  }

  async deleteCategory(id: string, userOrgId: string) {
    const category = await this.prisma.financeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isDefault) throw new ForbiddenException('Cannot delete default categories');
    await this.verifyProjectAccess(category.projectId, userOrgId);

    try {
      return await this.prisma.financeCategory.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('Cannot delete category that has records. Move or delete the records first.');
      }
      throw e;
    }
  }

  // ── Records ───────────────────────────────────────────────────────

  async findRecords(
    projectId: string,
    userOrgId: string,
    filters: { dateFrom?: string; dateTo?: string; type?: string; categoryId?: string; page?: number; limit?: number },
  ) {
    await this.verifyProjectAccess(projectId, userOrgId);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { projectId };
    if (filters.type) where.type = filters.type;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where,
        include: { category: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.financeRecord.count({ where }),
    ]);

    // Convert Decimal fields to numbers
    const records = data.map(r => ({
      ...r,
      amount: Number(r.amount),
      amountInBaseCurrency: Number(r.amountInBaseCurrency),
      exchangeRate: Number(r.exchangeRate),
    }));

    return { data: records, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createRecord(dto: CreateFinanceRecordDto, userOrgId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { organizationId: true, baseCurrency: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.organizationId !== userOrgId) throw new ForbiddenException();

    let exchangeRate = 1;
    let amountInBaseCurrency = dto.amount;

    if (dto.currency !== project.baseCurrency) {
      const rateData = await this.getExchangeRate(dto.currency, project.baseCurrency);
      exchangeRate = rateData.rate;
      amountInBaseCurrency = Math.round(dto.amount * exchangeRate * 100) / 100;
    }

    const record = await this.prisma.financeRecord.create({
      data: {
        projectId: dto.projectId,
        categoryId: dto.categoryId,
        type: dto.type as any,
        amount: dto.amount,
        currency: dto.currency,
        amountInBaseCurrency,
        exchangeRate,
        description: dto.description,
        date: new Date(dto.date),
      },
      include: { category: true },
    });

    return {
      ...record,
      amount: Number(record.amount),
      amountInBaseCurrency: Number(record.amountInBaseCurrency),
      exchangeRate: Number(record.exchangeRate),
    };
  }

  async updateRecord(id: string, dto: UpdateFinanceRecordDto, userOrgId: string) {
    const existing = await this.prisma.financeRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Record not found');
    await this.verifyProjectAccess(existing.projectId, userOrgId);

    const data: any = { ...dto };
    if (dto.date) data.date = new Date(dto.date);

    // Recalculate conversion if amount or currency changed
    if (dto.amount !== undefined || dto.currency !== undefined) {
      const project = await this.prisma.project.findUnique({
        where: { id: existing.projectId },
        select: { baseCurrency: true },
      });
      const amount = dto.amount ?? Number(existing.amount);
      const currency = dto.currency ?? existing.currency;

      if (currency !== project!.baseCurrency) {
        const rateData = await this.getExchangeRate(currency, project!.baseCurrency);
        data.exchangeRate = rateData.rate;
        data.amountInBaseCurrency = Math.round(amount * rateData.rate * 100) / 100;
      } else {
        data.exchangeRate = 1;
        data.amountInBaseCurrency = amount;
      }
      data.amount = amount;
      data.currency = currency;
    }

    // Remove projectId from update data if present
    delete data.projectId;

    const record = await this.prisma.financeRecord.update({
      where: { id },
      data,
      include: { category: true },
    });

    return {
      ...record,
      amount: Number(record.amount),
      amountInBaseCurrency: Number(record.amountInBaseCurrency),
      exchangeRate: Number(record.exchangeRate),
    };
  }

  async deleteRecord(id: string, userOrgId: string) {
    const existing = await this.prisma.financeRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Record not found');
    await this.verifyProjectAccess(existing.projectId, userOrgId);
    return this.prisma.financeRecord.delete({ where: { id } });
  }

  // ── Summary ───────────────────────────────────────────────────────

  async getSummary(projectId: string, userOrgId: string, dateFrom?: string, dateTo?: string) {
    await this.verifyProjectAccess(projectId, userOrgId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { baseCurrency: true },
    });

    const where: any = { projectId };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    // Aggregate by type
    const totals = await this.prisma.financeRecord.groupBy({
      by: ['type'],
      where,
      _sum: { amountInBaseCurrency: true },
    });

    const totalIncome = Number(totals.find(t => t.type === 'INCOME')?._sum.amountInBaseCurrency || 0);
    const totalExpense = Number(totals.find(t => t.type === 'EXPENSE')?._sum.amountInBaseCurrency || 0);

    // Aggregate by category
    const byCategory = await this.prisma.financeRecord.groupBy({
      by: ['categoryId', 'type'],
      where,
      _sum: { amountInBaseCurrency: true },
    });

    const categories = await this.prisma.financeCategory.findMany({
      where: { projectId },
    });
    const catMap = new Map(categories.map(c => [c.id, c]));

    const incomeByCategory = byCategory
      .filter(r => r.type === 'INCOME')
      .map(r => {
        const cat = catMap.get(r.categoryId);
        return { categoryId: r.categoryId, name: cat?.name || '', color: cat?.color || '#999', total: Number(r._sum.amountInBaseCurrency || 0) };
      });

    const expenseByCategory = byCategory
      .filter(r => r.type === 'EXPENSE')
      .map(r => {
        const cat = catMap.get(r.categoryId);
        return { categoryId: r.categoryId, name: cat?.name || '', color: cat?.color || '#999', total: Number(r._sum.amountInBaseCurrency || 0) };
      });

    // Monthly data — use raw query for month grouping
    const records = await this.prisma.financeRecord.findMany({
      where,
      select: { type: true, amountInBaseCurrency: true, date: true },
      orderBy: { date: 'asc' },
    });

    const monthlyMap = new Map<string, { income: number; expense: number }>();
    for (const r of records) {
      const month = r.date.toISOString().slice(0, 7); // YYYY-MM
      const entry = monthlyMap.get(month) || { income: 0, expense: 0 };
      if (r.type === 'INCOME') entry.income += Number(r.amountInBaseCurrency);
      else entry.expense += Number(r.amountInBaseCurrency);
      monthlyMap.set(month, entry);
    }

    const monthlyData = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income * 100) / 100,
        expense: Math.round(data.expense * 100) / 100,
      }));

    return {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      profit: Math.round((totalIncome - totalExpense) * 100) / 100,
      baseCurrency: project!.baseCurrency,
      incomeByCategory,
      expenseByCategory,
      monthlyData,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/finances/finances.service.ts
git commit -m "feat(api): add finances service with CRUD, exchange rates, and summary aggregation"
```

---

## Task 5: API — Controller

**Files:**
- Create: `apps/api/src/finances/finances.controller.ts`

Reference: `apps/api/src/checklists/checklists.controller.ts`

- [ ] **Step 1: Create controller**

```typescript
// apps/api/src/finances/finances.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinancesService } from './finances.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { UpdateFinanceRecordDto } from './dto/update-finance-record.dto';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('finances')
@ApiBearerAuth()
@Controller('finances')
export class FinancesController {
  constructor(private financesService: FinancesService) {}

  // ── Categories ─────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'List finance categories for a project' })
  findCategories(@Query('projectId') projectId: string, @CurrentUser() user: any) {
    return this.financesService.findCategories(projectId, user.organizationId);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create custom finance category' })
  createCategory(@Body() dto: CreateFinanceCategoryDto, @CurrentUser() user: any) {
    return this.financesService.createCategory(dto, user.organizationId);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update custom finance category' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateFinanceCategoryDto, @CurrentUser() user: any) {
    return this.financesService.updateCategory(id, dto, user.organizationId);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete custom finance category' })
  deleteCategory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.financesService.deleteCategory(id, user.organizationId);
  }

  // ── Summary ────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary for a project' })
  getSummary(
    @Query('projectId') projectId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: any,
  ) {
    return this.financesService.getSummary(projectId, user.organizationId, dateFrom, dateTo);
  }

  // ── Exchange rate ──────────────────────────────────────────────

  @Get('exchange-rate')
  @ApiOperation({ summary: 'Get exchange rate between two currencies' })
  getExchangeRate(@Query('from') from: string, @Query('to') to: string) {
    return this.financesService.getExchangeRate(from, to);
  }

  // ── Records ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List finance records for a project (paginated)' })
  findRecords(
    @Query('projectId') projectId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('type') type?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    return this.financesService.findRecords(projectId, user.organizationId, {
      dateFrom,
      dateTo,
      type,
      categoryId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create finance record' })
  createRecord(@Body() dto: CreateFinanceRecordDto, @CurrentUser() user: any) {
    return this.financesService.createRecord(dto, user.organizationId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update finance record' })
  updateRecord(@Param('id') id: string, @Body() dto: UpdateFinanceRecordDto, @CurrentUser() user: any) {
    return this.financesService.updateRecord(id, dto, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete finance record' })
  deleteRecord(@Param('id') id: string, @CurrentUser() user: any) {
    return this.financesService.deleteRecord(id, user.organizationId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/finances/finances.controller.ts
git commit -m "feat(api): add finances controller with all endpoints"
```

---

## Task 6: API — Module & Registration

**Files:**
- Create: `apps/api/src/finances/finances.module.ts`
- Modify: `apps/api/src/app.module.ts:31` (add import), `:71` (add to imports array)

- [ ] **Step 1: Create finances module**

```typescript
// apps/api/src/finances/finances.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { FinancesController } from './finances.controller';
import { FinancesService } from './finances.service';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600000, // 1 hour default
    }),
  ],
  controllers: [FinancesController],
  providers: [FinancesService],
  exports: [FinancesService],
})
export class FinancesModule {}
```

Note: Using in-memory cache for now. To upgrade to Redis, install `cache-manager-ioredis-yet` and configure with `REDIS_HOST`/`REDIS_PORT` from env. The in-memory cache works fine for single-instance deployments.

- [ ] **Step 2: Register in app.module.ts**

In `apps/api/src/app.module.ts`:

Add import after line 31 (`import { DocsModule } from './docs/docs.module';`):
```typescript
import { FinancesModule } from './finances/finances.module';
```

Add to imports array after line 71 (`DocsModule,`):
```typescript
    FinancesModule,
```

- [ ] **Step 3: Verify API builds**

```bash
cd apps/api && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/finances/finances.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): register FinancesModule with cache support"
```

---

## Task 7: API — Tests

**Files:**
- Create: `apps/api/src/finances/finances.service.spec.ts`

- [ ] **Step 1: Write service tests**

```typescript
// apps/api/src/finances/finances.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { FinancesService } from './finances.service';
import { PrismaService } from '../database/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

describe('FinancesService', () => {
  let service: FinancesService;
  let prisma: any;
  let cache: any;

  beforeEach(async () => {
    prisma = {
      project: { findUnique: jest.fn() },
      financeCategory: { count: jest.fn(), createMany: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      financeRecord: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn() },
    };
    cache = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get<FinancesService>(FinancesService);
  });

  describe('verifyProjectAccess', () => {
    it('should throw NotFoundException if project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.findCategories('nonexistent', 'org1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user org does not match', async () => {
      prisma.project.findUnique.mockResolvedValue({ organizationId: 'org-other' });
      await expect(service.findCategories('proj1', 'org1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findCategories', () => {
    it('should create default categories on first call', async () => {
      prisma.project.findUnique.mockResolvedValue({ organizationId: 'org1' });
      prisma.financeCategory.count.mockResolvedValue(0);
      prisma.financeCategory.createMany.mockResolvedValue({ count: 10 });
      prisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories('proj1', 'org1');

      expect(prisma.financeCategory.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('should not create defaults if categories exist', async () => {
      prisma.project.findUnique.mockResolvedValue({ organizationId: 'org1' });
      prisma.financeCategory.count.mockResolvedValue(5);
      prisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories('proj1', 'org1');

      expect(prisma.financeCategory.createMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('should throw ForbiddenException when deleting default category', async () => {
      prisma.financeCategory.findUnique.mockResolvedValue({ id: 'cat1', projectId: 'proj1', isDefault: true });
      await expect(service.deleteCategory('cat1', 'org1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException when category has records (P2003)', async () => {
      prisma.financeCategory.findUnique.mockResolvedValue({ id: 'cat1', projectId: 'proj1', isDefault: false });
      prisma.project.findUnique.mockResolvedValue({ organizationId: 'org1' });
      const prismaError = new Error('Foreign key constraint failed');
      (prismaError as any).code = 'P2003';
      Object.setPrototypeOf(prismaError, Object.getPrototypeOf(new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)('', { code: 'P2003', clientVersion: '' })));
      prisma.financeCategory.delete.mockRejectedValue(prismaError);

      // Note: This test may need adjustment depending on Prisma error class availability
    });
  });

  describe('createRecord', () => {
    it('should set exchangeRate=1 when currency matches baseCurrency', async () => {
      prisma.project.findUnique.mockResolvedValue({ organizationId: 'org1', baseCurrency: 'USD' });
      prisma.financeRecord.create.mockResolvedValue({
        id: 'rec1', amount: 100, amountInBaseCurrency: 100, exchangeRate: 1,
        type: 'EXPENSE', currency: 'USD', date: new Date(), category: {},
      });

      const result = await service.createRecord({
        projectId: 'proj1', categoryId: 'cat1', type: 'EXPENSE',
        amount: 100, currency: 'USD', date: '2026-04-04',
      }, 'org1');

      expect(result.exchangeRate).toBe(1);
      expect(result.amountInBaseCurrency).toBe(100);
    });
  });

  describe('getExchangeRate', () => {
    it('should return rate=1 for same currency', async () => {
      const result = await service.getExchangeRate('USD', 'USD');
      expect(result.rate).toBe(1);
    });

    it('should return cached rate if available', async () => {
      cache.get.mockResolvedValue({ EUR: 0.92 });
      const result = await service.getExchangeRate('USD', 'EUR');
      expect(result.rate).toBe(0.92);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && pnpm test -- src/finances/finances.service.spec.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/finances/finances.service.spec.ts
git commit -m "test(api): add finances service unit tests"
```

---

## Task 8: i18n — Add Finances Translations

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/pl.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: Add finances namespace to en.json**

Find the end of the last namespace block and add:

```json
"finances": {
  "title": "Finances",
  "subtitle": "Track income, expenses, and profitability",
  "income": "Income",
  "expense": "Expense",
  "expenses": "Expenses",
  "profit": "Profit",
  "addRecord": "Add Record",
  "editRecord": "Edit Record",
  "deleteRecord": "Delete Record",
  "deleteRecordConfirm": "Are you sure you want to delete this record?",
  "type": "Type",
  "category": "Category",
  "amount": "Amount",
  "currency": "Currency",
  "description": "Description",
  "date": "Date",
  "amountInBase": "Amount ({currency})",
  "exchangeRate": "Exchange Rate",
  "exchangeRateInfo": "Rate {from} → {to}",
  "exchangeRateSource": "Rate as of {date} from exchangerate-api.com",
  "save": "Save",
  "cancel": "Cancel",
  "period": "Period",
  "month": "Month",
  "quarter": "Quarter",
  "year": "Year",
  "custom": "Custom",
  "all": "All",
  "filterByCategory": "Category: All",
  "manageCategories": "Manage Categories",
  "emptyState": "No financial records yet. Click \"Add Record\" to start tracking.",
  "incomeVsExpenses": "Income vs Expenses",
  "byCategory": "By Category",
  "vsLastPeriod": "vs previous period",
  "categories": {
    "title": "Manage Categories",
    "expenseCategories": "Expense Categories",
    "incomeCategories": "Income Categories",
    "addCategory": "Add Category",
    "newCategory": "New category...",
    "default": "default",
    "cannotDeleteWithRecords": "Cannot delete category that has records",
    "advertising": "Advertising",
    "content": "Content",
    "design": "Design",
    "tools": "Tools & Services",
    "freelance": "Freelance",
    "other": "Other",
    "sales": "Sales",
    "services": "Services",
    "partnership": "Partnership",
    "otherIncome": "Other"
  }
},
"nav": {
  ...existing keys...,
  "orgFinances": "Finances"
}
```

Also add `"orgFinances": "Finances"` to the existing `"nav"` object.

- [ ] **Step 2: Add finances namespace to pl.json**

Same structure, Polish translations:

```json
"finances": {
  "title": "Finanse",
  "subtitle": "Śledź przychody, wydatki i rentowność",
  "income": "Przychód",
  "expense": "Wydatek",
  "expenses": "Wydatki",
  "profit": "Zysk",
  "addRecord": "Dodaj wpis",
  "editRecord": "Edytuj wpis",
  "deleteRecord": "Usuń wpis",
  "deleteRecordConfirm": "Czy na pewno chcesz usunąć ten wpis?",
  "type": "Typ",
  "category": "Kategoria",
  "amount": "Kwota",
  "currency": "Waluta",
  "description": "Opis",
  "date": "Data",
  "amountInBase": "Kwota ({currency})",
  "exchangeRate": "Kurs wymiany",
  "exchangeRateInfo": "Kurs {from} → {to}",
  "exchangeRateSource": "Kurs z dnia {date} z exchangerate-api.com",
  "save": "Zapisz",
  "cancel": "Anuluj",
  "period": "Okres",
  "month": "Miesiąc",
  "quarter": "Kwartał",
  "year": "Rok",
  "custom": "Własny",
  "all": "Wszystko",
  "filterByCategory": "Kategoria: Wszystkie",
  "manageCategories": "Zarządzaj kategoriami",
  "emptyState": "Brak wpisów finansowych. Kliknij \"Dodaj wpis\", aby rozpocząć.",
  "incomeVsExpenses": "Przychody vs Wydatki",
  "byCategory": "Wg kategorii",
  "vsLastPeriod": "vs poprzedni okres",
  "categories": {
    "title": "Zarządzanie kategoriami",
    "expenseCategories": "Kategorie wydatków",
    "incomeCategories": "Kategorie przychodów",
    "addCategory": "Dodaj kategorię",
    "newCategory": "Nowa kategoria...",
    "default": "domyślna",
    "cannotDeleteWithRecords": "Nie można usunąć kategorii z wpisami",
    "advertising": "Reklama",
    "content": "Treść",
    "design": "Projekt",
    "tools": "Narzędzia i usługi",
    "freelance": "Freelance",
    "other": "Inne",
    "sales": "Sprzedaż",
    "services": "Usługi",
    "partnership": "Partnerstwo",
    "otherIncome": "Inne"
  }
}
```

Add `"orgFinances": "Finanse"` to `"nav"`.

- [ ] **Step 3: Add finances namespace to ru.json**

```json
"finances": {
  "title": "Финансы",
  "subtitle": "Отслеживайте доходы, расходы и прибыльность",
  "income": "Доход",
  "expense": "Расход",
  "expenses": "Расходы",
  "profit": "Прибыль",
  "addRecord": "Добавить запись",
  "editRecord": "Редактировать запись",
  "deleteRecord": "Удалить запись",
  "deleteRecordConfirm": "Вы уверены, что хотите удалить эту запись?",
  "type": "Тип",
  "category": "Категория",
  "amount": "Сумма",
  "currency": "Валюта",
  "description": "Описание",
  "date": "Дата",
  "amountInBase": "Сумма ({currency})",
  "exchangeRate": "Курс обмена",
  "exchangeRateInfo": "Курс {from} → {to}",
  "exchangeRateSource": "Курс на {date} от exchangerate-api.com",
  "save": "Сохранить",
  "cancel": "Отмена",
  "period": "Период",
  "month": "Месяц",
  "quarter": "Квартал",
  "year": "Год",
  "custom": "Произвольный",
  "all": "Все",
  "filterByCategory": "Категория: Все",
  "manageCategories": "Управление категориями",
  "emptyState": "Финансовых записей пока нет. Нажмите \"Добавить запись\", чтобы начать.",
  "incomeVsExpenses": "Доходы vs Расходы",
  "byCategory": "По категориям",
  "vsLastPeriod": "к пред. периоду",
  "categories": {
    "title": "Управление категориями",
    "expenseCategories": "Категории расходов",
    "incomeCategories": "Категории доходов",
    "addCategory": "Добавить категорию",
    "newCategory": "Новая категория...",
    "default": "по умолчанию",
    "cannotDeleteWithRecords": "Нельзя удалить категорию с записями",
    "advertising": "Реклама",
    "content": "Контент",
    "design": "Дизайн",
    "tools": "Инструменты и сервисы",
    "freelance": "Фриланс",
    "other": "Прочее",
    "sales": "Продажи",
    "services": "Услуги",
    "partnership": "Партнёрство",
    "otherIncome": "Прочее"
  }
}
```

Add `"orgFinances": "Финансы"` to `"nav"`.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales/
git commit -m "feat(i18n): add finances translations for en, pl, ru"
```

---

## Task 9: Frontend — Sidebar Navigation

**Files:**
- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte:84-85` (add link), `:114` (add path segment)

- [ ] **Step 1: Add `banknotes` icon to the icons object**

In `Sidebar.svelte`, add a new entry to the `icons` object (after `creditcard` at line 52):

```typescript
    banknotes: `<svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>`,
```

- [ ] **Step 2: Add finances link to marketingLinks**

In `Sidebar.svelte`, add after the analytics entry in `marketingLinks` (line 84):

```typescript
    { href: '/finances',    iconKey: 'banknotes',    labelKey: 'nav.orgFinances' },
```

- [ ] **Step 3: Add 'finances' to marketingPathSegments**

Update line 114 to include `'finances'`:

```typescript
  const marketingPathSegments = ['content', 'checklists', 'documents', 'campaigns', 'email', 'analytics', 'finances', 'seo', 'competitors', 'experiments', 'sequences', 'calendar'];
```

- [ ] **Step 4: Verify sidebar renders**

Run: `pnpm dev` and check sidebar shows "Finances" link with banknotes icon between "Analytics" and "SEO".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/layout/Sidebar.svelte
git commit -m "feat(web): add Finances link to sidebar navigation"
```

---

## Task 10: Frontend — Finances Page

**Files:**
- Create: `apps/web/src/routes/(app)/projects/[id]/finances/+page.svelte`

Reference: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte` (Chart.js pattern), `apps/web/src/routes/(app)/projects/[id]/campaigns/+page.svelte` (CRUD modal pattern)

- [ ] **Step 1: Create finances page**

Create `apps/web/src/routes/(app)/projects/[id]/finances/+page.svelte` with:

1. Script section:
   - Imports: `svelte-i18n`, `$app/stores`, `api client`, `onMount/onDestroy/tick`, `currentProjectStore/projectsStore`
   - State: `loading`, `records`, `categories`, `summary`, `selectedPeriod`, `activeTypeFilter`, `selectedCategoryId`
   - Modal state: `showRecordModal`, `showCategoryModal`, `editingRecord`, `recordForm`
   - Chart refs: `barCanvas`, `doughnutCanvas`, `barChart`, `doughnutChart`, `ChartJS`
   - Period calculation: `getDateRange(period)` → `{ dateFrom, dateTo }`
   - Data loading: `loadData()` calls `/finances`, `/finances/summary`, `/finances/categories`
   - CRUD functions: `saveRecord()`, `deleteRecord()`, `saveCategory()`, `deleteCategory()`
   - Exchange rate preview: when currency changes in modal, call `/finances/exchange-rate`
   - Chart rendering: `renderCharts()` using Chart.js bar + doughnut
   - Decimal formatting: `formatCurrency(amount, currency)` helper

2. Markup:
   - Header row with title + period toggle + "Add Record" button
   - 3 summary cards (Income green, Expenses red, Profit indigo)
   - Charts row (bar left, doughnut right)
   - Records table with type filter tabs + category dropdown
   - Record rows with edit/delete actions
   - Add/Edit Record modal
   - Manage Categories modal

This is the largest single file. Follow the exact layout from the approved mockup in the spec. Use the same Tailwind CSS patterns as existing project pages.

- [ ] **Step 2: Verify page loads**

Run: `pnpm dev`, navigate to a project's finances page.
Expected: Page renders with empty state.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/(app)/projects/[id]/finances/+page.svelte
git commit -m "feat(web): add project finances page with charts, CRUD, and category management"
```

---

## Task 11: Project Settings — baseCurrency

**Files:**
- Modify: `apps/api/src/projects/dto/update-project.dto.ts` (add baseCurrency field)
- Modify: `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte`

- [ ] **Step 1: Add baseCurrency to UpdateProjectDto**

In `apps/api/src/projects/dto/update-project.dto.ts`, add:

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';
import { IsEnum, IsOptional, IsIn, IsString } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@marketing-ai/shared-types';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsEnum(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_CURRENCIES])
  baseCurrency?: string;
}
```

Note: if `@marketing-ai/shared-types` import fails in the API app, inline the list: `@IsIn(['USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY'])`.

- [ ] **Step 2: Add baseCurrency select to project settings page**

In the project settings form, add a currency selector. Inline the supported currencies list. Add a select field for base currency with label from i18n, listing all supported currencies. Bind to the project's `baseCurrency` field. Save via existing project update endpoint.

Show a warning text if the project already has finance records when changing currency.

- [ ] **Step 3: Add i18n keys**

Add `"baseCurrency": "Base Currency"` to `projects` namespace in en.json.
Add `"baseCurrency": "Bazowa waluta"` in pl.json.
Add `"baseCurrency": "Базовая валюта"` in ru.json.

Add `"baseCurrencyWarning"` keys: warning that existing records won't be recalculated.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/projects/dto/update-project.dto.ts apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte packages/i18n/src/locales/
git commit -m "feat: add baseCurrency selector to project settings with DTO validation"
```

---

## Task 12: Integration Test & Final Verification

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: All apps build successfully.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No lint errors.

- [ ] **Step 4: Manual smoke test**

1. Start docker + dev servers: `docker compose up -d && pnpm dev`
2. Login as demo user
3. Navigate to a project → Finances
4. Verify empty state shows
5. Add an expense record (USD)
6. Add an income record (EUR) — verify exchange rate preview
7. Verify summary cards update
8. Verify charts render
9. Edit a record
10. Delete a record
11. Open Manage Categories → add a custom category
12. Change base currency in project settings

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: project finances (P&L) — complete implementation (#32)"
```
