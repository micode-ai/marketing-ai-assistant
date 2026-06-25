# Google Search Console: extended Performance + SEO insights

Date: 2026-06-25
Status: Approved (design)

## Problem

The analytics page shows a compact Google Search Console panel
(`SearchConsolePanel`) with totals, by-date, top-20 queries, top-20 pages,
top-10 devices, top-10 countries for a single period. The GSC Search Analytics
API exposes much more than we surface, and we do no analysis on top of it. Users
want to see more and get actionable SEO insight.

## Goals (v1)

A dedicated GSC detail page, reached from the panel, built on the **existing**
Search Analytics API (no new integration), that adds:

- Period-over-period comparison (deltas).
- Full, sortable, paginated Queries and Pages tables (beyond top-20).
- Drill-down: query → its pages/countries; page → its queries.
- Filters: query contains, country, device, brand / non-brand.
- Search-type selector: web / image / video / news / discover.
- Four SEO insights: striking-distance, low-CTR-high-impressions,
  cannibalization, movers.

## Non-goals (separate future iterations)

- Indexation status (URL Inspection API) — separate sub-project.
- Core Web Vitals (CrUX / PageSpeed Insights API) — separate sub-project.
- Persisting GSC performance history to the DB — v1 is live via API + server
  cache. (Reports not available from the Search Analytics API — index coverage,
  links, manual actions — remain out of scope entirely.)
- No Prisma schema changes.

## Design

### Placement

New route `apps/web/src/routes/(app)/projects/[id]/search-console/+page.svelte`,
reached from `SearchConsolePanel`'s new "Details" button. The panel stays a
glanceable summary. Page requires a connected GSC integration; otherwise it
shows the same "connect" prompt the panel uses.

### Backend (`apps/api/src/google-integrations/`)

Extend the existing `fetchSearchConsoleData(accessToken, siteUrl, start, end,
dimensions, rowLimit)` to also accept:

- `type` — search type (`web` | `image` | `video` | `news` | `discover`),
  passed as the API `type` field (default `web`).
- `filters` — mapped to `dimensionFilterGroups` (operators: `contains`,
  `equals`, `notContains`).
- `startRow` — for pagination (API allows up to 25000 rows).

Two new JWT-protected endpoints on `GoogleIntegrationsController` (same auth
pattern as the other `/google/*` routes):

1. `GET /google/search-console/query`
   - Params: `projectId`, `start`, `end` (or `days`), `dimensions` (csv),
     `type`, `filters` (a JSON-encoded array of `{dimension, operator, expression}`),
     `rowLimit`, `startRow`, `compare` (bool).
   - When `compare=true`, runs the same query for the previous equal-length
     period and merges previous metrics per row key (for delta columns).
   - Used by: overview, Queries/Pages tables, drill-down.

2. `GET /google/search-console/insights`
   - Params: `projectId`, `days`, `type`, `filters`.
   - Computes the four insight sets server-side (pure functions over rows
     fetched via `fetchSearchConsoleData`) and returns ready lists.

Caching: reuse the existing 1h in-memory cache; extend the cache key to include
`type`, `filters`, `dimensions`, `start`, `end`, `startRow`. Cache entries are
bounded by a max-size LRU to avoid unbounded growth from filter combinations.

### Insight definitions (concrete, tunable defaults as named constants)

All thresholds live as named constants so they are easy to tune.

- **Striking-distance** — dimension `query`. Keep rows with
  `position > 10 && position <= 20` and `impressions >= MIN_IMPRESSIONS` (default
  10). Sort by `impressions` desc. Field shown: impressions (= potential).
  Limit 50.
- **Low-CTR-high-impressions** — dimension `query`. Keep rows with
  `position <= 10` (already page 1) and `impressions >= MIN_IMPRESSIONS_CTR`
  (default 20). Rank by `missedClicks = impressions * max(0, expectedCtr(position)
  - ctr)`, where `expectedCtr` is a static position→CTR lookup table
  (approx: 1→0.28, 2→0.15, 3→0.11, 4→0.08, 5→0.06, 6→0.05, 7→0.04, 8→0.03,
  9→0.028, 10→0.025). Sort by `missedClicks` desc. Limit 50.
- **Cannibalization** — dimensions `query,page`. Group by query; count pages
  with `impressions >= MIN_IMPRESSIONS_CANNIBAL` (default 5); flag queries with
  `>= 2` such pages. Sort by total impressions desc. Limit 50. Each row lists
  the competing pages.
- **Movers** — current vs previous equal-length period, dimension `query` (and
  `page` as a second list). Join by key; keep keys with
  `max(currentImpr, prevImpr) >= MIN_IMPRESSIONS_MOVERS` (default 20). Compute
  `deltaClicks` and `deltaPosition` (note: position increasing = worse). Return
  top 25 gainers and top 25 losers by `deltaClicks`. Position delta shown
  alongside.

### Frontend (page + components)

`+page.svelte` orchestrates; logic split into focused components under
`apps/web/src/lib/components/seo/` (or `analytics/`):

- `GscFilters.svelte` — period, compare toggle, search-type selector, filter
  inputs (query contains, country, device, brand/non-brand). Emits a filter
  state object. The brand/non-brand toggle uses a brand term that defaults to
  the project name (lowercased) and is editable in the UI; it maps to a
  `query` `contains` / `notContains` filter.
- `GscOverview.svelte` — clicks/impressions/CTR/position cards with deltas vs
  previous period + a by-date Chart.js line chart.
- `GscPerformanceTable.svelte` — sortable, paginated table for a dimension;
  row click triggers drill-down (re-queries the opposite dimension filtered by
  the clicked key). Used for both Queries and Pages.
- `GscInsights.svelte` — four insight sections (striking-distance, low-CTR,
  cannibalization, movers), each a list with explanation and links to the
  query/page.

Data flow: the page holds filter state; on change it calls
`/google/search-console/query` (overview + tables) and
`/google/search-console/insights`. Drill-down issues a scoped `query` call.
Reuses Chart.js and the table/empty-state patterns from `SearchConsolePanel`.

### Error handling / edge cases

- GSC not connected → "connect" prompt (same as panel), no API calls.
- API error / quota → graceful error state with retry.
- Fresh-but-incomplete last 1–2 days (GSC finalizes data late) → labeled.
- Empty result for a filter combination → per-section empty states.

### Testing

- Backend unit tests for the **pure insight functions** (`strikingDistance`,
  `lowCtr`, `cannibalization`, `movers`) over synthetic GSC rows, asserting the
  threshold logic and ordering; plus a test for param→request-body mapping
  (filters → `dimensionFilterGroups`, `type`, `startRow`).
- Frontend: `svelte-check` clean; live Playwright verification on a project with
  GSC connected (panel "Details" opens the page; tables/filters/drill-down/
  insights render).

## Components & boundaries

- `google-integrations.service.ts` — extend `fetchSearchConsoleData`; add
  `fetchSearchConsoleQuery` (with comparison merge) and `computeGscInsights`
  (delegating to the four pure functions, which live in a new
  `gsc-insights.util.ts` for isolated testing).
- `google-integrations.controller.ts` — two new endpoints.
- `SearchConsolePanel.svelte` — add a "Details" link to the new route (small
  change; otherwise unchanged).
- New page + 4 components — each one responsibility.

## Implementation phasing (informs the plan, one spec)

backend query+fetch extension → insight util + insights endpoint → page shell +
overview → performance tables + drill-down → filters + search types → insights
UI → panel "Details" link.
