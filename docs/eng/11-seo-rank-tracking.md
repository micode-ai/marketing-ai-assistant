# SEO Rank Tracking & Google Search Console Integration

## Overview

The SEO module provides keyword rank tracking with two data sources: manual entry and automatic sync from Google Search Console (GSC). It also surfaces GSC search-analytics data (clicks, impressions, CTR, position) in a dedicated Analytics panel, and feeds AI-generated competitor suggestions via the `SEO` agent type.

**Architecture sketch:**

```
User
 │
 ├─ /projects/[id]/seo          → SeoController  → SeoService
 │                                                → CompetitorSuggestionService
 │                                                → GscSyncService
 │
 ├─ /projects/[id]/settings     → GoogleIntegrationsController → GoogleIntegrationsService
 │
 └─ /projects/[id]/analytics    → GoogleIntegrationsController → fetchSearchConsoleSummary()
                                   (SearchConsolePanel.svelte)
```

**Key files:**

| Path | Purpose |
|------|---------|
| `apps/api/src/seo/seo.service.ts` | Keyword and history CRUD |
| `apps/api/src/seo/gsc-sync.service.ts` | GSC-to-keyword sync logic |
| `apps/api/src/seo/competitor-suggestion.service.ts` | AI competitor suggestions |
| `apps/api/src/seo/rank-tracking.cron.ts` | Daily sync cron |
| `apps/api/src/seo/seo.controller.ts` | REST endpoints |
| `apps/api/src/seo/seo.module.ts` | Module definition |
| `apps/api/src/google-integrations/` | OAuth, config, GSC analytics |
| `apps/web/src/routes/(app)/projects/[id]/seo/` | SEO page + keyword detail |
| `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte` | GSC analytics panel |

---

## Data Model

### Keyword

```prisma
model Keyword {
  id             String    @id @default(cuid())
  keyword        String
  url            String?                        // target URL; falls back to project.websiteUrl in sync
  locale         String    @default("en-US")    // search locale (pl-PL / en-US / ru-RU)
  intent         KeywordIntent?                 // INFORMATIONAL / NAVIGATIONAL / COMMERCIAL / TRANSACTIONAL
  targetRank     Int?                           // goal rank shown as reference line on history chart
  currentRank    Int?                           // last known position
  isTracking     Boolean   @default(true)
  lastCheckedAt  DateTime?
  lastCheckError String?
  projectId      String
  organizationId String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  project  Project            @relation(...)
  history  KeywordRankHistory[]
  ...
}
```

### KeywordRankHistory

```prisma
model KeywordRankHistory {
  id        String   @id @default(cuid())
  keywordId String
  date      DateTime @db.Date
  rank      Int?     // null = "not in top 100"
  url       String?  // matched URL returned by GSC or entered manually

  keyword Keyword @relation(...)

  @@unique([keywordId, date])  // one record per keyword per day
}
```

The `@@unique([keywordId, date])` constraint allows upserts — syncing the same day twice updates the existing record rather than inserting a duplicate.

### Competitor

```prisma
model Competitor {
  id          String           @id @default(cuid())
  name        String
  websiteUrl  String
  status      CompetitorStatus @default(ACTIVE)
  aiRationale String?          // AI explanation for suggestions
  suggestedAt DateTime?
  approvedAt  DateTime?
  projectId   String
  ...
}

enum CompetitorStatus {
  SUGGESTED   // proposed by AI, not yet reviewed
  ACTIVE      // manually added or AI-approved
  DISMISSED   // rejected; excluded from future AI suggestions
}
```

### ProjectApiKey (platform: GOOGLE)

OAuth credentials for Google integrations are stored in the existing `ProjectApiKey` table with `platform = 'GOOGLE'`. The `apiKey` column holds a base64-encoded JSON string:

```json
{
  "accessToken": "ya29.xxx",
  "refreshToken": "1//xxx",
  "expiresAt": 1714000000000,
  "siteUrl": "https://example.com/",      // selected GSC property
  "propertyId": ""                         // GA4 property (future use)
}
```

There is one record per project per Google integration type. Multiple integrations (GSC + GA4) share the same row, differentiated by fields within the JSON payload.

---

## Manual Rank Entry

**Endpoint:** `POST /seo/keywords/:id/rank`

**Body:**
```json
{
  "rank": 5,          // 1–100, or null for "not in top 100"
  "url": "https://example.com/page"
}
```

**Flow:**

1. `SeoController.addRankHistory()` validates the body with `AddRankHistoryDto` (rank: optional Int 1–100; url: optional string).
2. Calls `SeoService.addRankHistory(keywordId, dto, userId)`.
3. Service verifies the keyword belongs to a project the user has access to.
4. Upserts `KeywordRankHistory` with `date = today (UTC)`.
5. Updates `Keyword.currentRank` and `Keyword.lastCheckedAt`.
6. Returns the updated `Keyword` with the new history entry.

---

## GSC Integration

### OAuth Flow

The Google OAuth integration uses a two-step browser redirect pattern. Bearer tokens cannot be passed in browser navigations, so the auth URL is fetched via an authenticated API call and then the browser navigates away:

```
Frontend                          API                              Google
   │                               │                                   │
   │── GET /api/google/auth-url ──►│                                   │
   │   (JWT in cookie)             │── build consent URL ─────────────►│
   │◄─ { url: "https://..." } ────│                                   │
   │                               │                                   │
   │── window.location = url ─────────────────────────────────────────►│
   │                               │◄─ code + state (projectId) ──────│
   │                               │── exchange code for tokens        │
   │                               │── store in ProjectApiKey          │
   │◄──────────────────────────────── redirect to /settings ──────────│
```

**Why `auth-url` returns JSON instead of redirecting:** the frontend needs to navigate the top-level browser window, not just follow a redirect from `fetch()`. Returning `{url}` lets the frontend call `window.location.href = url` after receiving it.

**Why the callback is `@Public()`:** the callback arrives from Google's servers as a browser redirect. At that point, the user's JWT cookies are not present in the request that Google sends — only the `code` and `state` query parameters are. The `@Public()` decorator skips `JwtAuthGuard` on this specific handler. The `state` parameter carries the `projectId` (base64-encoded) to identify which project to attach the credentials to.

**Scopes requested:**
- `https://www.googleapis.com/auth/webmasters.readonly` — Search Console read access
- `https://www.googleapis.com/auth/analytics.readonly` — GA4 read access (future use)

### Config Storage

`POST /api/google/config` — persists or updates the `ProjectApiKey` row for `platform = 'GOOGLE'`.

`DELETE /api/google/integration?projectId=...` — removes the `ProjectApiKey` row, disconnecting all Google integrations for the project.

### Token Refresh

`GoogleIntegrationsService.refreshAccessToken(projectId)` is called automatically whenever a GSC API call returns a 401. It:

1. Reads the stored JSON payload from `ProjectApiKey`.
2. Calls `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`.
3. Updates `accessToken` and `expiresAt` in the stored JSON.
4. Retries the original request with the new token.

---

## GSC Sync

### Manual Trigger

**Endpoint:** `POST /seo/keywords/sync-from-gsc`

**Body:** `{ "projectId": "..." }`

**Returns:**

```json
{
  "synced": 10,
  "matched": 7,
  "skipped": [{ "keywordId": "...", "keyword": "...", "reason": "NO_MATCH_IN_GSC" }],
  "details": [
    {
      "keywordId": "...",
      "keyword": "best coffee grinder",
      "rank": 14,
      "previousRank": 18,
      "reason": null
    }
  ],
  "siteUrl": "https://example.com/",
  "date": "2026-04-21"
}
```

**Skip reasons:**

| Reason | Meaning |
|--------|---------|
| `NO_URL` | Keyword has no target URL and project has no websiteUrl |
| `NO_MATCH_IN_GSC` | GSC returned no row matching this query + host combination |
| `ORG_SCOPED_NOT_SUPPORTED` | Keyword is org-scoped (no projectId); sync skips these |

### GscSyncService.syncProject

The core sync logic in `GscSyncService.syncProject(projectId)`:

1. Loads the project's GSC `ProjectApiKey` (platform `GOOGLE`). Returns early if absent.
2. Loads all `isTracking=true` keywords for the project.
3. For each keyword, determines the effective URL:
   - Use `keyword.url` if set.
   - Fall back to `project.websiteUrl` if `keyword.url` is null. This ensures keywords created before the Target URL default feature are still synced.
   - If neither is set, mark as `NO_URL` and skip.
4. Calls GSC `searchanalytics.query` with:
   - `startDate` = yesterday (UTC)
   - `endDate` = yesterday (UTC)
   - `dimensions: ['query', 'page']`
   - `dimensionFilterGroups` filtering by the keyword text (case-insensitive)
5. From the GSC response, finds the row where:
   - `keys[0]` matches the keyword (case-insensitive)
   - `keys[1]` has the same host as the effective URL (host-match, not full URL match)
6. On match: upserts `KeywordRankHistory` (position rounded to integer), updates `Keyword.currentRank`.
7. On no match: records `NO_MATCH_IN_GSC` in skip list; `currentRank` is not changed.

### Daily Cron

`RankTrackingCron` in `apps/api/src/seo/rank-tracking.cron.ts`:

```
@Cron('0 3 * * *')   // 03:00 UTC every day
```

For each project with a GSC connection, the cron calls `GscSyncService.syncProject`. Plan-based keyword limits apply:

| Plan | Max keywords synced | Cadence |
|------|--------------------|---------| 
| FREE | 5 | Mondays only |
| PRO | 30 | Daily |
| ENTERPRISE | 90 | Daily |

Cron failures are reported via `CronFailureNotifier` (same shared service used by all crons).

---

## Analytics Summary

**Endpoint:** `GET /api/google/search-console/summary?projectId=X&days=28`

Returns aggregated GSC data for the specified period.

**Response shape:**

```json
{
  "totals": {
    "clicks": 1200,
    "impressions": 45000,
    "ctr": 0.0267,
    "position": 18.4
  },
  "byDate": [{ "date": "2026-03-25", "clicks": 42, "impressions": 1800, "ctr": 0.023, "position": 19.1 }],
  "topQueries": [{ "query": "best coffee grinder", "clicks": 80, "impressions": 2000, "ctr": 0.04, "position": 6.2 }],
  "topPages": [{ "page": "/blog/coffee-grinders", "clicks": 120, ... }],
  "byDevice": [{ "device": "MOBILE", "clicks": 700, ... }],
  "byCountry": [{ "country": "pol", "clicks": 400, ... }]
}
```

**Aggregation approach:** six parallel `searchanalytics.query` calls with different `dimensions` values (`[]`, `['date']`, `['query']`, `['page']`, `['device']`, `['country']`). Results are merged into a single response object.

**Caching:** results are cached in-memory (plain `Map`) for 1 hour per `projectId + days` key. The cache is module-level (not Redis) — it resets on process restart. A single API pod holds one cache instance; this is acceptable given the 1-hour TTL and the relatively low traffic on this endpoint.

---

## Frontend Components

### SearchConsolePanel.svelte

Location: `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte`

Rendered conditionally on the project Analytics page when the project has a GSC connection. Calls `GET /api/google/search-console/summary?projectId=X&days=N` on mount and when the period selector changes.

Key behaviours:
- Four KPI cards with Chart.js sparklines (line chart per card, one data point per day).
- Avg Position chart has inverted y-axis (`reverse: true` in Chart.js scale config) so rank 1 appears at the top.
- Top queries and top pages tables are sortable client-side.
- Device breakdown uses a Chart.js doughnut.
- Not-connected state: compact banner with link to `/projects/[id]/settings`.

### GSC Settings Section

Location: `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte`

- **Connect button** → `GET /api/google/auth-url?projectId=X` → `window.location.href = url`.
- **Connected state**: auto-loads verified sites from `GET /api/google/gsc/sites?projectId=X`, pre-selects the best match (`sc-domain:<project-domain>` preferred, URL-prefix as fallback).
- **Disconnect button** → `DELETE /api/google/integration?projectId=X` → clears local state.

### SEO Page Sync Card

Location: `apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte`

- Sync button calls `POST /seo/keywords/sync-from-gsc`.
- Result card is persisted to `localStorage` keyed by `gsc_sync_result_<projectId>`. This means the card survives page reloads.
- Dismiss button removes the `localStorage` entry.
- When `matched === 0`, the card shows an amber explanatory block with a link to the GSC tab in settings.
- Per-keyword rows in the card show: keyword text, previous rank → new rank, a coloured arrow (green = improved, red = dropped, grey = unchanged).

---

## i18n Key Conventions

All SEO-related strings live under the `seo` namespace in `packages/i18n/src/locales/{en,pl,ru}.json`.

| Sub-namespace | Purpose |
|---------------|---------|
| `seo.*` | Keyword list, form fields, table headers, general labels |
| `seo.gscConfig.*` | Settings page — GSC connection section |
| `seo.recordPosition.*` | Manual entry modal labels |
| `seo.searchConsolePanel.*` | Analytics panel KPI labels, table headers |
| `seo.errors.*` | Error toast messages |

When adding new strings: add to `en.json` first, then translate to `pl.json` and `ru.json`. Run `cd packages/i18n && pnpm build` to verify JSON syntax.

---

## Known Limitations

### GSC Data Lag

Google Search Console data is typically 2–3 days behind real time. The daily sync at 03:00 UTC always queries for `yesterday`, which may itself be 1–2 days stale in GSC.

### OAuth App Verification Pending

The Google OAuth app is not yet verified. Users see the "This app isn't verified" interstitial and must click **Advanced → Continue** to proceed. This is tracked in issue #70. The app is production-safe; the verification process is a Google compliance step that takes several weeks.

Until verification is complete, the consent screen shows the app as unverified, which may cause user hesitation. Document this in user-facing help and notify users when verification is complete.

### GSC API Quota

Google Search Console API has a quota of 1,200 requests per minute per project. With the current sync design (one query per keyword per day), there is ample headroom even for ENTERPRISE-tier projects.

### Host-Level URL Matching

The sync service matches GSC rows by host (scheme + hostname), not the full path. If a project has two tracked keywords pointing to pages on the same host, the matcher selects the first GSC row whose host matches. This is generally correct but can produce unexpected results if GSC ranks a deeply nested page for a keyword while the target URL is a different path on the same host. Path-level matching is planned for a future release.

### Org-Scoped Keywords Not Synced

Keywords with `organizationId` set but `projectId = null` are skipped by the sync (reason: `ORG_SCOPED_NOT_SUPPORTED`). GSC credentials are stored per-project, so there is no suitable credential to use for org-scoped keywords. This is by design for now.

---

## Future Work

- **OAuth app verification** — complete Google's verification process (#70) to remove the "unverified app" interstitial.
- **Path-level URL matching** — match GSC rows on full URL path, not just host, to avoid false positives when multiple keywords target different paths on the same domain.
- **Bing Webmaster Tools support** — Bing provides a similar Search Performance API; adding it as a second data source would cover non-Google traffic.
- **Scheduled manual-check prompts** — notify users when a keyword hasn't been checked in N days and GSC has no data for it (e.g., new site).
- **Rank change alerts** — email or in-app notification when a keyword moves by more than N positions in a single sync.
