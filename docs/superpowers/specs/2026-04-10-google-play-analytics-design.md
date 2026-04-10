# Google Play Console Analytics for Mobile App Projects

**Date:** 2026-04-10
**Status:** Approved

## Overview

Add Google Play Console integration for projects with `projectType === MOBILE_APP`. The analytics page switches entirely to mobile-specific metrics for these projects. Users connect via OAuth2 or Service Account at the project level. Includes AI-generated replies to app reviews.

## 1. Data Models (Prisma)

### New model: `AppStoreMetrics`

Daily metrics for mobile apps (analogous to `DailyMetrics` for web):

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `projectId` | String | FK → Project |
| `date` | DateTime | Unique with projectId |
| `installs` | Int | Daily installs |
| `uninstalls` | Int | Daily uninstalls |
| `updates` | Int | Daily updates |
| `activeDeviceInstalls` | Int | Total active devices |
| `storeListingVisitors` | Int | Store page visitors |
| `storeListingConversions` | Float | Conversion rate (installs/visitors) |
| `crashes` | Int | Daily crash count |
| `anrs` | Int | Daily ANR count |
| `crashRate` | Float | Crash rate % |
| `anrRate` | Float | ANR rate % |
| `averageRating` | Float | Average rating on that day |
| `totalRatings` | Int | Cumulative total ratings |
| `ratingsCount1`..`ratingsCount5` | Int | Ratings distribution |
| `revenue` | Float | Daily revenue (in project's baseCurrency) |
| `revenuePerUser` | Float | ARPU |
| `newSubscriptions` | Int | New subscriptions |
| `cancelledSubscriptions` | Int | Cancelled subscriptions |
| `activeSubscriptions` | Int | Total active subscriptions |

**Unique constraint:** `@@unique([projectId, date])`

### New model: `AppReview`

Cached Google Play reviews:

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `projectId` | String | FK → Project |
| `reviewId` | String | Google Play review ID, unique |
| `authorName` | String | Reviewer name |
| `language` | String | Review language code |
| `starRating` | Int | 1-5 |
| `text` | String | Review text |
| `reviewCreatedAt` | DateTime | Original review date |
| `replyText` | String? | Our reply |
| `replyCreatedAt` | DateTime? | When we replied |
| `aiSuggestedReply` | String? | AI-generated reply (before confirmation) |
| `isReplied` | Boolean | Default: false |
| `metadata` | Json? | Device info, app version, etc. |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint:** `@@unique([projectId, reviewId])`

### Existing model changes

**`ProjectApiKey`:** No schema change. For Google Play, the `config` JSON field stores:
```json
{
  "type": "PLAY_CONSOLE",
  "authMethod": "oauth2" | "service_account",
  "packageName": "com.example.myapp",
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": "...",
  // or for service account:
  "serviceAccountKey": "{ ... }",
  "lastSyncAt": "...",
  "initialSyncCompleted": true
}
```

**New enum `GoogleIntegrationType`:** `SEARCH_CONSOLE`, `ANALYTICS`, `PLAY_CONSOLE` — used in config JSON to distinguish Google integrations within the `GOOGLE` platform.

## 2. API Module

### Structure

```
apps/api/src/google-play/
  google-play.module.ts
  google-play.controller.ts
  google-play-auth.service.ts
  google-play-metrics.service.ts
  google-play-reviews.service.ts
  google-play-sync.service.ts
  dto/
    connect-oauth.dto.ts
    connect-service-account.dto.ts
    reply-review.dto.ts
    metrics-query.dto.ts
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/google-play/auth-url` | Get OAuth2 authorization URL |
| `GET` | `/google-play/auth/callback` | OAuth2 callback (exchange code for tokens) |
| `POST` | `/google-play/connect/service-account` | Upload Service Account JSON + package name |
| `DELETE` | `/google-play/disconnect` | Disconnect integration |
| `GET` | `/google-play/status` | Connection status + app list |
| `GET` | `/google-play/metrics` | Metrics for period (query: projectId, startDate, endDate) |
| `GET` | `/google-play/metrics/totals` | Totals with % change and trend |
| `GET` | `/google-play/reviews` | Reviews list (query: projectId, page, starRating, hasReply) |
| `POST` | `/google-play/reviews/:reviewId/reply` | Send reply to review via Google Play API |
| `POST` | `/google-play/reviews/:reviewId/ai-reply` | Generate AI reply (returns suggested text) |
| `POST` | `/google-play/sync` | Manual sync trigger |

All endpoints are project-scoped (projectId from query params), protected by JWT auth guard.

### Auth flows

**OAuth2:**
1. `GET /google-play/auth-url?projectId=X` → redirect URL with scope `androidpublisher`
2. Google callback → exchange code → save tokens in `ProjectApiKey` (encrypted AES-256-CBC)
3. Fetch app list → user selects package name
4. Start initial sync (up to 12 months)

**Service Account:**
1. `POST /google-play/connect/service-account` with JSON key + package name
2. Validate key (test API call)
3. Save in `ProjectApiKey` (encrypted)
4. Start initial sync

### Background sync

- **Cron:** Every 6 hours (PRO), every 1 hour (ENTERPRISE)
- **Initial sync:** Pulls max history — 6 months (PRO), 12 months (ENTERPRISE)
- Uses `@Cron()` decorator, iterates over all projects with active Google Play integration
- Syncs: `AppStoreMetrics` (daily rows) + `AppReview` (new/updated reviews)
- On sync failure: logs error, retries next cycle, does not disconnect

### Dependencies

- `googleapis` package (Google APIs Node.js client) — for Play Developer API v3
- Reuses existing encryption utils from social module

## 3. Frontend — Mobile Analytics Dashboard

### Switching logic

In `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`:
- Check `project.projectType === 'MOBILE_APP'`
- If yes → render `MobileAnalyticsDashboard.svelte`
- If no → current web analytics (no changes)

### Tabs

| Tab | Content |
|-----|---------|
| **Overview** | 4 KPI cards (installs, rating, revenue, crash rate) with % change + trend charts |
| **Installs** | Installs/uninstalls/updates line chart, active devices |
| **Store Listing** | Visitors → conversion to install, funnel visualization |
| **Stability** | Crashes + ANR: count, rate, trend chart |
| **Revenue** | Revenue chart, subscriptions (new/cancelled/active), ARPU |
| **Reviews** | Review list with filters (stars, date, unreplied). "AI Reply" button per review |

### New components

```
apps/web/src/lib/components/analytics/
  MobileAnalyticsDashboard.svelte    — wrapper with tabs
  MobileKpiCards.svelte              — 4 KPI cards with % change
  InstallsChart.svelte               — installs/uninstalls/updates (chart.js)
  StabilityChart.svelte              — crashes/ANR chart
  RevenueChart.svelte                — revenue and subscriptions
  StoreListingStats.svelte           — store listing conversion
  ReviewsList.svelte                 — reviews list with filters
  ReviewCard.svelte                  — single review with AI reply button
```

### Period selector

Same as current analytics: 7, 30, 90 days.

### "Not connected" state

If Google Play not connected → banner: "Connect Google Play Console to see your app analytics" + button → navigates to project settings.

## 4. Project Settings — Google Play Connection

### Location

In project settings page, alongside existing Google integrations (GSC, GA4). **Only visible for `projectType === MOBILE_APP`.**

### UI states

**Not connected:**
- Title + description of benefits
- "Connect with Google" button (OAuth2 flow)
- "Use Service Account" button → expands form: JSON file upload + package name input

**Connected:**
- Green "Connected" badge
- Package name display (e.g., `com.example.myapp`)
- Last sync timestamp
- "Sync Now" button
- "Disconnect" button with confirmation modal

### OAuth2 flow (user perspective)

1. Click "Connect with Google"
2. Redirect to Google consent screen (scope: `androidpublisher`)
3. Authorize → callback → back to settings
4. Select app from dropdown (package name)
5. Initial sync starts (progress indicator)

### Service Account flow

1. Click "Use Service Account"
2. Upload JSON key file + enter package name
3. Validation spinner → success/error
4. Initial sync starts

## 5. AI Replies to Reviews

### Mechanism

Synchronous call via `ChatOpenAI` in `google-play-reviews.service.ts` — no Bull queue needed (short request).

### Prompt design

**System message context:**
- App name and description from project
- Review language (reply in same language)
- Review text + star rating (1-5)
- Tone: professional, empathetic, constructive

**Rules by rating:**
- **1-2 stars:** Apologize, acknowledge the issue, offer solution or support contact
- **3 stars:** Thank, ask what could be improved
- **4-5 stars:** Thank, encourage continued use
- **Length:** 2-4 sentences
- **No template phrases**

### UX flow

1. Click "AI Reply" → spinner
2. AI response appears in editable textarea
3. User can edit the text
4. Click "Send Reply" → `POST /google-play/reviews/:reviewId/reply` → sent to Google Play API
5. Review updates: `isReplied: true`, `replyText` saved

### Limits

AI reply generation counts toward AI generation limit (FREE: 50/mo, PRO: 500/mo, ENTERPRISE: unlimited).

## 6. i18n

New keys in all three locales (en/pl/ru) under `googlePlay` namespace:
- Tab titles, KPI card labels, connection statuses
- Button texts (Connect, Disconnect, Sync Now, AI Reply, Send Reply)
- "Not connected" banner, confirmation modals
- Error messages (invalid key, no access, sync failed)
- Review filters (by stars, date, unreplied)

## 7. Plan Limits

| Feature | FREE | PRO | ENTERPRISE |
|---------|------|-----|------------|
| Google Play integration | No (upgrade banner) | Yes | Yes |
| AI review replies | — | From AI gen limit (500/mo) | Unlimited |
| Sync frequency | — | Every 6 hours | Every 1 hour |
| Initial history | — | 6 months | 12 months |

FREE plan: Google Play section visible in settings with upgrade banner ("Upgrade to PRO to connect Google Play Console").

## 8. Google Play Developer API

### APIs used

- **Google Play Developer API v3** (`androidpublisher` scope)
  - `reviews.list` / `reviews.get` / `reviews.reply` — review management
  - Reporting API — stats download (installs, crashes, ratings, revenue)

### Rate limits

- Default quota: 200,000 requests/day
- Sync batches data to minimize API calls
- Token refresh handled automatically (OAuth2) or via service account JWT

### Data mapping

| Google Play metric | → AppStoreMetrics field |
|-------------------|------------------------|
| `installEvents` | `installs` |
| `uninstallEvents` | `uninstalls` |
| `updateEvents` | `updates` |
| `activeDeviceInstalls` | `activeDeviceInstalls` |
| `storeListingVisitors` | `storeListingVisitors` |
| `storeListingInstalls / visitors` | `storeListingConversions` |
| `crashes` | `crashes` |
| `anrs` | `anrs` |
| `crashes / activeDevices` | `crashRate` |
| `averageRating` | `averageRating` |
| `totalRatingCount` | `totalRatings` |
| `earnings` | `revenue` |
| `newSubscriptions` | `newSubscriptions` |
