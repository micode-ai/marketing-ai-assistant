import { ThreadsSyncService } from './threads-sync.service';
import { encryptData } from '../common/crypto.util';
import {
  fetchThreadsProfile,
  fetchThreadsAccountInsights,
  fetchThreadsAccountInsightsRange,
  fetchThreadsMediaList,
  fetchThreadsMediaInsights,
  ThreadsAuthError,
} from './threads-graph.util';

jest.mock('./threads-graph.util', () => {
  const actual = jest.requireActual('./threads-graph.util');
  return {
    ...actual,
    fetchThreadsProfile: jest.fn(),
    fetchThreadsAccountInsights: jest.fn(),
    fetchThreadsAccountInsightsRange: jest.fn(),
    fetchThreadsMediaList: jest.fn(),
    fetchThreadsMediaInsights: jest.fn(),
  };
});

const mockFetchThreadsProfile = fetchThreadsProfile as jest.MockedFunction<
  typeof fetchThreadsProfile
>;
const mockFetchThreadsAccountInsights =
  fetchThreadsAccountInsights as jest.MockedFunction<
    typeof fetchThreadsAccountInsights
  >;
const mockFetchThreadsAccountInsightsRange =
  fetchThreadsAccountInsightsRange as jest.MockedFunction<
    typeof fetchThreadsAccountInsightsRange
  >;
const mockFetchThreadsMediaList = fetchThreadsMediaList as jest.MockedFunction<
  typeof fetchThreadsMediaList
>;
const mockFetchThreadsMediaInsights =
  fetchThreadsMediaInsights as jest.MockedFunction<
    typeof fetchThreadsMediaInsights
  >;

// Valid 64-char hex (32-byte) encryption key.
const ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeEncryptedTokens(): string {
  return encryptData(
    {
      accessToken: 'threads-long-lived-token',
      threadsUserId: '12345678901234567',
    },
    ENCRYPTION_KEY,
  );
}

function makePrisma() {
  return {
    threadsAccountMetrics: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      // Default count >= BACKFILL_THRESHOLD_DAYS so existing tests don't trigger backfill.
      count: jest.fn().mockResolvedValue(10),
    },
    threadsMedia: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
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
    accountName: '@brand_threads',
    encryptedTokens: makeEncryptedTokens(),
    scopes: ['threads_basic', 'threads_manage_insights'],
    ...overrides,
  };
}

describe('ThreadsSyncService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let config: ReturnType<typeof makeConfig>;
  let notifier: ReturnType<typeof makeNotifier>;
  let service: ThreadsSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    config = makeConfig();
    notifier = makeNotifier();
    service = new ThreadsSyncService(
      prisma as any,
      config as any,
      notifier as any,
    );
  });

  describe('syncAccount', () => {
    it('upserts account metrics with mapped values', async () => {
      mockFetchThreadsProfile.mockResolvedValue({
        followersCount: 2500,
        username: 'brand',
      });
      mockFetchThreadsAccountInsights.mockResolvedValue({
        views: 12000,
        likes: 400,
        replies: 150,
        reposts: 80,
        quotes: 30,
      });
      mockFetchThreadsMediaList.mockResolvedValue([]);

      const result = await service.syncAccount(makeAccount(), false);

      expect(result).toEqual({ accountSynced: true, mediaSynced: 0 });
      expect(prisma.threadsAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.threadsAccountMetrics.upsert.mock.calls[0][0];
      expect(arg.where.socialAccountId_date.socialAccountId).toBe('acc_1');
      expect(arg.create).toMatchObject({
        socialAccountId: 'acc_1',
        followersCount: 2500,
        views: 12000,
        likes: 400,
        replies: 150,
        reposts: 80,
        quotes: 30,
      });
      // date truncated to midnight UTC
      const d: Date = arg.create.date;
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
    });

    it('upserts media with computed engagementRate when withMedia', async () => {
      mockFetchThreadsProfile.mockResolvedValue({ followersCount: 1000 });
      mockFetchThreadsAccountInsights.mockResolvedValue({ views: 5000 });
      mockFetchThreadsMediaList.mockResolvedValue([
        {
          id: 'media_t1',
          mediaType: 'TEXT_POST',
          timestamp: '2026-06-20T10:00:00+0000',
          text: 'Hello Threads!',
          permalink: 'https://www.threads.net/@brand/post/abc',
        },
      ]);
      // views=1000, likes=50, replies=20, reposts=10, quotes=5, shares=15
      // interactions = 50+20+10+5+15 = 100
      // engagementRate = 100/1000 = 0.1
      mockFetchThreadsMediaInsights.mockResolvedValue({
        views: 1000,
        likes: 50,
        replies: 20,
        reposts: 10,
        quotes: 5,
        shares: 15,
      });

      const result = await service.syncAccount(makeAccount(), true);

      expect(result).toEqual({ accountSynced: true, mediaSynced: 1 });
      expect(prisma.threadsMedia.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.threadsMedia.upsert.mock.calls[0][0];
      expect(arg.where.socialAccountId_threadsMediaId).toEqual({
        socialAccountId: 'acc_1',
        threadsMediaId: 'media_t1',
      });
      // (50+20+10+5+15) / 1000 = 0.1
      expect(arg.create.engagementRate).toBeCloseTo(0.1);
      expect(arg.create.mediaType).toBe('TEXT_POST');
      expect(arg.create.text).toBe('Hello Threads!');
      expect(arg.create.permalink).toBe(
        'https://www.threads.net/@brand/post/abc',
      );
      expect(arg.create.timestamp).toBeInstanceOf(Date);
    });

    it('sets engagementRate null when views is null or 0', async () => {
      mockFetchThreadsProfile.mockResolvedValue({ followersCount: 500 });
      mockFetchThreadsAccountInsights.mockResolvedValue({});
      mockFetchThreadsMediaList.mockResolvedValue([
        {
          id: 'm_null_views',
          mediaType: 'TEXT_POST',
          timestamp: '2026-06-20T10:00:00+0000',
        },
        {
          id: 'm_zero_views',
          mediaType: 'TEXT_POST',
          timestamp: '2026-06-21T10:00:00+0000',
        },
      ]);
      mockFetchThreadsMediaInsights
        .mockResolvedValueOnce({ likes: 10, replies: 5 }) // views undefined -> null
        .mockResolvedValueOnce({ views: 0, likes: 10, replies: 5 }); // views 0

      await service.syncAccount(makeAccount(), true);

      const first = prisma.threadsMedia.upsert.mock.calls[0][0];
      const second = prisma.threadsMedia.upsert.mock.calls[1][0];
      expect(first.create.engagementRate).toBeNull();
      expect(second.create.engagementRate).toBeNull();
    });

    it('skips (zeros) when token payload is missing threadsUserId', async () => {
      const encryptedTokens = encryptData(
        { accessToken: 'only-token' },
        ENCRYPTION_KEY,
      );
      const result = await service.syncAccount(
        makeAccount({ encryptedTokens }),
        true,
      );
      expect(result).toEqual({ accountSynced: false, mediaSynced: 0 });
      expect(prisma.threadsAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('flips account to REAUTH_REQUIRED + reports THREADS_TOKEN_EXPIRED on auth error', async () => {
      mockFetchThreadsProfile.mockRejectedValue(
        new ThreadsAuthError('Threads auth failed: HTTP 401'),
      );
      mockFetchThreadsAccountInsights.mockResolvedValue({});

      await expect(service.syncAccount(makeAccount(), true)).rejects.toThrow();

      expect(prisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc_1' },
        data: { status: 'REAUTH_REQUIRED' },
      });
      expect(notifier.report).toHaveBeenCalledTimes(1);
      const reported = notifier.report.mock.calls[0][0];
      expect(reported).toMatchObject({
        organizationId: 'org_1',
        cronName: 'threads-sync',
        resourceType: 'SocialAccount',
        resourceId: 'acc_1',
        errorCode: 'THREADS_TOKEN_EXPIRED',
      });
    });
  });

  describe('planAllowsMedia', () => {
    it('returns false for FREE', () => {
      expect(service.planAllowsMedia('FREE')).toBe(false);
    });

    it('returns true for PRO', () => {
      expect(service.planAllowsMedia('PRO')).toBe(true);
    });

    it('returns true for ENTERPRISE', () => {
      expect(service.planAllowsMedia('ENTERPRISE')).toBe(true);
    });
  });

  describe('backfillAccount', () => {
    beforeEach(() => {
      mockFetchThreadsAccountInsightsRange.mockResolvedValue([]);
    });

    it('upserts one row per returned day with correct socialAccountId_date keys and values', async () => {
      mockFetchThreadsAccountInsightsRange.mockResolvedValue([
        { date: '2026-05-01', views: 1000, likes: 50, replies: 20, reposts: 10, quotes: 5 },
        { date: '2026-05-02', views: 1500, likes: 80 },
      ]);

      const result = await service.backfillAccount(makeAccount(), 90);

      expect(result).toEqual({ daysWritten: 2 });
      expect(prisma.threadsAccountMetrics.upsert).toHaveBeenCalledTimes(2);

      const call0 = prisma.threadsAccountMetrics.upsert.mock.calls[0][0];
      expect(call0.where.socialAccountId_date).toEqual({
        socialAccountId: 'acc_1',
        date: new Date('2026-05-01'),
      });
      expect(call0.create).toMatchObject({
        socialAccountId: 'acc_1',
        views: 1000,
        likes: 50,
        replies: 20,
        reposts: 10,
        quotes: 5,
      });
      expect(call0.update).toMatchObject({ views: 1000, likes: 50 });

      const call1 = prisma.threadsAccountMetrics.upsert.mock.calls[1][0];
      expect(call1.where.socialAccountId_date).toEqual({
        socialAccountId: 'acc_1',
        date: new Date('2026-05-02'),
      });
      // Partial row: missing fields become null.
      expect(call1.create).toMatchObject({ views: 1500, likes: 80 });
      expect(call1.create.replies).toBeNull();
    });

    it('is idempotent — second call issues upserts with the same keys and no error', async () => {
      mockFetchThreadsAccountInsightsRange.mockResolvedValue([
        { date: '2026-05-01', views: 100 },
      ]);

      await service.backfillAccount(makeAccount(), 90);
      await service.backfillAccount(makeAccount(), 90);

      expect(prisma.threadsAccountMetrics.upsert).toHaveBeenCalledTimes(2);
      const key0 =
        prisma.threadsAccountMetrics.upsert.mock.calls[0][0].where.socialAccountId_date;
      const key1 =
        prisma.threadsAccountMetrics.upsert.mock.calls[1][0].where.socialAccountId_date;
      expect(key0).toEqual(key1);
    });

    it('returns {daysWritten:0} when token decryption fails', async () => {
      const result = await service.backfillAccount(
        makeAccount({ encryptedTokens: 'not-valid-encrypted-data' }),
        90,
      );
      expect(result).toEqual({ daysWritten: 0 });
      expect(prisma.threadsAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('returns {daysWritten:0} when threadsUserId is absent in payload', async () => {
      const encryptedTokens = encryptData({ accessToken: 'tok-only' }, ENCRYPTION_KEY);
      const result = await service.backfillAccount(makeAccount({ encryptedTokens }), 90);
      expect(result).toEqual({ daysWritten: 0 });
    });

    it('propagates auth error after calling handleAuthError', async () => {
      const authErr = new ThreadsAuthError('expired');
      mockFetchThreadsAccountInsightsRange.mockRejectedValue(authErr);

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
      mockFetchThreadsProfile.mockResolvedValue({ followersCount: 1 });
      mockFetchThreadsAccountInsights.mockResolvedValue({});
      mockFetchThreadsMediaList.mockResolvedValue([]);
      mockFetchThreadsAccountInsightsRange.mockResolvedValue([]);
    });

    it('calls backfillAccount before syncAccount when count < BACKFILL_THRESHOLD_DAYS', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('ENTERPRISE')]);
      prisma.threadsAccountMetrics.count.mockResolvedValue(
        ThreadsSyncService.BACKFILL_THRESHOLD_DAYS - 1,
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
      expect(prisma.threadsAccountMetrics.upsert).toHaveBeenCalledTimes(1);
    });

    it('does NOT call backfillAccount when count >= BACKFILL_THRESHOLD_DAYS', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('ENTERPRISE')]);
      prisma.threadsAccountMetrics.count.mockResolvedValue(
        ThreadsSyncService.BACKFILL_THRESHOLD_DAYS,
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
      prisma.threadsAccountMetrics.count.mockResolvedValue(2); // < BACKFILL_THRESHOLD_DAYS (7)
      // hasMetricsForToday → true (findUnique returns a row)
      prisma.threadsAccountMetrics.findUnique.mockResolvedValue({ id: 'today-row' });

      const backfillSpy = jest
        .spyOn(service, 'backfillAccount')
        .mockResolvedValue({ daysWritten: 88 });
      const syncSpy = jest
        .spyOn(service, 'syncAccount')
        .mockResolvedValue({ accountSynced: true, mediaSynced: 0 });

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
      mockFetchThreadsProfile.mockResolvedValue({ followersCount: 100 });
      mockFetchThreadsAccountInsights.mockResolvedValue({});
      mockFetchThreadsMediaList.mockResolvedValue([]);
    });

    it('FREE: account-only, skips if metrics already exist for today', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('FREE')]);
      prisma.threadsAccountMetrics.findUnique.mockResolvedValue({ id: 'x' });

      await service.handleCron();

      expect(prisma.threadsAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('FREE: syncs account metrics only (no media) when none today', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('FREE')]);
      prisma.threadsAccountMetrics.findUnique.mockResolvedValue(null);

      await service.handleCron();

      expect(prisma.threadsAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      expect(mockFetchThreadsMediaList).not.toHaveBeenCalled();
    });

    it('PRO: skips if media synced within 6h', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('PRO')]);
      prisma.threadsMedia.findFirst.mockResolvedValue({
        lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
      });

      await service.handleCron();

      expect(prisma.threadsAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('ENTERPRISE: syncs account + media every run', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        cronAccount('ENTERPRISE'),
      ]);

      await service.handleCron();

      expect(prisma.threadsAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      expect(mockFetchThreadsMediaList).toHaveBeenCalledTimes(1);
    });
  });
});
