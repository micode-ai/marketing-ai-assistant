import {
  fetchAccountProfile,
  fetchAccountInsights,
  fetchMediaList,
  fetchMediaInsights,
} from './instagram-graph.util';

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function notOk(status = 400): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => 'error',
  } as unknown as Response;
}

/** Extract the comma-separated `metric` query param from a fetch URL. */
function metricOf(url: string): string {
  return new URL(url).searchParams.get('metric') ?? '';
}

describe('instagram-graph.util', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('fetchAccountProfile', () => {
    it('maps followers_count and media_count', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(okJson({ followers_count: 1234, media_count: 56 }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchAccountProfile('IG123', 'tok');

      expect(result).toEqual({ followersCount: 1234, mediaCount: 56 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('https://graph.instagram.com/IG123?');
      expect(url).toContain('fields=followers_count%2Cmedia_count');
      expect(url).toContain('access_token=tok');
    });

    it('returns {} on a non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue(notOk(404)) as unknown as typeof fetch;
      const result = await fetchAccountProfile('IG123', 'tok');
      expect(result).toEqual({});
    });
  });

  describe('fetchAccountInsights', () => {
    it('parses total_value.value for each metric in the batch', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        okJson({
          data: [
            { name: 'reach', total_value: { value: 100 } },
            { name: 'views', total_value: { value: 200 } },
            { name: 'accounts_engaged', total_value: { value: 30 } },
            { name: 'total_interactions', total_value: { value: 40 } },
          ],
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchAccountInsights('IG123', 'tok');

      expect(result).toEqual({
        reach: 100,
        views: 200,
        accountsEngaged: 30,
        totalInteractions: 40,
      });
      // Single batched request.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(metricOf(url)).toBe('reach,views,accounts_engaged,total_interactions');
      expect(url).toContain('period=day');
      expect(url).toContain('metric_type=total_value');
    });

    it('tolerates the older values[0].value shape', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        okJson({ data: [{ name: 'reach', values: [{ value: 77 }] }] }),
      ) as unknown as typeof fetch;

      const result = await fetchAccountInsights('IG123', 'tok');
      expect(result.reach).toBe(77);
    });

    it('per-metric tolerance: batch fails, retries individually and skips the failing metric', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const metric = metricOf(url);
        // Batched request (all four) fails.
        if (metric.includes(',')) return Promise.resolve(notOk(400));
        // `views` keeps failing individually; the rest succeed.
        if (metric === 'views') return Promise.resolve(notOk(400));
        return Promise.resolve(
          okJson({ data: [{ name: metric, total_value: { value: 5 } }] }),
        );
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchAccountInsights('IG123', 'tok');

      // views omitted; the other three present.
      expect(result).toEqual({ reach: 5, accountsEngaged: 5, totalInteractions: 5 });
      expect(result).not.toHaveProperty('views');

      // Assert the individual retry URLs were called: 1 batch + 4 individual.
      expect(fetchMock).toHaveBeenCalledTimes(5);
      const calledMetrics = fetchMock.mock.calls.map((c) => metricOf(c[0] as string));
      expect(calledMetrics).toEqual([
        'reach,views,accounts_engaged,total_interactions',
        'reach',
        'views',
        'accounts_engaged',
        'total_interactions',
      ]);
    });

    it('returns {} when every metric fails', async () => {
      global.fetch = jest.fn().mockResolvedValue(notOk(400)) as unknown as typeof fetch;
      const result = await fetchAccountInsights('IG123', 'tok');
      expect(result).toEqual({});
    });
  });

  describe('fetchMediaList', () => {
    it('maps snake_case fields to MediaItem[]', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        okJson({
          data: [
            {
              id: 'm1',
              caption: 'hello',
              media_type: 'IMAGE',
              media_product_type: 'FEED',
              permalink: 'https://insta/p/1',
              timestamp: '2026-06-01T10:00:00+0000',
              like_count: 10,
              comments_count: 2,
            },
          ],
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchMediaList('IG123', 'tok', 5);

      expect(result).toEqual([
        {
          id: 'm1',
          caption: 'hello',
          mediaType: 'IMAGE',
          mediaProductType: 'FEED',
          permalink: 'https://insta/p/1',
          timestamp: '2026-06-01T10:00:00+0000',
          likeCount: 10,
          commentsCount: 2,
        },
      ]);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('https://graph.instagram.com/IG123/media?');
      expect(url).toContain('limit=5');
    });

    it('defaults limit to 25 and returns [] on non-ok', async () => {
      const okMock = jest.fn().mockResolvedValue(okJson({ data: [] }));
      global.fetch = okMock as unknown as typeof fetch;
      await fetchMediaList('IG123', 'tok');
      expect(okMock.mock.calls[0][0]).toContain('limit=25');

      global.fetch = jest.fn().mockResolvedValue(notOk(500)) as unknown as typeof fetch;
      const result = await fetchMediaList('IG123', 'tok');
      expect(result).toEqual([]);
    });
  });

  describe('fetchMediaInsights', () => {
    it('parses metrics and tolerates a failing one', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const metric = metricOf(url);
        if (metric.includes(',')) return Promise.resolve(notOk(400));
        if (metric === 'shares') return Promise.resolve(notOk(400));
        return Promise.resolve(
          okJson({ data: [{ name: metric, total_value: { value: 9 } }] }),
        );
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchMediaInsights('MEDIA1', 'tok');

      expect(result).toEqual({ reach: 9, saved: 9, views: 9 });
      expect(result).not.toHaveProperty('shares');
      const calledMetrics = fetchMock.mock.calls.map((c) => metricOf(c[0] as string));
      expect(calledMetrics).toEqual(['reach,saved,shares,views', 'reach', 'saved', 'shares', 'views']);
    });
  });
});
