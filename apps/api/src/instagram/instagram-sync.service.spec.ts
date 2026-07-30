import { InstagramSyncService } from './instagram-sync.service';
import { encryptData } from '../common/crypto.util';
import {
  fetchAccountProfile,
  fetchAccountInsights,
  fetchAccountInsightsRange,
  fetchMediaList,
  fetchMediaInsights,
  fetchStoriesList,
  fetchStoryInsights,
  InstagramAuthError,
} from './instagram-graph.util';

jest.mock('./instagram-graph.util', () => {
  const actual = jest.requireActual('./instagram-graph.util');
  return {
    ...actual,
    fetchAccountProfile: jest.fn(),
    fetchAccountInsights: jest.fn(),
    fetchAccountInsightsRange: jest.fn(),
    fetchMediaList: jest.fn(),
    fetchMediaInsights: jest.fn(),
    fetchStoriesList: jest.fn(),
    fetchStoryInsights: jest.fn(),
  };
});

const mockFetchAccountProfile = fetchAccountProfile as jest.MockedFunction<
  typeof fetchAccountProfile
>;
const mockFetchAccountInsights = fetchAccountInsights as jest.MockedFunction<
  typeof fetchAccountInsights
>;
const mockFetchAccountInsightsRange =
  fetchAccountInsightsRange as jest.MockedFunction<typeof fetchAccountInsightsRange>;
const mockFetchMediaList = fetchMediaList as jest.MockedFunction<
  typeof fetchMediaList
>;
const mockFetchMediaInsights = fetchMediaInsights as jest.MockedFunction<
  typeof fetchMediaInsights
>;
const mockFetchStoriesList = fetchStoriesList as jest.MockedFunction<
  typeof fetchStoriesList
>;
const mockFetchStoryInsights = fetchStoryInsights as jest.MockedFunction<
  typeof fetchStoryInsights
>;

// Valid 64-char hex (32-byte) encryption key.
const ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeEncryptedTokens(): string {
  return encryptData(
    { accessToken: 'ig-long-lived-token', igUserId: '17841400000000000' },
    ENCRYPTION_KEY,
  );
}

function makePrisma() {
  return {
    instagramAccountMetrics: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      // Default count >= BACKFILL_THRESHOLD_DAYS so existing tests don't trigger backfill.
      count: jest.fn().mockResolvedValue(10),
    },
    instagramMedia: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    instagramStory: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    socialAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    ENCRYPTION_KEY,
    WEB_URL: 'http://localhost:5173',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, def?: string) => values[key] ?? def),
  };
}

function makeNotifier() {
  return { report: jest.fn().mockResolvedValue(undefined) };
}

function makeAccount(overrides: Partial<any> = {}) {
  return {
    id: 'acc_1',
    organizationId: 'org_1',
    accountName: '@brand',
    encryptedTokens: makeEncryptedTokens(),
    scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
    ...overrides,
  };
}

describe('InstagramSyncService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let config: ReturnType<typeof makeConfig>;
  let notifier: ReturnType<typeof makeNotifier>;
  let service: InstagramSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    config = makeConfig();
    notifier = makeNotifier();
    service = new InstagramSyncService(
      prisma as any,
      config as any,
      notifier as any,
    );
    // Stories default to none so existing withMedia tests don't hit the real fetch.
    mockFetchStoriesList.mockResolvedValue([]);
    mockFetchStoryInsights.mockResolvedValue({});
  });

  describe('syncAccount', () => {
    it('upserts account metrics with mapped values', async () => {
      mockFetchAccountProfile.mockResolvedValue({
        followersCount: 1200,
        mediaCount: 50,
      });
      mockFetchAccountInsights.mockResolvedValue({
        reach: 5000,
        views: 8000,
        likes: 620,
        accountsEngaged: 300,
        totalInteractions: 450,
      });
      mockFetchMediaList.mockResolvedValue([]);

      const result = await service.syncAccount(makeAccount(), false);

      expect(result).toEqual({ accountSynced: true, mediaSynced: 0, storiesSynced: 0 });
      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.instagramAccountMetrics.upsert.mock.calls[0][0];
      expect(arg.where.socialAccountId_date.socialAccountId).toBe('acc_1');
      expect(arg.create).toMatchObject({
        socialAccountId: 'acc_1',
        followersCount: 1200,
        reach: 5000,
        views: 8000,
        likes: 620,
        accountsEngaged: 300,
        totalInteractions: 450,
      });
      // The daily total_value snapshot is the only source of the likes trend.
      expect(arg.update.likes).toBe(620);
      // date truncated to midnight UTC
      const d: Date = arg.create.date;
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
    });

    it('upserts media with computed engagementRate when withMedia', async () => {
      mockFetchAccountProfile.mockResolvedValue({ followersCount: 100 });
      mockFetchAccountInsights.mockResolvedValue({ reach: 1000 });
      mockFetchMediaList.mockResolvedValue([
        {
          id: 'media_1',
          mediaType: 'IMAGE',
          timestamp: '2026-06-20T10:00:00+0000',
          caption: 'hello',
          permalink: 'https://instagram.com/p/abc',
          likeCount: 80,
          commentsCount: 15,
        },
      ]);
      mockFetchMediaInsights.mockResolvedValue({
        reach: 500,
        saved: 5,
        shares: 2,
        views: 700,
      });

      const result = await service.syncAccount(makeAccount(), true);

      expect(result).toEqual({ accountSynced: true, mediaSynced: 1, storiesSynced: 0 });
      expect(prisma.instagramMedia.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.instagramMedia.upsert.mock.calls[0][0];
      expect(arg.where.socialAccountId_igMediaId).toEqual({
        socialAccountId: 'acc_1',
        igMediaId: 'media_1',
      });
      // (80 + 15 + 5) / 500 = 0.2
      expect(arg.create.engagementRate).toBeCloseTo(0.2);
      expect(arg.create.mediaType).toBe('IMAGE');
      expect(arg.create.caption).toBe('hello');
      expect(arg.create.permalink).toBe('https://instagram.com/p/abc');
      expect(arg.create.timestamp).toBeInstanceOf(Date);
    });

    it('sets engagementRate null when reach is null or 0', async () => {
      mockFetchAccountProfile.mockResolvedValue({ followersCount: 100 });
      mockFetchAccountInsights.mockResolvedValue({});
      mockFetchMediaList.mockResolvedValue([
        {
          id: 'm_null',
          mediaType: 'VIDEO',
          timestamp: '2026-06-20T10:00:00+0000',
          likeCount: 10,
          commentsCount: 2,
        },
        {
          id: 'm_zero',
          mediaType: 'VIDEO',
          timestamp: '2026-06-21T10:00:00+0000',
          likeCount: 10,
          commentsCount: 2,
        },
      ]);
      mockFetchMediaInsights
        .mockResolvedValueOnce({ saved: 1 }) // reach undefined -> null
        .mockResolvedValueOnce({ reach: 0, saved: 1 }); // reach 0

      await service.syncAccount(makeAccount(), true);

      const first = prisma.instagramMedia.upsert.mock.calls[0][0];
      const second = prisma.instagramMedia.upsert.mock.calls[1][0];
      expect(first.create.engagementRate).toBeNull();
      expect(second.create.engagementRate).toBeNull();
    });

    it('skips (zeros) when token payload is missing igUserId', async () => {
      const encryptedTokens = encryptData(
        { accessToken: 'only-token' },
        ENCRYPTION_KEY,
      );
      const result = await service.syncAccount(
        makeAccount({ encryptedTokens }),
        true,
      );
      expect(result).toEqual({ accountSynced: false, mediaSynced: 0, storiesSynced: 0 });
      expect(prisma.instagramAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('flips account to REAUTH_REQUIRED + reports IG_TOKEN_EXPIRED on auth error', async () => {
      // The graph util surfaces auth failures as InstagramAuthError (propagated,
      // not swallowed by the per-metric tolerance).
      mockFetchAccountProfile.mockRejectedValue(
        new InstagramAuthError('Instagram auth failed: HTTP 401'),
      );
      mockFetchAccountInsights.mockResolvedValue({});

      await expect(service.syncAccount(makeAccount(), true)).rejects.toThrow();

      expect(prisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc_1' },
        data: { status: 'REAUTH_REQUIRED' },
      });
      expect(notifier.report).toHaveBeenCalledTimes(1);
      const reported = notifier.report.mock.calls[0][0];
      expect(reported).toMatchObject({
        organizationId: 'org_1',
        cronName: 'instagram-sync',
        resourceType: 'SocialAccount',
        resourceId: 'acc_1',
        errorCode: 'IG_TOKEN_EXPIRED',
      });
    });

    it('upserts one row per active story when withMedia', async () => {
      mockFetchAccountProfile.mockResolvedValue({ followersCount: 100 });
      mockFetchAccountInsights.mockResolvedValue({ reach: 1000 });
      mockFetchMediaList.mockResolvedValue([]);
      mockFetchStoriesList.mockResolvedValue([
        {
          id: 'story_1',
          mediaType: 'VIDEO',
          permalink: 'https://instagram.com/stories/1',
          timestamp: '2026-07-05T08:00:00+0000',
          caption: 'promo',
        },
      ]);
      mockFetchStoryInsights.mockResolvedValue({
        reach: 900,
        views: 1200,
        replies: 4,
        shares: 2,
        totalInteractions: 60,
        tapsForward: 50,
        tapsBack: 10,
        exits: 8,
      });

      const result = await service.syncAccount(makeAccount(), true);

      expect(result).toEqual({ accountSynced: true, mediaSynced: 0, storiesSynced: 1 });
      expect(prisma.instagramStory.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.instagramStory.upsert.mock.calls[0][0];
      expect(arg.where.socialAccountId_igStoryId).toEqual({
        socialAccountId: 'acc_1',
        igStoryId: 'story_1',
      });
      expect(arg.create).toMatchObject({
        socialAccountId: 'acc_1',
        igStoryId: 'story_1',
        mediaType: 'VIDEO',
        reach: 900,
        exits: 8,
        tapsForward: 50,
      });
      expect(arg.create.timestamp).toBeInstanceOf(Date);
    });

    it('does NOT fetch stories when withMedia is false', async () => {
      mockFetchAccountProfile.mockResolvedValue({ followersCount: 100 });
      mockFetchAccountInsights.mockResolvedValue({});

      const result = await service.syncAccount(makeAccount(), false);

      expect(result.storiesSynced).toBe(0);
      expect(mockFetchStoriesList).not.toHaveBeenCalled();
      expect(prisma.instagramStory.upsert).not.toHaveBeenCalled();
    });
  });

  describe('backfillAccount', () => {
    beforeEach(() => {
      mockFetchAccountInsightsRange.mockResolvedValue([]);
    });

    it('upserts one row per returned day with correct socialAccountId_date keys and values', async () => {
      mockFetchAccountInsightsRange.mockResolvedValue([
        { date: '2026-05-01', reach: 100, views: 200, accountsEngaged: 30, totalInteractions: 40 },
        { date: '2026-05-02', reach: 150, views: 250 },
      ]);

      const result = await service.backfillAccount(makeAccount(), 90);

      expect(result).toEqual({ daysWritten: 2 });
      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(2);

      const call0 = prisma.instagramAccountMetrics.upsert.mock.calls[0][0];
      expect(call0.where.socialAccountId_date).toEqual({
        socialAccountId: 'acc_1',
        date: new Date('2026-05-01'),
      });
      expect(call0.create).toMatchObject({
        socialAccountId: 'acc_1',
        reach: 100,
        views: 200,
        accountsEngaged: 30,
        totalInteractions: 40,
      });
      expect(call0.update).toMatchObject({ reach: 100, views: 200 });

      const call1 = prisma.instagramAccountMetrics.upsert.mock.calls[1][0];
      expect(call1.where.socialAccountId_date).toEqual({
        socialAccountId: 'acc_1',
        date: new Date('2026-05-02'),
      });
      // Partial row: missing fields become null.
      expect(call1.create).toMatchObject({ reach: 150, views: 250 });
      expect(call1.create.accountsEngaged).toBeNull();
    });

    it('is idempotent — second call issues upserts with the same keys and no error', async () => {
      mockFetchAccountInsightsRange.mockResolvedValue([
        { date: '2026-05-01', reach: 100 },
      ]);

      await service.backfillAccount(makeAccount(), 90);
      await service.backfillAccount(makeAccount(), 90);

      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(2);
      const key0 =
        prisma.instagramAccountMetrics.upsert.mock.calls[0][0].where.socialAccountId_date;
      const key1 =
        prisma.instagramAccountMetrics.upsert.mock.calls[1][0].where.socialAccountId_date;
      expect(key0).toEqual(key1);
    });

    it('returns {daysWritten:0} when token decryption fails', async () => {
      const result = await service.backfillAccount(
        makeAccount({ encryptedTokens: 'not-valid-encrypted-data' }),
        90,
      );
      expect(result).toEqual({ daysWritten: 0 });
      expect(prisma.instagramAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('returns {daysWritten:0} when igUserId is absent in payload', async () => {
      const encryptedTokens = encryptData({ accessToken: 'tok-only' }, ENCRYPTION_KEY);
      const result = await service.backfillAccount(makeAccount({ encryptedTokens }), 90);
      expect(result).toEqual({ daysWritten: 0 });
    });

    it('propagates auth error after calling handleAuthError', async () => {
      const authErr = new InstagramAuthError('expired');
      mockFetchAccountInsightsRange.mockRejectedValue(authErr);

      await expect(service.backfillAccount(makeAccount(), 90)).rejects.toThrow(authErr);
      expect(prisma.socialAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REAUTH_REQUIRED' } }),
      );
    });
  });

  describe('self-healing trigger', () => {
    function cronAccount(plan: string) {
      return makeAccount({
        organization: { subscription: { plan } },
      });
    }

    beforeEach(() => {
      mockFetchAccountProfile.mockResolvedValue({ followersCount: 1 });
      mockFetchAccountInsights.mockResolvedValue({});
      mockFetchMediaList.mockResolvedValue([]);
      mockFetchAccountInsightsRange.mockResolvedValue([]);
    });

    it('calls backfillAccount before syncAccount when count < BACKFILL_THRESHOLD_DAYS', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('ENTERPRISE')]);
      prisma.instagramAccountMetrics.count.mockResolvedValue(
        InstagramSyncService.BACKFILL_THRESHOLD_DAYS - 1,
      );
      const backfillSpy = jest
        .spyOn(service, 'backfillAccount')
        .mockResolvedValue({ daysWritten: 5 });

      await service.handleCron();

      expect(backfillSpy).toHaveBeenCalledTimes(1);
      expect(backfillSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc_1' }),
        90,
      );
      // Normal sync still runs after backfill.
      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(1);
    });

    it('does NOT call backfillAccount when count >= BACKFILL_THRESHOLD_DAYS', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('ENTERPRISE')]);
      prisma.instagramAccountMetrics.count.mockResolvedValue(
        InstagramSyncService.BACKFILL_THRESHOLD_DAYS,
      );
      const backfillSpy = jest
        .spyOn(service, 'backfillAccount')
        .mockResolvedValue({ daysWritten: 0 });

      await service.handleCron();

      expect(backfillSpy).not.toHaveBeenCalled();
    });

    it('FREE + today metric exists + count < threshold → backfills but skips daily sync', async () => {
      // Regression: backfill must run BEFORE the FREE throttle so a sparse
      // account (2 rows including today) is backfilled even though
      // hasMetricsForToday would cause a `continue` in the old ordering.
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('FREE')]);
      prisma.instagramAccountMetrics.count.mockResolvedValue(2); // < BACKFILL_THRESHOLD_DAYS (7)
      // hasMetricsForToday → true (findUnique returns a row)
      prisma.instagramAccountMetrics.findUnique.mockResolvedValue({ id: 'today-row' });

      const backfillSpy = jest
        .spyOn(service, 'backfillAccount')
        .mockResolvedValue({ daysWritten: 88 });
      const syncSpy = jest
        .spyOn(service, 'syncAccount')
        .mockResolvedValue({ accountSynced: true, mediaSynced: 0, storiesSynced: 0 });

      await service.handleCron();

      // Backfill must have been called first.
      expect(backfillSpy).toHaveBeenCalledTimes(1);
      expect(backfillSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc_1' }),
        90,
      );
      // The FREE throttle fires after the backfill → regular sync is skipped.
      expect(syncSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleCron plan throttling', () => {
    function cronAccount(plan: string | null) {
      return makeAccount({
        organization: { subscription: plan ? { plan } : null },
      });
    }

    beforeEach(() => {
      mockFetchAccountProfile.mockResolvedValue({ followersCount: 1 });
      mockFetchAccountInsights.mockResolvedValue({});
      mockFetchMediaList.mockResolvedValue([]);
    });

    it('FREE: account-only, skips if metrics already exist for today', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('FREE')]);
      prisma.instagramAccountMetrics.findUnique.mockResolvedValue({ id: 'x' });

      await service.handleCron();

      expect(prisma.instagramAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('FREE: syncs account + media (per-post analytics) when none today', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('FREE')]);
      prisma.instagramAccountMetrics.findUnique.mockResolvedValue(null);

      await service.handleCron();

      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      expect(mockFetchMediaList).toHaveBeenCalledTimes(1);
    });

    it('PRO: skips if media synced within 6h', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('PRO')]);
      prisma.instagramMedia.findFirst.mockResolvedValue({
        lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      await service.handleCron();

      expect(prisma.instagramAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('ENTERPRISE: syncs account + media every run', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        cronAccount('ENTERPRISE'),
      ]);

      await service.handleCron();

      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      expect(mockFetchMediaList).toHaveBeenCalledTimes(1);
    });
  });
});
