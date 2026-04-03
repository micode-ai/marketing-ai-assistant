import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Prisma } from '@prisma/client';
import { FinancesService } from './finances.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  project: { findUnique: jest.fn() },
  financeCategory: {
    count: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  financeRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
};

const mockCache = { get: jest.fn(), set: jest.fn() };

const ORG_ID = 'org-1';
const PROJECT_ID = 'project-1';

const baseProject = { id: PROJECT_ID, organizationId: ORG_ID, baseCurrency: 'USD' };

describe('FinancesService', () => {
  let service: FinancesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<FinancesService>(FinancesService);
  });

  // ── verifyProjectAccess ────────────────────────────────────────────────

  describe('verifyProjectAccess (via findCategories)', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.findCategories(PROJECT_ID, ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when project belongs to a different org', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        ...baseProject,
        organizationId: 'other-org',
      });

      await expect(service.findCategories(PROJECT_ID, ORG_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findCategories ─────────────────────────────────────────────────────

  describe('findCategories', () => {
    it('creates 10 default categories on first call (count = 0)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeCategory.count.mockResolvedValue(0);
      mockPrisma.financeCategory.createMany.mockResolvedValue({ count: 10 });
      mockPrisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories(PROJECT_ID, ORG_ID);

      expect(mockPrisma.financeCategory.createMany).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.financeCategory.createMany.mock.calls[0][0];
      expect(callArg.data).toHaveLength(10); // 6 expense + 4 income
      expect(callArg.data.every((d: any) => d.isDefault === true)).toBe(true);
      expect(callArg.skipDuplicates).toBe(true);
    });

    it('skips creating defaults on subsequent calls (count > 0)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeCategory.count.mockResolvedValue(10);
      mockPrisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories(PROJECT_ID, ORG_ID);

      expect(mockPrisma.financeCategory.createMany).not.toHaveBeenCalled();
    });

    it('returns categories ordered by createdAt asc', async () => {
      const categories = [{ id: 'cat-1', name: 'Advertising', type: 'EXPENSE' }];
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeCategory.count.mockResolvedValue(1);
      mockPrisma.financeCategory.findMany.mockResolvedValue(categories);

      const result = await service.findCategories(PROJECT_ID, ORG_ID);

      expect(result).toBe(categories);
      expect(mockPrisma.financeCategory.findMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  // ── updateCategory ─────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue(null);

      await expect(service.updateCategory('cat-1', { name: 'New' }, ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when category belongs to a different org', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: false,
        project: { organizationId: 'other-org' },
      });

      await expect(service.updateCategory('cat-1', { name: 'New' }, ORG_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when trying to edit a default category', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: true,
        project: { organizationId: ORG_ID },
      });

      await expect(service.updateCategory('cat-1', { name: 'New' }, ORG_ID)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.updateCategory('cat-1', { name: 'New' }, ORG_ID)).rejects.toThrow(
        'Cannot edit default categories',
      );
    });

    it('updates a non-default category successfully', async () => {
      const updated = { id: 'cat-1', name: 'Updated', isDefault: false };
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: false,
        project: { organizationId: ORG_ID },
      });
      mockPrisma.financeCategory.update.mockResolvedValue(updated);

      const result = await service.updateCategory('cat-1', { name: 'Updated' }, ORG_ID);

      expect(result).toBe(updated);
      expect(mockPrisma.financeCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { name: 'Updated' },
      });
    });
  });

  // ── deleteCategory ─────────────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue(null);

      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when category belongs to a different org', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: false,
        project: { organizationId: 'other-org' },
      });

      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when trying to delete a default category', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: true,
        project: { organizationId: ORG_ID },
      });

      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(ForbiddenException);
      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(
        'Cannot delete default categories',
      );
    });

    it('throws ConflictException when Prisma P2003 foreign key error occurs', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: false,
        project: { organizationId: ORG_ID },
      });

      const p2003 = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      mockPrisma.financeCategory.delete.mockRejectedValue(p2003);

      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(ConflictException);
      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(
        'Cannot delete category that has records.',
      );
    });

    it('rethrows non-P2003 errors', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: false,
        project: { organizationId: ORG_ID },
      });

      const unexpectedError = new Error('Unexpected DB error');
      mockPrisma.financeCategory.delete.mockRejectedValue(unexpectedError);

      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow('Unexpected DB error');
    });

    it('deletes a non-default category successfully', async () => {
      const deleted = { id: 'cat-1' };
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        isDefault: false,
        project: { organizationId: ORG_ID },
      });
      mockPrisma.financeCategory.delete.mockResolvedValue(deleted);

      const result = await service.deleteCategory('cat-1', ORG_ID);

      expect(result).toBe(deleted);
    });
  });

  // ── createRecord ───────────────────────────────────────────────────────

  describe('createRecord', () => {
    const dto = {
      projectId: PROJECT_ID,
      categoryId: 'cat-1',
      type: 'EXPENSE' as const,
      amount: 100,
      currency: 'USD',
      date: '2026-01-15',
      description: 'Test expense',
    };

    it('sets exchangeRate=1 when currency matches baseCurrency', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject); // baseCurrency = 'USD'
      const createdRecord = {
        ...dto,
        id: 'rec-1',
        amount: 100,
        amountInBaseCurrency: 100,
        exchangeRate: 1,
        category: { id: 'cat-1', name: 'Tools' },
      };
      mockPrisma.financeRecord.create.mockResolvedValue(createdRecord);

      const result = await service.createRecord(dto, ORG_ID);

      expect(mockPrisma.financeRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            exchangeRate: 1,
            amountInBaseCurrency: 100,
          }),
        }),
      );
      expect(result.exchangeRate).toBe(1);
    });

    it('fetches exchange rate when currency differs from baseCurrency', async () => {
      const euroProject = { ...baseProject, baseCurrency: 'EUR' };
      mockPrisma.project.findUnique.mockResolvedValue(euroProject);

      // Mock the cache miss and fetch
      mockCache.get.mockResolvedValue(null);
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: async () => ({
          rates: { EUR: 0.92 },
          time_last_update_utc: '2026-01-15',
        }),
      } as Response);

      const usdDto = { ...dto, currency: 'USD' };
      const createdRecord = {
        ...usdDto,
        id: 'rec-1',
        amount: 100,
        amountInBaseCurrency: 92,
        exchangeRate: 0.92,
        category: null,
      };
      mockPrisma.financeRecord.create.mockResolvedValue(createdRecord);

      const result = await service.createRecord(usdDto, ORG_ID);

      expect(fetchSpy).toHaveBeenCalled();
      expect(result.exchangeRate).toBe(0.92);

      fetchSpy.mockRestore();
    });

    it('returns record with numeric amount fields', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      const createdRecord = {
        id: 'rec-1',
        amount: '100.00',      // Prisma returns Decimal as string-like
        amountInBaseCurrency: '100.00',
        exchangeRate: '1.00',
        category: null,
        projectId: PROJECT_ID,
        categoryId: 'cat-1',
        type: 'EXPENSE',
        currency: 'USD',
        date: new Date('2026-01-15'),
        description: 'Test',
      };
      mockPrisma.financeRecord.create.mockResolvedValue(createdRecord);

      const result = await service.createRecord(dto, ORG_ID);

      expect(typeof result.amount).toBe('number');
      expect(typeof result.amountInBaseCurrency).toBe('number');
      expect(typeof result.exchangeRate).toBe('number');
    });
  });

  // ── getExchangeRate ────────────────────────────────────────────────────

  describe('getExchangeRate', () => {
    it('returns rate=1 and today\'s date when from === to', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = await service.getExchangeRate('USD', 'USD');

      expect(result).toEqual({ rate: 1, date: today });
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('returns cached rate without calling fetch', async () => {
      mockCache.get.mockResolvedValue({ rates: { EUR: 0.92 }, date: '2026-01-15' });
      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await service.getExchangeRate('USD', 'EUR');

      expect(result).toEqual({ rate: 0.92, date: '2026-01-15' });
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('fetches rate from API when cache miss and stores in cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: async () => ({
          rates: { EUR: 0.92 },
          time_last_update_utc: '2026-01-15',
        }),
      } as Response);

      const result = await service.getExchangeRate('USD', 'EUR');

      expect(result).toEqual({ rate: 0.92, date: '2026-01-15' });
      expect(mockCache.set).toHaveBeenCalledWith(
        'exchange_rate_USD',
        { rates: { EUR: 0.92 }, date: '2026-01-15' },
        3600000,
      );

      fetchSpy.mockRestore();
    });

    it('returns rate=1 when API call fails', async () => {
      mockCache.get.mockResolvedValue(null);
      const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
      const today = new Date().toISOString().slice(0, 10);

      const result = await service.getExchangeRate('USD', 'EUR');

      expect(result).toEqual({ rate: 1, date: today });

      fetchSpy.mockRestore();
    });

    it('returns rate=1 when API returns invalid data', async () => {
      mockCache.get.mockResolvedValue(null);
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: async () => ({ result: 'error' }), // no rates
      } as Response);
      const today = new Date().toISOString().slice(0, 10);

      const result = await service.getExchangeRate('USD', 'EUR');

      expect(result).toEqual({ rate: 1, date: today });

      fetchSpy.mockRestore();
    });
  });

  // ── findRecords ────────────────────────────────────────────────────────

  describe('findRecords', () => {
    const makeRecord = (id: string) => ({
      id,
      amount: '50.00',
      amountInBaseCurrency: '50.00',
      exchangeRate: '1.00',
      category: { id: 'cat-1', name: 'Tools' },
    });

    it('returns paginated records with metadata', async () => {
      const records = [makeRecord('rec-1'), makeRecord('rec-2')];
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue(records);
      mockPrisma.financeRecord.count.mockResolvedValue(2);

      const result = await service.findRecords(PROJECT_ID, ORG_ID);

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.baseCurrency).toBe('USD');
      expect(result.data).toHaveLength(2);
    });

    it('respects custom page and limit', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue([]);
      mockPrisma.financeRecord.count.mockResolvedValue(100);

      const result = await service.findRecords(PROJECT_ID, ORG_ID, { page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(mockPrisma.financeRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('applies type filter when provided', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue([]);
      mockPrisma.financeRecord.count.mockResolvedValue(0);

      await service.findRecords(PROJECT_ID, ORG_ID, { type: 'INCOME' });

      expect(mockPrisma.financeRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'INCOME' }) }),
      );
    });

    it('applies date range filters when provided', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue([]);
      mockPrisma.financeRecord.count.mockResolvedValue(0);

      await service.findRecords(PROJECT_ID, ORG_ID, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });

      expect(mockPrisma.financeRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31'),
            },
          }),
        }),
      );
    });

    it('converts amount fields to numbers in returned records', async () => {
      const records = [makeRecord('rec-1')];
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue(records);
      mockPrisma.financeRecord.count.mockResolvedValue(1);

      const result = await service.findRecords(PROJECT_ID, ORG_ID);

      const rec = result.data[0];
      expect(typeof rec.amount).toBe('number');
      expect(typeof rec.amountInBaseCurrency).toBe('number');
      expect(typeof rec.exchangeRate).toBe('number');
    });

    it('defaults to page=1 and limit=50 when no filters provided', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue([]);
      mockPrisma.financeRecord.count.mockResolvedValue(0);

      const result = await service.findRecords(PROJECT_ID, ORG_ID);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockPrisma.financeRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });
  });
});
