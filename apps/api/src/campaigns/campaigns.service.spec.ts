import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  content: { findMany: jest.fn(), updateMany: jest.fn() },
  emailCampaign: { findMany: jest.fn(), updateMany: jest.fn() },
  project: { findUnique: jest.fn() },
};

describe('CampaignsService', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get(CampaignsService);
  });

  describe('findOne', () => {
    it('returns campaign with progress aggregation over content and emails', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        name: 'Launch',
        projectId: 'p1',
        organizationId: 'o1',
        scope: 'PROJECT',
        project: { id: 'p1', name: 'My Project' },
        content: [
          { id: 'ct1', status: 'DRAFT' },
          { id: 'ct2', status: 'PUBLISHED' },
          { id: 'ct3', status: 'PUBLISHED' },
        ],
        emailCampaigns: [
          { id: 'ec1', status: 'draft' },
          { id: 'ec2', status: 'sent' },
        ],
      });

      const result = await service.findOne('c1');

      expect(mockPrisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        include: expect.objectContaining({
          project: { select: { id: true, name: true } },
          content: true,
          emailCampaigns: {
            include: {
              list: { select: { id: true, name: true } },
              emailAccount: { select: { id: true, email: true, displayName: true } },
            },
          },
        }),
      });
      expect(result.progress).toEqual({
        content: { total: 3, byStatus: { DRAFT: 1, APPROVED: 0, PUBLISHED: 2, ARCHIVED: 0 } },
        email: { total: 2, byStatus: { draft: 1, scheduled: 0, sent: 1 } },
      });
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachContent', () => {
    const baseCampaign = { id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' };

    it('attaches project-scoped content whose projectId matches', async () => {
      mockPrisma.campaign.findUnique
        .mockResolvedValueOnce(baseCampaign)
        .mockResolvedValueOnce({ ...baseCampaign, project: null, content: [], emailCampaigns: [] });
      mockPrisma.content.findMany.mockResolvedValue([
        { id: 'ct1', projectId: 'p1', organizationId: 'o1', campaignId: null },
        { id: 'ct2', projectId: 'p1', organizationId: 'o1', campaignId: null },
      ]);
      mockPrisma.content.updateMany.mockResolvedValue({ count: 2 });

      await service.attachContent('c1', ['ct1', 'ct2']);

      expect(mockPrisma.content.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ct1', 'ct2'] } },
        data: { campaignId: 'c1' },
      });
    });

    it('rejects content from a different project (BadRequest)', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
      mockPrisma.content.findMany.mockResolvedValue([
        { id: 'ct1', projectId: 'p1', organizationId: 'o1', campaignId: null },
        { id: 'ct2', projectId: 'p2', organizationId: 'o1', campaignId: null },
      ]);
      await expect(service.attachContent('c1', ['ct1', 'ct2'])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects content already attached to another campaign (Conflict)', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
      mockPrisma.content.findMany.mockResolvedValue([
        { id: 'ct1', projectId: 'p1', organizationId: 'o1', campaignId: 'c2' },
      ]);
      await expect(service.attachContent('c1', ['ct1'])).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('detachContent', () => {
    it('only detaches rows currently attached to this campaign', async () => {
      mockPrisma.campaign.findUnique
        .mockResolvedValueOnce({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' })
        .mockResolvedValueOnce({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT', project: null, content: [], emailCampaigns: [] });
      mockPrisma.content.updateMany.mockResolvedValue({ count: 1 });

      await service.detachContent('c1', ['ct1']);

      expect(mockPrisma.content.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ct1'] }, campaignId: 'c1' },
        data: { campaignId: null },
      });
    });
  });

  describe('attachEmails', () => {
    const baseCampaign = { id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' };

    it('attaches emails whose list.projectId matches', async () => {
      mockPrisma.campaign.findUnique
        .mockResolvedValueOnce(baseCampaign)
        .mockResolvedValueOnce({ ...baseCampaign, project: null, content: [], emailCampaigns: [] });
      mockPrisma.emailCampaign.findMany.mockResolvedValue([
        { id: 'e1', campaignId: null, list: { projectId: 'p1', organizationId: 'o1' } },
      ]);
      mockPrisma.emailCampaign.updateMany.mockResolvedValue({ count: 1 });

      await service.attachEmails('c1', ['e1']);

      expect(mockPrisma.emailCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1'] } },
        data: { campaignId: 'c1' },
      });
    });

    it('rejects emails whose list is in another project', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
      mockPrisma.emailCampaign.findMany.mockResolvedValue([
        { id: 'e1', campaignId: null, list: { projectId: 'p2', organizationId: 'o1' } },
      ]);
      await expect(service.attachEmails('c1', ['e1'])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects emails already attached to another campaign', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(baseCampaign);
      mockPrisma.emailCampaign.findMany.mockResolvedValue([
        { id: 'e1', campaignId: 'c2', list: { projectId: 'p1', organizationId: 'o1' } },
      ]);
      await expect(service.attachEmails('c1', ['e1'])).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('detachEmails', () => {
    it('only detaches rows currently attached to this campaign', async () => {
      mockPrisma.campaign.findUnique
        .mockResolvedValueOnce({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' })
        .mockResolvedValueOnce({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT', project: null, content: [], emailCampaigns: [] });
      mockPrisma.emailCampaign.updateMany.mockResolvedValue({ count: 1 });

      await service.detachEmails('c1', ['e1']);

      expect(mockPrisma.emailCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1'] }, campaignId: 'c1' },
        data: { campaignId: null },
      });
    });
  });

  describe('availableContent', () => {
    it('returns free content in campaign scope, ordered by updatedAt', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
      mockPrisma.content.findMany.mockResolvedValue([{ id: 'ct1' }]);

      await service.availableContent('c1', 'launch');

      expect(mockPrisma.content.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'p1',
          campaignId: null,
          title: { contains: 'launch', mode: 'insensitive' },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
    });

    it('drops search filter when not provided', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
      mockPrisma.content.findMany.mockResolvedValue([]);
      await service.availableContent('c1', undefined);
      expect(mockPrisma.content.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'p1', campaignId: null } }),
      );
    });
  });

  describe('availableEmails', () => {
    it('returns free emails scoped through list.projectId', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1', organizationId: 'o1', scope: 'PROJECT' });
      mockPrisma.emailCampaign.findMany.mockResolvedValue([]);
      await service.availableEmails('c1', undefined);
      expect(mockPrisma.emailCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: null, list: { projectId: 'p1' } },
        }),
      );
    });
  });
});
