# Analytics: multi-surface view + Google Play reply visibility

Date: 2026-06-25
Status: Approved (design)

## Problem

A single project can have several analytics surfaces at once: a website (Google
Search Console), a tracked web app (in-app analytics events), and a mobile app
(Google Play). Today the analytics page hard-gates on `projectType`:

```
{#if isMobileApp}  <MobileAnalyticsDashboard/>  {:else}  <GSC + web analytics/>  {/if}
```

So a `MOBILE_APP` project shows **only** Google Play data; its Google Search
Console panel (and web traffic) is never rendered even when GSC is connected.

Separately, **developer replies to Google Play reviews are not shown**. Reviews
appear, but the reply text is missing.

## Goals

1. On the analytics page, surface every connected source for a project, grouped
   by surface, via top-level tabs **Сайт / Приложение**.
2. Make Google Play developer replies visible.

## Non-goals

- No change to the Prisma schema or API contracts.
- No change to `ProjectType` (stays single-valued; visibility is driven by
  *connected integrations*, not by type).
- No backfill migration for old reviews (Google's reviews API only returns
  reviews from ~the last 7 days, so older reviews aren't re-syncable anyway).
- Internals of `SearchConsolePanel` / `MobileAnalyticsDashboard` unchanged.

## Design

### Part A — Google Play reply visibility (backend bug fix)

File: `apps/api/src/google-play/google-play-sync.service.ts`, `syncReviews`.

Root cause: the developer reply is read from the wrong array slot. The Android
Publisher `reviews.list` response represents a review's `comments[]` as separate
entries — `comments[0]` is the user comment, the developer reply is a *separate*
entry (typically `comments[1]`) with a `developerComment`. Current code reads
`review.comments?.[0]?.developerComment`, which is always `undefined`, so
`replyText` is stored as `null`. Worse, a sync **overwrites** (nulls) a reply
that was sent through the app.

Fix — scan the array instead of indexing `[0]`:

```ts
const userComment      = review.comments?.find(c => c.userComment)?.userComment;
if (!userComment) continue;
const developerComment = review.comments?.find(c => c.developerComment)?.developerComment;
```

`replyText` / `replyCreatedAt` / `isReplied` are then derived from
`developerComment` exactly as today. No schema/API/frontend change is needed —
`ReviewCard` already renders `review.replyText` when `isReplied && replyText`.
Existing recent reviews self-heal on the next sync.

### Part B — Surface tabs on the analytics page (frontend)

File: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`.

**Surface detection** (on mount and on project switch, reusing the existing
`projectId` watcher):

- `appConnected`  ← `GET /google-play/status` → `.connected`
- `gscConnected`  ← `GET /google/integration` → truthy integration
  (`accessToken` + `siteUrl`)

Run both in parallel; treat failures as "not connected".

**Visibility rules:**

- `showApp = appConnected || projectType === 'MOBILE_APP'`
- `showWeb = gscConnected || projectType !== 'MOBILE_APP'`

**Rendering:**

- Both surfaces available → render a top-level tab bar with **Сайт** and
  **Приложение**.
  - **Сайт** tab: `<SearchConsolePanel {projectId} />` followed by the existing
    web analytics block (period selector; Overview / UTM / Funnel / Pages
    sub-tabs; KPI cards; charts).
  - **Приложение** tab: `<MobileAnalyticsDashboard {projectId} days={selectedPeriod} />`.
- Exactly one surface available → render that surface directly, **no tab bar**
  (preserves current UX for single-surface projects — no visual change).
- Neither flag true → fall back to the web block (current default), which shows
  its own empty states.

**Default active surface tab:** matches `projectType`
(`MOBILE_APP` → Приложение, otherwise Сайт); if that surface isn't available,
fall back to the other.

**Data fetching:** the existing `fetchData()` (web metrics) should only run for
the web surface. The mobile dashboard fetches its own data. Lazy-load web data
when the Сайт tab is first shown (avoid fetching web metrics for an app-only
project, and vice-versa).

### i18n

Add `analytics.surface.web` ("Сайт" / "Strona" / "Site") and
`analytics.surface.app` ("Приложение" / "Aplikacja" / "App") to en/pl/ru.

## Components & boundaries

- `analytics/+page.svelte` — orchestrates surface detection + top-level tabs;
  owns the web-analytics block it already contains.
- `SearchConsolePanel.svelte` — unchanged; reused under the Сайт tab.
- `MobileAnalyticsDashboard.svelte` — unchanged; reused under the Приложение tab.
- `google-play-sync.service.ts` — reply parsing fix only.

## Edge cases

- Project switch (SvelteKit reuses the `[id]` component): re-detect surfaces and
  reset the active surface tab via the existing guarded `projectId` watcher.
- A surface flips from connected→disconnected after load: tab simply stops being
  offered on the next detection; no live teardown needed.
- App-only project (no GSC): only Приложение renders, no tab bar — unchanged.

## Testing

- Backend unit test: `syncReviews` maps a reply when `developerComment` is in
  `comments[1]` (and `comments[0]` is the user comment); `isReplied` true,
  `replyText` set; a review with no developer reply keeps `replyText` null.
- Frontend (manual + reproducible via the existing Playwright harness against
  prod): for a project with both GSC and Play connected, both tabs appear,
  default tab matches `projectType`, switching tabs shows the right source;
  single-surface projects show no tab bar.

## Limitations

- Reviews older than Google's ~7-day reviews window won't gain reply text (data
  unavailable from the API).
