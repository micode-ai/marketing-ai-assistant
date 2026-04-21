# SEO Module Overhaul — Design Spec

**Issue:** #64
**Date:** 2026-04-21
**Status:** Draft

## Summary

Close the gap between what `user_docs/*/08-advanced-features.md` promises for the SEO module and what the app actually delivers. Four workstreams:

- **A.** Clarify the existing keyword UI (Target URL field, Intent explanation)
- **B.** Automatic rank tracking via Google Custom Search JSON API (user-provided key, free tier)
- **C.** Dedicated keyword detail page with rank-history line chart
- **D.** AI-driven competitor suggestions via the existing SEO agent

## Goals

- A user can set a target URL and locale for every tracked keyword
- The app pulls current Google rankings on a schedule without manual entry
- The keyword detail page shows a real rank history chart (not a sparkline)
- The SEO agent proposes candidate competitors; users approve before they land in the table
- User docs (EN/PL/RU) are rewritten to match the new flow

## Non-Goals

- SEMrush/Ahrefs-level SERP feature parity (SERP features, rich snippets, PAA boxes)
- Backlink tracking
- Keyword cannibalization analysis
- Self-hosted scraping or paid SERP providers — free tier only in v1
- Managed CSE keys — each project supplies its own Google Cloud API key

## Data Model Changes

Changes to `packages/database/prisma/schema.prisma`:

### `Keyword` — add columns
```prisma
locale        String    @default("en-US")   // BCP-47 locale, falls back to Project.language
lastCheckedAt DateTime?                      // last successful rank check
lastCheckError String?                       // error code if last check failed
```

- `locale` defaults to `"en-US"` at the schema level; service-layer `createKeyword` populates it from `Project.language` (mapped `en → en-US`, `pl → pl-PL`, `ru → ru-RU`) when the caller omits it.
- Existing `@@unique([projectId, keyword])` stays — locale is not part of the uniqueness. A user who wants to track the same phrase in two locales creates two rows with different keyword text or extends the unique later. This is a v1 tradeoff; revisit if users complain.

### `Competitor` — add columns
```prisma
status       CompetitorStatus @default(ACTIVE)
aiRationale  String?
suggestedAt  DateTime?
approvedAt   DateTime?
```

New enum:
```prisma
enum CompetitorStatus {
  SUGGESTED   // proposed by AI, awaiting user approval
  ACTIVE      // approved or user-created, counts in UI
  DISMISSED   // rejected suggestion; kept so AI doesn't re-propose
}
```

Migration backfill: all existing rows → `status = ACTIVE`, `approvedAt = createdAt`.

The existing `Competitor.isActive` boolean is kept but becomes legacy: new code reads/writes `status` only. The migration leaves `isActive` untouched. A follow-up cleanup PR may drop it once no code depends on it, but that is out of scope for this spec.

### `ProjectApiKey` — add column
```prisma
lastValidationError String?
```
Set by the rank-tracking path when Google CSE rejects the credentials; cleared on the next successful check. Drives the "invalid key" banner on the SEO page.

### `SocialPlatform` enum — add value
```prisma
GOOGLE_CSE   // stored in ProjectApiKey; encryptedKey carries JSON {apiKey, cseId}
```

No new table for CSE config — we reuse `ProjectApiKey` the same way Google Play does.

### `KeywordRankHistory` — no changes
The existing `(keywordId, date)` unique + upsert behavior in `SeoService.addRankHistory` already fits.

## Backend

### Module structure
```
apps/api/src/seo/
  seo.service.ts              # existing, no major changes
  seo.controller.ts           # existing, add new endpoints
  rank-tracking.service.ts    # NEW — Google CSE integration
  rank-tracking.cron.ts       # NEW — scheduled checks
  competitor-suggestion.service.ts # NEW — calls AI agent
  cse-config.service.ts       # NEW — encrypt/decrypt CSE credentials
  dto/
    configure-cse.dto.ts      # { apiKey, cseId }
    suggest-competitors.dto.ts
    approve-competitor.dto.ts
```

### `RankTrackingService.checkKeyword(keywordId)`

1. Load `Keyword` with `project.organizationId`
2. Skip if `isTracking === false` or `url` (target URL) is null — record `lastCheckError = 'NO_TARGET_URL'`
3. Fetch CSE credentials via `CseConfigService.getCredentials(projectId)`; if missing, skip and record `lastCheckError = 'CSE_NOT_CONFIGURED'`
4. Call Google CSE (`customsearch/v1`, `num=10`, paginate 10 pages → top 100) with:
   - `q = keyword.keyword`
   - `cx = cseId`, `key = apiKey`
   - `gl` and `hl` derived from `keyword.locale`
5. Scan results for the first URL whose origin matches `keyword.url` origin (host-level match, query and path ignored). Position = 1-based index.
6. Upsert `KeywordRankHistory` for today via existing `SeoService.addRankHistory`. Store `null` rank if not found in top 100.
7. Set `keyword.lastCheckedAt = now()`, `keyword.lastCheckError = null` on success.
8. On Google API error: set `lastCheckError = <code>` (e.g., `QUOTA_EXCEEDED`, `INVALID_API_KEY`). Do not throw from cron path.

### `RankTrackingCronService`

- `@Cron('0 3 * * *')` — daily 03:00 UTC
- Iterate active projects that have a CSE config. For each project:
  - Load the plan via `Subscription`
  - **FREE:** only run on Mondays (`new Date().getUTCDay() === 1`). Cap at 5 keywords ordered by `createdAt ASC`.
  - **PRO:** run every day. Cap at 30 keywords.
  - **ENTERPRISE:** run every day. Cap at 90 keywords.
- Only pick `Keyword` where `isTracking = true` AND `url IS NOT NULL`, ordered by `createdAt ASC`.
- Calls `RankTrackingService.checkKeyword` sequentially per project (respects CSE 10 QPS rate limit with a small per-call throttle, e.g. 500 ms).
- Wraps each project's batch in a try/catch; reports via `CronFailureNotifier.report({ cronName: 'rank-tracking', resourceType: 'PROJECT', resourceId: projectId, errorCode })` on batch-level failures.

### Endpoints (new)

All require JWT + `ProjectAccessGuard` unless noted:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/seo/keywords/:id/check-now` | Run `checkKeyword` immediately, return updated keyword + rank |
| POST | `/seo/cse/config` | Body `{ projectId, apiKey, cseId }` — save encrypted CSE credentials |
| GET | `/seo/cse/config/:projectId` | Returns `{ configured: boolean, cseId?: string }` — never returns the raw key |
| DELETE | `/seo/cse/config/:projectId` | Disconnect |
| POST | `/seo/competitors/suggest` | Body `{ projectId }` — dispatch AI agent to propose competitors, save as `SUGGESTED` |
| GET | `/seo/competitors?projectId=X&status=SUGGESTED` | Filter by `status` (existing endpoint, extend query) |
| POST | `/seo/competitors/:id/approve` | Move `SUGGESTED → ACTIVE`, set `approvedAt` |
| POST | `/seo/competitors/:id/dismiss` | Move `SUGGESTED → DISMISSED` |

### `check-now` rate limiting

Protect the user's CSE quota from UI spam: max 3 calls per keyword per hour, returned as `429` with a hint in the body. Throttle in-memory per keyword ID (simple LRU, no Redis — quota only matters per project which has one Google account).

## AI Agent Changes

`apps/ai-agent/src/agents/seo-agent.ts` gains a new LangGraph action `suggestCompetitors`:

**Input:**
```ts
{
  projectId: string,
  projectName: string,
  industry?: string,
  websiteUrl?: string,
  targetKeywords: string[],
  existingCompetitorUrls: string[],  // exclude these (ACTIVE + DISMISSED)
  locale: string,
  count: number  // default 5
}
```

**Output:**
```ts
{
  competitors: Array<{
    name: string,
    websiteUrl: string,
    rationale: string  // 1–2 sentences, why this is a relevant competitor
  }>
}
```

The agent uses the existing web-search tool to find real companies. It is instructed to skip any URL present in `existingCompetitorUrls` (case-insensitive host match) and to normalize URLs to origin-only (`https://example.com`).

Exposed via the existing `POST /agent/run` entry point with `agentType: 'SEO'`, `input.action: 'suggest-competitors'`. The API-side `CompetitorSuggestionService` waits for the run (polling the existing agent-run queue) and persists each returned competitor with `status = SUGGESTED`, `suggestedAt = now()`, `aiRationale = rationale`.

## Frontend

### Add/Edit Keyword modal (`apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte`)

New fields:
- **Target URL** (text input, placeholder `https://your-page.com/path`) — with helper text: "The page you want to rank for this keyword"
- **Locale** (select: `pl-PL`, `en-US`, `ru-RU`) — default from `project.language`, label "Search locale"
- **Intent** dropdown — keep existing options, add helper text under the select explaining the four values (i18n keys already exist for labels; add `seo.intentHelper` keys)

New column in keyword table: `Target URL` (host only, truncated, tooltip = full URL)

New row action (icon button): `Check now` — calls `POST /seo/keywords/:id/check-now`, shows inline spinner, updates `currentRank` on success. Handles 429 with a toast.

### Keyword detail page (new)

Route: `apps/web/src/routes/(app)/projects/[id]/seo/keywords/[keywordId]/+page.svelte`

Contents:
- Header: keyword text, locale badge, intent badge, target URL link, `Check now` button
- Rank history line chart — **Chart.js** (already used by `/analytics` pages; confirm via `apps/web/package.json` before writing the plan — if absent, use `svelte-chartjs` or the lightweight approach already in the codebase)
- Date range picker: 7d / 30d / 90d / custom. Default 30d.
- Reference line at `targetRank` if set
- Table below the chart: date, rank, URL found (last 30 entries)
- Edit / Delete actions

The existing sparkline in the list page stays as a glance view; this detail page is the "View history" target promised in the docs.

### Google CSE configuration

New section inside `apps/web/src/routes/(app)/projects/[id]/settings/+page.svelte` (follow the Google Play section pattern):

- Two inputs: **API key** (password input), **CSE ID** (text)
- Link to Google Cloud Console / Programmable Search setup (opens in new tab)
- Connected state: shows masked key (`••••••••`) + CSE ID, with `Disconnect` button
- Small inline doc: "Free tier: 100 searches/day per Google Cloud project"

### Competitors tab

Existing competitors page/section gains:
- Button **Suggest competitors with AI** — POSTs to `/seo/competitors/suggest`, shows a loading state ("AI is analyzing your project…")
- New "Suggested" section at top of the list: cards with competitor name, URL, AI rationale, and `Approve` / `Dismiss` buttons
- Active competitors render as today
- Dismissed competitors hidden from the default view; toggle to show

### i18n

New keys in `packages/i18n/src/locales/{en,pl,ru}.json` under `seo`:

- `targetUrl`, `targetUrlHelper`
- `locale`, `localeHelper`
- `intentHelper`, `intentInformationalHelper`, `intentNavigationalHelper`, `intentCommercialHelper`, `intentTransactionalHelper`
- `checkNow`, `checkNowRateLimited`, `checkingRank`
- `cseConfig.title`, `cseConfig.apiKey`, `cseConfig.cseId`, `cseConfig.setupLink`, `cseConfig.quotaHint`, `cseConfig.connected`, `cseConfig.disconnect`
- `history.title`, `history.range7d`, `history.range30d`, `history.range90d`, `history.rangeCustom`, `history.targetRankLine`
- `competitors.suggestWithAi`, `competitors.suggestedSection`, `competitors.aiRationale`, `competitors.approve`, `competitors.dismiss`, `competitors.suggesting`
- Error labels: `errors.cseNotConfigured`, `errors.cseQuotaExceeded`, `errors.cseInvalidKey`, `errors.noTargetUrl`

## User Docs

Rewrite the SEO section in `user_docs/{eng,pl,ru}/08-advanced-features.md`:

- Remove the "Record position" / "Запись позиций" flow
- Add: "Automatic tracking with Google CSE" — setup steps, where to paste key, free-tier quota
- Add: "Viewing rank history" — how to open detail page, range selection
- Add: "AI competitor suggestions" — how to invoke, approve/dismiss
- Keep existing keyword research / adding keywords, updated to mention Target URL + locale

Three locales kept in sync. The user's ongoing preference is that docs in user_docs/ru stay in Russian; EN/PL follow.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| CSE not configured | `check-now` returns `409` with `code: CSE_NOT_CONFIGURED`; cron records `lastCheckError` and skips |
| CSE quota exceeded (Google `dailyLimitExceeded`) | Abort project batch; `CronFailureNotifier` with `errorCode: 'CSE_QUOTA_EXCEEDED'`; user sees email + banner on SEO page |
| Invalid API key (`keyInvalid`) | Flip config to invalid state (stored in `ProjectApiKey` — nullable `lastValidationError` column OR simply fail loudly); surface banner "Google CSE key is invalid. Update in settings." |
| Target URL missing | Skip with `lastCheckError = 'NO_TARGET_URL'`; UI shows amber badge |
| Keyword not in top 100 | `rank = null`, shown as "Not ranked" in UI; still stored in history for trend |
| AI competitor suggestion fails | Surface error toast; no partial save |

The `ProjectApiKey.lastValidationError` column declared above drives the UI banner: set on the failing check, cleared on the next successful one.

## Testing Strategy

### Unit tests (`apps/api/src/seo/**/*.spec.ts`)
- `RankTrackingService.checkKeyword` — mock `googleapis` `customsearch.cse.list`; assert:
  - Finds position by host match, ignores path/query differences
  - Returns null when target URL absent from top 100
  - Records `NO_TARGET_URL` when url missing
  - Records `CSE_NOT_CONFIGURED` when credentials missing
  - Records `CSE_QUOTA_EXCEEDED` when Google returns 429
- `RankTrackingCronService` — inject mocked service + fake time; assert plan-based cadence and keyword caps
- `CseConfigService` — encrypt/decrypt round-trip
- `CompetitorSuggestionService` — mocks agent run, asserts `SUGGESTED` rows and existing-URL filter

### Integration (existing `apps/api/test/` patterns)
- E2E: POST `/seo/cse/config` → GET returns `configured: true` without leaking key
- E2E: Approve flow creates `ACTIVE` row; dismiss creates `DISMISSED`

### Manual QA
- Run `pnpm dev`, open `/projects/:id/seo`, add keyword with PL locale + target URL, click "Check now" with valid Google CSE credentials, verify `rank` populates and appears on detail page chart

## Open Risks / Decisions Deferred

- **Uniqueness on `Keyword`:** same phrase in two locales currently collides because `(projectId, keyword)` is unique. Acceptable for v1; revisit if users report.
- **Chart library:** confirm whether `apps/web` already uses Chart.js or another library. Plan-writing phase will check `apps/web/package.json` and align.
- **Plan-based keyword cap:** enforced only by cron (silent truncation). The UI does NOT block adding more than N keywords — the overflow ones simply stop being auto-checked. If users complain we'll add a visible warning.
- **Google CSE origin match:** matches on `URL(result.link).host === URL(keyword.url).host`, ignoring `www.` prefix (stripped on both sides). Subdomains are treated as different hosts.

## Acceptance

- [ ] Add Keyword form exposes Target URL + Locale + Intent helper
- [ ] CSE config UI persists encrypted credentials; status endpoint never leaks the key
- [ ] Cron runs daily at 03:00 UTC with plan-based limits and writes to `KeywordRankHistory`
- [ ] `Check now` button triggers an immediate check with 3/hr rate limit
- [ ] Keyword detail page renders a real rank-history line chart
- [ ] `Suggest competitors` button produces ≥1 suggestion with rationale; approve/dismiss flows work
- [ ] `user_docs/{eng,pl,ru}/08-advanced-features.md` rewritten; no stale "Record position" text remains
- [ ] Unit + integration tests green; lint clean
