import {
  chunkRanges,
  DEFAULT_CHUNK_SIZE,
  fetchPublishStatus,
  fetchTikTokUser,
  initPhotoPost,
  initVideoUpload,
  parseTikTokEnvelope,
  planVideoChunks,
  queryCreatorInfo,
  SINGLE_CHUNK_LIMIT,
  TikTokApiError,
  TikTokAuthError,
  uploadVideoChunk,
} from './tiktok-api.util';

describe('tiktok-api.util', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /** Run fn and return whatever it threw (or null), so the error can be inspected. */
  function thrownBy(fn: () => unknown): any {
    try {
      fn();
      return null;
    } catch (e) {
      return e;
    }
  }

  /** Mock fetch returning a successful TikTok envelope; records every call. */
  function mockEnvelope(data: unknown) {
    const calls: Array<{ url: string; init: any }> = [];
    global.fetch = jest.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ data, error: { code: 'ok' } }) };
    }) as unknown as typeof fetch;
    return calls;
  }

  describe('parseTikTokEnvelope', () => {
    it('returns data when error.code is ok', () => {
      const data = parseTikTokEnvelope<{ publish_id: string }>(
        { data: { publish_id: 'p1' }, error: { code: 'ok' } },
        'test',
      );
      expect(data.publish_id).toBe('p1');
    });

    it('treats a missing error block as success', () => {
      expect(parseTikTokEnvelope<{ a: number }>({ data: { a: 1 } }, 'test').a).toBe(1);
    });

    it('throws TikTokApiError preserving the code for a content-level rejection', () => {
      expect(() =>
        parseTikTokEnvelope(
          { error: { code: 'url_ownership_unverified', message: 'verify it', log_id: 'L1' } },
          'content/init',
        ),
      ).toThrow(TikTokApiError);

      const err = thrownBy(() =>
        parseTikTokEnvelope({ error: { code: 'spam_risk_too_many_posts' } }, 'video/init'),
      );
      expect(err).toBeInstanceOf(TikTokApiError);
      expect(err).not.toBeInstanceOf(TikTokAuthError);
      expect(err.code).toBe('spam_risk_too_many_posts');
    });

    it('throws TikTokAuthError for token failures so callers can flip REAUTH_REQUIRED', () => {
      for (const code of ['access_token_invalid', 'scope_not_authorized']) {
        const err = thrownBy(() => parseTikTokEnvelope({ error: { code } }, 'user/info'));
        expect(err).toBeInstanceOf(TikTokAuthError);
        expect(err.code).toBe(code);
      }
    });
  });

  describe('fetchTikTokUser', () => {
    it('requests the documented fields and maps snake_case to camelCase', async () => {
      const calls = mockEnvelope({
        user: {
          open_id: 'oid1',
          username: 'brand',
          display_name: 'Brand',
          avatar_url: 'https://cdn/a.jpg',
          follower_count: 120,
          following_count: 7,
          likes_count: 900,
          video_count: 12,
        },
      });

      const user = await fetchTikTokUser('tok');

      const fields = new URL(calls[0].url).searchParams.get('fields') ?? '';
      expect(fields).toContain('open_id');
      expect(fields).toContain('follower_count');
      expect(calls[0].init.headers.Authorization).toBe('Bearer tok');
      expect(user).toMatchObject({
        openId: 'oid1',
        username: 'brand',
        followerCount: 120,
        videoCount: 12,
      });
    });

    it('maps HTTP 401 to TikTokAuthError', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      await expect(fetchTikTokUser('tok')).rejects.toBeInstanceOf(TikTokAuthError);
    });
  });

  describe('queryCreatorInfo', () => {
    it('maps privacy options and interaction flags', async () => {
      const calls = mockEnvelope({
        creator_nickname: 'Brand',
        creator_username: 'brand',
        privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
        comment_disabled: true,
        duet_disabled: false,
        stitch_disabled: true,
        max_video_post_duration_sec: 600,
      });

      const info = await queryCreatorInfo('tok');

      expect(calls[0].url).toContain('/v2/post/publish/creator_info/query/');
      expect(info).toEqual({
        nickname: 'Brand',
        username: 'brand',
        privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
        commentDisabled: true,
        duetDisabled: false,
        stitchDisabled: true,
        maxVideoPostDurationSec: 600,
      });
    });

    it('defaults privacyLevelOptions to an empty array when absent', async () => {
      mockEnvelope({});
      await expect(queryCreatorInfo('tok')).resolves.toMatchObject({ privacyLevelOptions: [] });
    });
  });

  describe('initVideoUpload', () => {
    it('sends FILE_UPLOAD source info and post_info for a direct post', async () => {
      const calls = mockEnvelope({ publish_id: 'p1', upload_url: 'https://upload/1' });

      const result = await initVideoUpload('tok', {
        videoSize: 1000,
        chunkSize: 1000,
        totalChunkCount: 1,
        postInfo: { title: 'hello', privacyLevel: 'PUBLIC_TO_EVERYONE', disableDuet: true },
      });

      expect(calls[0].url).toContain('/v2/post/publish/video/init/');
      const body = JSON.parse(calls[0].init.body);
      expect(body.source_info).toEqual({
        source: 'FILE_UPLOAD',
        video_size: 1000,
        chunk_size: 1000,
        total_chunk_count: 1,
      });
      expect(body.post_info).toMatchObject({
        title: 'hello',
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: true,
        disable_comment: false,
      });
      expect(result).toEqual({ publishId: 'p1', uploadUrl: 'https://upload/1' });
    });

    it('uses the inbox endpoint and omits post_info when no postInfo is given', async () => {
      const calls = mockEnvelope({ publish_id: 'p2', upload_url: 'https://upload/2' });

      await initVideoUpload('tok', { videoSize: 10, chunkSize: 10, totalChunkCount: 1 });

      expect(calls[0].url).toContain('/v2/post/publish/inbox/video/init/');
      expect(JSON.parse(calls[0].init.body).post_info).toBeUndefined();
    });
  });

  describe('initPhotoPost', () => {
    it('sends PHOTO + PULL_FROM_URL with the cover index', async () => {
      const calls = mockEnvelope({ publish_id: 'p3' });

      const result = await initPhotoPost('tok', {
        photoUrls: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
        coverIndex: 1,
        postMode: 'DIRECT_POST',
        postInfo: { title: 'T', description: 'D', privacyLevel: 'SELF_ONLY' },
      });

      expect(calls[0].url).toContain('/v2/post/publish/content/init/');
      const body = JSON.parse(calls[0].init.body);
      expect(body.media_type).toBe('PHOTO');
      expect(body.post_mode).toBe('DIRECT_POST');
      expect(body.source_info).toEqual({
        source: 'PULL_FROM_URL',
        photo_cover_index: 1,
        photo_images: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
      });
      expect(body.post_info).toMatchObject({ title: 'T', description: 'D', privacy_level: 'SELF_ONLY' });
      expect(result).toEqual({ publishId: 'p3' });
    });

    it('omits privacy_level in MEDIA_UPLOAD mode (TikTok rejects it for drafts)', async () => {
      const calls = mockEnvelope({ publish_id: 'p4' });

      await initPhotoPost('tok', {
        photoUrls: ['https://cdn/1.jpg'],
        postMode: 'MEDIA_UPLOAD',
        postInfo: { title: 'T', privacyLevel: 'PUBLIC_TO_EVERYONE' },
      });

      const body = JSON.parse(calls[0].init.body);
      expect(body.post_mode).toBe('MEDIA_UPLOAD');
      expect(body.post_info.privacy_level).toBeUndefined();
    });
  });

  describe('fetchPublishStatus', () => {
    it('maps status, fail reason and both spellings of the post id field', async () => {
      mockEnvelope({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [777] });
      await expect(fetchPublishStatus('tok', 'p1')).resolves.toEqual({
        status: 'PUBLISH_COMPLETE',
        failReason: undefined,
        postIds: ['777'],
      });

      mockEnvelope({ status: 'FAILED', fail_reason: 'file_format_check_failed' });
      await expect(fetchPublishStatus('tok', 'p1')).resolves.toMatchObject({
        status: 'FAILED',
        failReason: 'file_format_check_failed',
        postIds: [],
      });
    });
  });

  describe('planVideoChunks', () => {
    it('uses a single chunk at or below the 64 MB limit', () => {
      expect(planVideoChunks(10 * 1024 * 1024)).toEqual({
        chunkSize: 10 * 1024 * 1024,
        totalChunkCount: 1,
      });
      expect(planVideoChunks(SINGLE_CHUNK_LIMIT)).toEqual({
        chunkSize: SINGLE_CHUNK_LIMIT,
        totalChunkCount: 1,
      });
    });

    it('rounds the chunk count DOWN above the limit so the last chunk absorbs the remainder', () => {
      // 150 MB / 10 MB = 15 exactly
      expect(planVideoChunks(150 * 1024 * 1024)).toEqual({
        chunkSize: DEFAULT_CHUNK_SIZE,
        totalChunkCount: 15,
      });
      // 155 MB → 15 chunks, not 16: the extra 5 MB rides along in the final chunk
      expect(planVideoChunks(155 * 1024 * 1024).totalChunkCount).toBe(15);
    });

    it('rejects an empty file', () => {
      expect(() => planVideoChunks(0)).toThrow(TikTokApiError);
    });
  });

  describe('chunkRanges', () => {
    it('produces contiguous inclusive ranges covering the whole file', () => {
      const size = 155 * 1024 * 1024;
      const plan = planVideoChunks(size);
      const ranges = chunkRanges(size, plan);

      expect(ranges).toHaveLength(plan.totalChunkCount);
      expect(ranges[0].start).toBe(0);
      expect(ranges[ranges.length - 1].end).toBe(size - 1);
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].start).toBe(ranges[i - 1].end + 1);
      }
      // The final chunk carries the 5 MB remainder on top of a full chunk.
      const last = ranges[ranges.length - 1];
      expect(last.end - last.start + 1).toBe(DEFAULT_CHUNK_SIZE + 5 * 1024 * 1024);
    });

    it('handles the single-chunk case', () => {
      expect(chunkRanges(500, { chunkSize: 500, totalChunkCount: 1 })).toEqual([
        { index: 0, start: 0, end: 499 },
      ]);
    });
  });

  describe('uploadVideoChunk', () => {
    it('sends an inclusive Content-Range against the total size', async () => {
      const calls: any[] = [];
      global.fetch = jest.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        return { ok: true, status: 201, text: async () => '' };
      }) as unknown as typeof fetch;

      await uploadVideoChunk(
        'https://upload/1',
        Buffer.alloc(100),
        { index: 0, start: 0, end: 99 },
        250,
      );

      expect(calls[0].init.method).toBe('PUT');
      expect(calls[0].init.headers['Content-Range']).toBe('bytes 0-99/250');
      expect(calls[0].init.headers['Content-Length']).toBe('100');
    });

    it('throws TikTokApiError when the upload is rejected', async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'boom',
      })) as unknown as typeof fetch;

      await expect(
        uploadVideoChunk('https://upload/1', Buffer.alloc(10), { index: 0, start: 0, end: 9 }, 10),
      ).rejects.toBeInstanceOf(TikTokApiError);
    });
  });
});
