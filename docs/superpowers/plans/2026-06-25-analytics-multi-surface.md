# Analytics Multi-Surface Tabs + Google Play Reply Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every connected analytics surface (Google Search Console + web traffic under a "Сайт" tab; Google Play under an "Приложение" tab) for a single project, and make Google Play developer replies visible.

**Architecture:** Backend fix is a one-function parsing correction (scan the `comments[]` array instead of index 0), extracted into a pure, unit-tested helper. Frontend replaces the `projectType`-gated `{#if isMobileApp}` block in the analytics page with surface detection (driven by which integrations are *connected*) plus a top-level tab bar shown only when both surfaces exist. Child components (`SearchConsolePanel`, `MobileAnalyticsDashboard`) are reused unchanged.

**Tech Stack:** NestJS 10 + Jest (apps/api), SvelteKit 2 + svelte-i18n (apps/web), JSON locale files (packages/i18n).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-25-analytics-multi-surface-design.md`.
- No Prisma schema changes, no API contract changes.
- `ProjectType` stays single-valued; surface visibility is driven by connected integrations, NOT by type.
- Single-surface projects must render exactly as today (no tab bar, no visual change).
- All three locale files (`en`, `pl`, `ru`) updated together.
- IDs are cuid; never assume UUID.
- Commits/PRs in English.

---

### Task 1: Backend — fix Google Play developer-reply parsing

**Files:**
- Modify: `apps/api/src/google-play/google-play-sync.service.ts` (add exported helper; use it in `syncReviews`, ~lines 364-368)
- Test: `apps/api/src/google-play/google-play-sync.service.spec.ts` (create)

**Interfaces:**
- Produces: `extractReviewComments(comments: RawReviewComment[] | undefined): { userComment?: RawUserComment; developerComment?: RawDeveloperComment }` — exported from `google-play-sync.service.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/google-play/google-play-sync.service.spec.ts`:

```ts
import { extractReviewComments } from './google-play-sync.service';

describe('extractReviewComments', () => {
  it('finds the developer reply when it is a separate comments entry (not index 0)', () => {
    const comments = [
      { userComment: { text: 'Great app', starRating: 5, lastModified: { seconds: '1700000000' }, reviewerLanguage: 'en' } },
      { developerComment: { text: 'Thanks for the feedback!', lastModified: { seconds: '1700001000' } } },
    ];

    const { userComment, developerComment } = extractReviewComments(comments);

    expect(userComment?.text).toBe('Great app');
    expect(userComment?.starRating).toBe(5);
    expect(developerComment?.text).toBe('Thanks for the feedback!');
  });

  it('returns undefined developerComment when there is no reply', () => {
    const comments = [
      { userComment: { text: 'It is ok', starRating: 3, lastModified: { seconds: '1700000000' }, reviewerLanguage: 'pl' } },
    ];

    const { userComment, developerComment } = extractReviewComments(comments);

    expect(userComment?.text).toBe('It is ok');
    expect(developerComment).toBeUndefined();
  });

  it('handles undefined comments', () => {
    const { userComment, developerComment } = extractReviewComments(undefined);

    expect(userComment).toBeUndefined();
    expect(developerComment).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test -- src/google-play/google-play-sync.service.spec.ts`
Expected: FAIL — `extractReviewComments` is not exported / not a function.

- [ ] **Step 3: Add the exported helper + types**

In `apps/api/src/google-play/google-play-sync.service.ts`, add at the top of the file (after the imports, before the `@Injectable()` class):

```ts
export interface RawUserComment {
  text: string;
  starRating: number;
  lastModified: { seconds: string };
  reviewerLanguage: string;
}

export interface RawDeveloperComment {
  text: string;
  lastModified: { seconds: string };
}

export interface RawReviewComment {
  userComment?: RawUserComment;
  developerComment?: RawDeveloperComment;
}

/**
 * Android Publisher returns a review's comments as separate array entries:
 * comments[0] is the user comment, the developer reply is a SEPARATE entry
 * (typically comments[1]) carrying `developerComment`. Scan the array — do NOT
 * read both off index 0 (that loses every reply).
 */
export function extractReviewComments(
  comments: RawReviewComment[] | undefined,
): { userComment?: RawUserComment; developerComment?: RawDeveloperComment } {
  return {
    userComment: comments?.find((c) => c.userComment)?.userComment,
    developerComment: comments?.find((c) => c.developerComment)?.developerComment,
  };
}
```

- [ ] **Step 4: Use the helper in `syncReviews`**

In `apps/api/src/google-play/google-play-sync.service.ts`, replace these three lines (currently ~365-368):

```ts
        const userComment = review.comments?.[0]?.userComment;
        if (!userComment) continue;

        const developerComment = review.comments?.[0]?.developerComment;
```

with:

```ts
        const { userComment, developerComment } = extractReviewComments(review.comments);
        if (!userComment) continue;
```

(The surrounding `upsert` that maps `developerComment?.text` → `replyText`, `replyCreatedAt`, `isReplied` is already correct and stays unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && pnpm test -- src/google-play/google-play-sync.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check the service compiles**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors in `google-play-sync.service.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/google-play/google-play-sync.service.ts apps/api/src/google-play/google-play-sync.service.spec.ts
git commit -m "fix(google-play): capture developer reply from correct comments entry"
```

---

### Task 2: i18n — surface tab labels

**Files:**
- Modify: `packages/i18n/src/locales/en.json` (inside the `"analytics"` object)
- Modify: `packages/i18n/src/locales/ru.json` (inside the `"analytics"` object)
- Modify: `packages/i18n/src/locales/pl.json` (inside the `"analytics"` object)

**Interfaces:**
- Produces: i18n keys `analytics.surface.web` and `analytics.surface.app` in all three locales (consumed by Task 3).

- [ ] **Step 1: Add the keys to English**

In `packages/i18n/src/locales/en.json`, inside the top-level `"analytics"` object (the one that contains `"title": "Analytics"`, `"subtitle"`, `"tabOverview"`, …), add a `"surface"` entry:

```json
    "surface": {
      "web": "Site",
      "app": "App"
    },
```

- [ ] **Step 2: Add the keys to Russian**

In `packages/i18n/src/locales/ru.json`, inside the same `"analytics"` object:

```json
    "surface": {
      "web": "Сайт",
      "app": "Приложение"
    },
```

- [ ] **Step 3: Add the keys to Polish**

In `packages/i18n/src/locales/pl.json`, inside the same `"analytics"` object:

```json
    "surface": {
      "web": "Strona",
      "app": "Aplikacja"
    },
```

- [ ] **Step 4: Verify all three files are valid JSON**

Run: `cd "D:/Work/micode/marketing-ai-assistant" && node -e "for (const l of ['en','pl','ru']) { const a=require('./packages/i18n/src/locales/'+l+'.json'); if(!a.analytics.surface.web||!a.analytics.surface.app) throw new Error('missing surface in '+l); } console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "i18n(analytics): add Site/App surface tab labels (en/pl/ru)"
```

---

### Task 3: Frontend — surface detection + top-level Site/App tabs

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`

**Interfaces:**
- Consumes: `api.get('/google-play/status', { projectId })` → `{ connected: boolean, ... }`; `api.get('/google/integration', { projectId })` → integration object with `accessToken` + `siteUrl` (or throws/empty when not connected); i18n `analytics.surface.web` / `analytics.surface.app` from Task 2.
- Reuses existing in-file: `fetchData()`, `fetchUtmData()`, `fetchFunnelData()`, `fetchPagesData()`, `selectedPeriod`, the `prevProjectId`/`mounted` project-switch watcher.

> Note: the analytics page cannot be meaningfully unit-tested (Svelte page + Chart.js + live APIs), so this task is verified by type-check + the live Playwright harness, consistent with the spec's testing section.

- [ ] **Step 1: Add surface state + helpers to the `<script>`**

In `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`, find the line:

```ts
  $: isMobileApp = $currentProjectStore?.projectType === 'MOBILE_APP';
```

Replace that single line with:

```ts
  $: projectType = $currentProjectStore?.projectType;

  // Which analytics surfaces are available for this project. Driven by which
  // integrations are actually connected — NOT by projectType — so a mobile
  // project that also has a website (GSC) shows both.
  let appConnected = false;
  let gscConnected = false;
  let surfacesLoaded = false;
  let activeSurface: 'web' | 'app' = 'web';
  let webLoaded = false;

  $: showApp = appConnected || projectType === 'MOBILE_APP';
  $: showWeb = gscConnected || projectType !== 'MOBILE_APP';
  $: showSurfaceTabs = showApp && showWeb;

  async function detectSurfaces() {
    const [play, gsc] = await Promise.allSettled([
      api.get<any>('/google-play/status', { projectId }),
      api.get<any>('/google/integration', { projectId }),
    ]);
    appConnected = play.status === 'fulfilled' && !!play.value?.connected;
    gscConnected =
      gsc.status === 'fulfilled' && !!(gsc.value?.accessToken && gsc.value?.siteUrl);
    surfacesLoaded = true;
    activeSurface = pickDefaultSurface();
  }

  function pickDefaultSurface(): 'web' | 'app' {
    const app = appConnected || projectType === 'MOBILE_APP';
    const web = gscConnected || projectType !== 'MOBILE_APP';
    if (projectType === 'MOBILE_APP' && app) return 'app';
    if (web) return 'web';
    return app ? 'app' : 'web';
  }

  async function ensureWebData() {
    if (webLoaded) return;
    webLoaded = true;
    await fetchData();
  }

  function switchSurface(s: 'web' | 'app') {
    activeSurface = s;
    if (s === 'web') ensureWebData();
  }
```

- [ ] **Step 2: Replace the onMount body to detect surfaces first**

Find the existing `onMount(async () => { ... })` block (the one that imports `chart.js/auto`, then branches on `$currentProjectStore`/`$projectsStore` and calls `fetchData()`, ending with `prevProjectId = projectId; mounted = true;`). Replace the WHOLE `onMount` callback body with:

```ts
  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;

    await detectSurfaces();
    if (activeSurface === 'web') await ensureWebData();

    prevProjectId = projectId;
    mounted = true;
  });
```

- [ ] **Step 3: Update the project-switch watcher to re-detect surfaces**

Find `reloadForProjectChange()` and replace its body with:

```ts
  async function reloadForProjectChange() {
    // Reset cached per-tab + per-surface state so everything refetches for the
    // newly selected project. The mobile dashboard refetches via its own watcher.
    utmData = [];
    funnelData = null;
    pagesData = [];
    dailyData = [];
    totals = null;
    webLoaded = false;
    surfacesLoaded = false;
    await detectSurfaces();
    if (activeSurface === 'web') await ensureWebData();
  }
```

- [ ] **Step 4: Restructure the template to surface tabs**

Find the template block that starts at `{#if isMobileApp}` and ends with its matching `{/if}` (the wrapper that currently chooses MobileAnalyticsDashboard vs the web analytics block). Replace ONLY the opening `{#if isMobileApp}` / `{:else}` scaffolding and its closing `{/if}` so the structure becomes:

Replace:

```svelte
  {#if isMobileApp}
    <MobileAnalyticsDashboard {projectId} days={selectedPeriod} />
  {:else}
```

with:

```svelte
  {#if !surfacesLoaded}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 rounded-full border-2 border-gray-200 border-t-primary-600 animate-spin"></div>
    </div>
  {:else}
    {#if showSurfaceTabs}
      <div class="inline-flex bg-gray-100 rounded-lg p-0.5 mb-6">
        <button on:click={() => switchSurface('web')}
          class="px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
            {activeSurface === 'web' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
          {$_('analytics.surface.web')}
        </button>
        <button on:click={() => switchSurface('app')}
          class="px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
            {activeSurface === 'app' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
          {$_('analytics.surface.app')}
        </button>
      </div>
    {/if}

    {#if activeSurface === 'app'}
      <MobileAnalyticsDashboard {projectId} days={selectedPeriod} />
    {:else}
```

The existing web-analytics markup (period selector, `<SearchConsolePanel {projectId} />`, the Overview/UTM/Funnel/Pages tabs and their content) stays exactly as-is between this new `{:else}` and the block's closing `{/if}`. The closing `{/if}` of the original `isMobileApp` block now needs a SECOND closing `{/if}` for the added `{#if !surfacesLoaded}` wrapper — make sure the end of the block reads:

```svelte
    {/if}
  {/if}
```

(first `{/if}` closes `activeSurface === 'app'`, second closes `!surfacesLoaded`).

- [ ] **Step 5: Type-check the page (svelte-check)**

Run: `cd apps/web && npx svelte-check --threshold error`
Expected: no NEW errors referencing `analytics/+page.svelte` (pre-existing project-wide `string | undefined` errors elsewhere are unrelated). Confirm `isMobileApp` is no longer referenced anywhere (search the file).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte"
git commit -m "feat(analytics): top-level Site/App surface tabs by connected integration"
```

- [ ] **Step 7: Verify live with the Playwright harness**

Use the existing reproduction harness (Playwright 1.59 at `C:/Users/perev/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs`; login client-side at `#login-email`/`#login-password`). Against the multi-surface project `https://emarketingai.pl/projects/cmme3iggz0002o001u65wpuoi/analytics` (after this branch is deployed), assert:
  1. Both surface tabs render (text `Сайт` and `Приложение`).
  2. Default active tab matches `projectType` (mobile project → `Приложение`).
  3. Clicking `Сайт` shows the GSC panel + web KPIs; clicking `Приложение` shows the Google Play dashboard.
  4. A single-surface project (e.g. a website-only project) shows NO surface tab bar.

Expected: all four hold. (Pre-deploy, this step is deferred until the branch is on `development`.)

---

## Self-Review

**Spec coverage:**
- Part A (reply parsing fix) → Task 1. ✓
- Part B surface detection (`/google-play/status`, `/google/integration`) → Task 3 Step 1 (`detectSurfaces`). ✓
- Visibility rules `showApp`/`showWeb` → Task 3 Step 1. ✓
- Both-available tab bar; single-surface no bar; neither → web fallback → Task 3 Steps 1 & 4 (`showSurfaceTabs`, `pickDefaultSurface` returns `web` by default). ✓
- Default active tab matches projectType → `pickDefaultSurface`. ✓
- Lazy web fetch → `ensureWebData` + onMount/switchSurface. ✓
- Project-switch re-detection → Task 3 Step 3 (reuses existing watcher). ✓
- i18n en/pl/ru → Task 2. ✓
- Backend unit test for reply parsing → Task 1. ✓
- Frontend verification via Playwright → Task 3 Step 7. ✓
- Limitation (reviews >7 days) — documented in spec, no code needed. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `extractReviewComments` signature identical in interface block and Task 1 Steps 1/3. `detectSurfaces`/`pickDefaultSurface`/`ensureWebData`/`switchSurface`/`showSurfaceTabs`/`activeSurface`/`webLoaded`/`surfacesLoaded` names consistent across Steps 1-4. ✓
