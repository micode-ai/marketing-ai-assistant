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

@Injectable()
export class FinancesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private async verifyProjectAccess(projectId: string, userOrgId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, baseCurrency: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.organizationId !== userOrgId) {
      throw new ForbiddenException('Access denied');
    }
    return project;
  }

  async getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const cacheKey = `exchange_rate_${from}_${to}`;
    const cached = await this.cacheManager.get<number>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
      const data = (await response.json()) as { rates?: Record<string, number> };
      if (data && data.rates && data.rates[to]) {
        const rate = data.rates[to];
        await this.cacheManager.set(cacheKey, rate, 3600000);
        return rate;
      }
    } catch {
      // Fall through to default
    }

    return 1;
  }

  // ── Categories ──────────────────────────────────────────────────────

  async findCategories(projectId: string, userOrgId: string) {
    await this.verifyProjectAccess(projectId, userOrgId);

    // Lazy-init default categories
    const count = await this.prisma.financeCategory.count({ where: { projectId } });
    if (count === 0) {
      const allDefaults = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
      await this.prisma.financeCategory.createMany({
        data: allDefaults.map((c) => ({
          projectId,
          name: c.name,
          type: c.type,
          color: c.color,
          isDefault: true,
        })),
        skipDuplicates: true,
      });
    }

    return this.prisma.financeCategory.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createCategory(dto: CreateFinanceCategoryDto, userOrgId: string) {
    await this.verifyProjectAccess(dto.projectId, userOrgId);

    return this.prisma.financeCategory.create({
      data: {
        projectId: dto.projectId,
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
    if (category.project.organizationId !== userOrgId) {
      throw new ForbiddenException('Access denied');
    }

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
    if (category.project.organizationId !== userOrgId) {
      throw new ForbiddenException('Access denied');
    }

    try {
      return await this.prisma.financeCategory.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('Cannot delete category that has records.');
      }
      throw e;
    }
  }

  // ── Records ─────────────────────────────────────────────────────────

  async findRecords(
    projectId: string,
    userOrgId: string,
    filters?: {
      type?: 'INCOME' | 'EXPENSE';
      categoryId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const project = await this.verifyProjectAccess(projectId, userOrgId);

    const where: any = { projectId };
    if (filters?.type) where.type = filters.type;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;

    const [records, total] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where,
        include: { category: true },
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
      baseCurrency: project.baseCurrency,
    };
  }

  async createRecord(dto: CreateFinanceRecordDto, userOrgId: string) {
    const project = await this.verifyProjectAccess(dto.projectId, userOrgId);

    const exchangeRate = await this.getExchangeRate(dto.currency, project.baseCurrency);
    const amountInBaseCurrency = dto.amount * exchangeRate;

    const record = await this.prisma.financeRecord.create({
      data: {
        projectId: dto.projectId,
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
    if (existing.project.organizationId !== userOrgId) {
      throw new ForbiddenException('Access denied');
    }

    const data: any = {};
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.date !== undefined) data.date = new Date(dto.date);

    // Recalculate if amount or currency changed
    const newAmount = dto.amount ?? Number(existing.amount);
    const newCurrency = dto.currency ?? existing.currency;
    if (dto.amount !== undefined || dto.currency !== undefined) {
      const exchangeRate = await this.getExchangeRate(newCurrency, existing.project.baseCurrency);
      data.amount = newAmount;
      data.currency = newCurrency;
      data.exchangeRate = exchangeRate;
      data.amountInBaseCurrency = newAmount * exchangeRate;
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
    if (record.project.organizationId !== userOrgId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.financeRecord.delete({ where: { id } });
  }

  // ── Summary ─────────────────────────────────────────────────────────

  async getSummary(
    projectId: string,
    userOrgId: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const project = await this.verifyProjectAccess(projectId, userOrgId);

    const where: any = { projectId };
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

    // Build monthly breakdown
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

    // Fetch category names for the breakdown
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
      baseCurrency: project.baseCurrency,
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
