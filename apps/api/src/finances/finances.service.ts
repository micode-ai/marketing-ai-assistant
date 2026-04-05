import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import { UpdateFinanceRecordDto } from './dto/update-finance-record.dto';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';

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

interface Scope {
  projectId?: string;
  organizationId: string;
  aggregated?: boolean;
}

@Injectable()
export class FinancesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────

  private async resolveScope(scope: Scope) {
    if (scope.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: scope.projectId },
        select: { id: true, organizationId: true, baseCurrency: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (project.organizationId !== scope.organizationId) throw new ForbiddenException('Access denied');
      return { type: 'project' as const, project, baseCurrency: project.baseCurrency };
    }
    // Org-level: use USD as default base currency (org has no baseCurrency field)
    return { type: 'org' as const, project: null, baseCurrency: 'USD' };
  }

  private buildWhere(scope: Scope): any {
    if (scope.aggregated && scope.organizationId) {
      // All records across all projects in this org + org-level records
      return {
        OR: [
          { project: { organizationId: scope.organizationId } },
          { organizationId: scope.organizationId, scope: 'ORGANIZATION' },
        ],
      };
    }
    if (scope.projectId) {
      return { projectId: scope.projectId };
    }
    // Org-level only
    return { organizationId: scope.organizationId, scope: 'ORGANIZATION' };
  }

  private buildCategoryWhere(scope: Scope): any {
    if (scope.aggregated && scope.organizationId) {
      return {
        OR: [
          { project: { organizationId: scope.organizationId } },
          { organizationId: scope.organizationId, scope: 'ORGANIZATION' },
        ],
      };
    }
    if (scope.projectId) {
      return { projectId: scope.projectId };
    }
    return { organizationId: scope.organizationId, scope: 'ORGANIZATION' };
  }

  // ── Exchange rate ─────────────────────────────────────────────────

  async getExchangeRate(from: string, to: string): Promise<{ rate: number; date: string }> {
    const today = new Date().toISOString().slice(0, 10);
    if (from === to) return { rate: 1, date: today };

    const cacheKey = `exchange_rate_${from}`;
    const cached = await this.cacheManager.get<{ rates: Record<string, number>; date: string }>(cacheKey);
    if (cached && cached.rates[to] !== undefined) {
      return { rate: cached.rates[to], date: cached.date };
    }

    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
      const data = (await response.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (data && data.rates && data.rates[to]) {
        const rateDate = data.time_last_update_utc?.slice(0, 10) || today;
        await this.cacheManager.set(cacheKey, { rates: data.rates, date: rateDate }, 3600000);
        return { rate: data.rates[to], date: rateDate };
      }
    } catch {
      // Fall through to default
    }

    return { rate: 1, date: today };
  }

  // ── Categories ────────────────────────────────────────────────────

  async findCategories(reqScope: Scope) {
    try {
      await this.resolveScope(reqScope);

      // Lazy-init default categories for project or org
      const countWhere: any = reqScope.projectId
        ? { projectId: reqScope.projectId }
        : { organizationId: reqScope.organizationId, scope: 'ORGANIZATION' };
      const count = await this.prisma.financeCategory.count({ where: countWhere });
      if (count === 0) {
        const allDefaults = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
        await this.prisma.financeCategory.createMany({
          data: allDefaults.map((c) => ({
            ...(reqScope.projectId
              ? { projectId: reqScope.projectId, scope: 'PROJECT' as any }
              : { organizationId: reqScope.organizationId, scope: 'ORGANIZATION' as any }),
            name: c.name,
            type: c.type,
            color: c.color,
            isDefault: true,
          })),
          skipDuplicates: true,
        });
      }

      return await this.prisma.financeCategory.findMany({
        where: this.buildCategoryWhere(reqScope),
        orderBy: { createdAt: 'asc' },
      });
    } catch (e) {
      console.error('[findCategories] Error:', e, 'Scope:', JSON.stringify(reqScope));
      throw e;
    }
  }

  async createCategory(dto: CreateFinanceCategoryDto, orgId: string) {
    if (dto.projectId) {
      await this.resolveScope({ projectId: dto.projectId, organizationId: orgId });
    }

    return this.prisma.financeCategory.create({
      data: {
        ...(dto.projectId
          ? { projectId: dto.projectId, scope: 'PROJECT' as const }
          : { organizationId: orgId, scope: 'ORGANIZATION' as const }),
        name: dto.name,
        type: dto.type,
        color: dto.color,
        isDefault: false,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateFinanceCategoryDto, userOrgId: string) {
    const category = await this.prisma.financeCategory.findUnique({
      where: { id },
      include: { project: { select: { organizationId: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    const catOrgId = category.organizationId || category.project?.organizationId;
    if (catOrgId !== userOrgId) throw new ForbiddenException('Access denied');
    if (category.isDefault) throw new ForbiddenException('Cannot edit default categories');

    return this.prisma.financeCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
  }

  async deleteCategory(id: string, userOrgId: string) {
    const category = await this.prisma.financeCategory.findUnique({
      where: { id },
      include: { project: { select: { organizationId: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    const catOrgId = category.organizationId || category.project?.organizationId;
    if (catOrgId !== userOrgId) throw new ForbiddenException('Access denied');
    if (category.isDefault) throw new ForbiddenException('Cannot delete default categories');

    try {
      return await this.prisma.financeCategory.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('Cannot delete category that has records.');
      }
      throw e;
    }
  }

  // ── Records ───────────────────────────────────────────────────────

  async findRecords(
    scope: Scope,
    filters?: {
      type?: 'INCOME' | 'EXPENSE';
      categoryId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const resolved = await this.resolveScope(scope);

    const where: any = this.buildWhere(scope);
    if (filters?.type) where.type = filters.type;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      if (filters?.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.date.lte = new Date(filters.dateTo);
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;

    const [records, total] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where,
        include: { category: true, project: { select: { name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.financeRecord.count({ where }),
    ]);

    return {
      data: records.map((r) => ({
        ...r,
        amount: Number(r.amount),
        amountInBaseCurrency: Number(r.amountInBaseCurrency),
        exchangeRate: Number(r.exchangeRate),
      })),
      total,
      page,
      limit,
      baseCurrency: resolved.baseCurrency,
    };
  }

  async createRecord(dto: CreateFinanceRecordDto, orgId: string) {
    let baseCurrency = 'USD';

    if (dto.projectId) {
      const resolved = await this.resolveScope({ projectId: dto.projectId, organizationId: orgId });
      baseCurrency = resolved.baseCurrency;
    }

    const rateData = await this.getExchangeRate(dto.currency, baseCurrency);
    const exchangeRate = rateData.rate;
    const amountInBaseCurrency = Math.round(dto.amount * exchangeRate * 100) / 100;

    const record = await this.prisma.financeRecord.create({
      data: {
        ...(dto.projectId
          ? { projectId: dto.projectId, scope: 'PROJECT' as const }
          : { organizationId: orgId, scope: 'ORGANIZATION' as const }),
        categoryId: dto.categoryId,
        type: dto.type,
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
    const existing = await this.prisma.financeRecord.findUnique({
      where: { id },
      include: { project: { select: { organizationId: true, baseCurrency: true } } },
    });
    if (!existing) throw new NotFoundException('Record not found');
    const recOrgId = existing.organizationId || existing.project?.organizationId;
    if (recOrgId !== userOrgId) throw new ForbiddenException('Access denied');

    const data: any = {};
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.date !== undefined) data.date = new Date(dto.date);

    // Reassign project: null = move to org-level, string = move to project
    if (dto.projectId !== undefined) {
      if (dto.projectId === null || dto.projectId === '') {
        data.projectId = null;
        data.organizationId = userOrgId;
        data.scope = 'ORGANIZATION';
      } else {
        await this.resolveScope({ projectId: dto.projectId, organizationId: userOrgId });
        data.projectId = dto.projectId;
        data.organizationId = null;
        data.scope = 'PROJECT';
      }
    }

    const newAmount = dto.amount ?? Number(existing.amount);
    const newCurrency = dto.currency ?? existing.currency;
    if (dto.amount !== undefined || dto.currency !== undefined) {
      const baseCurrency = existing.project?.baseCurrency || 'USD';
      const rateData = await this.getExchangeRate(newCurrency, baseCurrency);
      data.amount = newAmount;
      data.currency = newCurrency;
      data.exchangeRate = rateData.rate;
      data.amountInBaseCurrency = Math.round(newAmount * rateData.rate * 100) / 100;
    }

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
    const record = await this.prisma.financeRecord.findUnique({
      where: { id },
      include: { project: { select: { organizationId: true } } },
    });
    if (!record) throw new NotFoundException('Record not found');
    const recOrgId = record.organizationId || record.project?.organizationId;
    if (recOrgId !== userOrgId) throw new ForbiddenException('Access denied');

    return this.prisma.financeRecord.delete({ where: { id } });
  }

  // ── Summary ───────────────────────────────────────────────────────

  async getSummary(scope: Scope, dateFrom?: string, dateTo?: string) {
    const resolved = await this.resolveScope(scope);

    const where: any = this.buildWhere(scope);
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [incomeAgg, expenseAgg, byCategory, monthlyData] = await Promise.all([
      this.prisma.financeRecord.aggregate({
        where: { ...where, type: 'INCOME' },
        _sum: { amountInBaseCurrency: true },
        _count: true,
      }),
      this.prisma.financeRecord.aggregate({
        where: { ...where, type: 'EXPENSE' },
        _sum: { amountInBaseCurrency: true },
        _count: true,
      }),
      this.prisma.financeRecord.groupBy({
        by: ['categoryId', 'type'],
        where,
        _sum: { amountInBaseCurrency: true },
        _count: true,
      }),
      this.prisma.financeRecord.findMany({
        where,
        select: { type: true, amountInBaseCurrency: true, date: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const monthlyMap = new Map<string, { income: number; expense: number }>();
    for (const r of monthlyData) {
      const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) monthlyMap.set(key, { income: 0, expense: 0 });
      const entry = monthlyMap.get(key)!;
      const amount = Number(r.amountInBaseCurrency);
      if (r.type === 'INCOME') entry.income += amount;
      else entry.expense += amount;
    }

    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income * 100) / 100,
        expense: Math.round(data.expense * 100) / 100,
        profit: Math.round((data.income - data.expense) * 100) / 100,
      }));

    const categoryIds = byCategory.map((c) => c.categoryId);
    const categories = await this.prisma.financeCategory.findMany({
      where: { id: { in: categoryIds } },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const totalIncome = Number(incomeAgg._sum.amountInBaseCurrency || 0);
    const totalExpense = Number(expenseAgg._sum.amountInBaseCurrency || 0);

    return {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      profit: Math.round((totalIncome - totalExpense) * 100) / 100,
      incomeCount: incomeAgg._count,
      expenseCount: expenseAgg._count,
      baseCurrency: resolved.baseCurrency,
      byCategory: byCategory.map((c) => {
        const cat = categoryMap.get(c.categoryId);
        return {
          categoryId: c.categoryId,
          categoryName: cat?.name || 'Unknown',
          categoryColor: cat?.color || '#888888',
          type: c.type,
          total: Math.round(Number(c._sum.amountInBaseCurrency || 0) * 100) / 100,
          count: c._count,
        };
      }),
      monthly,
    };
  }
}
