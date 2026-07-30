jest.mock('./instagram-graph.util', () => ({
  fetchAccountInsightsTotals: jest.fn(),
}));

jest.mock('../common/crypto.util', () => ({
  decryptData: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { fetchAccountInsightsTotals } from './instagram-graph.util';
import { decryptData } from '../common/crypto.util';

function makePrisma() {
  return {
    projectSocialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    instagramAccountMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      // Default >= BACKFILL_THRESHOLD_DAYS so existing tests don't trigger backfill.
      count: jest.fn().mockResolvedValue(10),
    },
    instagramMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    instagramStory: {
      findMany: jest.fn().mockResolvedValue([]),
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
    planAllowsMedia: jest.fn(() => true),
    backfillAccount: jest.fn().mockResolvedValue({ daysWritten: 0 }),
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
    // Default: decryptData returns nothing so periodTotals stays {} without error.
    (decryptData as jest.Mock).mockReturnValue(undefined);
    // Default: fetchAccountInsightsTotals resolves to empty.
    (fetchAccountInsightsTotals as jest.Mock).mockResolvedValue({});
  });

  describe('getStatus', () => {
    it('returns not-connected when no IG account linked', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      const status = await service.getStatus('p1');

      expect(status).toEqual({ connected: false, insightsGranted: false });
    });

    it('returns connected with insightsGranted true when scope present', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date('2026-06-26T00:00:00Z'),
      });

      const status = await service.getStatus('p1');

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

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(true);
      expect(status.insightsGranted).toBe(false);
    });

    it('ignores accounts from another organization', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        igLink({ organizationId: 'other_org' }),
      ]);

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(false);
    });

    it('ignores non-INSTAGRAM accounts', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        igLink({ platform: 'FACEBOOK' }),
      ]);

      const status = await service.getStatus('p1');

      expect(status.connected).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('returns empty arrays when not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics).toEqual({
        account: [],
        topPosts: [],
        worstPosts: [],
        recentPosts: [],
        periodTotals: {},
        stories: {
          list: [],
          summary: { count: 0, avgReach: 0, avgReplies: 0, avgCompletion: null },
          daily: [],
        },
      });
    });

    it('returns account series + top/worst posts ordered by engagementRate', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findMany.mockResolvedValue([
        {
          date: new Date('2026-06-20T00:00:00Z'),
          followersCount: 100,
          reach: 500,
          views: 800,
          likes: 45,
          accountsEngaged: 60,
          totalInteractions: 90,
        },
      ]);
      // A single windowed query ordered by engagementRate desc; top/worst are
      // sliced in memory (>5 rated posts so Best and Worst don't overlap).
      prisma.instagramMedia.findMany.mockResolvedValue([
        { igMediaId: 'a', engagementRate: 0.6 },
        { igMediaId: 'b', engagementRate: 0.5 },
        { igMediaId: 'c', engagementRate: 0.4 },
        { igMediaId: 'd', engagementRate: 0.3 },
        { igMediaId: 'e', engagementRate: 0.2 },
        { igMediaId: 'f', engagementRate: 0.15 },
        { igMediaId: 'g', engagementRate: 0.1 },
      ]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics.account).toHaveLength(1);
      expect(metrics.account[0]).toMatchObject({
        followersCount: 100,
        reach: 500,
        likes: 45,
      });
      expect(metrics.topPosts.map((m: any) => m.igMediaId)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
      // worst = bottom 5 asc, excluding the two left after the top 5 (f, g);
      // here only f and g remain after excluding top ids.
      expect(metrics.worstPosts.map((m: any) => m.igMediaId)).toEqual(['g', 'f']);

      // Single windowed query: non-null engagementRate + timestamp >= since.
      const args = prisma.instagramMedia.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ engagementRate: 'desc' });
      expect(args.where.engagementRate).toEqual({ not: null });
      expect(args.where.timestamp.gte).toBeInstanceOf(Date);
    });

    it('does not list the same post under both Best and Worst for small accounts', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramMedia.findMany.mockResolvedValue([
        { igMediaId: 'a', engagementRate: 0.5 },
        { igMediaId: 'b', engagementRate: 0.2 },
      ]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics.topPosts.map((m: any) => m.igMediaId)).toEqual(['a', 'b']);
      // Both already in top → worst is empty (no overlap).
      expect(metrics.worstPosts).toEqual([]);
    });

    it('returns recentPosts chronologically from a second, unfiltered media query', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      // Newest-first from the DB; the service reverses to chronological order.
      prisma.instagramMedia.findMany.mockResolvedValue([
        { igMediaId: 'newest', timestamp: new Date('2026-06-20T00:00:00Z'), likeCount: 30 },
        { igMediaId: 'oldest', timestamp: new Date('2026-06-18T00:00:00Z'), likeCount: 10 },
      ]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics.recentPosts.map((m: any) => m.igMediaId)).toEqual(['oldest', 'newest']);

      // The chart query must NOT inherit the engagementRate filter — a post with
      // likes but no reach insight still belongs on a likes chart.
      const chartArgs = prisma.instagramMedia.findMany.mock.calls[1][0];
      expect(chartArgs.orderBy).toEqual({ timestamp: 'desc' });
      expect(chartArgs.where.engagementRate).toBeUndefined();
      expect(chartArgs.where.timestamp.gte).toBeInstanceOf(Date);
      expect(chartArgs.take).toBe(50);
    });

    it('does not let the recentPosts reversal disturb the rated post order', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      // Both queries hit the same mock — the service must not mutate the rows.
      prisma.instagramMedia.findMany.mockResolvedValue([
        { igMediaId: 'a', engagementRate: 0.6, timestamp: new Date('2026-06-20T00:00:00Z'), likeCount: 5 },
        { igMediaId: 'b', engagementRate: 0.1, timestamp: new Date('2026-06-19T00:00:00Z'), likeCount: 1 },
      ]);

      const metrics = await service.getMetrics('p1', 28);

      expect(metrics.topPosts.map((m: any) => m.igMediaId)).toEqual(['a', 'b']);
      expect(metrics.recentPosts.map((m: any) => m.igMediaId)).toEqual(['b', 'a']);
    });

    it('includes periodTotals from fetchAccountInsightsTotals when tokens decrypt successfully', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      (decryptData as jest.Mock).mockReturnValue({
        accessToken: 'live_tok',
        igUserId: 'ig_123',
      });
      (fetchAccountInsightsTotals as jest.Mock).mockResolvedValue({
        reach: 400,
        views: 1200,
        likes: 95,
        accountsEngaged: 80,
        totalInteractions: 150,
      });

      const metrics = await service.getMetrics('p1', 7);

      expect(metrics.periodTotals).toEqual({
        reach: 400,
        views: 1200,
        likes: 95,
        accountsEngaged: 80,
        totalInteractions: 150,
      });
      // Verify the API call received a plausible since/until window.
      const [igUserId, token, since, until] = (
        fetchAccountInsightsTotals as jest.Mock
      ).mock.calls[0];
      expect(igUserId).toBe('ig_123');
      expect(token).toBe('live_tok');
      expect(until - since).toBe(7 * 86400);
    });

    it('returns periodTotals:{} and still delivers account/posts when totals fetch throws', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findMany.mockResolvedValue([
        {
          date: new Date('2026-06-20T00:00:00Z'),
          followersCount: 50,
          reach: 200,
          views: null,
          accountsEngaged: null,
          totalInteractions: null,
        },
      ]);
      (decryptData as jest.Mock).mockReturnValue({
        accessToken: 'tok',
        igUserId: 'ig_1',
      });
      (fetchAccountInsightsTotals as jest.Mock).mockRejectedValue(
        new Error('IG Graph unavailable'),
      );

      const metrics = await service.getMetrics('p1', 28);

      // The main payload is still intact.
      expect(metrics.account).toHaveLength(1);
      expect(metrics.account[0].reach).toBe(200);
      // periodTotals degrades gracefully.
      expect(metrics.periodTotals).toEqual({});
    });
  });

  describe('triggerSync', () => {
    it('throws when Instagram not connected', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([]);

      await expect(service.triggerSync('p1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('skips when metrics synced within the last 10 minutes', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
      });

      const result = await service.triggerSync('p1');

      expect(result).toEqual({ skipped: true });
      expect(syncService.syncAccount).not.toHaveBeenCalled();
    });

    it('calls syncAccount with media when no recent metrics (PRO/ENTERPRISE)', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue({
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
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue(null);
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
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
      prisma.instagramAccountMetrics.findFirst.mockResolvedValue(null);

      await service.triggerSync('p1');

      expect(syncService.syncAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateAdvice persistence', () => {
    beforeEach(() => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([igLink()]);
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
        json: async () => ({ advice: '## Do X', contextSummary: 'ctx' }),
      }) as any;

      const result = await service.generateAdvice('p1', 'ru');

      expect(result.advice).toBe('## Do X');
      expect(typeof result.generatedAt).toBe('number');
      expect(prisma.aiAdvice.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.aiAdvice.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ projectId_channel: { projectId: 'p1', channel: 'instagram' } });
      expect(arg.create).toMatchObject({ projectId: 'p1', channel: 'instagram', advice: '## Do X', contextSummary: 'ctx', language: 'ru' });
      expect(arg.update).toMatchObject({ advice: '## Do X', contextSummary: 'ctx', language: 'ru' });
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
        where: { projectId_channel: { projectId: 'p1', channel: 'instagram' } },
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
