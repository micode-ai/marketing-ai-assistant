import { BadRequestException } from '@nestjs/common';
import { InstagramService } from './instagram.service';

function makePrisma() {
  return {
    projectSocialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    instagramAccountMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    instagramMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    project: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Brand', industry: 'SaaS' }),
    },
  };
}

function makeSyncService() {
  return {
    syncAccount: jest
      .fn()
      .mockResolvedValue({ accountSynced: true, mediaSynced: 3 }),
  };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: string) => def) };
}

function igLink(overrides: Partial<any> = {}) {
  return {
    socialAccount: {
      id: 'acc_1',
      organizationId: 'org_1',
      platform: 'INSTAGRAM',
      accountName: '@brand',
      accountId: '17841400000000000',
      encryptedTokens: 'enc',
      scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
      ...overrides,
    },
  };
}

describe('InstagramService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let syncService: ReturnType<typeof makeSyncService>;
  let config: ReturnType<typeof makeConfig>;
  let service: InstagramService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    syncService = makeSyncService();
    config = makeConfig();
    service = new InstagramService(
      prisma as any,
      syncService as any,
      config as any,
    );
  });

  describe('getStatus', () => {
    it('returns not-connected when no IG account linked', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      const status = await service.getStatus('p1', 'org_1');

      expect(status).toEqual({ connected: false, insightsGranted: false });
    });

    it('returns connected with insightsGranted true when scope present', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date('2026-06-26T00:00:00Z'),
      });

      const status = await service.getStatus('p1', 'org_1');

      expect(status.connected).toBe(true);
      expect(status.accountName).toBe('@brand');
      expect(status.accountId).toBe('17841400000000000');
      expect(status.insightsGranted).toBe(true);
      expect(status.lastSyncAt).toBeInstanceOf(Date);
    });

    it('insightsGranted false when scope missing', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        igLink({ scopes: ['instagram_business_basic'] }),
      ]);

      const status = await service.getStatus('p1', 'org_1');

      expect(status.connected).toBe(true);
      expect(status.insightsGranted).toBe(false);
    });

    it('ignores accounts from another organization', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        igLink({ organizationId: 'other_org' }),
      ]);

      const status = await service.getStatus('p1', 'org_1');

      expect(status.connected).toBe(false);
    });

    it('ignores non-INSTAGRAM accounts', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        igLink({ platform: 'FACEBOOK' }),
      ]);

      const status = await service.getStatus('p1', 'org_1');

      expect(status.connected).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('returns empty arrays when not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      const metrics = await service.getMetrics('p1', 'org_1', 28);

      expect(metrics).toEqual({ account: [], topPosts: [], worstPosts: [] });
    });

    it('returns account series + top/worst posts ordered by engagementRate', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findMany.mockResolvedValue([
        {
          date: new Date('2026-06-20T00:00:00Z'),
          followersCount: 100,
          reach: 500,
          views: 800,
          accountsEngaged: 60,
          totalInteractions: 90,
        },
      ]);
      prisma.instagramMedia.findMany
        .mockResolvedValueOnce([{ id: 'top', engagementRate: 0.5 }])
        .mockResolvedValueOnce([{ id: 'worst', engagementRate: 0.01 }]);

      const metrics = await service.getMetrics('p1', 'org_1', 28);

      expect(metrics.account).toHaveLength(1);
      expect(metrics.account[0]).toMatchObject({
        followersCount: 100,
        reach: 500,
      });
      expect(metrics.topPosts).toEqual([{ id: 'top', engagementRate: 0.5 }]);
      expect(metrics.worstPosts).toEqual([{ id: 'worst', engagementRate: 0.01 }]);

      // top ordered desc, worst ordered asc, both filter non-null engagementRate
      const topArgs = prisma.instagramMedia.findMany.mock.calls[0][0];
      const worstArgs = prisma.instagramMedia.findMany.mock.calls[1][0];
      expect(topArgs.orderBy).toEqual({ engagementRate: 'desc' });
      expect(topArgs.take).toBe(5);
      expect(topArgs.where.engagementRate).toEqual({ not: null });
      expect(worstArgs.orderBy).toEqual({ engagementRate: 'asc' });
    });
  });

  describe('triggerSync', () => {
    it('throws when Instagram not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      await expect(service.triggerSync('p1', 'org_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('skips when metrics synced within the last 10 minutes', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
      });

      const result = await service.triggerSync('p1', 'org_1');

      expect(result).toEqual({ skipped: true });
      expect(syncService.syncAccount).not.toHaveBeenCalled();
    });

    it('calls syncAccount when no recent metrics', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const result = await service.triggerSync('p1', 'org_1');

      expect(syncService.syncAccount).toHaveBeenCalledTimes(1);
      expect(syncService.syncAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc_1' }),
      );
      expect(result).toEqual({
        skipped: false,
        accountSynced: true,
        mediaSynced: 3,
      });
    });

    it('calls syncAccount when there are no prior metrics at all', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue(null);

      await service.triggerSync('p1', 'org_1');

      expect(syncService.syncAccount).toHaveBeenCalledTimes(1);
    });
  });
});
