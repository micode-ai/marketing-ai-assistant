import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CompetitorStatus } from '@prisma/client';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { CompetitorSuggestionService } from './competitor-suggestion.service';
import { GscSyncService } from './gsc-sync.service';
import { PrismaService } from '../database/prisma.service';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CompetitorAccessGuard } from '../common/guards/competitor-access.guard';

const mockSeoService = {
  findKeywords: jest.fn(),
  findKeyword: jest.fn(),
  createKeyword: jest.fn(),
  updateKeyword: jest.fn(),
  deleteKeyword: jest.fn(),
  getKeywordHistory: jest.fn(),
  addRankHistory: jest.fn(),
  findCompetitors: jest.fn(),
  createCompetitor: jest.fn(),
  updateCompetitor: jest.fn(),
  deleteCompetitor: jest.fn(),
  addCompetitorSnapshot: jest.fn(),
};

const mockPrismaService = {};

const mockCompetitorSuggestionService = {
  suggest: jest.fn(),
};

const mockGscSyncService = {
  syncProject: jest.fn(),
};

describe('SeoController', () => {
  let controller: SeoController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeoController],
      providers: [
        { provide: SeoService, useValue: mockSeoService },
        { provide: CompetitorSuggestionService, useValue: mockCompetitorSuggestionService },
        { provide: GscSyncService, useValue: mockGscSyncService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      .overrideGuard(ProjectAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CompetitorAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SeoController>(SeoController);
  });

  // ---------------------------------------------------------------------------
  // POST /seo/keywords/:id/rank
  // ---------------------------------------------------------------------------

  describe('addRankHistory()', () => {
    it('calls seoService.addRankHistory with rank and url', async () => {
      const result = { id: 'hist-1', rank: 5 };
      mockSeoService.addRankHistory.mockResolvedValue(result);

      const res = await controller.addRankHistory('kw-abc', { rank: 5, url: 'https://example.com' });

      expect(mockSeoService.addRankHistory).toHaveBeenCalledWith('kw-abc', 5, 'https://example.com');
      expect(res).toEqual(result);
    });

    it('passes rank: null when not in top 100', async () => {
      mockSeoService.addRankHistory.mockResolvedValue({ id: 'hist-2', rank: null });

      await controller.addRankHistory('kw-abc', { rank: null });

      expect(mockSeoService.addRankHistory).toHaveBeenCalledWith('kw-abc', null, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/keywords/sync-from-gsc
  // ---------------------------------------------------------------------------

  describe('syncFromGsc()', () => {
    it('calls gscSync.syncProject with projectId and returns its result', async () => {
      const summary = { synced: 5, matched: 4, skipped: ['kw:NO_MATCH_IN_GSC'] };
      mockGscSyncService.syncProject.mockResolvedValue(summary);

      const result = await controller.syncFromGsc({ projectId: 'proj-123' });

      expect(mockGscSyncService.syncProject).toHaveBeenCalledWith('proj-123');
      expect(result).toEqual(summary);
    });

    it('throws BadRequestException when projectId is missing', () => {
      expect(() => controller.syncFromGsc({ projectId: '' })).toThrow('projectId is required');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/competitors/suggest
  // ---------------------------------------------------------------------------

  describe('suggestCompetitors()', () => {
    it('calls CompetitorSuggestionService.suggest with projectId and returns the result', async () => {
      const suggestions = [
        { id: 'c1', name: 'CompA', websiteUrl: 'https://compa.com', status: 'SUGGESTED' },
        { id: 'c2', name: 'CompB', websiteUrl: 'https://compb.com', status: 'SUGGESTED' },
      ];
      mockCompetitorSuggestionService.suggest.mockResolvedValue(suggestions);

      const result = await controller.suggestCompetitors({ projectId: 'proj-xyz' });

      expect(mockCompetitorSuggestionService.suggest).toHaveBeenCalledWith('proj-xyz');
      expect(result).toEqual(suggestions);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/competitors/:id/approve
  // ---------------------------------------------------------------------------

  describe('approveCompetitor()', () => {
    it('calls updateCompetitor with status ACTIVE and an approvedAt Date', async () => {
      const updated = { id: 'comp-1', status: 'ACTIVE', approvedAt: new Date() };
      mockSeoService.updateCompetitor.mockResolvedValue(updated);

      const result = await controller.approveCompetitor('comp-1');

      expect(mockSeoService.updateCompetitor).toHaveBeenCalledWith('comp-1', {
        status: CompetitorStatus.ACTIVE,
        approvedAt: expect.any(Date),
      });
      expect(result).toEqual(updated);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /seo/competitors/:id/dismiss
  // ---------------------------------------------------------------------------

  describe('dismissCompetitor()', () => {
    it('calls updateCompetitor with status DISMISSED', async () => {
      const updated = { id: 'comp-1', status: 'DISMISSED' };
      mockSeoService.updateCompetitor.mockResolvedValue(updated);

      const result = await controller.dismissCompetitor('comp-1');

      expect(mockSeoService.updateCompetitor).toHaveBeenCalledWith('comp-1', {
        status: CompetitorStatus.DISMISSED,
      });
      expect(result).toEqual(updated);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /seo/competitors?status=SUGGESTED
  // ---------------------------------------------------------------------------

  describe('findCompetitors() — status filter', () => {
    it('passes status=SUGGESTED through to the service', async () => {
      const competitors = [{ id: 'c1', status: 'SUGGESTED' }];
      mockSeoService.findCompetitors.mockResolvedValue(competitors);

      const result = await controller.findCompetitors('proj-abc', undefined, undefined, 'SUGGESTED');

      expect(mockSeoService.findCompetitors).toHaveBeenCalledWith({
        projectId: 'proj-abc',
        organizationId: undefined,
        aggregated: false,
        status: CompetitorStatus.SUGGESTED,
      });
      expect(result).toEqual(competitors);
    });

    it('omits status from the service call when query param is absent', async () => {
      mockSeoService.findCompetitors.mockResolvedValue([]);

      await controller.findCompetitors('proj-abc', undefined, undefined, undefined);

      expect(mockSeoService.findCompetitors).toHaveBeenCalledWith({
        projectId: 'proj-abc',
        organizationId: undefined,
        aggregated: false,
        status: undefined,
      });
    });

    it('omits status when an invalid value is passed', async () => {
      mockSeoService.findCompetitors.mockResolvedValue([]);

      await controller.findCompetitors('proj-abc', undefined, undefined, 'INVALID_STATUS');

      expect(mockSeoService.findCompetitors).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });
  });
});
