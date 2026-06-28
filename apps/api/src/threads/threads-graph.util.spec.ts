import {
  fetchThreadsAccountInsightsRange,
  ThreadsAuthError,
} from './threads-graph.util';

describe('threads-graph.util', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('fetchThreadsAccountInsightsRange', () => {
    it('chunks a 90-day window into <=30-day requests and maps values[] to per-day rows', async () => {
      const calls: string[] = [];
      global.fetch = jest.fn(async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                name: 'views',
                period: 'day',
                values: [
                  { value: 100, end_time: '2026-06-01T07:00:00+0000' },
                  { value: 200, end_time: '2026-06-02T07:00:00+0000' },
                ],
              },
              {
                name: 'likes',
                period: 'day',
                values: [
                  { value: 10, end_time: '2026-06-01T07:00:00+0000' },
                  { value: 20, end_time: '2026-06-02T07:00:00+0000' },
                ],
              },
            ],
          }),
        };
      }) as unknown as typeof fetch;

      const until = Math.floor(Date.UTC(2026, 8, 1) / 1000); // Sep 1 2026
      const since = until - 90 * 86400;
      const rows = await fetchThreadsAccountInsightsRange('tid1', 'tok', since, until);

      // 90d / 30d-chunks → at least 3 requests
      expect(calls.length).toBeGreaterThanOrEqual(3);
      // Time-series form: no total_value in any URL
      expect(calls.every((u) => !u.includes('total_value'))).toBe(true);
      // Uses the threads_insights endpoint (not generic 'insights')
      expect(calls.every((u) => u.includes('threads_insights'))).toBe(true);
      // Metric param includes engagement metrics
      expect(calls.every((u) => new URL(u).searchParams.get('metric')?.includes('views'))).toBe(true);
      // Per-day mapping
      const d1 = rows.find((r) => r.date === '2026-06-01');
      expect(d1).toMatchObject({ views: 100, likes: 10 });
      const d2 = rows.find((r) => r.date === '2026-06-02');
      expect(d2).toMatchObject({ views: 200, likes: 20 });
    });

    it('returns rows sorted by date', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              name: 'views',
              period: 'day',
              values: [
                { value: 50, end_time: '2026-07-10T07:00:00+0000' },
                { value: 30, end_time: '2026-07-08T07:00:00+0000' },
              ],
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 6, 1) / 1000);
      const until = since + 30 * 86400;
      const rows = await fetchThreadsAccountInsightsRange('tid1', 'tok', since, until);

      const dates = rows.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
    });

    it('throws ThreadsAuthError on 401 and propagates it', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '',
      }) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 5, 1) / 1000);
      const until = since + 86400;
      await expect(
        fetchThreadsAccountInsightsRange('tid1', 'tok', since, until),
      ).rejects.toBeInstanceOf(ThreadsAuthError);
    });

    it('skips a non-auth failing chunk and continues', async () => {
      let callCount = 0;
      global.fetch = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // First chunk fails with a non-auth error
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
                name: 'views',
                period: 'day',
                values: [{ value: 42, end_time: '2026-07-31T07:00:00+0000' }],
              },
            ],
          }),
        };
      }) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 5, 1) / 1000); // Jun 1
      const until = since + 60 * 86400; // 60 days → exactly 2 chunks of 30d
      const rows = await fetchThreadsAccountInsightsRange('tid1', 'tok', since, until);

      expect(callCount).toBe(2);
      expect(rows.find((r) => r.date === '2026-07-31')).toBeDefined();
    });

    it('maps all five engagement metrics (views, likes, replies, reposts, quotes)', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { name: 'views', values: [{ value: 500, end_time: '2026-06-15T07:00:00+0000' }] },
            { name: 'likes', values: [{ value: 40, end_time: '2026-06-15T07:00:00+0000' }] },
            { name: 'replies', values: [{ value: 10, end_time: '2026-06-15T07:00:00+0000' }] },
            { name: 'reposts', values: [{ value: 5, end_time: '2026-06-15T07:00:00+0000' }] },
            { name: 'quotes', values: [{ value: 2, end_time: '2026-06-15T07:00:00+0000' }] },
          ],
        }),
      })) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 5, 1) / 1000);
      const until = since + 30 * 86400;
      const rows = await fetchThreadsAccountInsightsRange('tid1', 'tok', since, until);

      expect(rows.find((r) => r.date === '2026-06-15')).toMatchObject({
        views: 500,
        likes: 40,
        replies: 10,
        reposts: 5,
        quotes: 2,
      });
    });

    it('does not include followers_count in the metric request URL', async () => {
      const calls: string[] = [];
      global.fetch = jest.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ data: [] }) };
      }) as unknown as typeof fetch;

      const since = Math.floor(Date.UTC(2026, 5, 1) / 1000);
      const until = since + 86400;
      await fetchThreadsAccountInsightsRange('tid1', 'tok', since, until);

      expect(calls.length).toBeGreaterThan(0);
      const metric = new URL(calls[0]).searchParams.get('metric') ?? '';
      expect(metric).not.toContain('followers_count');
    });
  });
});
