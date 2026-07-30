import { TikTokSyncService } from './tiktok-sync.service';
import { TikTokAuthError } from './tiktok-api.util';

describe('TikTokSyncService', () => {
  const originalFetch = global.fetch;

  const account = {
    id: 'acc1',
    organizationId: 'org1',
    accountName: 'brand',
    accountId: 'oid1',
    encryptedTokens: 'iv:blob',
  };

  let prisma: any;
  let notifier: any;
  let tokenService: any;
  let service: TikTokSyncService;

  const config = { get: (_k: string, d?: string) => d ?? 'https://app.example.com' } as any;

  function envelope(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ data, error: { code: 'ok' } }) };
  }

  /** Mock the Display API: profile + one or more video pages. */
  function routeFetch(opts: {
    profile?: Record<string, unknown>;
    pages?: Array<{ videos: Array<Record<string, unknown>>; cursor?: number; has_more?: boolean }>;
  }) {
    const pages = opts.pages ?? [{ videos: [], has_more: false }];
    let pageIdx = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/v2/user/info/')) {
        return envelope({
          user: opts.profile ?? {
            open_id: 'oid1',
            username: 'brand',
            follower_count: 1200,
            following_count: 30,
            likes_count: 9000,
            video_count: 42,
          },
        });
      }
      const page = pages[Math.min(pageIdx++, pages.length - 1)]!;
      return envelope(page);
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    prisma = {
      tikTokAccountMetrics: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tikTokMedia: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { viewCount: 5000, likeCount: 400, commentCount: 25, shareCount: 12 },
        }),
      },
      socialAccount: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifier = { report: jest.fn().mockResolvedValue(undefined) };
    tokenService = {
      getValidAccessToken: jest.fn().mockResolvedValue('at1'),
      markReauthRequired: jest.fn().mockResolvedValue(undefined),
    };
    service = new TikTokSyncService(prisma, config, notifier, tokenService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('syncAccount', () => {
    it('writes a dated snapshot of profile counters plus aggregated video totals', async () => {
      routeFetch({});

      const result = await service.syncAccount(account, false);

      expect(tokenService.getValidAccessToken).toHaveBeenCalledWith(account);
      const call = prisma.tikTokAccountMetrics.upsert.mock.calls[0][0];
      expect(call.create).toMatchObject({
        socialAccountId: 'acc1',
        followersCount: 1200,
        followingCount: 30,
        likesCount: 9000,
        videoCount: 42,
        // Aggregated from stored media, not from this fetch.
        views: 5000,
        likes: 400,
        comments: 25,
        shares: 12,
      });
      // Date is truncated to midnight UTC so one row per calendar day.
      const date: Date = call.create.date;
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(result).toEqual({ accountSynced: true, mediaSynced: 0 });
    });

    it('upserts videos with an engagement rate over views', async () => {
      routeFetch({
        pages: [
          {
            videos: [
              {
                id: 'v1',
                title: 'Launch',
                create_time: 1751000000,
                view_count: 1000,
                like_count: 80,
                comment_count: 15,
                share_count: 5,
              },
            ],
            has_more: false,
          },
        ],
      });

      const result = await service.syncAccount(account, true);

      const media = prisma.tikTokMedia.upsert.mock.calls[0][0];
      expect(media.where.socialAccountId_tiktokVideoId).toEqual({
        socialAccountId: 'acc1',
        tiktokVideoId: 'v1',
      });
      // (80 + 15 + 5) / 1000
      expect(media.create.engagementRate).toBeCloseTo(0.1);
      expect(result.mediaSynced).toBe(1);
    });

    it('leaves engagementRate null when a video reports no views', async () => {
      routeFetch({
        pages: [{ videos: [{ id: 'v1', create_time: 1751000000, like_count: 3 }], has_more: false }],
      });

      await service.syncAccount(account, true);

      expect(prisma.tikTokMedia.upsert.mock.calls[0][0].create.engagementRate).toBeNull();
    });

    it('follows pagination up to the page cap', async () => {
      routeFetch({
        pages: [
          { videos: [{ id: 'v1', create_time: 1751000000, view_count: 10 }], cursor: 20, has_more: true },
          { videos: [{ id: 'v2', create_time: 1751000001, view_count: 10 }], cursor: 40, has_more: true },
          { videos: [{ id: 'v3', create_time: 1751000002, view_count: 10 }], has_more: false },
        ],
      });

      const result = await service.syncAccount(account, true);

      // MAX_PAGES = 2 — the third page is intentionally not fetched.
      expect(result.mediaSynced).toBe(2);
    });

    it('stops paging when has_more is false', async () => {
      routeFetch({
        pages: [
          { videos: [{ id: 'v1', create_time: 1751000000, view_count: 10 }], cursor: 20, has_more: false },
          { videos: [{ id: 'v2', create_time: 1751000001, view_count: 10 }], has_more: false },
        ],
      });

      const result = await service.syncAccount(account, true);
      expect(result.mediaSynced).toBe(1);
    });

    it('returns without syncing when the token cannot be refreshed', async () => {
      tokenService.getValidAccessToken.mockRejectedValue(new Error('invalid_grant'));

      await expect(service.syncAccount(account)).resolves.toEqual({
        accountSynced: false,
        mediaSynced: 0,
      });
      expect(prisma.tikTokAccountMetrics.upsert).not.toHaveBeenCalled();
    });

    it('marks reauth required and rethrows on an auth error mid-sync', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      await expect(service.syncAccount(account)).rejects.toBeInstanceOf(TikTokAuthError);
      expect(tokenService.markReauthRequired).toHaveBeenCalledWith(account, expect.any(String));
    });
  });

  describe('handleCron', () => {
    function accountRow(plan: string) {
      return {
        ...account,
        organization: { subscription: { plan } },
      };
    }

    it('skips a FREE account that already has today\'s snapshot', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([accountRow('FREE')]);
      prisma.tikTokAccountMetrics.findUnique.mockResolvedValue({ id: 'm1' });
      routeFetch({});

      await service.handleCron();

      expect(tokenService.getValidAccessToken).not.toHaveBeenCalled();
    });

    it('syncs a FREE account that has no snapshot yet', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([accountRow('FREE')]);
      routeFetch({});

      await service.handleCron();

      expect(prisma.tikTokAccountMetrics.upsert).toHaveBeenCalled();
    });

    it('skips a PRO account synced within the last 6 hours', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([accountRow('PRO')]);
      prisma.tikTokMedia.findFirst.mockResolvedValue({ lastSyncedAt: new Date() });
      routeFetch({});

      await service.handleCron();

      expect(tokenService.getValidAccessToken).not.toHaveBeenCalled();
    });

    it('reports TIKTOK_SYNC_FAILED for a non-auth failure', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([accountRow('ENTERPRISE')]);
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ error: { code: 'internal_error', message: 'boom' } }),
      })) as unknown as typeof fetch;

      await service.handleCron();

      expect(notifier.report).toHaveBeenCalledWith(
        expect.objectContaining({
          cronName: 'tiktok-sync',
          errorCode: 'TIKTOK_SYNC_FAILED',
          resourceId: 'acc1',
        }),
      );
    });

    it('does NOT double-report an auth failure already handled by the token service', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([accountRow('ENTERPRISE')]);
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      await service.handleCron();

      expect(tokenService.markReauthRequired).toHaveBeenCalled();
      expect(notifier.report).not.toHaveBeenCalled();
    });

    it('keeps going after one account fails', async () => {
      prisma.socialAccount.findMany.mockResolvedValue([
        accountRow('ENTERPRISE'),
        { ...accountRow('ENTERPRISE'), id: 'acc2' },
      ]);
      let call = 0;
      global.fetch = jest.fn(async (url: string) => {
        if (url.includes('/v2/user/info/')) {
          call++;
          if (call === 1) throw new Error('network down');
          return envelope({ user: { open_id: 'oid2', follower_count: 5 } });
        }
        return envelope({ videos: [], has_more: false });
      }) as unknown as typeof fetch;

      await service.handleCron();

      expect(prisma.tikTokAccountMetrics.upsert).toHaveBeenCalledTimes(1);
      expect(notifier.report).toHaveBeenCalledTimes(1);
    });
  });

  it('allows per-video metrics on every plan (plans differ only in frequency)', () => {
    expect(service.planAllowsMedia('FREE')).toBe(true);
    expect(service.planAllowsMedia('ENTERPRISE')).toBe(true);
  });
});
