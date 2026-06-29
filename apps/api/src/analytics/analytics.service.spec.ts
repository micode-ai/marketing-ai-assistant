import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

// ---------------------------------------------------------------------------
// Minimal mocks
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    project: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Test Project',
        industry: 'SaaS',
        projectType: 'WEBSITE',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    content: {
      count: jest.fn().mockResolvedValue(0),
    },
    campaign: {
      count: jest.fn().mockResolvedValue(0),
    },
    keyword: {
      count: jest.fn().mockResolvedValue(0),
    },
    competitor: {
      count: jest.fn().mockResolvedValue(0),
    },
    emailList: {
      count: jest.fn().mockResolvedValue(0),
    },
    projectApiKey: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    projectSocialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    analyticsRecommendation: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    // Analytics data queries used by the delegated methods (spied below)
    dailyMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    analyticsEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    funnelStep: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeNotifier() {
  return { report: jest.fn() };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: string) => def) };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AnalyticsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let notifier: ReturnType<typeof makeNotifier>;
  let config: ReturnType<typeof makeConfig>;
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    notifier = makeNotifier();
    config = makeConfig();
    service = new AnalyticsService(prisma as any, notifier as any, config as any);
  });

  // =========================================================================
  describe('generateRecommendations', () => {
    // Stub the heavy aggregation methods so they don't hit the DB
    const METRICS_STUB = {
      total: {
        visitors: 500,
        leads: 50,
        conversions: 25,
        emailsSent: 100,
        emailOpens: 80,
        emailClicks: 40,
        socialReach: 200,
        socialEngagements: 30,
      },
      change: {},
      trend: {},
    };

    const FUNNEL_STUB = {
      steps: [
        { name: 'Visitors', eventType: 'PAGE_VIEW', count: 500, conversionRate: 100, dropOffRate: 0 },
        { name: 'Converted', eventType: 'CONVERSION', count: 25, conversionRate: 5, dropOffRate: 95 },
      ],
      period: '30 days',
      totalVisitors: 500,
    };

    const UTM_STUB = {
      sources: [
        { name: 'google', visits: 300, conversions: 20, conversionRate: 6.67 },
        { name: 'direct', visits: 100, conversions: 5, conversionRate: 5 },
      ],
      mediums: [],
      campaigns: [],
    };

    beforeEach(() => {
      jest.spyOn(service, 'getMetricsTotals').mockResolvedValue(METRICS_STUB as any);
      jest.spyOn(service, 'getFunnel').mockResolvedValue(FUNNEL_STUB as any);
      jest.spyOn(service, 'getUtmBreakdown').mockResolvedValue(UTM_STUB as any);
      // content.count called twice: total then published
      prisma.content.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(7);
      prisma.keyword.count.mockResolvedValue(15);
      prisma.campaign.count.mockResolvedValue(3);
      prisma.competitor.count.mockResolvedValue(5);
      prisma.emailList.count.mockResolvedValue(2);
    });

    it('posts the digest to the agent and returns recommendations', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [{ title: 'Boost SEO', priority: 'HIGH' }] }),
      });
      global.fetch = mockFetch as any;

      const result = await service.generateRecommendations('proj_1', 'en');

      expect(result.recommendations).toEqual([{ title: 'Boost SEO', priority: 'HIGH' }]);
      expect(typeof result.generatedAt).toBe('number');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('persists a non-empty result (upsert by projectId)', async () => {
      const recs = [{ title: 'Boost SEO', priority: 'HIGH' }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: recs }),
      }) as any;

      await service.generateRecommendations('proj_1', 'pl');

      expect(prisma.analyticsRecommendation.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.analyticsRecommendation.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ projectId: 'proj_1' });
      expect(arg.create).toMatchObject({ projectId: 'proj_1', recommendations: recs, language: 'pl' });
      expect(arg.update).toMatchObject({ recommendations: recs, language: 'pl' });
    });

    it('does NOT persist an empty result', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      }) as any;

      await service.generateRecommendations('proj_1', 'en');

      expect(prisma.analyticsRecommendation.upsert).not.toHaveBeenCalled();
    });

    it('still returns recommendations when persistence fails (swallowed)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [{ title: 'X', priority: 'LOW' }] }),
      }) as any;
      prisma.analyticsRecommendation.upsert.mockRejectedValueOnce(new Error('db down'));

      const result = await service.generateRecommendations('proj_1', 'en');

      expect(result.recommendations).toEqual([{ title: 'X', priority: 'LOW' }]);
    });

    it('sends web.visitors and counts.keywords from mocked inputs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const [url, options] = mockFetch.mock.calls[0] as [string, { body: string }];
      expect(url).toContain('/analytics-recommendations');

      const body = JSON.parse(options.body as string);
      expect(body.data.web.visitors).toBe(500);
      expect(body.data.counts.keywords).toBe(15);
      expect(body.language).toBe('en');
      expect(body.projectName).toBe('Test Project');
      expect(body.data.periodDays).toBe(30);
    });

    it('includes conversionRate derived from visitors/conversions', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      // 25 / 500 * 100 = 5.00
      expect(body.data.web.conversionRate).toBe(5);
    });

    it('maps funnel steps with dropOffPct', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.funnel).toHaveLength(2);
      expect(body.data.funnel[1]).toMatchObject({ step: 'Converted', count: 25, dropOffPct: 95 });
    });

    it('includes top UTM sources (up to 5)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.topUtm).toHaveLength(2);
      expect(body.data.topUtm[0]).toMatchObject({ source: 'google', visits: 300 });
    });

    it('sets gsc.connected=true when ProjectApiKey with GOOGLE platform exists', async () => {
      prisma.projectApiKey.findFirst.mockResolvedValue({ id: 'key_1' });
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.gsc.connected).toBe(true);
    });

    it('sets gsc.connected=false when no Google ProjectApiKey', async () => {
      prisma.projectApiKey.findFirst.mockResolvedValue(null);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.gsc.connected).toBe(false);
    });

    it('detects Instagram connected via linked social account', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { platform: 'INSTAGRAM' } },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.instagram.connected).toBe(true);
      expect(body.data.threads.connected).toBe(false);
    });

    it('detects Threads connected via linked social account', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { platform: 'THREADS' } },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.instagram.connected).toBe(false);
      expect(body.data.threads.connected).toBe(true);
    });

    it('throws BadRequestException when agent returns non-OK response', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      global.fetch = mockFetch as any;

      await expect(
        service.generateRecommendations('proj_1', 'en'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when fetch throws (network error)', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch as any;

      await expect(
        service.generateRecommendations('proj_1', 'en'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses defaults for counts when prisma queries fail', async () => {
      prisma.keyword.count.mockRejectedValue(new Error('DB down'));
      prisma.campaign.count.mockRejectedValue(new Error('DB down'));

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      // Should not throw — tolerates partial failures
      const result = await service.generateRecommendations('proj_1', 'en');
      expect(result.recommendations).toEqual([]);

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.counts.keywords).toBe(0);
      expect(body.data.counts.campaigns).toBe(0);
    });
  });

  describe('getStoredRecommendations', () => {
    it('returns the persisted recommendations + epoch generatedAt', async () => {
      const when = new Date('2026-06-29T10:00:00Z');
      prisma.analyticsRecommendation.findUnique.mockResolvedValue({
        recommendations: [{ title: 'Stored', priority: 'HIGH' }],
        language: 'ru',
        generatedAt: when,
      });

      const result = await service.getStoredRecommendations('proj_1');

      expect(result).toEqual({
        recommendations: [{ title: 'Stored', priority: 'HIGH' }],
        generatedAt: when.getTime(),
        language: 'ru',
      });
    });

    it('returns an empty set when nothing is stored', async () => {
      prisma.analyticsRecommendation.findUnique.mockResolvedValue(null);

      const result = await service.getStoredRecommendations('proj_1');

      expect(result).toEqual({ recommendations: [], generatedAt: null, language: null });
    });
  });
});
