import { InstagramSyncService } from './instagram-sync.service';
import { encryptData } from '../common/crypto.util';
import {
  fetchAccountProfile,
  fetchAccountInsights,
  fetchMediaList,
  fetchMediaInsights,
} from './instagram-graph.util';

jest.mock('./instagram-graph.util');

const mockFetchAccountProfile = fetchAccountProfile as jest.MockedFunction<
  typeof fetchAccountProfile
>;
const mockFetchAccountInsights = fetchAccountInsights as jest.MockedFunction<
  typeof fetchAccountInsights
>;
const mockFetchMediaList = fetchMediaList as jest.MockedFunction<
  typeof fetchMediaList
>;
const mockFetchMediaInsights = fetchMediaInsights as jest.MockedFunction<
  typeof fetchMediaInsights
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
    },
    instagramMedia: {
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
        accountsEngaged: 300,
        totalInteractions: 450,
      });
      mockFetchMediaList.mockResolvedValue([]);

      const result = await service.syncAccount(makeAccount(), false);

      expect(result).toEqual({ accountSynced: true, mediaSynced: 0 });
      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      const arg = prisma.instagramAccountMetrics.upsert.mock.calls[0][0];
      expect(arg.where.socialAccountId_date.socialAccountId).toBe('acc_1');
      expect(arg.create).toMatchObject({
        socialAccountId: 'acc_1',
        followersCount: 1200,
        reach: 5000,
        views: 8000,
        accountsEngaged: 300,
        totalInteractions: 450,
      });
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

      expect(result).toEqual({ accountSynced: true, mediaSynced: 1 });
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
      expect(result).toEqual({ accountSynced: false, mediaSynced: 0 });
      expect(prisma.instagramAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('flips account to REAUTH_REQUIRED + reports IG_TOKEN_EXPIRED on auth error', async () => {
      const authError: any = new Error('OAuthException: token expired');
      authError.status = 401;
      mockFetchAccountProfile.mockRejectedValue(authError);
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

    it('FREE: syncs account metrics only (no media) when none today', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([cronAccount('FREE')]);
      prisma.instagramAccountMetrics.findUnique.mockResolvedValue(null);

      await service.handleCron();

      expect(prisma.instagramAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      expect(mockFetchMediaList).not.toHaveBeenCalled();
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
