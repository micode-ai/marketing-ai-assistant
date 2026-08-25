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
    instagramAccountMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    instagramMedia: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    threadsAccountMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    threadsMedia: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tikTokAccountMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tikTokMedia: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    keyword: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    keywordRankHistory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    emailCampaign: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    emailSubscriber: {
      count: jest.fn().mockResolvedValue(0),
    },
    appStoreMetrics: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    appReview: {
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

function makeGoogle() {
  return {
    fetchSearchConsoleSummary: jest.fn().mockResolvedValue({
      totals: { clicks: 412, impressions: 9540, ctr: 0.0432, position: 18.37 },
      topQueries: [
        { query: 'crm software', clicks: 90, impressions: 1200, ctr: 0.075, position: 4.2 },
      ],
    }),
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
  let google: ReturnType<typeof makeGoogle>;
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    notifier = makeNotifier();
    config = makeConfig();
    google = makeGoogle();
    service = new AnalyticsService(
      prisma as any,
      notifier as any,
      config as any,
      google as any,
    );
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

    it('carries Search Console figures when the integration is present', async () => {
      prisma.projectApiKey.findFirst.mockResolvedValue({ id: 'gkey' });
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en', 14);

      expect(google.fetchSearchConsoleSummary).toHaveBeenCalledWith('proj_1', 14);
      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.gsc).toMatchObject({
        connected: true,
        clicks: 412,
        impressions: 9540,
        // Converted from Google's fraction so it compares with the other rates.
        ctr: 4.32,
        avgPosition: 18.4,
        lagDays: 2,
      });
      expect(body.data.gsc.topQueries[0].query).toBe('crm software');
    });

    it('keeps the digest when Search Console fails', async () => {
      // A Google outage must not fail the endpoint, and must not read as zero
      // search traffic either.
      prisma.projectApiKey.findFirst.mockResolvedValue({ id: 'gkey' });
      google.fetchSearchConsoleSummary.mockRejectedValue(new Error('502 from Google'));
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.gsc.connected).toBe(true);
      expect(body.data.gsc.clicks).toBeNull();
      expect(body.data.web).toBeDefined();
    });

    it('treats GSC_NOT_CONFIGURED as not connected', async () => {
      prisma.projectApiKey.findFirst.mockResolvedValue({ id: 'gkey' });
      google.fetchSearchConsoleSummary.mockRejectedValue(
        Object.assign(new Error('GSC_NOT_CONFIGURED'), { code: 'GSC_NOT_CONFIGURED' }),
      );
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.gsc.connected).toBe(false);
    });

    it('does not call Google when no integration row exists', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      expect(google.fetchSearchConsoleSummary).not.toHaveBeenCalled();
    });

    it('detects Instagram connected via linked social account', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { id: 'ig_1', platform: 'INSTAGRAM' } },
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

    it('carries real Instagram figures, not just a connected flag', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { id: 'ig_1', platform: 'INSTAGRAM' } },
      ]);
      prisma.instagramAccountMetrics.findMany.mockResolvedValue([
        { socialAccountId: 'ig_1', followersCount: 1000 },
        { socialAccountId: 'ig_1', followersCount: 1080 },
      ]);
      prisma.instagramMedia.findMany.mockResolvedValue([
        { views: 4000, likeCount: 210, commentsCount: 12, shares: 5, engagementRate: 4.5 },
        { views: 2000, likeCount: 90, commentsCount: 3, shares: 1, engagementRate: 3.5 },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.instagram).toMatchObject({
        connected: true,
        accounts: 1,
        followers: 1080,
        followerChange: 80,
        postsInPeriod: 2,
        views: 6000,
        likes: 300,
        comments: 15,
        avgEngagementRate: 4,
      });
    });

    it('includes TikTok in the digest', async () => {
      // TikTok was absent from the digest entirely, so the cross-channel advice
      // could not even tell the channel existed (issue #170).
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { id: 'tt_1', platform: 'TIKTOK' } },
      ]);
      prisma.tikTokAccountMetrics.findMany.mockResolvedValue([
        { socialAccountId: 'tt_1', followersCount: 12 },
      ]);
      prisma.tikTokMedia.findMany.mockResolvedValue([
        { viewCount: 812, likeCount: 9, commentCount: 1, shareCount: 0, engagementRate: 1.23 },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.tiktok).toMatchObject({
        connected: true,
        followers: 12,
        views: 812,
        postsInPeriod: 1,
      });
      // One snapshot is a level, not a trend.
      expect(body.data.tiktok.followerChange).toBeNull();
    });

    it('aggregates two accounts of the same channel', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { id: 'ig_1', platform: 'INSTAGRAM' } },
        { socialAccount: { id: 'ig_2', platform: 'INSTAGRAM' } },
      ]);
      prisma.instagramAccountMetrics.findMany.mockResolvedValue([
        { socialAccountId: 'ig_1', followersCount: 500 },
        { socialAccountId: 'ig_2', followersCount: 300 },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.instagram.accounts).toBe(2);
      expect(body.data.instagram.followers).toBe(800);
    });

    it('degrades one failing channel instead of losing the digest', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { id: 'ig_1', platform: 'INSTAGRAM' } },
        { socialAccount: { id: 'tt_1', platform: 'TIKTOK' } },
      ]);
      prisma.instagramAccountMetrics.findMany.mockRejectedValue(new Error('db down'));
      prisma.tikTokAccountMetrics.findMany.mockResolvedValue([
        { socialAccountId: 'tt_1', followersCount: 12 },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.instagram.connected).toBe(false);
      expect(body.data.tiktok.followers).toBe(12);
      expect(body.data.web).toBeDefined();
    });

    it('carries keyword positions, not just a keyword count', async () => {
      prisma.keyword.findMany.mockResolvedValue([
        { id: 'k1', keyword: 'crm software', currentRank: 4, isTracking: true },
        { id: 'k2', keyword: 'invoicing', currentRank: 31, isTracking: true },
        { id: 'k3', keyword: 'unranked', currentRank: null, isTracking: false },
      ]);
      prisma.keywordRankHistory.findMany.mockResolvedValue([
        { keywordId: 'k1', rank: 20 },
        { keywordId: 'k1', rank: 4 },
        { keywordId: 'k2', rank: 9 },
        { keywordId: 'k2', rank: 31 },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.seo).toMatchObject({
        keywords: 3,
        tracked: 2,
        ranked: 2,
        top10: 1,
        improved: 1,
        declined: 1,
      });
      expect(body.data.seo.topMovers[0]).toEqual({
        keyword: 'invoicing',
        rank: 31,
        change: -22,
      });
    });

    it('sends email activity without the untracked opens and clicks', async () => {
      prisma.emailList.count.mockResolvedValue(2);
      prisma.emailSubscriber.count.mockResolvedValue(340);
      prisma.emailCampaign.findMany.mockResolvedValue([
        { stats: { sent: 200, opens: 0, clicks: 0 } },
        { stats: { sent: 140, opens: 0, clicks: 0 } },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.email).toEqual({
        lists: 2,
        subscribers: 340,
        campaignsSent: 2,
        emailsSent: 340,
        openTracking: false,
      });
      // The zeros are absence of tracking, not absence of engagement.
      expect(body.data.email).not.toHaveProperty('opens');
    });

    it('carries Play figures for a mobile app project', async () => {
      prisma.projectApiKey.findFirst.mockResolvedValue({ id: 'key_1' });
      prisma.appStoreMetrics.findMany.mockResolvedValue([
        {
          installs: 40, uninstalls: 5, activeDeviceInstalls: 900,
          storeListingVisitors: 300, storeListingConversions: 12.5,
          crashRate: 1.2, anrRate: 0.3, averageRating: 4.4, totalRatings: 88,
        },
        {
          installs: 60, uninstalls: 9, activeDeviceInstalls: 950,
          storeListingVisitors: 340, storeListingConversions: 13.1,
          crashRate: 0.8, anrRate: 0.2, averageRating: 4.5, totalRatings: 95,
        },
      ]);
      prisma.appReview.findMany.mockResolvedValue([
        { starRating: 5, isReplied: true },
        { starRating: 2, isReplied: false },
      ]);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.app).toMatchObject({
        connected: true,
        installs: 100,
        uninstalls: 14,
        netInstalls: 86,
        // A level, not a sum of the daily rows.
        activeDeviceInstalls: 950,
        crashRate: 0.8,
        averageRating: 4.5,
      });
      expect(body.data.app.reviews).toEqual({ total: 2, unanswered: 1, avgRating: 3.5 });
    });

    it('marks the app block disconnected without a Play integration', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      await service.generateRecommendations('proj_1', 'en');

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.app.connected).toBe(false);
      expect(body.data.app.installs).toBeNull();
    });

    it('honours the requested period instead of always using 30 days', async () => {
      // A non-empty result, because the service only persists when the agent
      // actually returned cards.
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [{ title: 'Do a thing', priority: 'high' }] }),
      });
      global.fetch = mockFetch as any;

      const result = await service.generateRecommendations('proj_1', 'en', 7);

      const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(body.data.periodDays).toBe(7);
      expect(result.periodDays).toBe(7);
      expect(prisma.analyticsRecommendation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ periodDays: 7 }),
          update: expect.objectContaining({ periodDays: 7 }),
        }),
      );
    });

    it('clamps an absurd period instead of querying it', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });
      global.fetch = mockFetch as any;

      const result = await service.generateRecommendations('proj_1', 'en', 99999);

      expect(result.periodDays).toBe(365);
    });

    it('detects Threads connected via linked social account', async () => {
      prisma.projectSocialAccount.findMany.mockResolvedValue([
        { socialAccount: { id: 'th_1', platform: 'THREADS' } },
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
        periodDays: 7,
      });

      const result = await service.getStoredRecommendations('proj_1');

      expect(result).toEqual({
        recommendations: [{ title: 'Stored', priority: 'HIGH' }],
        generatedAt: when.getTime(),
        language: 'ru',
        // Returned so the page can say the cards describe a different window
        // than the one currently selected.
        periodDays: 7,
      });
    });

    it('reports a null period for rows written before the column existed', async () => {
      prisma.analyticsRecommendation.findUnique.mockResolvedValue({
        recommendations: [{ title: 'Old', priority: 'LOW' }],
        language: 'en',
        generatedAt: new Date('2026-06-01T00:00:00Z'),
        periodDays: null,
      });

      const result = await service.getStoredRecommendations('proj_1');

      expect(result.periodDays).toBeNull();
    });

    it('returns an empty set when nothing is stored', async () => {
      prisma.analyticsRecommendation.findUnique.mockResolvedValue(null);

      const result = await service.getStoredRecommendations('proj_1');

      expect(result).toEqual({ recommendations: [], generatedAt: null, language: null, periodDays: null });
    });
  });
});
