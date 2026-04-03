# Project Finances (P&L) — Design Spec

## Overview

Add a per-project financial tracking feature — income and expense records with multi-currency support, category management, and visual analytics (charts). Accessible as a dedicated "Finances" page in the project sidebar.

## Goals

- Users can manually record income and expense transactions per project
- All amounts are converted to the project's base currency using real exchange rates
- Visual P&L overview with bar chart (monthly income vs expenses) and doughnut chart (by category)
- Preset + custom categories for organizing records
- Full i18n support (en/pl/ru)

## Data Model

### New field on `Project`

```prisma
baseCurrency String @default("USD") @db.VarChar(3) // ISO 4217 code
```

Also add relation fields to the `Project` model:
```prisma
financeCategories FinanceCategory[]
financeRecords    FinanceRecord[]
```

### New enum `FinanceRecordType`

```prisma
enum FinanceRecordType {
  INCOME
  EXPENSE
}
```

### New enum `FinanceCategoryType`

```prisma
enum FinanceCategoryType {
  INCOME
  EXPENSE
  BOTH
}
```

### New model `FinanceCategory`

```prisma
model FinanceCategory {
  id        String               @id @default(uuid())
  projectId String
  project   Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  type      FinanceCategoryType
  isDefault Boolean              @default(false)
  color     String               // hex color for charts
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  records FinanceRecord[]

  @@unique([projectId, name])
  @@index([projectId])
  @@map("finance_categories")
}
```

### New model `FinanceRecord`

Uses `Decimal` types for monetary precision — Prisma returns these as strings, so the service layer calls `.toNumber()` when building responses.

```prisma
model FinanceRecord {
  id                   String            @id @default(uuid())
  projectId            String
  project              Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  categoryId           String
  category             FinanceCategory   @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  type                 FinanceRecordType
  amount               Decimal           @db.Decimal(12, 2) // amount in original currency
  currency             String            @db.VarChar(3) // ISO 4217 (USD, EUR, etc.)
  amountInBaseCurrency Decimal           @db.Decimal(12, 2) // converted to project.baseCurrency
  exchangeRate         Decimal           @db.Decimal(10, 6) // rate at time of creation (1.0 if same currency)
  description          String?           @db.Text
  date                 DateTime          // transaction date
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  @@index([projectId])
  @@index([projectId, type])
  @@index([projectId, date])
  @@map("finance_records")
}
```

### Default categories

Created lazily on first `GET /api/finances/categories?projectId=X` if none exist for the project. Use `createMany` with `skipDuplicates: true` to handle concurrent requests safely (the `@@unique([projectId, name])` constraint prevents duplicates).

**Expense categories:**
| Name | Color | i18n key |
|------|-------|----------|
| Advertising | `#6366f1` | `finances.categories.advertising` |
| Content | `#f59e0b` | `finances.categories.content` |
| Design | `#ec4899` | `finances.categories.design` |
| Tools & Services | `#22c55e` | `finances.categories.tools` |
| Freelance | `#ef4444` | `finances.categories.freelance` |
| Other | `#8b5cf6` | `finances.categories.other` |

**Income categories:**
| Name | Color | i18n key |
|------|-------|----------|
| Sales | `#34d399` | `finances.categories.sales` |
| Services | `#60a5fa` | `finances.categories.services` |
| Partnership | `#a78bfa` | `finances.categories.partnership` |
| Other | `#f97316` | `finances.categories.otherIncome` |

Category `name` is stored as the i18n key (e.g., `finances.categories.advertising`). The frontend resolves it via `$_()` — if the key is not found in i18n (custom categories), the raw name is displayed. Custom categories store the user-entered name directly. Note: expense "Other" uses key `finances.categories.other`, income "Other" uses `finances.categories.otherIncome` — distinct keys avoid `@@unique` collision.

## API

### Module: `apps/api/src/finances/`

Files: `finances.module.ts`, `finances.controller.ts`, `finances.service.ts`, `dto/` folder.

Register in `app.module.ts`.

All endpoints are JWT-protected (default guard). All endpoints (both read and write) require `projectId` and verify the user belongs to the project's organization.

### Authorization

Every endpoint must verify ownership. For mutating endpoints (`POST`, `PUT`, `DELETE`) the check is mandatory before any write; for read endpoints (`GET`), the service filters by `projectId` after verifying org membership. Steps for mutation:
1. Extract user from `@CurrentUser()` decorator
2. Load the target record (or use `projectId` from body)
3. Follow `projectId → project.organizationId`
4. Check that `user.organizationId === project.organizationId`
5. Return 403 Forbidden if mismatch

For `PUT /finances/:id` and `DELETE /finances/:id`: load the record first, then verify via its `projectId`.

### Endpoints

#### Finance Records

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/finances?projectId=X` | List records. Query params: `dateFrom`, `dateTo`, `type` (INCOME/EXPENSE), `categoryId`. Sorted by `date` desc. Paginated (`page`, `limit`, defaults: page=1, limit=20, max=100). Response: `{ data: FinanceRecord[], total: number, page: number, limit: number, totalPages: number }`. |
| `POST` | `/api/finances` | Create record. Body: `projectId`, `categoryId`, `type`, `amount`, `currency`, `description?`, `date`. Service fetches exchange rate if `currency ≠ baseCurrency`, computes `amountInBaseCurrency` and `exchangeRate`. |
| `PUT` | `/api/finances/:id` | Update record. Same body fields. Recalculates conversion if amount/currency changed. |
| `DELETE` | `/api/finances/:id` | Delete record. |
| `GET` | `/api/finances/summary?projectId=X` | Aggregated data. Query params: `dateFrom`, `dateTo`. Returns: `totalIncome`, `totalExpense`, `profit`, `incomeByCategory[]`, `expenseByCategory[]`, `monthlyData[]` (for bar chart). All amounts in base currency. Uses Prisma `groupBy` for aggregation. |

#### Finance Categories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/finances/categories?projectId=X` | List categories. Creates defaults if none exist (lazy init). |
| `POST` | `/api/finances/categories` | Create custom category. Body: `projectId`, `name`, `type`, `color`. `isDefault` = false. |
| `PUT` | `/api/finances/categories/:id` | Update custom category. Only non-default categories. |
| `DELETE` | `/api/finances/categories/:id` | Delete custom category. Only if no records reference it. Only non-default. |

#### Exchange Rate

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/finances/exchange-rate?from=EUR&to=USD` | Proxy to exchangerate-api.com. Returns `{ rate: number, date: string }`. Used by frontend to show preview before saving. |

### Exchange Rate Service

- Uses free tier of `https://open.er-api.com/v6/latest/{base}` (no API key required, 1500 requests/month).
- Caches rates using `@nestjs/cache-manager` with Redis store (`cache-manager-ioredis-yet`). TTL: 1 hour. Cache key: `exchange-rate:{base}`. Register `CacheModule` in `FinancesModule` with Redis connection from env vars (`REDIS_HOST`, `REDIS_PORT`).
- Fallback: if API unreachable, return error — user must retry or enter amount in base currency.

### DTOs

**CreateFinanceRecordDto:**
```typescript
{
  projectId: string
  categoryId: string
  type: FinanceRecordType // 'INCOME' | 'EXPENSE'
  amount: number          // positive
  currency: string        // ISO 4217
  description?: string
  date: string            // ISO date
}
```

**UpdateFinanceRecordDto:** same fields, all optional except `id` in path.

**CreateFinanceCategoryDto:**
```typescript
{
  projectId: string
  name: string
  type: FinanceCategoryType // 'INCOME' | 'EXPENSE' | 'BOTH'
  color: string             // hex
}
```

**FinanceSummaryResponse:**
```typescript
{
  totalIncome: number
  totalExpense: number
  profit: number
  baseCurrency: string
  incomeByCategory: { categoryId: string, name: string, color: string, total: number }[]
  expenseByCategory: { categoryId: string, name: string, color: string, total: number }[]
  monthlyData: { month: string, income: number, expense: number }[]
}
```

## Frontend

### Page: `apps/web/src/routes/(app)/projects/[id]/finances/+page.svelte`

#### Layout (top to bottom)

1. **Header row:** page title + period filter (Month / Quarter / Year / Custom) + "Add record" button
2. **Summary cards (3):** Income (green), Expenses (red), Profit (indigo). Shows amount in base currency + % change vs previous period.
3. **Charts row:**
   - Left (wider): bar chart — income vs expenses by month (Chart.js bar)
   - Right: doughnut chart — by category with toggle (expenses/income) (Chart.js doughnut)
4. **Records table:**
   - Filter tabs: All / Income / Expenses
   - Category dropdown filter + "Manage categories" link
   - Columns: Date, Type (badge), Category, Description, Amount (original currency), Amount (base currency)
   - Edit/delete icons per row
   - Sorted by date descending

#### Modals

**Add/Edit Record Modal:**
- Type toggle (Expense / Income)
- Category select (filtered by selected type)
- Amount input + Currency select
- Exchange rate info block (shown when currency ≠ base): rate, converted amount, source date
- Date picker
- Description textarea (optional)
- Cancel / Save buttons

**Manage Categories Modal:**
- Two sections: Expense categories, Income categories
- Default categories shown with "default" label, no edit/delete
- Custom categories: edit name/color, delete (only if no records)
- Add new: name input + color picker + "Add" button

### Navigation

New sidebar item "Finances" with banknote/wallet icon, placed between "Analytics" and "Settings" in the project navigation. Add to `marketingLinks` array in `Sidebar.svelte` and add `'finances'` to `marketingPathSegments` for `isActive()` matching. The link points to `/projects/{projectId}/finances`.

### Supported currencies

Supported currencies are defined once in `packages/shared-types/src/finances.ts` as `SUPPORTED_CURRENCIES` constant: `USD, EUR, GBP, PLN, RUB, UAH, BYN, KZT, TRY, JPY, CNY`. Both frontend select and backend DTO validation reference this list.

Project base currency is set via a new field in project settings page (`baseCurrency` select).

### Base currency change behavior

Changing `baseCurrency` does NOT retroactively recalculate existing records. Historical `amountInBaseCurrency` values are point-in-time conversions at their original exchange rate. Only new records use the new base currency. The UI shows a warning when changing base currency if records already exist.

### Charts library

Chart.js — already used in the analytics page. Use same import pattern.

## Shared Types

Add to `packages/shared-types/src/finances.ts`:

```typescript
export interface FinanceRecord { ... }
export interface FinanceCategory { ... }
export interface FinanceSummary { ... }
export interface CreateFinanceRecordDto { ... }
export interface UpdateFinanceRecordDto { ... }
export interface CreateFinanceCategoryDto { ... }
export interface UpdateFinanceCategoryDto { ... }
export type FinanceRecordType = 'INCOME' | 'EXPENSE'
export type FinanceCategoryType = 'INCOME' | 'EXPENSE' | 'BOTH'
```

Export from `packages/shared-types/src/index.ts`.

## i18n

Add `finances` namespace to all three locale files (`packages/i18n/src/locales/{en,pl,ru}.json`):

Keys needed:
- Page title, buttons (add, save, cancel, delete)
- Period filters (month, quarter, year, custom)
- Summary card labels (income, expenses, profit)
- Chart titles
- Table column headers
- Type labels (income, expense)
- Modal labels (all form fields)
- Category management labels
- Default category names
- Validation messages (required, positive amount, etc.)
- Empty state message
- Delete confirmation
- Currency display

## Migration

Single migration: `add_project_finances`

Adds:
- `baseCurrency` field to `Project`
- `FinanceRecordType` enum
- `FinanceCategoryType` enum
- `FinanceCategory` table
- `FinanceRecord` table

## Error Handling

- Exchange rate API failure: show error toast, user can save in base currency or retry
- Delete category with records: `onDelete: Restrict` on the FK prevents deletion at DB level. Service catches Prisma `P2003` error and returns 409 Conflict with a user-friendly message
- Invalid currency code: validate against hardcoded list in DTO
- Amount must be positive: DTO validation
- Date must not be in the future: optional, depends on user preference (allow future dates for planned expenses)

## Out of Scope

- Automatic AI cost tracking (future enhancement)
- CSV import/export (future enhancement)
- Budget vs actual comparison
- Recurring/scheduled transactions
- Attachment/receipt upload
- Campaign-level expense linking
