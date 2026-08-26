jest.mock('./threads-graph.util', () => ({
  fetchThreadsAccountInsightsTotals: jest.fn(),
}));

jest.mock('../common/crypto.util', () => ({
  decryptData: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { ThreadsService } from './threads.service';
import { fetchThreadsAccountInsightsTotals } from './threads-graph.util';
import { decryptData } from '../common/crypto.util';

function makePrisma() {
  return {
    projectSocialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    threadsAccountMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      // Default count >= BACKFILL_THRESHOLD_DAYS so existing tests don't trigger backfill.
      count: jest.fn().mockResolvedValue(10),
    },
    threadsMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    project: {
      // resolveAccount derives the org from the project; generateAdvice also
      // reads name/industry — both come from this mock.
      findUnique: jest
        .fn()
        .mockResolvedValue({ organizationId: 'org_1', name: 'Brand', industry: 'SaaS' }),
    },
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ subscription: { plan: 'ENTERPRISE' } }),
    },
    aiAdvice: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

function makeSyncService() {
  return {
    syncAccount: jest
      .fn()
      .mockResolvedValue({ accountSynced: true, mediaSynced: 3 }),
    backfillAccount: jest.fn().mockResolvedValue({ daysWritten: 0 }),
    planAllowsMedia: jest.fn(() => true),
  };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: string) => def) };
}

function threadsLink(overrides: Partial<any> = {}) {
  return {
    socialAccount: {
      id: 'acc_1',
      organizationId: 'org_1',
      platform: 'THREADS',
      accountName: '@brand',
      accountId: '12345678900000000',
      encryptedTokens: 'enc',
      scopes: ['threads_basic', 'threads_manage_insights'],
      ...overrides,
    },
  };
}

describe('ThreadsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let syncService: ReturnType<typeof makeSyncService>;
  let config: ReturnType<typeof makeConfig>;
  let service: ThreadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    syncService = makeSyncService();
    config = makeConfig();
    service = new ThreadsService(
      prisma as any,
      syncService as any,
      config as any,
    );
    // Default: decryptData returns nothing so periodTotals stays {} without error.
    (decryptData as jest.Mock).mockReturnValue(undefined);
    // Default: fetchThreadsAccountInsightsTotals resolves to empty.
    (fetchThreadsAccountInsightsTotals as jest.Mock).mockResolvedValue({});
  });

  describe('getStatus', () => {
    it('returns not-connected when no Threads account linked', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      const status = await service.getStatus('p1');

      expect(status).toEqual({ connected: false, insightsGranted: false, accounts: [], selectedAccountId: null });
    });

    it('returns connected with insightsGranted true when scope present', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date('2026-06-26T00:00:00Z'),
      });

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(true);
      expect(status.accountName).toBe('@brand');
      expect(status.accountId).toBe('12345678900000000');
      expect(status.insightsGranted).toBe(true);
      expect(status.lastSyncAt).toBeInstanceOf(Date);
    });

    it('insightsGranted false when scope missing', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        threadsLink({ scopes: ['threads_basic'] }),
      ]);

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(true);
      expect(status.insightsGranted).toBe(false);
    });

    it('ignores accounts from another organization', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        threadsLink({ organizationId: 'other_org' }),
      ]);

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(false);
    });

    it('ignores non-THREADS accounts', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        threadsLink({ platform: 'INSTAGRAM' }),
      ]);

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('returns empty arrays when not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics).toEqual({ account: [], topPosts: [], worstPosts: [], periodTotals: {} });
    });

    it('returns account series + top/worst posts ordered by engagementRate', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findMany.mockResolvedValue([
        {
          date: new Date('2026-06-20T00:00:00Z'),
          followersCount: 100,
          views: 800,
          likes: 50,
          replies: 20,
          reposts: 10,
          quotes: 5,
        },
      ]);
      // A single windowed query ordered by engagementRate desc; top/worst are
      // sliced in memory (>5 rated posts so Best and Worst don't overlap).
      prisma.threadsMedia.findMany.mockResolvedValue([
        { threadsMediaId: 'a', engagementRate: 0.6 },
        { threadsMediaId: 'b', engagementRate: 0.5 },
        { threadsMediaId: 'c', engagementRate: 0.4 },
        { threadsMediaId: 'd', engagementRate: 0.3 },
        { threadsMediaId: 'e', engagementRate: 0.2 },
        { threadsMediaId: 'f', engagementRate: 0.15 },
        { threadsMediaId: 'g', engagementRate: 0.1 },
      ]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics.account).toHaveLength(1);
      expect(metrics.account[0]).toMatchObject({
        followersCount: 100,
        views: 800,
      });
      expect(metrics.topPosts.map((m: any) => m.threadsMediaId)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
      // worst = bottom 5 asc, excluding those already in top (f, g);
      // here only f and g remain after excluding top ids.
      expect(metrics.worstPosts.map((m: any) => m.threadsMediaId)).toEqual(['g', 'f']);

      // Single windowed query: non-null engagementRate + timestamp >= since.
      const args = prisma.threadsMedia.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ engagementRate: 'desc' });
      expect(args.where.engagementRate).toEqual({ not: null });
      expect(args.where.timestamp.gte).toBeInstanceOf(Date);
    });

    it('does not list the same post under both Best and Worst for small accounts', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsMedia.findMany.mockResolvedValue([
        { threadsMediaId: 'a', engagementRate: 0.5 },
        { threadsMediaId: 'b', engagementRate: 0.2 },
      ]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics.topPosts.map((m: any) => m.threadsMediaId)).toEqual(['a', 'b']);
      // Both already in top → worst is empty (no overlap).
      expect(metrics.worstPosts).toEqual([]);
    });

    it('includes periodTotals from fetchThreadsAccountInsightsTotals when tokens decrypt successfully', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      (decryptData as jest.Mock).mockReturnValue({
        accessToken: 'live_tok',
        threadsUserId: 'tid_123',
      });
      (fetchThreadsAccountInsightsTotals as jest.Mock).mockResolvedValue({
        views: 5000,
        likes: 300,
        replies: 100,
        reposts: 50,
        quotes: 20,
      });

      const metrics = await service.getMetrics('p1', 7);

      expect(metrics.periodTotals).toEqual({
        views: 5000,
        likes: 300,
        replies: 100,
        reposts: 50,
        quotes: 20,
      });
      // Verify the API call received a plausible since/until window.
      const [threadsUserId, token, since, until] = (
        fetchThreadsAccountInsightsTotals as jest.Mock
      ).mock.calls[0];
      expect(threadsUserId).toBe('tid_123');
      expect(token).toBe('live_tok');
      expect(until - since).toBe(7 * 86400);
    });

    it('returns periodTotals:{} and still delivers account/posts when totals fetch throws', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findMany.mockResolvedValue([
        {
          date: new Date('2026-06-20T00:00:00Z'),
          followersCount: 50,
          views: 800,
          likes: null,
          replies: null,
          reposts: null,
          quotes: null,
        },
      ]);
      (decryptData as jest.Mock).mockReturnValue({
        accessToken: 'tok',
        threadsUserId: 'tid_1',
      });
      (fetchThreadsAccountInsightsTotals as jest.Mock).mockRejectedValue(
        new Error('Threads Graph unavailable'),
      );

      const metrics = await service.getMetrics('p1', 28);

      // The main payload is still intact.
      expect(metrics.account).toHaveLength(1);
      expect(metrics.account[0].views).toBe(800);
      // periodTotals degrades gracefully.
      expect(metrics.periodTotals).toEqual({});
    });
  });

  describe('triggerSync', () => {
    it('throws when Threads not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      await expect(service.triggerSync('p1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('skips when metrics synced within the last 10 minutes', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
      });

      const result = await service.triggerSync('p1');

      expect(result).toEqual({ skipped: true });
      expect(syncService.syncAccount).not.toHaveBeenCalled();
    });

    it('calls syncAccount with media when no recent metrics (PRO/ENTERPRISE)', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      prisma.organization.findUnique.mockResolvedValue({
        subscription: { plan: 'ENTERPRISE' },
      });

      const result = await service.triggerSync('p1');

      expect(syncService.syncAccount).toHaveBeenCalledTimes(1);
      expect(syncService.syncAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc_1' }),
        true,
      );
      expect(result).toEqual({
        skipped: false,
        accountSynced: true,
        mediaSynced: 3,
      });
    });

    it('FREE: triggers syncAccount with withMedia=true (per-post analytics on the manual path)', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findFirst.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue({
        subscription: { plan: 'FREE' },
      });

      await service.triggerSync('p1');

      expect(syncService.syncAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc_1' }),
        true,
      );
    });

    it('calls syncAccount when there are no prior metrics at all', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      prisma.threadsAccountMetrics.findFirst.mockResolvedValue(null);

      await service.triggerSync('p1');

      expect(syncService.syncAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateAdvice persistence', () => {
    beforeEach(() => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([threadsLink()]);
      jest.spyOn(service, 'getMetrics').mockResolvedValue({
        account: [],
        topPosts: [],
        worstPosts: [],
        periodTotals: {},
      } as any);
    });

    it('persists non-empty advice (upsert by projectId+channel) and returns generatedAt', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ advice: '## Post more', contextSummary: 'ctx' }),
      }) as any;

      const result = await service.generateAdvice('p1', 'ru');

      expect(result.advice).toBe('## Post more');
      expect(typeof result.generatedAt).toBe('number');
      expect(prisma.aiAdvice.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.aiAdvice.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ projectId_channel: { projectId: 'p1', channel: 'threads' } });
      expect(arg.create).toMatchObject({ projectId: 'p1', channel: 'threads', advice: '## Post more', contextSummary: 'ctx', language: 'ru' });
      expect(arg.update).toMatchObject({ advice: '## Post more', contextSummary: 'ctx', language: 'ru' });
    });

    it('does NOT persist when advice is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ advice: '', contextSummary: '' }),
      }) as any;

      await service.generateAdvice('p1', 'en');

      expect(prisma.aiAdvice.upsert).not.toHaveBeenCalled();
    });

    it('still returns advice when persistence fails (swallowed)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ advice: 'keep me', contextSummary: 'c' }),
      }) as any;
      prisma.aiAdvice.upsert.mockRejectedValueOnce(new Error('db down'));

      const result = await service.generateAdvice('p1', 'en');

      expect(result.advice).toBe('keep me');
    });
  });

  describe('getStoredAdvice', () => {
    it('returns the persisted advice + epoch generatedAt', async () => {
      const when = new Date('2026-06-29T10:00:00Z');
      prisma.aiAdvice.findUnique.mockResolvedValue({
        advice: 'stored advice',
        contextSummary: 'stored ctx',
        generatedAt: when,
      });

      const result = await service.getStoredAdvice('p1');

      expect(prisma.aiAdvice.findUnique).toHaveBeenCalledWith({
        where: { projectId_channel: { projectId: 'p1', channel: 'threads' } },
      });
      expect(result).toEqual({
        advice: 'stored advice',
        contextSummary: 'stored ctx',
        generatedAt: when.getTime(),
      });
    });

    it('returns nulls when nothing is stored', async () => {
      prisma.aiAdvice.findUnique.mockResolvedValue(null);

      const result = await service.getStoredAdvice('p1');

      expect(result).toEqual({ advice: null, contextSummary: null, generatedAt: null });
    });
  });
});
