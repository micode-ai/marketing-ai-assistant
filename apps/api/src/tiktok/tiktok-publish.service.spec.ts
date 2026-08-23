import { TikTokPublishService } from './tiktok-publish.service';
import { TikTokApiError } from './tiktok-api.util';

/**
 * These specs drive the real tiktok-api.util against a mocked global fetch, so the
 * request bodies TikTok would actually receive are asserted end to end.
 */
describe('TikTokPublishService', () => {
  const originalFetch = global.fetch;

  const account = {
    id: 'acc1',
    organizationId: 'org1',
    accountName: 'brand',
    accountId: 'oid1',
    encryptedTokens: 'iv:blob',
  };

  let tokenService: any;
  let calls: Array<{ url: string; init: any }>;

  /** Route mocked fetch by URL: media download, creator info, init, upload, status. */
  function routeFetch(options: {
    videoBytes?: number;
    creator?: Record<string, unknown>;
    statuses?: Array<Record<string, unknown>>;
    initData?: Record<string, unknown>;
  }) {
    const statuses = options.statuses ?? [{ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['777'] }];
    let statusIdx = 0;

    global.fetch = jest.fn(async (url: string, init: any = {}) => {
      calls.push({ url, init });

      if (url.includes('creator_info/query')) {
        return envelope(
          options.creator ?? {
            creator_username: 'brand',
            privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
          },
        );
      }
      if (url.includes('/init/')) {
        return envelope(
          options.initData ?? { publish_id: 'pub1', upload_url: 'https://upload.tiktok/1' },
        );
      }
      if (url.includes('status/fetch')) {
        const body = statuses[Math.min(statusIdx++, statuses.length - 1)]!;
        return envelope(body);
      }
      if (url.startsWith('https://upload.tiktok')) {
        return { ok: true, status: 201, text: async () => '' };
      }
      // Media download for FILE_UPLOAD.
      return {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h === 'content-length' ? String(options.videoBytes ?? 1024) : null) },
        arrayBuffer: async () => new ArrayBuffer(options.videoBytes ?? 1024),
      };
    }) as unknown as typeof fetch;
  }

  function envelope(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ data, error: { code: 'ok' } }) };
  }

  function makeService(env: Record<string, string | undefined> = {}) {
    const config = {
      get: (key: string) => ({ WEB_URL: 'https://app.example.com', ...env })[key],
    } as any;
    return new TikTokPublishService(config, tokenService);
  }

  /** Find the body of the first request whose URL matches. */
  function bodyOf(fragment: string) {
    const call = calls.find((c) => c.url.includes(fragment));
    return call ? JSON.parse(call.init.body) : null;
  }

  beforeEach(() => {
    calls = [];
    tokenService = { getValidAccessToken: jest.fn().mockResolvedValue('at1') };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('directPostEnabled', () => {
    it('is off unless explicitly enabled', () => {
      expect(makeService().directPostEnabled()).toBe(false);
      expect(makeService({ TIKTOK_DIRECT_POST_ENABLED: 'false' }).directPostEnabled()).toBe(false);
      expect(makeService({ TIKTOK_DIRECT_POST_ENABLED: 'true' }).directPostEnabled()).toBe(true);
      expect(makeService({ TIKTOK_DIRECT_POST_ENABLED: '1' }).directPostEnabled()).toBe(true);
    });
  });

  describe('pickPrivacyLevel', () => {
    it('prefers public, degrades to whatever the creator allows', () => {
      const svc = makeService();
      expect(svc.pickPrivacyLevel(['SELF_ONLY', 'PUBLIC_TO_EVERYONE'])).toBe('PUBLIC_TO_EVERYONE');
      // An unaudited client only ever gets SELF_ONLY back.
      expect(svc.pickPrivacyLevel(['SELF_ONLY'])).toBe('SELF_ONLY');
      expect(svc.pickPrivacyLevel(['FOLLOWER_OF_CREATOR'])).toBe('FOLLOWER_OF_CREATOR');
      expect(svc.pickPrivacyLevel([])).toBe('SELF_ONLY');
    });
  });

  it('rejects text-only content — TikTok has no text post type', async () => {
    routeFetch({});
    await expect(
      makeService().publish({ title: 'T', body: 'just words' }, account),
    ).rejects.toThrow(/requires a video or at least one image/i);
    // Nothing should have been sent to TikTok.
    expect(calls).toHaveLength(0);
  });

  describe('video', () => {
    it('uploads via the inbox endpoint as a draft when direct post is disabled', async () => {
      routeFetch({ statuses: [{ status: 'SEND_TO_USER_INBOX' }] });

      const result = await makeService().publish(
        { title: 'T', body: 'caption text', mediaUrls: ['https://cdn.example.com/a.mp4'] },
        account,
      );

      expect(calls.some((c) => c.url.includes('/v2/post/publish/inbox/video/init/'))).toBe(true);
      expect(bodyOf('/init/').post_info).toBeUndefined();
      // creator_info needs video.publish, which a sandbox never grants — and a
      // draft has no privacy level to pick, so it must not be called at all.
      expect(calls.some((c) => c.url.includes('creator_info/query'))).toBe(false);
      expect(bodyOf('/init/').source_info).toMatchObject({
        source: 'FILE_UPLOAD',
        video_size: 1024,
        total_chunk_count: 1,
      });
      // One PUT for the single chunk.
      expect(calls.filter((c) => c.url.startsWith('https://upload.tiktok'))).toHaveLength(1);
      expect(result).toEqual({ postId: 'pub1', postUrl: '', draft: true });
    });

    it('sends post_info with the creator-allowed privacy level in direct-post mode', async () => {
      routeFetch({});

      const result = await makeService({ TIKTOK_DIRECT_POST_ENABLED: 'true' }).publish(
        { title: 'T', body: '**bold** caption', mediaUrls: ['https://cdn.example.com/a.mp4'] },
        account,
      );

      expect(calls.some((c) => c.url.includes('/v2/post/publish/video/init/'))).toBe(true);
      expect(bodyOf('/init/').post_info).toMatchObject({
        title: 'bold caption',
        privacy_level: 'PUBLIC_TO_EVERYONE',
      });
      expect(result).toEqual({
        postId: '777',
        postUrl: 'https://www.tiktok.com/@brand/video/777',
        draft: false,
      });
    });

    it('mirrors the creator interaction restrictions instead of forcing them on', async () => {
      routeFetch({
        creator: {
          creator_username: 'brand',
          privacy_level_options: ['SELF_ONLY'],
          comment_disabled: true,
          duet_disabled: true,
          stitch_disabled: false,
        },
      });

      await makeService({ TIKTOK_DIRECT_POST_ENABLED: 'true' }).publish(
        { body: 'x', mediaUrls: ['https://cdn.example.com/a.mp4'] },
        account,
      );

      expect(bodyOf('/init/').post_info).toMatchObject({
        privacy_level: 'SELF_ONLY',
        disable_comment: true,
        disable_duet: true,
        disable_stitch: false,
      });
    });

    it('splits a large video into chunks and covers every byte', async () => {
      const size = 155 * 1024 * 1024; // 15 chunks of 10 MB, remainder in the last
      routeFetch({ videoBytes: size });

      await makeService().publish(
        { body: 'x', mediaUrls: ['https://cdn.example.com/big.mp4'] },
        account,
      );

      const init = bodyOf('/init/');
      expect(init.source_info.total_chunk_count).toBe(15);

      const puts = calls.filter((c) => c.url.startsWith('https://upload.tiktok'));
      expect(puts).toHaveLength(15);
      expect(puts[0]!.init.headers['Content-Range']).toBe(`bytes 0-10485759/${size}`);
      expect(puts[14]!.init.headers['Content-Range']).toBe(
        `bytes 146800640-${size - 1}/${size}`,
      );
    });

    it('refuses a video larger than the in-memory upload limit', async () => {
      routeFetch({ videoBytes: TikTokPublishService.MAX_VIDEO_BYTES + 1 });

      await expect(
        makeService().publish({ body: 'x', mediaUrls: ['https://cdn/huge.mp4'] }, account),
      ).rejects.toThrow(/too large/i);
    });

    it('picks the MIME type from the file extension', async () => {
      routeFetch({});
      await makeService().publish(
        { body: 'x', mediaUrls: ['https://cdn.example.com/a.mov'] },
        account,
      );
      const put = calls.find((c) => c.url.startsWith('https://upload.tiktok'))!;
      expect(put.init.headers['Content-Type']).toBe('video/quicktime');
    });
  });

  it('publishes a draft even when creator_info would reject the token', async () => {
    // Exactly the production failure: five sandbox scopes, no video.publish, so
    // creator_info answers HTTP 401. The draft path must never touch it.
    global.fetch = jest.fn(async (url: string, init: any = {}) => {
      calls.push({ url, init });
      if (url.includes('creator_info/query')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      if (url.includes('/init/')) return envelope({ publish_id: 'pub9', upload_url: 'https://upload.tiktok/9' });
      if (url.includes('status/fetch')) return envelope({ status: 'SEND_TO_USER_INBOX' });
      if (url.startsWith('https://upload.tiktok')) return { ok: true, status: 201, text: async () => '' };
      return {
        ok: true,
        status: 200,
        headers: { get: () => '1024' },
        arrayBuffer: async () => new ArrayBuffer(1024),
      };
    }) as unknown as typeof fetch;

    const result = await makeService().publish(
      { body: 'caption', mediaUrls: ['https://cdn.example.com/a.mp4'] },
      account,
    );

    expect(result).toEqual({ postId: 'pub9', postUrl: '', draft: true });
    expect(calls.some((c) => c.url.includes('creator_info/query'))).toBe(false);
  });

  describe('photos', () => {
    it('sends the images as PULL_FROM_URL with a cover index', async () => {
      routeFetch({ initData: { publish_id: 'pub2' } });

      const result = await makeService({ TIKTOK_DIRECT_POST_ENABLED: 'true' }).publish(
        {
          title: 'Launch',
          body: 'Copy ![a](https://cdn.example.com/1.jpg) ![b](https://cdn.example.com/2.jpg)',
        },
        account,
      );

      const body = bodyOf('/content/init/');
      expect(body.media_type).toBe('PHOTO');
      expect(body.post_mode).toBe('DIRECT_POST');
      expect(body.source_info).toMatchObject({
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      });
      expect(body.post_info.title).toBe('Launch');
      expect(result.postId).toBe('777');
      expect(result.draft).toBe(false);
    });

    it('uses MEDIA_UPLOAD when direct post is disabled', async () => {
      routeFetch({ initData: { publish_id: 'pub2' }, statuses: [{ status: 'SEND_TO_USER_INBOX' }] });

      const result = await makeService().publish(
        { body: '![a](https://cdn.example.com/1.jpg)' },
        account,
      );

      expect(bodyOf('/content/init/').post_mode).toBe('MEDIA_UPLOAD');
      expect(result.draft).toBe(true);
      expect(result.postUrl).toBe('');
    });

    it('rejects non-HTTPS images, which TikTok cannot pull', async () => {
      routeFetch({ initData: { publish_id: 'pub2' } });

      await expect(
        makeService().publish({ body: '', mediaUrls: ['http://insecure.example.com/1.jpg'] }, account),
      ).rejects.toThrow(/HTTPS image URLs/i);
    });

    it('caps the carousel at TikTok\'s 35-image limit', async () => {
      routeFetch({ initData: { publish_id: 'pub2' } });
      const mediaUrls = Array.from({ length: 40 }, (_, i) => `https://cdn.example.com/${i}.jpg`);

      await makeService().publish({ body: '', mediaUrls }, account);

      expect(bodyOf('/content/init/').source_info.photo_images).toHaveLength(35);
    });
  });

  describe('status polling', () => {
    it('keeps polling past a non-terminal status', async () => {
      routeFetch({
        statuses: [
          { status: 'PROCESSING_UPLOAD' },
          { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['888'] },
        ],
      });

      const result = await makeService({ TIKTOK_DIRECT_POST_ENABLED: 'true' }).publish(
        { body: 'x', mediaUrls: ['https://cdn.example.com/a.mp4'] },
        account,
      );

      expect(calls.filter((c) => c.url.includes('status/fetch')).length).toBeGreaterThanOrEqual(2);
      expect(result.postId).toBe('888');
    }, 15000);

    it('throws with TikTok\'s fail reason on FAILED', async () => {
      routeFetch({ statuses: [{ status: 'FAILED', fail_reason: 'file_format_check_failed' }] });

      await expect(
        makeService().publish({ body: 'x', mediaUrls: ['https://cdn.example.com/a.mp4'] }, account),
      ).rejects.toMatchObject({ code: 'file_format_check_failed' });
    });

    it('propagates a TikTok error from init', async () => {
      global.fetch = jest.fn(async (url: string) => {
        if (url.includes('creator_info/query')) {
          return envelope({ privacy_level_options: ['PUBLIC_TO_EVERYONE'] });
        }
        if (url.includes('/init/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ error: { code: 'spam_risk_too_many_posts', message: 'slow down' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => '1024' },
          arrayBuffer: async () => new ArrayBuffer(1024),
        };
      }) as unknown as typeof fetch;

      await expect(
        makeService().publish({ body: 'x', mediaUrls: ['https://cdn/a.mp4'] }, account),
      ).rejects.toBeInstanceOf(TikTokApiError);
    });
  });

  it('asks the token service for a valid token before doing anything else', async () => {
    routeFetch({});
    await makeService().publish({ body: 'x', mediaUrls: ['https://cdn/a.mp4'] }, account);
    expect(tokenService.getValidAccessToken).toHaveBeenCalledWith(account);
  });
});
