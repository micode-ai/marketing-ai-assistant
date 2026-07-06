import {
  fetchAccountProfile,
  fetchAccountInsights,
  fetchAccountInsightsTotals,
  fetchAccountInsightsRange,
  fetchMediaList,
  fetchMediaInsights,
  fetchStoriesList,
  fetchStoryInsights,
  InstagramAuthError,
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

/** HTTP 401 — no body needed. */
function unauthorized(): Response {
  return {
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}

/** 200-ok=false with a Graph OAuthException body (token revoked/expired). */
function oauthErrorBody(status = 400): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code: 190, type: 'OAuthException' } }),
    text: async () => JSON.stringify({ error: { code: 190, type: 'OAuthException' } }),
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
    it('parses metrics and tolerates a failing one (REELS requests views)', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const metric = metricOf(url);
        if (metric.includes(',')) return Promise.resolve(notOk(400));
        if (metric === 'shares') return Promise.resolve(notOk(400));
        return Promise.resolve(
          okJson({ data: [{ name: metric, total_value: { value: 9 } }] }),
        );
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchMediaInsights('MEDIA1', 'tok', 'REELS');

      expect(result).toEqual({ reach: 9, saved: 9, views: 9 });
      expect(result).not.toHaveProperty('shares');
      const calledMetrics = fetchMock.mock.calls.map((c) => metricOf(c[0] as string));
      expect(calledMetrics).toEqual(['reach,saved,shares,views', 'reach', 'saved', 'shares', 'views']);
    });

    it('omits views/shares-only-video metrics for IMAGE (requests reach,saved,shares)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        okJson({
          data: [
            { name: 'reach', total_value: { value: 10 } },
            { name: 'saved', total_value: { value: 2 } },
            { name: 'shares', total_value: { value: 1 } },
          ],
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchMediaInsights('MEDIA1', 'tok', 'IMAGE');

      expect(result).toEqual({ reach: 10, saved: 2, shares: 1 });
      // Single batched request; `views` is never requested for IMAGE.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(metricOf(fetchMock.mock.calls[0][0] as string)).toBe('reach,saved,shares');
    });

    it('requests reach,saved,shares for CAROUSEL_ALBUM (no views)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okJson({ data: [] }));
      global.fetch = fetchMock as unknown as typeof fetch;

      await fetchMediaInsights('MEDIA1', 'tok', 'CAROUSEL_ALBUM');

      expect(metricOf(fetchMock.mock.calls[0][0] as string)).toBe('reach,saved,shares');
    });
  });

  describe('fetchAccountInsightsRange', () => {
    it('chunks a 90-day window into <=30-day requests and maps values[] to per-day rows', async () => {
      const calls: string[] = [];
      global.fetch = (jest.fn(async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                name: 'reach',
                period: 'day',
                values: [
                  { value: 10, end_time: '2026-06-01T07:00:00+0000' },
                  { value: 20, end_time: '2026-06-02T07:00:00+0000' },
                ],
              },
              {
                name: 'views',
                period: 'day',
                values: [
                  { value: 100, end_time: '2026-06-01T07:00:00+0000' },
                  { value: 200, end_time: '2026-06-02T07:00:00+0000' },
                ],
              },
            ],
          }),
        };
      }) as unknown as typeof fetch);

      const until = Math.floor(Date.UTC(2026, 8, 1) / 1000); // Sep 1 2026
      const since = until - 90 * 86400;
      const rows = await fetchAccountInsightsRange('ig1', 'tok', since, until);

      expect(calls.length).toBeGreaterThanOrEqual(3); // 90d / 30d -> >=3 chunks
      expect(calls.every((u) => !u.includes('total_value'))).toBe(true); // time-series form
      const d1 = rows.find((r) => r.date === '2026-06-01');
      expect(d1).toMatchObject({ reach: 10, views: 100 });
    });

    it('returns rows sorted by date', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              name: 'reach',
              period: 'day',
              values: [
                { value: 5, end_time: '2026-07-10T07:00:00+0000' },
                { value: 3, end_time: '2026-07-08T07:00:00+0000' },
              ],
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 6, 1) / 1000);
      const until = since + 30 * 86400;
      const rows = await fetchAccountInsightsRange('ig1', 'tok', since, until);

      const dates = rows.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
    });

    it('throws InstagramAuthError on 401 and propagates it', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '',
      }) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 5, 1) / 1000);
      const until = since + 86400;
      await expect(
        fetchAccountInsightsRange('ig1', 'tok', since, until),
      ).rejects.toBeInstanceOf(InstagramAuthError);
    });

    it('skips a non-auth failing chunk and continues', async () => {
      let callCount = 0;
      global.fetch = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // First chunk fails with non-auth error
          return {
            ok: false,
            status: 500,
            text: async () => 'server error',
          };
        }
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                name: 'reach',
                period: 'day',
                values: [{ value: 42, end_time: '2026-07-31T07:00:00+0000' }],
              },
            ],
          }),
        };
      }) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 5, 1) / 1000); // Jun 1
      const until = since + 60 * 86400; // 60 days → exactly 2 chunks of 30d
      const rows = await fetchAccountInsightsRange('ig1', 'tok', since, until);

      expect(callCount).toBe(2);
      expect(rows.find((r) => r.date === '2026-07-31')).toBeDefined();
    });
  });

  describe('fetchAccountInsightsTotals', () => {
    it('reads metric_type=total_value over the range into per-metric totals', async () => {
      global.fetch = (jest.fn(async (_url: string) => ({
        ok: true,
        json: async () => ({
          data: [
            { name: 'views', total_value: { value: 5000 } },
            { name: 'reach', total_value: { value: 800 } },
          ],
        }),
      })) as unknown as typeof fetch);
      const t = await fetchAccountInsightsTotals('ig1', 'tok', 1, 2);
      expect(t.views).toBe(5000);
      expect(t.reach).toBe(800);
    });

    it('passes since/until as query params with metric_type=total_value', async () => {
      const calls: string[] = [];
      global.fetch = (jest.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ data: [] }) };
      }) as unknown as typeof fetch);

      await fetchAccountInsightsTotals('ig1', 'tok', 1000, 2000);

      expect(calls.length).toBeGreaterThan(0);
      const url = calls[0];
      expect(url).toContain('since=1000');
      expect(url).toContain('until=2000');
      expect(url).toContain('metric_type=total_value');
      expect(url).toContain('period=day');
      expect(url).toContain('metric=reach');
    });

    it('throws InstagramAuthError on 401', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '',
      }) as unknown as typeof fetch;
      await expect(
        fetchAccountInsightsTotals('ig1', 'tok', 1, 2),
      ).rejects.toBeInstanceOf(InstagramAuthError);
    });

    it('tolerates a per-metric failure and returns partial results', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const metric = metricOf(url);
        if (metric.includes(',')) return Promise.resolve(notOk(400));
        if (metric === 'views') return Promise.resolve(notOk(400));
        return Promise.resolve(
          okJson({ data: [{ name: metric, total_value: { value: 1 } }] }),
        );
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchAccountInsightsTotals('ig1', 'tok', 1, 2);
      expect(result.views).toBeUndefined();
      expect(result.reach).toBe(1);
    });
  });

  describe('auth-error propagation', () => {
    it('fetchAccountProfile throws InstagramAuthError on HTTP 401', async () => {
      global.fetch = jest.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch;
      await expect(fetchAccountProfile('IG123', 'tok')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });

    it('fetchAccountProfile throws on a Graph OAuthException body (code 190)', async () => {
      global.fetch = jest.fn().mockResolvedValue(oauthErrorBody(400)) as unknown as typeof fetch;
      await expect(fetchAccountProfile('IG123', 'tok')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });

    it('fetchAccountProfile still returns {} for a non-auth 400 (tolerance preserved)', async () => {
      global.fetch = jest.fn().mockResolvedValue(notOk(400)) as unknown as typeof fetch;
      await expect(fetchAccountProfile('IG123', 'tok')).resolves.toEqual({});
    });

    it('fetchAccountInsights throws InstagramAuthError on 401 (not swallowed by tolerance)', async () => {
      global.fetch = jest.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch;
      await expect(fetchAccountInsights('IG123', 'tok')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });

    it('fetchAccountInsights throws on an OAuthException body during the batched request', async () => {
      global.fetch = jest.fn().mockResolvedValue(oauthErrorBody(400)) as unknown as typeof fetch;
      await expect(fetchAccountInsights('IG123', 'tok')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });

    it('fetchAccountInsights still returns {} when every metric fails non-auth', async () => {
      global.fetch = jest.fn().mockResolvedValue(notOk(400)) as unknown as typeof fetch;
      await expect(fetchAccountInsights('IG123', 'tok')).resolves.toEqual({});
    });

    it('fetchMediaList throws InstagramAuthError on 401', async () => {
      global.fetch = jest.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch;
      await expect(fetchMediaList('IG123', 'tok')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });

    it('fetchMediaInsights throws InstagramAuthError on an OAuthException body', async () => {
      global.fetch = jest.fn().mockResolvedValue(oauthErrorBody(400)) as unknown as typeof fetch;
      await expect(fetchMediaInsights('MEDIA1', 'tok', 'IMAGE')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });
  });

  describe('fetchStoriesList', () => {
    it('maps active stories to StoryItem[]', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        okJson({
          data: [
            {
              id: 's1',
              media_type: 'VIDEO',
              permalink: 'https://insta/stories/1',
              timestamp: '2026-07-05T08:00:00+0000',
              caption: 'promo',
            },
          ],
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchStoriesList('IG123', 'tok');

      expect(result).toEqual([
        {
          id: 's1',
          mediaType: 'VIDEO',
          permalink: 'https://insta/stories/1',
          timestamp: '2026-07-05T08:00:00+0000',
          caption: 'promo',
        },
      ]);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('https://graph.instagram.com/IG123/stories?');
      expect(url).toContain('fields=id%2Cmedia_type%2Cpermalink%2Ctimestamp%2Ccaption');
    });

    it('returns [] on a non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue(notOk(400)) as unknown as typeof fetch;
      expect(await fetchStoriesList('IG123', 'tok')).toEqual([]);
    });

    it('throws InstagramAuthError on 401', async () => {
      global.fetch = jest.fn().mockResolvedValue(unauthorized()) as unknown as typeof fetch;
      await expect(fetchStoriesList('IG123', 'tok')).rejects.toBeInstanceOf(
        InstagramAuthError,
      );
    });
  });

  describe('fetchStoryInsights', () => {
    it('parses flat metrics + navigation breakdown into taps/exits', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const metric = metricOf(url);
        if (metric === 'navigation') {
          return Promise.resolve(
            okJson({
              data: [
                {
                  name: 'navigation',
                  total_value: {
                    value: 68,
                    breakdowns: [
                      {
                        dimension_keys: ['story_navigation_action_type'],
                        results: [
                          { dimension_values: ['tap_forward'], value: 50 },
                          { dimension_values: ['tap_back'], value: 10 },
                          { dimension_values: ['tap_exit'], value: 8 },
                          { dimension_values: ['swipe_forward'], value: 3 },
                        ],
                      },
                    ],
                  },
                },
              ],
            }),
          );
        }
        // Flat metrics batch.
        return Promise.resolve(
          okJson({
            data: [
              { name: 'reach', total_value: { value: 900 } },
              { name: 'views', total_value: { value: 1200 } },
              { name: 'replies', total_value: { value: 4 } },
              { name: 'shares', total_value: { value: 2 } },
              { name: 'total_interactions', total_value: { value: 60 } },
            ],
          }),
        );
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchStoryInsights('STORY1', 'tok');

      expect(result).toEqual({
        reach: 900,
        views: 1200,
        replies: 4,
        shares: 2,
        totalInteractions: 60,
        tapsForward: 50,
        tapsBack: 10,
        exits: 8,
      });
      const navUrl = fetchMock.mock.calls
        .map((c) => c[0] as string)
        .find((u) => metricOf(u) === 'navigation')!;
      expect(navUrl).toContain('breakdown=story_navigation_action_type');
    });

    it('keeps flat metrics when navigation fails (non-auth)', async () => {
      const fetchMock = jest.fn().mockImplementation((url: string) => {
        const metric = metricOf(url);
        if (metric === 'navigation') return Promise.resolve(notOk(400));
        return Promise.resolve(
          okJson({ data: [{ name: 'reach', total_value: { value: 500 } }] }),
        );
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchStoryInsights('STORY1', 'tok');
      expect(result.reach).toBe(500);
      expect(result).not.toHaveProperty('tapsForward');
      expect(result).not.toHaveProperty('exits');
    });
  });
});
