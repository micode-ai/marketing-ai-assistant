# Dashboard Stats — Design

**Date:** 2026-04-20
**Issue:** https://github.com/micode-ai/marketing-ai-assistant/issues/54
**Scope:** Frontend only (`apps/web`). No API changes.

## Problem

`/dashboard` currently shows only a list of projects with mini-counters (content, campaigns, checklists). Users cannot see aggregate health of their organization (total activity, trends across projects) without navigating to the `/analytics` page or opening each project.

## Goal

Add three sections to `/dashboard`:

1. **Organization KPI** — non-temporal counters (totals).
2. **Activity metrics** — temporal counters with period selector (7/30/90d) and trend indicators.
3. **Extended project cards** — each project card gets a mini-stats section for the selected period.

## Data Sources (existing endpoints, no backend work)

| Endpoint | Purpose | Used where |
|----------|---------|------------|
| `GET /analytics/summary?organizationId=X` | Totals: `contentCountAll`, `campaignCount`, `subscriberCount`, `socialAccountCount` | KPI block (period-independent) |
| `GET /analytics/totals?organizationId=X&days=N` | Returns `{ total, change, trend }` for visitors/leads/conversions/emails over N days vs. previous N days | Activity block |
| `GET /analytics/org-summary?organizationId=X&period=Nd` | Returns `byProject[]` with `content / emailsSent / pageViews / conversions` per project | Per-project card stats |

All three are already implemented in `apps/api/src/analytics/analytics.service.ts`.

## UI Structure

```
┌─ Header (title + Import/Create) ──────────────────────────┐
│                                                           │
├─ KPI block (period-independent) ──────────────────────────┤
│  [Content] [Campaigns] [Subscribers] [Social accounts]    │
│                                                           │
├─ Activity block  [period: 7d | 30d | 90d] ────────────────┤
│  [Visitors ↑12%] [Leads ↓3%] [Conversions ↑8%] [Opens]    │
│                                                           │
├─ Projects grid (extended cards) ──────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐                     │
│  │ Project card  │  │ Project card  │  …                  │
│  │ (existing)    │  │ (existing)    │                     │
│  │ ─────         │  │ ─────         │                     │
│  │ Last N days:  │  │ Last N days:  │                     │
│  │ 👁 views      │  │ 👁 views      │                     │
│  │ 📧 opens      │  │ 📧 opens      │                     │
│  │ 🎯 conv.      │  │ 🎯 conv.      │                     │
│  └───────────────┘  └───────────────┘                     │
└───────────────────────────────────────────────────────────┘
```

The period selector controls **both** the Activity block and the per-project card stats (single source of truth).

## Components

Two small Svelte components, kept next to `+page.svelte` for locality:

### `DashboardKpiCards.svelte`
- Props: `organizationId: string`, `period: 7 | 30 | 90` (bindable).
- Owns the loading/state for summary + totals.
- Emits period changes back to parent via `bind:period`.
- Internal state:
  - `summary` — loaded once on mount.
  - `totals` — reloaded whenever `period` changes.
- Handles skeleton + error states independently.

### `ProjectCardStats.svelte`
- Props: `stats: { pageViews, emailsSent, conversions, content } | undefined`, `period: number`.
- Pure presentational. If `stats` is undefined (loading), shows skeleton; if all zeros, shows "No activity in last N days".

### `+page.svelte` integration
- Adds single state variable `period: 7 | 30 | 90 = 30`.
- Loads `orgSummary` (byProject) via reactive statement when `period` changes; stores in `Map<projectId, ProjectStats>`.
- Passes `stats[project.id]` to `<ProjectCardStats>` inside each card.

## States

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton placeholders for KPI cards and each project's stats section (prevents layout shift). |
| Zero metrics | KPI shows `0`, trend shows `—` (no arrow). |
| API error | Stats sections hide; project list remains fully functional. |
| No projects (0) | KPI + activity blocks hidden; existing empty state shown. |
| Period changes | Activity block + per-project stats reload together; KPI unchanged. |

## i18n

New keys in `packages/i18n/src/locales/{en,pl,ru}.json` under `dashboard` namespace:

```
dashboard.kpiTotalContent
dashboard.kpiCampaigns
dashboard.kpiSubscribers
dashboard.kpiSocialAccounts
dashboard.activityVisitors
dashboard.activityLeads
dashboard.activityConversions
dashboard.activityEmailOpens
dashboard.periodLabel
dashboard.period7d
dashboard.period30d
dashboard.period90d
dashboard.lastNDays          # "Last {n} days"
dashboard.noActivity         # "No activity"
dashboard.noChange           # "—"
```

## Out of Scope

- Sparkline/chart visualisations — deferred. Simple numbers only for v1.
- Custom date ranges — only 7/30/90 fixed options.
- Comparison between projects (already exists in `/analytics`).
- New backend endpoints.

## Acceptance Criteria

- [ ] KPI block loads from `/analytics/summary` and renders above the project list.
- [ ] Activity block shows trends, recalculated on period change.
- [ ] Period selector (7/30/90) drives both activity block and per-project stats.
- [ ] Per-project stats render from `byProject[]` under each card.
- [ ] Skeleton placeholders shown during load.
- [ ] Stats API errors do not break the project list.
- [ ] All strings localised in `en/pl/ru`.
- [ ] Mobile layout stacks KPI cards vertically.

## Risks / Open Questions

None significant. All data is already served by existing endpoints; this is a pure UI composition.
