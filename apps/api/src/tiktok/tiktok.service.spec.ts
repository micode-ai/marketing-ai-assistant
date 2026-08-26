import { BadRequestException } from '@nestjs/common';
import { TikTokService } from './tiktok.service';

describe('TikTokService', () => {
  let prisma: any;
  let syncService: any;
  let service: TikTokService;

  const linkedAccount = (overrides: Record<string, unknown> = {}) => ({
    socialAccount: {
      id: 'acc1',
      organizationId: 'org1',
      platform: 'TIKTOK',
      accountName: 'brand',
      accountId: 'oid1',
      encryptedTokens: 'iv:blob',
      scopes: ['user.info.basic', 'user.info.stats', 'video.list', 'video.publish'],
      ...overrides,
    },
  });

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org1' }) },
      projectSocialAccount: { findMany: jest.fn().mockResolvedValue([linkedAccount()]) },
      tikTokAccountMetrics: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tikTokMedia: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ subscription: { plan: 'PRO' } }) },
      aiAdvice: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    };
    syncService = {
      syncAccount: jest.fn().mockResolvedValue({ accountSynced: true, mediaSynced: 3 }),
      planAllowsMedia: jest.fn().mockReturnValue(true),
    };
    service = new TikTokService(prisma, syncService);
  });

  describe('getStatus', () => {
    it('reports connected with statsGranted when both analytics scopes are present', async () => {
      prisma.tikTokAccountMetrics.findFirst.mockResolvedValue({ createdAt: new Date('2026-07-30T10:00:00Z') });

      await expect(service.getStatus('p1')).resolves.toMatchObject({
        connected: true,
        accountName: 'brand',
        accountId: 'oid1',
        statsGranted: true,
        lastSyncAt: new Date('2026-07-30T10:00:00Z'),
      });
    });

    it('reports statsGranted false when video.list was not granted', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        linkedAccount({ scopes: ['user.info.basic', 'user.info.stats'] }),
      ]);

      await expect(service.getStatus('p1')).resolves.toMatchObject({
        connected: true,
        statsGranted: false,
      });
    });

    it('lists every linked account so the dashboard can offer a switcher', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        linkedAccount({ id: 'acc1', accountName: 'brand' }),
        linkedAccount({ id: 'acc2', accountName: 'side-project' }),
      ]);

      const status = await service.getStatus('p1');

      expect(status.accounts).toEqual([
        { id: 'acc1', accountName: 'brand', accountId: 'oid1' },
        { id: 'acc2', accountName: 'side-project', accountId: 'oid1' },
      ]);
      // Default is the oldest link, and it is stated rather than implied.
      expect(status.selectedAccountId).toBe('acc1');
      expect(status.accountName).toBe('brand');
    });

    it('reports the account that was asked for', async () => {
      // Before this, the second account of a channel was silently unreachable.
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        linkedAccount({ id: 'acc1', accountName: 'brand' }),
        linkedAccount({ id: 'acc2', accountName: 'side-project' }),
      ]);

      const status = await service.getStatus('p1', 'acc2');

      expect(status.accountName).toBe('side-project');
      expect(status.selectedAccountId).toBe('acc2');
    });

    it('reports disconnected — with the account list — for an id that is not linked', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        linkedAccount({ id: 'acc1', accountName: 'brand' }),
      ]);

      const status = await service.getStatus('p1', 'someone-elses');

      expect(status.connected).toBe(false);
      // The list travels anyway, so the dashboard can fall back to a real one.
      expect(status.accounts).toHaveLength(1);
    });

    it('asks the database for a stable order', async () => {
      await service.getStatus('p1');

      expect(prisma.projectSocialAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
      );
    });

    it('reports disconnected when the project has no TikTok account', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        linkedAccount({ platform: 'THREADS' }),
      ]);

      await expect(service.getStatus('p1')).resolves.toEqual({
        connected: false,
        statsGranted: false,
        accounts: [],
        selectedAccountId: null,
      });
    });

    it('ignores an account belonging to a different organization', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        linkedAccount({ organizationId: 'other-org' }),
      ]);

      await expect(service.getStatus('p1')).resolves.toMatchObject({ connected: false });
    });

    it('uses the newest of snapshot and video timestamps for lastSyncAt', async () => {
      prisma.tikTokAccountMetrics.findFirst.mockResolvedValue({ createdAt: new Date('2026-07-29T00:00:00Z') });
      prisma.tikTokMedia.findFirst.mockResolvedValue({ lastSyncedAt: new Date('2026-07-30T12:00:00Z') });

      const status = await service.getStatus('p1');
      expect(status.lastSyncAt).toEqual(new Date('2026-07-30T12:00:00Z'));
    });
  });

  describe('getMetrics', () => {
    it('returns empty structures for a disconnected project instead of throwing', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      await expect(service.getMetrics('p1', 30)).resolves.toEqual({
        account: [],
        topPosts: [],
        worstPosts: [],
      });
    });

    it('windows queries to the requested period', async () => {
      await service.getMetrics('p1', 7);

      const since = prisma.tikTokAccountMetrics.findMany.mock.calls[0][0].where.date.gte as Date;
      const ageDays = (Date.now() - since.getTime()) / 86_400_000;
      expect(ageDays).toBeGreaterThan(6.5);
      expect(ageDays).toBeLessThan(8.5);
      // Only rated videos are considered for best/worst.
      expect(prisma.tikTokMedia.findMany.mock.calls[0][0].where.engagementRate).toEqual({ not: null });
    });

    it('never lists the same video as both best and worst', async () => {
      // Three rated videos, descending by engagement rate.
      prisma.tikTokMedia.findMany.mockResolvedValue([
        { tiktokVideoId: 'a', engagementRate: 0.3 },
        { tiktokVideoId: 'b', engagementRate: 0.2 },
        { tiktokVideoId: 'c', engagementRate: 0.1 },
      ]);

      const { topPosts, worstPosts } = await service.getMetrics('p1', 30);

      // With fewer than 5 videos all land in topPosts, so worst must be empty
      // rather than repeating them.
      expect(topPosts.map((p: any) => p.tiktokVideoId)).toEqual(['a', 'b', 'c']);
      expect(worstPosts).toEqual([]);
    });

    it('picks the weakest videos once the list exceeds the top-5 window', async () => {
      prisma.tikTokMedia.findMany.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({
          tiktokVideoId: `v${i}`,
          engagementRate: (7 - i) / 10,
        })),
      );

      const { topPosts, worstPosts } = await service.getMetrics('p1', 30);

      expect(topPosts).toHaveLength(5);
      expect(worstPosts.map((p: any) => p.tiktokVideoId)).toEqual(['v6', 'v5']);
    });

    it('passes snapshots through as cumulative rows', async () => {
      prisma.tikTokAccountMetrics.findMany.mockResolvedValue([
        { date: new Date('2026-07-29'), followersCount: 100, views: 1000, likes: 10, comments: 1, shares: 0, followingCount: 5, likesCount: 20, videoCount: 3 },
      ]);

      const { account } = await service.getMetrics('p1', 30);
      expect(account[0]).toMatchObject({ followersCount: 100, views: 1000, videoCount: 3 });
    });
  });

  describe('triggerSync', () => {
    it('throws when TikTok is not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);
      await expect(service.triggerSync('p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('skips a sync that just ran', async () => {
      prisma.tikTokAccountMetrics.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(service.triggerSync('p1')).resolves.toEqual({ skipped: true });
      expect(syncService.syncAccount).not.toHaveBeenCalled();
    });

    it('skips based on the last sync, not the day-old snapshot row', async () => {
      // One snapshot per day, updated in place: createdAt freezes at the first
      // sync of the day, so it cannot tell us when we last talked to TikTok.
      // Media lastSyncedAt moves on every sync and is what the guard must read.
      prisma.tikTokAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      });
      prisma.tikTokMedia.findFirst.mockResolvedValue({ lastSyncedAt: new Date() });

      await expect(service.triggerSync('p1')).resolves.toEqual({ skipped: true });
      expect(syncService.syncAccount).not.toHaveBeenCalled();
    });

    it('syncs when the last run is older than the guard window', async () => {
      prisma.tikTokAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      await expect(service.triggerSync('p1')).resolves.toEqual({
        skipped: false,
        accountSynced: true,
        mediaSynced: 3,
      });
      expect(syncService.syncAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc1' }),
        true,
      );
    });
  });

  describe('advice', () => {
    it('returns nulls when nothing has been generated yet', async () => {
      await expect(service.getStoredAdvice('p1')).resolves.toEqual({
        advice: null,
        contextSummary: null,
        generatedAt: null,
      });
    });

    it('returns the persisted advice', async () => {
      prisma.aiAdvice.findUnique.mockResolvedValue({
        advice: '## Performance',
        contextSummary: 'ctx',
        generatedAt: new Date('2026-07-30T09:00:00Z'),
      });

      await expect(service.getStoredAdvice('p1')).resolves.toEqual({
        advice: '## Performance',
        contextSummary: 'ctx',
        generatedAt: new Date('2026-07-30T09:00:00Z').getTime(),
      });
    });

    it('throws when TikTok is not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);
      await expect(service.generateAdvice('p1', 'en')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists advice returned by the agent under the tiktok channel', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ advice: '## Performance', contextSummary: 'ctx' }),
      })) as unknown as typeof fetch;

      const result = await service.generateAdvice('p1', 'ru');

      expect(result.advice).toBe('## Performance');
      expect(prisma.aiAdvice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId_channel: { projectId: 'p1', channel: 'tiktok' } },
        }),
      );
      global.fetch = originalFetch;
    });

    it('surfaces an agent failure as a BadRequest', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;

      await expect(service.generateAdvice('p1', 'en')).rejects.toBeInstanceOf(BadRequestException);
      global.fetch = originalFetch;
    });
  });
});
