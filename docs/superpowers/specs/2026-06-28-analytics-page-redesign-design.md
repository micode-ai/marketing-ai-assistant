# Project Analytics Page Redesign — Design

**Date:** 2026-06-28
**Status:** Approved design — ready for implementation planning
**Scope owner:** `apps/web` (project analytics page + analytics components), `packages/i18n`

## Goal

Fix three problems with `/projects/[id]/analytics`:
1. **Chaos** — four independent analytics blocks (Website, GSC Search, Instagram, Threads) are stacked vertically into one long scroll. → Reorganize into **channel tabs** with a cross-channel **summary strip** above them.
2. **Repeated day-filters** — the page has four separate period selectors (web header `7/30/90`, GSC's own `28`, Instagram `7/28/90`, Threads `7/28/90`). → **One global period filter** that drives every channel.
3. **Unclear metrics** — only one top-level hint. → **`?` info-tooltips** on metrics and section headers.

## Approved decisions

| Decision | Choice |
|---|---|
| Organization | Channel tabs: **Overview · Website · Search (GSC) · Instagram · Threads · (App)** |
| Above-tabs summary | **Cross-channel KPIs** (Site visitors + conversions, GSC clicks, IG followers, Threads engagement) with trends |
| Global period | One selector `7 / 30 / 90`, applied to all channels |
| Overview content | Cross-channel KPI strip **+ combo trend chart + channel quick-links** |
| Tooltips | `?` info-tooltips (new `InfoTooltip` component), en/pl/ru |

## Non-goals

- New backend analytics endpoints beyond what already exists (reuse `/analytics/*`, `/google/search-console/summary`, `/instagram/metrics`, `/threads/metrics`, `/google-play/*`).
- Redesigning the internals of each channel's charts/tables (Website UTM/funnel/pages tables, IG/Threads post lists stay as-is — only their period selector is removed and `days` becomes a prop).
- GSC advanced filters (dimension/compare) overhaul — they stay inside the Search tab; only GSC's date range follows the global period.
- Mobile/App dashboard internals (already accepts `days`).

---

## 1. Page structure (`projects/[id]/analytics/+page.svelte`)

Replace the current "surface tabs (web/app) + stacked blocks + web sub-tabs" with a single **channel-tab container**:

```
[ SectionHint (top, existing) ]
[ Header:  "Analytics"  ............  Period: (7 | 30 | 90)  ]   ← ONE global selector
[ Overview summary strip: cross-channel KPI cards w/ trends + ? tooltips ]
[ Channel tabs:  Overview | Website | Search | Instagram | Threads | App ]
[ Active channel content ]
```

### 1.1 Channel tabs — visibility

A tab renders only when its channel is relevant/connected:

| Tab | Shown when | Content |
|---|---|---|
| **Overview** | always (≥1 channel available) | cross-channel summary (see §3) |
| **Website** | `gscConnected || projectType !== 'MOBILE_APP'` (existing `showWeb`) | existing web analytics: KPI cards + traffic/email/funnel charts + UTM/Funnel/Pages **sub-tabs** (the current `overview/utm/funnel/pages` become sub-views *inside* the Website tab) |
| **Search** | `gscConnected` | `SearchConsolePanel` (period-controlled) |
| **Instagram** | IG account linked (status.connected) | `InstagramAnalyticsDashboard` (period-controlled) |
| **Threads** | Threads account linked (status.connected) | `ThreadsAnalyticsDashboard` (period-controlled) |
| **App** | `appConnected || projectType === 'MOBILE_APP'` (existing `showApp`) | `MobileAnalyticsDashboard days={selectedPeriod}` (already prop-driven) |

- The existing `detectSurfaces()` already computes `gscConnected` / `appConnected`. Extend it to also probe IG + Threads connection (`GET /instagram/status`, `GET /threads/status`) so the Instagram/Threads tabs appear only when linked. These two dashboards already self-hide when not linked, but the tab itself must be hidden too.
- Default active tab: **Overview**. (If a project has exactly one channel, Overview still shows; the single channel's tab is also present.)
- Tab state persists in component state (no URL change required), mirroring the current `activeTab` pattern.

### 1.2 Global period

- Single `selectedPeriod: 7 | 30 | 90` (default 30) with one segmented control in the header.
- `switchPeriod(p)` sets `selectedPeriod` and triggers a refetch of the **active** tab's data (and the Overview summary). Other tabs refetch lazily on activation (existing lazy pattern).
- `selectedPeriod` is passed as `days={selectedPeriod}` to every child dashboard (Website internal fetches, `SearchConsolePanel`, `InstagramAnalyticsDashboard`, `ThreadsAnalyticsDashboard`, `MobileAnalyticsDashboard`).

## 2. Child component refactor — remove internal period selectors

Each channel dashboard currently owns a period selector. Make them **controlled** by the parent.

### 2.1 `SearchConsolePanel.svelte`
- Add `export let days: number = 30;`. Remove the internal `period` state + its selector UI. Use `days` in the summary/query fetches (currently `let period = 28; days: period`).
- Refetch when `days` changes (reactive `$: days, refetch()` guarded by mount, mirroring the existing project-switch watcher pattern).
- Keep GSC's advanced filters (dimension, compare) — only the date-range period is lifted out.

### 2.2 `InstagramAnalyticsDashboard.svelte` and `ThreadsAnalyticsDashboard.svelte`
- Add `export let days: number = 30;`. Remove `const PERIODS = [7,28,90]`, the `period` state, `setPeriod`, and the selector UI.
- Replace internal `period` usages (`/instagram/metrics?days=period`, `pointRadius: period <= 28`) with the `days` prop (`pointRadius: days <= 30 ? 2 : 0`).
- Refetch metrics when `days` changes (guarded reactive watcher). Keep the status fetch, auto-sync, AI suggestions, reconnect banner unchanged.

> Note: IG/Threads backends accept arbitrary `days` (they filter by a since-date), so the unified `7/30/90` works without backend changes — `28`→`30` is a harmless widening.

## 3. Overview tab (new cross-channel summary)

A new section rendered both as the **summary strip above the tabs** and as the **Overview tab body**:

### 3.1 Summary strip (above tabs, always visible)
A responsive grid of KPI cards, one per connected channel, each with value + trend (▲/▼ %) + a `?` tooltip:
- **Site visitors** and **Conversions** — from `/analytics/metrics/totals?days=` (`total.visitors`, `total.conversions`, `change.*`, `trend.*`).
- **GSC clicks** — from `/google/search-console/summary?days=` (clicks + delta). Show only if `gscConnected`.
- **Instagram followers** (+ trend) — from `/instagram/metrics?days=` latest `account` row `followersCount`. Show only if IG linked.
- **Threads engagement** — from `/threads/metrics?days=` (sum of interactions or latest). Show only if Threads linked.
- Each card uses the Iris `.kpi` style + a channel-tinted icon chip; cards for absent channels are omitted.

### 3.2 Overview tab body
The summary strip lives **above** the tabs (always visible), so the Overview tab body does **not** repeat it. The Overview tab shows:
- **Combo trend chart**: web **visitors** + GSC **clicks** as a dual-axis line/bar over the period (both have clean daily series — web from `/analytics/metrics`, GSC daily from the existing GSC daily data). Social channels are summarized in the strip + the channel list (their daily charts live in their own tabs).
- **Channel quick-links**: a list of connected channels (Search / Instagram / Threads / App) each with a one-line headline stat and a "details →" link that switches to that channel's tab.

## 4. `InfoTooltip` component (hints)

New `apps/web/src/lib/components/InfoTooltip.svelte`:
- Props: `text: string` (resolved i18n string) or `key: string` (i18n key); optional `side` (top/bottom).
- Renders a small `?` badge (token-styled: `border-border text-ink-subtle`), shows a tooltip on **hover and focus** (keyboard-accessible), `aria-label`/`role="tooltip"`. Respects `prefers-reduced-motion`.
- Used on: Overview KPI labels, Website KPI labels, section headers (traffic/email/funnel), and the trickier metrics in each channel.
- i18n: a `hints.metric.*` namespace (en/pl/ru) — short one-sentence explanations (e.g. `hints.metric.conversions`, `hints.metric.gscClicks`, `hints.metric.igFollowers`, `hints.metric.threadsEngagement`, `hints.metric.conversionRate`, …).

## 5. i18n (`packages/i18n/src/locales/{en,pl,ru}.json`)

- `analytics.tabOverviewChannel` / `analytics.tabWebsite` / `analytics.tabSearch` / `analytics.tabInstagram` / `analytics.tabThreads` / `analytics.tabApp` — channel tab labels (reuse existing `analytics.surface.*` / `tab*` where sensible).
- `analytics.summaryTitle` ("All channels · last {days} days"), `analytics.overviewTrend`, `analytics.channelsDrilldown`, `analytics.viewDetails`.
- `hints.metric.*` tooltip strings.
- All three locales together (i18n-translator).

## 6. Testing & verification

- `pnpm --filter web build` + `pnpm --filter web lint` pass (lint catches unused imports — see the lesson from prior work).
- `vitest`: a small unit test for any extracted pure helper (e.g. an `overview-summary` aggregator that maps the per-channel responses to KPI cards, if extracted) — mirror the existing `*-dashboard-state.test.ts` style. View-state/tab logic that is pure should be unit-tested.
- Manual (dev server, both themes): period change updates **all** tabs; tabs hide for unconnected channels; tooltips show on hover + keyboard focus; no console errors; responsive at 375/768/1024/1440.
- Regression: Website UTM/funnel/pages still work; IG/Threads reconnect banner, auto-sync, AI suggestions still work with the new `days` prop.

## 7. Risks & mitigations

- **GSC daily series for the combo chart** may not be directly exposed by `/google/search-console/summary` (which is aggregate). → If a clean GSC daily series isn't available, the Overview combo chart falls back to **web visitors only** (single line) for v1, and GSC stays represented in the KPI strip + channel list. Decide during implementation by checking the GSC data shape; log the choice.
- **Period unification (28→30)** changes IG/Threads default window slightly — acceptable, no data loss.
- **Tab visibility probes** add two status calls (`/instagram/status`, `/threads/status`) to `detectSurfaces` — run them in the existing `Promise.allSettled` batch (no extra round-trips serialized).
- **Lint/unused** — removing internal period selectors may leave unused vars/i18n; clean them in the same change.

## 8. File inventory

Modify:
- `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte` (channel-tab container, global period, Overview, tab visibility incl. IG/Threads probes)
- `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte` (`days` prop, drop period selector)
- `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte` (`days` prop, drop period selector)
- `apps/web/src/lib/components/analytics/ThreadsAnalyticsDashboard.svelte` (`days` prop, drop period selector)
- `packages/i18n/src/locales/{en,pl,ru}.json` (tab + hint strings)

Create:
- `apps/web/src/lib/components/InfoTooltip.svelte`
- `apps/web/src/lib/components/analytics/AnalyticsOverview.svelte` (cross-channel summary strip + combo chart + channel list) — keeps the page file focused
- (optional) `apps/web/src/lib/components/analytics/overview-summary.ts` + `.test.ts` — pure aggregator + unit test, if extraction clarifies the page
