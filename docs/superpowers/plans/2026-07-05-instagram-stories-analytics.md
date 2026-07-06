# Instagram Stories Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Instagram Stories analytics (snapshots of active stories + calendar trends) as a new section inside the existing Instagram analytics dashboard.

**Architecture:** The Meta Graph `/{ig-user-id}/stories` edge returns only currently-active stories (< 24h) — no history exists in the API. We poll it on the **existing** IG sync cron (piggyback, no new cron) and upsert **one row per story** with its latest metric snapshot; since story metrics only grow, the last poll before expiry ≈ final numbers. The API exposes an additive `stories` block on `GET /instagram/metrics`; the web dashboard renders a KPI strip + trend chart + recent-stories table.

**Tech Stack:** Prisma (PostgreSQL), NestJS 10 (apps/api), Jest, SvelteKit 2 + Chart.js (apps/web), svelte-i18n (packages/i18n).

## Global Constraints

- IG Graph base URL is `https://graph.instagram.com` (`GRAPH` const in `instagram-graph.util.ts`); auth via `access_token` query param.
- Auth failures MUST propagate as `InstagramAuthError` (via `throwIfAuthError`); non-auth failures are tolerated (return `[]`/`{}`).
- Prisma IDs are `cuid()` — never `@IsUUID`.
- `apps/api` compiled build must NOT runtime value-import `@marketing-ai/*` (use local code only).
- All new UI copy uses i18n keys with **en/pl/ru parity** (`packages/i18n/src/locales/{en,pl,ru}.json`).
- Run the app's lint before pushing: `corepack pnpm --filter api lint`, `corepack pnpm --filter web lint`.
- Branch off `origin/development`; PR targets `development`; commits/PR/issue text in English. Closes #145.
- Docker services (Postgres 5437) must be up for `db:migrate:dev`.

---

### Task 1: Prisma — `InstagramStory` model + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (SocialAccount relation ~line 936; new model after `InstagramMedia` ~line 1638)

**Interfaces:**
- Produces: `InstagramStory` table with `@@unique([socialAccountId, igStoryId])`; columns `igStoryId, mediaType, permalink?, timestamp, caption?, reach?, views?, replies?, shares?, totalInteractions?, tapsForward?, tapsBack?, exits?, lastSyncedAt`.

- [ ] **Step 1: Add the relation field on `SocialAccount`**

In `model SocialAccount`, after the `instagramMedia` relation line, add:

```prisma
  instagramStories      InstagramStory[]
```

- [ ] **Step 2: Add the `InstagramStory` model**

Immediately after `model InstagramMedia { ... }` (before the `// Threads Analytics` divider), add:

```prisma
model InstagramStory {
  id                String   @id @default(cuid())
  socialAccountId   String
  igStoryId         String
  mediaType         String
  caption           String?  @db.Text
  permalink         String?
  timestamp         DateTime
  reach             Int?
  views             Int?
  replies           Int?
  shares            Int?
  totalInteractions Int?
  tapsForward       Int?
  tapsBack          Int?
  exits             Int?
  lastSyncedAt      DateTime

  socialAccount SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)

  @@unique([socialAccountId, igStoryId])
  @@index([socialAccountId])
  @@map("instagram_stories")
}
```

- [ ] **Step 3: Create the migration (Docker must be up)**

Run:
```bash
cd packages/database && pnpm db:migrate:dev --name instagram_stories
```
Expected: a new folder `packages/database/prisma/migrations/<timestamp>_instagram_stories/migration.sql` creating table `instagram_stories`, and Prisma Client regenerated.

- [ ] **Step 4: Verify client generation**

Run:
```bash
cd D:/Work/micode/marketing-ai-assistant && pnpm db:generate
```
Expected: PASS (no schema errors). `prisma.instagramStory` is now a valid delegate.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(db): InstagramStory model + migration (#145)"
```

---

### Task 2: Graph util — `fetchStoriesList` + `fetchStoryInsights`

**Files:**
- Modify: `apps/api/src/instagram/instagram-graph.util.ts`
- Test: `apps/api/src/instagram/instagram-graph.util.spec.ts`

**Interfaces:**
- Consumes: existing `GRAPH`, `throwIfAuthError`, `fetchInsightsWithTolerance`, `logger`, `InstagramAuthError`.
- Produces:
  - `interface StoryItem { id: string; mediaType: string; permalink?: string; timestamp: string; caption?: string }`
  - `interface StoryInsights { reach?: number; views?: number; replies?: number; shares?: number; totalInteractions?: number; tapsForward?: number; tapsBack?: number; exits?: number }`
  - `fetchStoriesList(igUserId: string, token: string): Promise<StoryItem[]>`
  - `fetchStoryInsights(storyId: string, token: string): Promise<StoryInsights>`

- [ ] **Step 1: Write the failing tests**

Add to `instagram-graph.util.spec.ts`. First extend the import at the top:

```typescript
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
```

Then add these describe blocks before the final closing `});` of the top-level describe:

```typescript
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
      // navigation is requested with the breakdown param.
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd apps/api && pnpm test -- src/instagram/instagram-graph.util.spec.ts
```
Expected: FAIL — `fetchStoriesList`/`fetchStoryInsights` are not exported.

- [ ] **Step 3: Implement the functions**

Append to the end of `apps/api/src/instagram/instagram-graph.util.ts`:

```typescript
export interface StoryItem {
  id: string;
  mediaType: string;
  permalink?: string;
  timestamp: string;
  caption?: string;
}

export interface StoryInsights {
  reach?: number;
  views?: number;
  replies?: number;
  shares?: number;
  totalInteractions?: number;
  tapsForward?: number;
  tapsBack?: number;
  exits?: number;
}

// Flat (non-breakdown) story metric name → StoryInsights key.
const STORY_METRIC_KEYS: Record<string, keyof StoryInsights> = {
  reach: 'reach',
  views: 'views',
  replies: 'replies',
  shares: 'shares',
  total_interactions: 'totalInteractions',
};

/**
 * GET /{ig-user-id}/stories?fields=id,media_type,permalink,timestamp,caption
 * Returns only currently-active stories (< 24h). [] on non-auth failure;
 * auth errors propagate via throwIfAuthError.
 */
export async function fetchStoriesList(
  igUserId: string,
  token: string,
): Promise<StoryItem[]> {
  const params = new URLSearchParams({
    fields: 'id,media_type,permalink,timestamp,caption',
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${igUserId}/stories?${params}`);
  if (!res.ok) {
    const body = await throwIfAuthError(res);
    logger.warn(`fetchStoriesList failed for ${igUserId}: ${res.status} ${body}`);
    return [];
  }
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      media_type: string;
      permalink?: string;
      timestamp: string;
      caption?: string;
    }>;
  };
  return (json.data ?? []).map((s) => {
    const item: StoryItem = { id: s.id, mediaType: s.media_type, timestamp: s.timestamp };
    if (typeof s.permalink === 'string') item.permalink = s.permalink;
    if (typeof s.caption === 'string') item.caption = s.caption;
    return item;
  });
}

/**
 * Story navigation breakdown (taps_forward/back, exits). A single `navigation`
 * metric with a `story_navigation_action_type` breakdown. Non-auth failures are
 * tolerated (return {}) so they never drop the flat metrics; auth propagates.
 */
async function fetchStoryNavigation(
  storyId: string,
  token: string,
): Promise<Pick<StoryInsights, 'tapsForward' | 'tapsBack' | 'exits'>> {
  const params = new URLSearchParams({
    metric: 'navigation',
    breakdown: 'story_navigation_action_type',
    access_token: token,
  });
  const res = await fetch(`${GRAPH}/${storyId}/insights?${params}`);
  if (!res.ok) {
    await throwIfAuthError(res); // auth → throws; non-auth → falls through
    return {};
  }
  const json = (await res.json()) as {
    data?: Array<{
      name: string;
      total_value?: {
        breakdowns?: Array<{
          results?: Array<{ dimension_values?: string[]; value?: number }>;
        }>;
      };
    }>;
  };
  const row = (json.data ?? []).find((r) => r.name === 'navigation');
  const results = row?.total_value?.breakdowns?.[0]?.results ?? [];
  const out: Pick<StoryInsights, 'tapsForward' | 'tapsBack' | 'exits'> = {};
  for (const entry of results) {
    const key = entry.dimension_values?.[0];
    const val = entry.value;
    if (typeof val !== 'number' || !key) continue;
    if (key === 'tap_forward') out.tapsForward = val;
    else if (key === 'tap_back') out.tapsBack = val;
    else if (key === 'tap_exit') out.exits = val;
  }
  return out;
}

/**
 * GET /{story-id}/insights — flat metrics via the shared per-metric tolerance
 * helper + a separate navigation-breakdown call. A navigation failure never
 * loses the flat metrics.
 */
export async function fetchStoryInsights(
  storyId: string,
  token: string,
): Promise<StoryInsights> {
  const flat = await fetchInsightsWithTolerance<StoryInsights>(
    storyId,
    token,
    STORY_METRIC_KEYS,
    {},
  );
  const nav = await fetchStoryNavigation(storyId, token);
  return { ...flat, ...nav };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd apps/api && pnpm test -- src/instagram/instagram-graph.util.spec.ts
```
Expected: PASS (all existing + new tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/instagram/instagram-graph.util.ts apps/api/src/instagram/instagram-graph.util.spec.ts
git commit -m "feat(api): fetch Instagram stories list + insights with navigation breakdown (#145)"
```

---

### Task 3: Sync service — `syncStories` piggybacks `syncAccount`

**Files:**
- Modify: `apps/api/src/instagram/instagram-sync.service.ts`
- Test: `apps/api/src/instagram/instagram-sync.service.spec.ts`

**Interfaces:**
- Consumes: `fetchStoriesList`, `fetchStoryInsights` (Task 2).
- Produces: `SyncAccountResult` gains `storiesSynced: number`; new private `syncStories(igUserId, accessToken, socialAccountId): Promise<number>`.

- [ ] **Step 1: Update the spec mocks and assertions (failing state)**

In `instagram-sync.service.spec.ts`:

(a) Extend the `jest.mock('./instagram-graph.util', ...)` factory and add mock handles:

```typescript
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
```

Add near the other mock handles (after `mockFetchMediaInsights`):

```typescript
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

const mockFetchStoriesList = fetchStoriesList as jest.MockedFunction<
  typeof fetchStoriesList
>;
const mockFetchStoryInsights = fetchStoryInsights as jest.MockedFunction<
  typeof fetchStoryInsights
>;
```

(b) Add `instagramStory` to the prisma mock in `makePrisma()`:

```typescript
    instagramStory: {
      upsert: jest.fn().mockResolvedValue({}),
    },
```

(c) In the top-level `beforeEach` (after `jest.clearAllMocks()` block that resets services), default stories to empty so existing `withMedia` tests don't hit the real fetch. Add inside the outer `describe('InstagramSyncService')` `beforeEach`:

```typescript
    mockFetchStoriesList.mockResolvedValue([]);
    mockFetchStoryInsights.mockResolvedValue({});
```

(d) Update the two existing exact-match assertions to include `storiesSynced`:
- In `'upserts account metrics with mapped values'` (withMedia `false`): change
  `expect(result).toEqual({ accountSynced: true, mediaSynced: 0 });`
  → `expect(result).toEqual({ accountSynced: true, mediaSynced: 0, storiesSynced: 0 });`
- In `'upserts media with computed engagementRate when withMedia'` (withMedia `true`): change
  `expect(result).toEqual({ accountSynced: true, mediaSynced: 1 });`
  → `expect(result).toEqual({ accountSynced: true, mediaSynced: 1, storiesSynced: 0 });`
- In `'skips (zeros) when token payload is missing igUserId'`: change
  `expect(result).toEqual({ accountSynced: false, mediaSynced: 0 });`
  → `expect(result).toEqual({ accountSynced: false, mediaSynced: 0, storiesSynced: 0 });`

(e) Add a new test in the `describe('syncAccount', ...)` block:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd apps/api && pnpm test -- src/instagram/instagram-sync.service.spec.ts
```
Expected: FAIL — `storiesSynced` missing from result; `instagramStory.upsert` never called.

- [ ] **Step 3: Implement `syncStories` and wire it in**

In `instagram-sync.service.ts`:

(a) Extend the import from `./instagram-graph.util` to add `fetchStoriesList, fetchStoryInsights`.

(b) Add `storiesSynced` to the result interface:

```typescript
export interface SyncAccountResult {
  accountSynced: boolean;
  mediaSynced: number;
  storiesSynced: number;
}
```

(c) Update the two early-return zeros in `syncAccount` (decrypt-failure and missing-token branches) to include `storiesSynced: 0`:

```typescript
      return { accountSynced: false, mediaSynced: 0, storiesSynced: 0 };
```
(both occurrences).

(d) Inside `syncAccount`, change the media section to also sync stories. Replace the `let mediaSynced = 0;` block and the closing `return` with:

```typescript
      let mediaSynced = 0;
      let storiesSynced = 0;

      // --- Media metrics ---
      if (withMedia) {
        const mediaList = await fetchMediaList(igUserId, accessToken, 25);
        for (const media of mediaList) {
          const mediaInsights = await fetchMediaInsights(
            media.id,
            accessToken,
            media.mediaProductType || media.mediaType,
          );

          const likeCount = media.likeCount ?? null;
          const commentsCount = media.commentsCount ?? null;
          const reach = mediaInsights.reach ?? null;
          const saved = mediaInsights.saved ?? null;
          const shares = mediaInsights.shares ?? null;
          const views = mediaInsights.views ?? null;
          const engagementRate = this.computeEngagementRate(
            likeCount,
            commentsCount,
            saved,
            reach,
          );

          const mediaData = {
            mediaType: media.mediaType,
            caption: media.caption ?? null,
            permalink: media.permalink ?? null,
            timestamp: new Date(media.timestamp),
            likeCount,
            commentsCount,
            reach,
            saved,
            shares,
            views,
            engagementRate,
            lastSyncedAt: new Date(),
          };

          await this.prisma.instagramMedia.upsert({
            where: {
              socialAccountId_igMediaId: {
                socialAccountId: account.id,
                igMediaId: media.id,
              },
            },
            create: {
              socialAccountId: account.id,
              igMediaId: media.id,
              ...mediaData,
            },
            update: mediaData,
          });
          mediaSynced++;
        }

        // --- Stories (piggyback on the media plan-throttle) ---
        storiesSynced = await this.syncStories(igUserId, accessToken, account.id);
      }

      this.logger.log(
        `Synced IG account ${account.id} (media: ${mediaSynced}, stories: ${storiesSynced})`,
      );
      return { accountSynced: true, mediaSynced, storiesSynced };
```

(e) Add the `syncStories` method (place it right after `syncAccount`, before `backfillAccount`):

```typescript
  /**
   * Fetch currently-active stories (< 24h) and upsert one row per story with the
   * latest metric snapshot. Metrics only grow, so the last poll before a story
   * expires yields near-final numbers. Returns the number of stories upserted.
   */
  private async syncStories(
    igUserId: string,
    accessToken: string,
    socialAccountId: string,
  ): Promise<number> {
    const stories = await fetchStoriesList(igUserId, accessToken);
    let count = 0;
    for (const story of stories) {
      const insights = await fetchStoryInsights(story.id, accessToken);
      const data = {
        mediaType: story.mediaType,
        caption: story.caption ?? null,
        permalink: story.permalink ?? null,
        timestamp: new Date(story.timestamp),
        reach: insights.reach ?? null,
        views: insights.views ?? null,
        replies: insights.replies ?? null,
        shares: insights.shares ?? null,
        totalInteractions: insights.totalInteractions ?? null,
        tapsForward: insights.tapsForward ?? null,
        tapsBack: insights.tapsBack ?? null,
        exits: insights.exits ?? null,
        lastSyncedAt: new Date(),
      };
      await this.prisma.instagramStory.upsert({
        where: {
          socialAccountId_igStoryId: { socialAccountId, igStoryId: story.id },
        },
        create: { socialAccountId, igStoryId: story.id, ...data },
        update: data,
      });
      count++;
    }
    return count;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd apps/api && pnpm test -- src/instagram/instagram-sync.service.spec.ts
```
Expected: PASS (all existing + new tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/instagram/instagram-sync.service.ts apps/api/src/instagram/instagram-sync.service.spec.ts
git commit -m "feat(api): sync active Instagram stories on the IG cron (#145)"
```

---

### Task 4: API — `stories` block on `GET /instagram/metrics`

**Files:**
- Create: `apps/api/src/instagram/stories.util.ts`
- Create: `apps/api/src/instagram/stories.util.spec.ts`
- Modify: `apps/api/src/instagram/instagram.service.ts` (`getMetrics`)

**Interfaces:**
- Produces: `buildStoriesBlock(rows: StoryMetricRow[]): StoriesBlock` and `storyCompletion(reach, exits)`; `getMetrics` return gains `stories: StoriesBlock`.

- [ ] **Step 1: Write the failing tests for the pure helper**

Create `apps/api/src/instagram/stories.util.spec.ts`:

```typescript
import { buildStoriesBlock, storyCompletion, StoryMetricRow } from './stories.util';

function row(overrides: Partial<StoryMetricRow>): StoryMetricRow {
  return {
    igStoryId: 's',
    mediaType: 'VIDEO',
    permalink: null,
    timestamp: new Date('2026-07-05T08:00:00Z'),
    caption: null,
    reach: null,
    views: null,
    replies: null,
    shares: null,
    totalInteractions: null,
    tapsForward: null,
    tapsBack: null,
    exits: null,
    ...overrides,
  };
}

describe('storyCompletion', () => {
  it('is null when reach is null or 0', () => {
    expect(storyCompletion(null, 5)).toBeNull();
    expect(storyCompletion(0, 5)).toBeNull();
  });
  it('treats missing exits as 0 (full completion)', () => {
    expect(storyCompletion(100, null)).toBe(1);
  });
  it('computes 1 - exits/reach', () => {
    expect(storyCompletion(100, 20)).toBeCloseTo(0.8);
  });
  it('clamps to [0,1]', () => {
    expect(storyCompletion(100, 150)).toBe(0);
  });
});

describe('buildStoriesBlock', () => {
  it('returns empty summary for no rows', () => {
    expect(buildStoriesBlock([])).toEqual({
      list: [],
      summary: { count: 0, avgReach: 0, avgReplies: 0, avgCompletion: null },
      daily: [],
    });
  });

  it('computes per-story completion, summary averages, and daily grouping', () => {
    const rows: StoryMetricRow[] = [
      row({ igStoryId: 'a', reach: 100, replies: 4, exits: 20, timestamp: new Date('2026-07-05T08:00:00Z') }),
      row({ igStoryId: 'b', reach: 300, replies: 6, exits: 30, timestamp: new Date('2026-07-05T20:00:00Z') }),
      row({ igStoryId: 'c', reach: 200, replies: 2, exits: 0, timestamp: new Date('2026-07-04T09:00:00Z') }),
    ];

    const out = buildStoriesBlock(rows);

    // completion: a=0.8, b=0.9, c=1.0
    expect(out.list.find((r) => r.igStoryId === 'a')!.completion).toBeCloseTo(0.8);
    expect(out.summary.count).toBe(3);
    expect(out.summary.avgReach).toBe(200); // (100+300+200)/3
    expect(out.summary.avgReplies).toBe(4); // (4+6+2)/3
    expect(out.summary.avgCompletion).toBeCloseTo(0.9); // (0.8+0.9+1.0)/3
    // daily sorted asc; Jul-04 one story reach 200; Jul-05 two stories avg (100+300)/2=200
    expect(out.daily).toEqual([
      { date: '2026-07-04', avgReach: 200, count: 1 },
      { date: '2026-07-05', avgReach: 200, count: 2 },
    ]);
  });

  it('excludes null-reach stories from avgReach but counts them', () => {
    const rows: StoryMetricRow[] = [
      row({ igStoryId: 'a', reach: 100, timestamp: new Date('2026-07-05T08:00:00Z') }),
      row({ igStoryId: 'b', reach: null, timestamp: new Date('2026-07-05T09:00:00Z') }),
    ];
    const out = buildStoriesBlock(rows);
    expect(out.daily).toEqual([{ date: '2026-07-05', avgReach: 100, count: 2 }]);
    expect(out.summary.avgReach).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd apps/api && pnpm test -- src/instagram/stories.util.spec.ts
```
Expected: FAIL — `./stories.util` does not exist.

- [ ] **Step 3: Implement `stories.util.ts`**

Create `apps/api/src/instagram/stories.util.ts`:

```typescript
/**
 * Pure aggregation helpers for the Instagram Stories analytics block. Kept free
 * of Prisma types so they can be unit-tested without a DB. `getMetrics` maps
 * InstagramStory rows into StoryMetricRow before calling buildStoriesBlock.
 */

export interface StoryMetricRow {
  igStoryId: string;
  mediaType: string;
  permalink: string | null;
  timestamp: Date;
  caption: string | null;
  reach: number | null;
  views: number | null;
  replies: number | null;
  shares: number | null;
  totalInteractions: number | null;
  tapsForward: number | null;
  tapsBack: number | null;
  exits: number | null;
}

export interface StoryListItem extends StoryMetricRow {
  completion: number | null;
}

export interface StoriesBlock {
  list: StoryListItem[];
  summary: {
    count: number;
    avgReach: number;
    avgReplies: number;
    avgCompletion: number | null;
  };
  daily: Array<{ date: string; avgReach: number; count: number }>;
}

/** Story completion ≈ 1 − exits/reach, clamped to [0,1]; null when reach falsy. */
export function storyCompletion(
  reach: number | null,
  exits: number | null,
): number | null {
  if (!reach || reach <= 0) return null;
  const c = 1 - (exits ?? 0) / reach;
  return Math.max(0, Math.min(1, c));
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function buildStoriesBlock(rows: StoryMetricRow[]): StoriesBlock {
  const list: StoryListItem[] = rows.map((r) => ({
    ...r,
    completion: storyCompletion(r.reach, r.exits),
  }));

  const reaches = list.map((r) => r.reach).filter((n): n is number => n != null);
  const replies = list.map((r) => r.replies).filter((n): n is number => n != null);
  const completions = list
    .map((r) => r.completion)
    .filter((n): n is number => n != null);

  const summary = {
    count: list.length,
    avgReach: Math.round(mean(reaches)),
    avgReplies: Math.round(mean(replies)),
    avgCompletion: completions.length ? mean(completions) : null,
  };

  // Group by UTC calendar day of the story timestamp.
  const dayMap = new Map<string, { reaches: number[]; count: number }>();
  for (const r of list) {
    const date = r.timestamp.toISOString().slice(0, 10);
    const bucket = dayMap.get(date) ?? { reaches: [], count: 0 };
    bucket.count++;
    if (r.reach != null) bucket.reaches.push(r.reach);
    dayMap.set(date, bucket);
  }
  const daily = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      avgReach: Math.round(mean(b.reaches)),
      count: b.count,
    }));

  return { list, summary, daily };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd apps/api && pnpm test -- src/instagram/stories.util.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Wire `stories` into `getMetrics`**

In `apps/api/src/instagram/instagram.service.ts`:

(a) Add the import near the top:

```typescript
import { buildStoriesBlock, StoryMetricRow } from './stories.util';
```

(b) In `getMetrics`, update the not-connected early return to include an empty block:

```typescript
    if (!account) {
      return {
        account: [],
        topPosts: [],
        worstPosts: [],
        periodTotals: {},
        stories: { list: [], summary: { count: 0, avgReach: 0, avgReplies: 0, avgCompletion: null }, daily: [] },
      };
    }
```

(c) After the `ratedMedia` query (before the `periodTotals` block), add the stories query:

```typescript
    const storyRows = await this.prisma.instagramStory.findMany({
      where: { socialAccountId: account.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
    });
    const stories = buildStoriesBlock(storyRows as StoryMetricRow[]);
```

(d) Add `stories` to the final `return`:

```typescript
    return {
      account: accountMetrics.map((m) => ({
        date: m.date,
        followersCount: m.followersCount,
        reach: m.reach,
        views: m.views,
        accountsEngaged: m.accountsEngaged,
        totalInteractions: m.totalInteractions,
      })),
      topPosts,
      worstPosts,
      periodTotals,
      stories,
    };
```

- [ ] **Step 6: Verify the API build + full instagram suite**

Run:
```bash
cd apps/api && pnpm test -- src/instagram && pnpm build
```
Expected: PASS + build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/instagram/stories.util.ts apps/api/src/instagram/stories.util.spec.ts apps/api/src/instagram/instagram.service.ts
git commit -m "feat(api): additive stories block on GET /instagram/metrics (#145)"
```

---

### Task 5: Web — Stories section in the IG dashboard + i18n

**Files:**
- Modify: `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte`
- Modify: `packages/i18n/src/locales/en.json`, `pl.json`, `ru.json`

**Interfaces:**
- Consumes: the `stories` block from `GET /instagram/metrics` (Task 4).

- [ ] **Step 1: Add the i18n keys (en/pl/ru parity)**

In each locale file, inside the top-level analytics `"instagram": { ... }` object (the one with `"title": "Instagram Analytics"`), add a nested `"stories"` object.

`en.json`:
```json
    "stories": {
      "title": "Stories",
      "count": "Stories",
      "avgReach": "Avg reach",
      "avgReplies": "Avg replies",
      "avgCompletion": "Avg completion",
      "trend": "Story reach over time",
      "date": "Date",
      "type": "Type",
      "replies": "Replies",
      "exits": "Exits",
      "completion": "Completion",
      "empty": "No stories captured for this period. Stories expire after 24h in the API, so they're snapshotted on each sync — more frequent syncing (PRO/Enterprise) captures more."
    }
```

`pl.json`:
```json
    "stories": {
      "title": "Relacje",
      "count": "Relacje",
      "avgReach": "Śr. zasięg",
      "avgReplies": "Śr. odpowiedzi",
      "avgCompletion": "Śr. ukończenie",
      "trend": "Zasięg relacji w czasie",
      "date": "Data",
      "type": "Typ",
      "replies": "Odpowiedzi",
      "exits": "Wyjścia",
      "completion": "Ukończenie",
      "empty": "Brak relacji w tym okresie. Relacje wygasają po 24 h w API, więc zapisujemy je przy każdej synchronizacji — częstsza synchronizacja (PRO/Enterprise) zbiera ich więcej."
    }
```

`ru.json`:
```json
    "stories": {
      "title": "Истории",
      "count": "Истории",
      "avgReach": "Ср. охват",
      "avgReplies": "Ср. ответы",
      "avgCompletion": "Ср. досматриваемость",
      "trend": "Охват историй во времени",
      "date": "Дата",
      "type": "Тип",
      "replies": "Ответы",
      "exits": "Выходы",
      "completion": "Досматриваемость",
      "empty": "Нет историй за период. Истории живут в API только 24 ч, поэтому снимаются при каждой синхронизации — при более частой синхронизации (PRO/Enterprise) их собирается больше."
    }
```

Verify JSON validity:
```bash
cd D:/Work/micode/marketing-ai-assistant && node -e "['en','pl','ru'].forEach(l=>{const j=require('./packages/i18n/src/locales/'+l+'.json'); if(!j.instagram.stories.title) throw new Error('missing '+l); console.log(l,'ok')})"
```
Expected: `en ok / pl ok / ru ok`.

- [ ] **Step 2: Extend the component's types and state**

In `InstagramAnalyticsDashboard.svelte` `<script>`:

(a) Add a `StoryRow` interface and extend `Metrics` (after the `MediaPost` interface):

```typescript
  interface StoryRow {
    igStoryId: string;
    mediaType: string;
    caption: string | null;
    permalink: string | null;
    timestamp: string;
    reach: number | null;
    views: number | null;
    replies: number | null;
    exits: number | null;
    completion: number | null;
  }

  interface StoriesBlock {
    list: StoryRow[];
    summary: { count: number; avgReach: number; avgReplies: number; avgCompletion: number | null };
    daily: Array<{ date: string; avgReach: number; count: number }>;
  }
```

Add `stories?: StoriesBlock;` to the `Metrics` interface, and include it in the default `metrics` initialiser and both `reinit()`/`fetchMetrics()` catch resets:
- `let metrics: Metrics = { account: [], topPosts: [], worstPosts: [], periodTotals: {}, stories: emptyStories() };`
- add a helper: `function emptyStories(): StoriesBlock { return { list: [], summary: { count: 0, avgReach: 0, avgReplies: 0, avgCompletion: null }, daily: [] }; }`
- in `reinit()` reset: `metrics = { account: [], topPosts: [], worstPosts: [], periodTotals: {}, stories: emptyStories() };`
- in `fetchMetrics()` catch: `metrics = { account: [], topPosts: [], worstPosts: [], periodTotals: {}, stories: emptyStories() };`

(b) Add a second chart canvas + instance for the stories trend:

```typescript
  let storiesChartCanvas: HTMLCanvasElement;
  let storiesChart: any = null;
```

Update `destroyChart()` to also destroy it:
```typescript
  function destroyChart() {
    chart?.destroy();
    chart = null;
    storiesChart?.destroy();
    storiesChart = null;
  }
```

(c) After `renderChart()` (or inside `fetchMetrics` after `renderChart()`), render the stories trend. Add a `renderStoriesChart()` function and call it right after `renderChart();` in `fetchMetrics`:

```typescript
  function renderStoriesChart() {
    const daily = metrics.stories?.daily ?? [];
    if (!ChartJS || !storiesChartCanvas || daily.length === 0) return;
    storiesChart?.destroy();
    storiesChart = new ChartJS(storiesChartCanvas, {
      type: 'line',
      data: {
        labels: daily.map((d) =>
          new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        ),
        datasets: [
          {
            label: $_('instagram.stories.avgReach'),
            data: daily.map((d) => d.avgReach),
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: daily.length <= 30 ? 2 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true },
        },
      },
    });
  }
```

In `fetchMetrics`, after `renderChart();` add `renderStoriesChart();`.

(d) Add KPI/format helpers reuse — a completion formatter:

```typescript
  function formatPct(v: number | null | undefined): string {
    if (v == null) return '—';
    return Math.round(v * 100) + '%';
  }
```

- [ ] **Step 3: Add the Stories section markup**

In the connected view, inside the `<div class="p-5 space-y-6">` that holds the metrics (after the Posts & Reels `{#each ...}` block and before the AI advice block), add:

```svelte
        <!-- Stories -->
        <div>
          <h3 class="text-sm font-semibold text-ink mb-3">{$_('instagram.stories.title')}</h3>
          {#if (metrics.stories?.summary.count ?? 0) === 0}
            <div class="text-sm text-ink-subtle py-6 px-4 text-center bg-surface-2 rounded-xl">{$_('instagram.stories.empty')}</div>
          {:else}
            <!-- KPI strip -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
                <div class="text-xs text-ink-muted mb-1">{$_('instagram.stories.count')}</div>
                <div class="text-2xl font-bold text-ink">{metrics.stories?.summary.count ?? 0}</div>
              </div>
              <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
                <div class="text-xs text-ink-muted mb-1">{$_('instagram.stories.avgReach')}</div>
                <div class="text-2xl font-bold text-ink">{formatNumber(metrics.stories?.summary.avgReach)}</div>
              </div>
              <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
                <div class="text-xs text-ink-muted mb-1">{$_('instagram.stories.avgReplies')}</div>
                <div class="text-2xl font-bold text-ink">{formatNumber(metrics.stories?.summary.avgReplies)}</div>
              </div>
              <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
                <div class="text-xs text-ink-muted mb-1">{$_('instagram.stories.avgCompletion')}</div>
                <div class="text-2xl font-bold text-ink">{formatPct(metrics.stories?.summary.avgCompletion)}</div>
              </div>
            </div>

            <!-- Trend -->
            <div class="mb-4">
              <div class="relative" style="height: 220px;">
                <canvas bind:this={storiesChartCanvas} style="width: 100%; height: 100%;"></canvas>
              </div>
            </div>

            <!-- Recent stories table -->
            <div class="rounded-xl border border-border overflow-x-auto">
              <table class="w-full text-sm min-w-[520px]">
                <thead>
                  <tr class="bg-surface-2 border-b border-border">
                    <th class="text-left px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.stories.date')}</th>
                    <th class="text-left px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.stories.type')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.reach')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.views')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.stories.replies')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.stories.exits')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.stories.completion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each metrics.stories?.list ?? [] as story (story.igStoryId)}
                    <tr class="border-b border-border hover:bg-surface-2">
                      <td class="px-3 py-2 text-ink">
                        {#if story.permalink}
                          <a href={story.permalink} target="_blank" rel="noopener noreferrer" class="text-brand hover:underline">
                            {new Date(story.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </a>
                        {:else}
                          {new Date(story.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {/if}
                      </td>
                      <td class="px-3 py-2">
                        <span class="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/12 text-amber-700">{story.mediaType}</span>
                      </td>
                      <td class="px-3 py-2 text-right text-ink font-medium">{formatNumber(story.reach)}</td>
                      <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(story.views)}</td>
                      <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(story.replies)}</td>
                      <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(story.exits)}</td>
                      <td class="px-3 py-2 text-right text-ink-muted">{formatPct(story.completion)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
```

- [ ] **Step 4: Verify types + lint**

Run:
```bash
cd apps/web && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i "InstagramAnalyticsDashboard"
```
Expected: no output (no diagnostics for the file).

Run:
```bash
cd apps/web && corepack pnpm lint 2>&1 | grep -iE "error|InstagramAnalyticsDashboard" | head
```
Expected: no new errors for the file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "feat(web): Instagram Stories section in the analytics dashboard (#145)"
```

---

### Task 6: Final verification + PR

- [ ] **Step 1: Run the full instagram API suite + api build**

Run:
```bash
cd apps/api && pnpm test -- src/instagram && pnpm build && corepack pnpm --filter api lint 2>&1 | grep -iE "error" | head
```
Expected: tests PASS, build OK, no lint errors.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/instagram-stories-analytics
gh pr create --repo micode-ai/marketing-ai-assistant --base development \
  --head feat/instagram-stories-analytics \
  --title "feat(analytics): Instagram Stories analytics" \
  --body "Closes #145. Adds Instagram Stories analytics: InstagramStory snapshot model, active-story fetch + navigation-breakdown insights, sync piggybacked on the IG cron, additive stories block on GET /instagram/metrics, and a Stories section (KPI strip + trend + table) inside the IG dashboard. en/pl/ru parity. Tests: graph-util navigation parse, syncStories, stories.util aggregation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Confirm CI green** via `gh pr view <n> --json statusCheckRollup`.

---

## Notes / Deferred (from issue #145)

- FREE captures stories sparsely (piggyback throttle) — surfaced in the empty-state copy.
- Out of scope: dedicated stories cron, swipe/link-sticker metrics, stories-specific AI advice.
- Migration must be applied in prod after merge (auto-deploy runs `prisma migrate deploy`).
