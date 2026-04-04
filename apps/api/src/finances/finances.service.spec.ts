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
const projectScope = { projectId: PROJECT_ID, organizationId: ORG_ID };
const orgScope = { organizationId: ORG_ID };

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

  describe('resolveScope (via findCategories)', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      await expect(service.findCategories(projectScope)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when project belongs to a different org', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ ...baseProject, organizationId: 'other-org' });
      await expect(service.findCategories(projectScope)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findCategories ─────────────────────────────────────────────────────

  describe('findCategories', () => {
    it('creates 10 default categories on first call (count = 0)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeCategory.count.mockResolvedValue(0);
      mockPrisma.financeCategory.createMany.mockResolvedValue({ count: 10 });
      mockPrisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories(projectScope);

      expect(mockPrisma.financeCategory.createMany).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.financeCategory.createMany.mock.calls[0][0];
      expect(callArg.data).toHaveLength(10);
      expect(callArg.data.every((d: any) => d.isDefault === true)).toBe(true);
      expect(callArg.skipDuplicates).toBe(true);
    });

    it('skips creating defaults on subsequent calls (count > 0)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeCategory.count.mockResolvedValue(10);
      mockPrisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories(projectScope);
      expect(mockPrisma.financeCategory.createMany).not.toHaveBeenCalled();
    });

    it('works with org scope (no projectId)', async () => {
      mockPrisma.financeCategory.count.mockResolvedValue(0);
      mockPrisma.financeCategory.createMany.mockResolvedValue({ count: 10 });
      mockPrisma.financeCategory.findMany.mockResolvedValue([]);

      await service.findCategories(orgScope);

      const callArg = mockPrisma.financeCategory.createMany.mock.calls[0][0];
      expect(callArg.data[0]).toHaveProperty('organizationId', ORG_ID);
      expect(callArg.data[0]).toHaveProperty('scope', 'ORGANIZATION');
    });
  });

  // ── updateCategory ─────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue(null);
      await expect(service.updateCategory('cat-1', { name: 'New' }, ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to edit a default category', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1', isDefault: true, organizationId: ORG_ID, project: null,
      });
      await expect(service.updateCategory('cat-1', { name: 'New' }, ORG_ID)).rejects.toThrow(ForbiddenException);
    });

    it('updates a non-default category successfully', async () => {
      const updated = { id: 'cat-1', name: 'Updated', isDefault: false };
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1', isDefault: false, organizationId: null, project: { organizationId: ORG_ID },
      });
      mockPrisma.financeCategory.update.mockResolvedValue(updated);

      const result = await service.updateCategory('cat-1', { name: 'Updated' }, ORG_ID);
      expect(result).toBe(updated);
    });
  });

  // ── deleteCategory ─────────────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('throws ForbiddenException when trying to delete a default category', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1', isDefault: true, organizationId: ORG_ID, project: null,
      });
      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when Prisma P2003 error occurs', async () => {
      mockPrisma.financeCategory.findUnique.mockResolvedValue({
        id: 'cat-1', isDefault: false, organizationId: null, project: { organizationId: ORG_ID },
      });
      const p2003 = new Prisma.PrismaClientKnownRequestError('FK constraint', { code: 'P2003', clientVersion: '5.0.0' });
      mockPrisma.financeCategory.delete.mockRejectedValue(p2003);

      await expect(service.deleteCategory('cat-1', ORG_ID)).rejects.toThrow(ConflictException);
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
    };

    it('sets exchangeRate=1 when currency matches baseCurrency', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.create.mockResolvedValue({
        ...dto, id: 'rec-1', amount: 100, amountInBaseCurrency: 100, exchangeRate: 1, category: {},
      });

      const result = await service.createRecord(dto, ORG_ID);
      expect(result.exchangeRate).toBe(1);
    });

    it('creates org-level record when no projectId', async () => {
      const orgDto = { ...dto, projectId: undefined };
      mockPrisma.financeRecord.create.mockResolvedValue({
        ...orgDto, id: 'rec-1', amount: 100, amountInBaseCurrency: 100, exchangeRate: 1, category: {},
        organizationId: ORG_ID, scope: 'ORGANIZATION',
      });

      const result = await service.createRecord(orgDto, ORG_ID);
      expect(mockPrisma.financeRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: ORG_ID, scope: 'ORGANIZATION' }),
        }),
      );
      expect(result.exchangeRate).toBe(1);
    });
  });

  // ── getExchangeRate ────────────────────────────────────────────────────

  describe('getExchangeRate', () => {
    it('returns rate=1 when from === to', async () => {
      const result = await service.getExchangeRate('USD', 'USD');
      expect(result.rate).toBe(1);
    });

    it('returns cached rate without calling fetch', async () => {
      mockCache.get.mockResolvedValue({ rates: { EUR: 0.92 }, date: '2026-01-15' });
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await service.getExchangeRate('USD', 'EUR');
      expect(result).toEqual({ rate: 0.92, date: '2026-01-15' });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('fetches rate from API on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: async () => ({ rates: { EUR: 0.92 }, time_last_update_utc: '2026-01-15' }),
      } as Response);

      const result = await service.getExchangeRate('USD', 'EUR');
      expect(result).toEqual({ rate: 0.92, date: '2026-01-15' });
      fetchSpy.mockRestore();
    });

    it('returns rate=1 when API fails', async () => {
      mockCache.get.mockResolvedValue(null);
      const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fail'));
      const result = await service.getExchangeRate('USD', 'EUR');
      expect(result.rate).toBe(1);
      fetchSpy.mockRestore();
    });
  });

  // ── findRecords ────────────────────────────────────────────────────────

  describe('findRecords', () => {
    it('returns paginated records for project scope', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(baseProject);
      mockPrisma.financeRecord.findMany.mockResolvedValue([
        { id: 'r1', amount: '50', amountInBaseCurrency: '50', exchangeRate: '1', category: {} },
      ]);
      mockPrisma.financeRecord.count.mockResolvedValue(1);

      const result = await service.findRecords(projectScope);
      expect(result.total).toBe(1);
      expect(result.baseCurrency).toBe('USD');
      expect(typeof result.data[0].amount).toBe('number');
    });

    it('returns records for org scope', async () => {
      mockPrisma.financeRecord.findMany.mockResolvedValue([]);
      mockPrisma.financeRecord.count.mockResolvedValue(0);

      const result = await service.findRecords(orgScope);
      expect(result.total).toBe(0);
      expect(result.baseCurrency).toBe('USD');
    });
  });
});
