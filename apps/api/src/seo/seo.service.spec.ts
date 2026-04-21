import { Test, TestingModule } from '@nestjs/testing';
import { CompetitorStatus } from '@prisma/client';
import { SeoService } from './seo.service';
import { PrismaService } from '../database/prisma.service';

const mockPrismaService = {
  competitor: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('SeoService', () => {
  let service: SeoService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeoService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SeoService>(SeoService);
  });

  // ---------------------------------------------------------------------------
  // updateCompetitor — field whitelist
  // ---------------------------------------------------------------------------

  describe('updateCompetitor()', () => {
    it('passes only whitelisted fields to prisma.competitor.update', async () => {
      mockPrismaService.competitor.update.mockResolvedValue({ id: 'comp-1' });

      await service.updateCompetitor('comp-1', {
        name: 'New Name',
        status: CompetitorStatus.ACTIVE,
        approvedAt: null,
      });

      expect(mockPrismaService.competitor.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: {
          name: 'New Name',
          status: CompetitorStatus.ACTIVE,
          approvedAt: null,
        },
      });
    });

    it('silently drops unknown fields that are not in the whitelist', async () => {
      mockPrismaService.competitor.update.mockResolvedValue({ id: 'comp-1' });

      // Pass a DTO that has extra unknown fields (simulating a caller that passes raw request body)
      const dtoWithExtras: any = {
        name: 'Valid Name',
        unknownField: 'should be ignored',
        anotherBadField: 42,
      };
      await service.updateCompetitor('comp-1', dtoWithExtras);

      const callArgs = mockPrismaService.competitor.update.mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('unknownField');
      expect(callArgs.data).not.toHaveProperty('anotherBadField');
      expect(callArgs.data).toEqual({ name: 'Valid Name' });
    });

    it('omits a key entirely when its value is undefined (no partial-null pollution)', async () => {
      mockPrismaService.competitor.update.mockResolvedValue({ id: 'comp-1' });

      await service.updateCompetitor('comp-1', {
        name: 'A',
        // websiteUrl is not passed → should not appear in data
      });

      const callArgs = mockPrismaService.competitor.update.mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('websiteUrl');
    });

    it('includes null values explicitly (e.g. approvedAt: null to clear the field)', async () => {
      mockPrismaService.competitor.update.mockResolvedValue({ id: 'comp-1' });

      await service.updateCompetitor('comp-1', { approvedAt: null });

      const callArgs = mockPrismaService.competitor.update.mock.calls[0][0];
      expect(callArgs.data).toHaveProperty('approvedAt', null);
    });
  });

  // ---------------------------------------------------------------------------
  // findCompetitors — status filter
  // ---------------------------------------------------------------------------

  describe('findCompetitors()', () => {
    it('includes status in the where clause when explicitly passed', async () => {
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      await service.findCompetitors({ projectId: 'proj-1', status: CompetitorStatus.SUGGESTED });

      const callArgs = mockPrismaService.competitor.findMany.mock.calls[0][0];
      expect(callArgs.where).toHaveProperty('status', CompetitorStatus.SUGGESTED);
    });

    it('does not include status in the where clause when not passed (preserves existing behaviour)', async () => {
      mockPrismaService.competitor.findMany.mockResolvedValue([]);

      await service.findCompetitors({ projectId: 'proj-1' });

      const callArgs = mockPrismaService.competitor.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('status');
    });
  });
});
