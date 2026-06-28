# Analytics Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `/projects/[id]/analytics` into channel tabs with a cross-channel summary strip, a single global period filter driving every channel, and `?` info-tooltips.

**Architecture:** The page becomes a channel-tab container (Overview · Website · Search · Instagram · Threads · App) with one global `selectedPeriod` passed to every child dashboard as a `days` prop; the child dashboards (GSC/Instagram/Threads) lose their internal period selectors and become period-controlled. A new `AnalyticsOverview` component renders the cross-channel summary + combo chart + channel quick-links, and a new `InfoTooltip` adds hover/focus hints.

**Tech Stack:** SvelteKit 2, TailwindCSS (Iris tokens), Chart.js, svelte-i18n (en/pl/ru), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-28-analytics-page-redesign-design.md`.
- Global period values: **`7 | 30 | 90`** (default 30). One selector; passed as `days` to all child dashboards.
- Channel tabs: **Overview · Website · Search · Instagram · Threads · App**; a tab shows only when its channel is connected/relevant (Website `gscConnected || projectType!=='MOBILE_APP'`; Search `gscConnected`; Instagram/Threads when linked via `/instagram/status` / `/threads/status` `.connected`; App `appConnected || projectType==='MOBILE_APP'`).
- Child dashboards accept `export let days: number` and remove internal period UI/state. IG/Threads backends accept arbitrary `days` (filter by since-date); `28`→`30` is a safe widening.
- Styling: Iris tokens only (`bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-brand`, `.kpi`, `.badge*`); no raw `bg-white`/`text-gray-*`.
- Tooltips: hover **and** keyboard focus; `role="tooltip"` + `aria-label`; respect `prefers-reduced-motion`.
- i18n: every new string in en/pl/ru together. A missing key renders the raw key (no crash) — but all keys the components use must exist by the end.
- Build/lint gates: `corepack pnpm --filter web build` and `corepack pnpm --filter web lint` must pass (lint fails on unused vars/imports — remove dead period state). `vitest` is installed (`corepack pnpm --filter web exec vitest run <path>` for one-shot; the bare `test` script is watch-mode). Heap `NODE_OPTIONS=--max-old-space-size=4096`. pnpm only via `corepack`.
- GitHub artifacts English. Branch `redesign/analytics-tabs` (already off `origin/development`).
- Reference files (read before editing): `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`, `apps/web/src/lib/components/analytics/{SearchConsolePanel,InstagramAnalyticsDashboard,ThreadsAnalyticsDashboard,MobileAnalyticsDashboard}.svelte`, `apps/web/src/lib/components/SectionHint.svelte`.

---

### Task 1: `InfoTooltip` component + hint i18n

**Files:**
- Create: `apps/web/src/lib/components/InfoTooltip.svelte`
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`

**Interfaces:**
- Produces: a Svelte component used as `<InfoTooltip text={$_('hints.metric.conversions')} />` (or `<InfoTooltip key="hints.metric.conversions" />`). Consumed by Tasks 3 & 4.

- [ ] **Step 1:** Create `InfoTooltip.svelte`. Props: `export let text = ''` and `export let key = ''` (if `key` set, resolve via `$_(key)`); `export let side: 'top' | 'bottom' = 'top'`. Render a `?` badge button (token-styled: `w-4 h-4 rounded-full border border-border text-ink-subtle text-[10px] inline-flex items-center justify-center cursor-help`) with `type="button"`, `aria-label={resolved}`. On hover/focus show an absolutely-positioned tooltip (`role="tooltip"`, `bg-surface-2 border border-brand/40 text-ink rounded-lg text-xs p-2 w-52 shadow-xl z-30`) containing the resolved text. Toggle via `on:mouseenter/mouseleave/focus/blur` setting a local `open` boolean (keyboard-accessible). Wrap in a `prefers-reduced-motion`-safe transition (use `transition: opacity` only).
- [ ] **Step 2:** Add a `hints.metric` namespace to all three locales with at least: `conversions`, `conversionRate`, `visitors`, `gscClicks`, `gscPosition`, `igFollowers`, `igEngagement`, `threadsEngagement`, `threadsViews`, `overviewTrend`. EN baseline, one short sentence each; PL/RU translated (use the i18n-translator agent in Task 5, or add EN now and let Task 5 translate — but add the EN keys here so the component resolves).
- [ ] **Step 3: Verify:** `corepack pnpm --filter web build` compiles; a throwaway usage renders the `?` + tooltip on hover/focus in `pnpm dev`.
- [ ] **Step 4: Commit:** `feat(web): InfoTooltip hint component + hints.metric strings`

### Task 2: Period-controlled child dashboards (`days` prop)

**Files:**
- Modify: `apps/web/src/lib/components/analytics/InstagramAnalyticsDashboard.svelte`
- Modify: `apps/web/src/lib/components/analytics/ThreadsAnalyticsDashboard.svelte`
- Modify: `apps/web/src/lib/components/analytics/SearchConsolePanel.svelte`

**Interfaces:**
- Produces: each component now takes `export let days: number = 30;` and refetches when `days` changes; internal period selectors removed. Consumed by Task 4 (`<InstagramAnalyticsDashboard {projectId} days={selectedPeriod} />` etc.).

- [ ] **Step 1 (Instagram):** In `InstagramAnalyticsDashboard.svelte` add `export let days: number = 30;`. Remove `const PERIODS = [7,28,90]`, the `let period = 28`, `setPeriod`, the `period = 28` reset, and the period selector markup. Replace `days: period` (metrics fetch) with `days`, and `period <= 28` (pointRadius) with `days <= 30`. Add a guarded reactive watcher to refetch metrics on change:

```svelte
let mounted = false;
let prevDays = days;
$: if (mounted && days !== prevDays) { prevDays = days; loadMetrics(); }
```
  (set `mounted = true` at the end of `onMount`; reuse the existing metrics-fetch fn name — confirm it, e.g. `loadMetrics`/`fetchMetrics`). Keep status fetch, auto-sync, AI suggestions, reconnect banner intact.
- [ ] **Step 2 (Threads):** Apply the identical change to `ThreadsAnalyticsDashboard.svelte`.
- [ ] **Step 3 (GSC):** In `SearchConsolePanel.svelte` add `export let days: number = 30;`. Remove the internal `let period = 28` + its selector UI; use `days` where `period` was used (summary/query fetch `days: period` → `days`). Add the same guarded reactive refetch on `days` change. Leave GSC's other filters (dimension/compare) untouched.
- [ ] **Step 4: Verify:** `corepack pnpm --filter web build` + `lint` pass (no unused `period`/`PERIODS`/`setPeriod`). In `pnpm dev`, the three components no longer render their own period buttons.
- [ ] **Step 5: Commit:** `refactor(web): make GSC/Instagram/Threads dashboards period-controlled via days prop`

### Task 3: `AnalyticsOverview` component (+ pure aggregator + test)

**Files:**
- Create: `apps/web/src/lib/components/analytics/AnalyticsOverview.svelte`
- Create: `apps/web/src/lib/components/analytics/overview-summary.ts`
- Create: `apps/web/src/lib/components/analytics/overview-summary.test.ts`

**Interfaces:**
- Consumes: `InfoTooltip` (Task 1).
- Produces: `<AnalyticsOverview projectId days={selectedPeriod} connected={{ gsc, instagram, threads, app }} on:goto />` rendering the cross-channel **summary strip** (used above the tabs) and the **Overview tab body** (combo chart + channel quick-links). `overview-summary.ts` exports `buildSummaryCards(input): SummaryCard[]` (pure).

- [ ] **Step 1: Write the failing test** (`overview-summary.test.ts`): `buildSummaryCards` maps per-channel responses to cards, omitting channels not connected.

```ts
import { describe, it, expect } from 'vitest';
import { buildSummaryCards } from './overview-summary';

describe('buildSummaryCards', () => {
  it('includes site KPIs always and channel KPIs only when connected', () => {
    const cards = buildSummaryCards({
      totals: { total: { visitors: 12800, conversions: 432 }, change: { visitors: 5, conversions: -2 }, trend: { visitors: 'up', conversions: 'down' } },
      gsc: { connected: true, clicks: 9100, clicksChange: 12 },
      instagram: { connected: false },
      threads: { connected: true, engagement: 1200, engagementChange: 8 },
    });
    const keys = cards.map((c) => c.key);
    expect(keys).toContain('visitors');
    expect(keys).toContain('conversions');
    expect(keys).toContain('gscClicks');
    expect(keys).toContain('threadsEngagement');
    expect(keys).not.toContain('igFollowers');
    const conv = cards.find((c) => c.key === 'conversions');
    expect(conv?.trend).toBe('down');
  });
});
```

- [ ] **Step 2: Run, verify fail:** `corepack pnpm --filter web exec vitest run src/lib/components/analytics/overview-summary` → FAIL (module not found).
- [ ] **Step 3: Implement `overview-summary.ts`:** export `interface SummaryCard { key: string; labelKey: string; hintKey: string; value: number; change: number; trend: 'up'|'down'|'stable'; channel: 'site'|'gsc'|'instagram'|'threads' }` and `buildSummaryCards(input)` that pushes `visitors` + `conversions` from `totals`, then conditionally `gscClicks` (if `gsc.connected`), `igFollowers` (if `instagram.connected`), `threadsEngagement` (if `threads.connected`). Derive `trend` from the provided trend or sign of change.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Implement `AnalyticsOverview.svelte`:** on mount/`days`-change, fetch in parallel (`Promise.allSettled`) only the connected channels: `/analytics/metrics/totals?projectId&days`, `/analytics/metrics?projectId&days` (daily for combo), `/google/search-console/summary?projectId&days` (if gsc), `/instagram/metrics?projectId&days` (if instagram), `/threads/metrics?projectId&days` (if threads). Build cards via `buildSummaryCards`. Render: (a) the **summary strip** (KPI cards w/ `InfoTooltip` on labels) — exported as a named block the page places above the tabs (or render strip + body and let the page show only the strip when not on Overview — simplest: `AnalyticsOverview` renders the strip always and the body only when `expanded` prop true). Use `expanded: boolean` prop: strip-only above tabs (`expanded={false}`), full (strip hidden, combo chart + channel list) inside the Overview tab (`expanded={true}`). Combo chart: Chart.js dual-axis line of web `visitors` + GSC `clicks` daily; **fallback** to visitors-only if GSC daily series isn't available (log the choice). Channel quick-links dispatch `goto` events with the channel id.
- [ ] **Step 6: Verify:** build + lint pass; `vitest run overview-summary` green.
- [ ] **Step 7: Commit:** `feat(web): AnalyticsOverview cross-channel summary + combo chart`

### Task 4: Analytics page — channel tabs + global period + tab visibility

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`

**Interfaces:**
- Consumes: `AnalyticsOverview` (Task 3), the period-controlled child dashboards (Task 2), `InfoTooltip` (Task 1).

- [ ] **Step 1:** Extend `detectSurfaces()` to also probe IG + Threads: add `api.get('/instagram/status',{projectId})` and `api.get('/threads/status',{projectId})` into the existing `Promise.allSettled` batch; set `igConnected = fulfilled && value.connected`, `threadsConnected = fulfilled && value.connected`.
- [ ] **Step 2:** Replace the surface tabs + stacked blocks + web sub-tabs region with a **channel-tab model**. Keep `selectedPeriod` (rename default to 30) and the single header period selector `[7,30,90]` (already present — keep it as the one global control; remove all child selectors per Task 2). Define `channelTabs` computed from connection flags: always `overview`; `website` if `showWeb`; `search` if `gscConnected`; `instagram` if `igConnected`; `threads` if `threadsConnected`; `app` if `showApp`. New `activeChannel` state (default `'overview'`).
- [ ] **Step 3:** Render above the tab bar: header + global period, then `<AnalyticsOverview {projectId} days={selectedPeriod} expanded={false} connected={{ gsc: gscConnected, instagram: igConnected, threads: threadsConnected, app: showApp }} on:goto={(e)=>activeChannel=e.detail} />` (the summary strip).
- [ ] **Step 4:** Render the channel tab bar (iris underline style, the existing tab markup) and the active channel body:
  - `overview` → `<AnalyticsOverview ... expanded={true} on:goto=...>` (combo chart + channel list).
  - `website` → the existing web analytics block (KPI cards + traffic/email/funnel charts + the existing `overview/utm/funnel/pages` **sub-tabs**), driven by `selectedPeriod`. Move the current web markup here verbatim; its internal `activeTab` (overview/utm/funnel/pages) stays as Website sub-tabs.
  - `search` → `<SearchConsolePanel {projectId} days={selectedPeriod} />`.
  - `instagram` → `<InstagramAnalyticsDashboard {projectId} days={selectedPeriod} />`.
  - `threads` → `<ThreadsAnalyticsDashboard {projectId} days={selectedPeriod} />`.
  - `app` → `<MobileAnalyticsDashboard {projectId} days={selectedPeriod} />`.
- [ ] **Step 5:** `switchPeriod(p)` sets `selectedPeriod` and refetches the active channel (web data + overview). Lazy-load per channel on first activation (keep the existing lazy pattern). Add `InfoTooltip` to the Website KPI labels + chart section headers.
- [ ] **Step 6: Verify:** build + lint pass; in `pnpm dev` load `/projects/<id>/analytics`: one period control; switching it updates all tabs; tabs hidden for unconnected channels; no console errors; Website sub-tabs + IG/Threads banners/AI still work. Both themes; responsive.
- [ ] **Step 7: Commit:** `feat(web): channel-tab analytics page with global period + overview`

### Task 5: i18n — tab labels, summary, remaining hints (en/pl/ru)

**Files:**
- Modify: `packages/i18n/src/locales/{en,pl,ru}.json`

- [ ] **Step 1:** Add/confirm keys used by Tasks 1/3/4 in all three locales: channel tab labels (`analytics.tabOverviewChannel`, `analytics.tabWebsite`, `analytics.tabSearch`, `analytics.tabInstagram`, `analytics.tabThreads`, `analytics.tabApp` — or reuse `analytics.surface.*`), `analytics.summaryTitle`, `analytics.overviewTrend`, `analytics.channelsDrilldown`, `analytics.viewDetails`, and translate the `hints.metric.*` set from Task 1 into PL/RU. Use the i18n-translator agent to keep parity.
- [ ] **Step 2: Verify:** build passes; grep the analytics page + `AnalyticsOverview` + `InfoTooltip` for `$_('...')` keys and confirm each exists in `en.json` (no raw-key leakage).
- [ ] **Step 3: Commit:** `i18n: analytics channel tabs + summary + metric hints (en/pl/ru)`

---

## Finalization

- [ ] **Full build/lint:** `corepack pnpm --filter web build && corepack pnpm --filter web lint`.
- [ ] **Tests:** `corepack pnpm --filter web exec vitest run src/lib/components/analytics/overview-summary`.
- [ ] **Manual (dev, both themes):** single period drives all channels; tab visibility correct; tooltips on hover+keyboard; Website UTM/funnel/pages intact; IG/Threads reconnect/auto-sync/AI intact; responsive 375/768/1024/1440.
- [ ] **GitHub issue + PR** (English) → `development`; PR links spec + plan.

## Self-Review notes (coverage vs spec)

- Spec §1 page structure → Task 4. §1.1 tab visibility (incl. IG/Threads probes) → Task 4 Step 1-2. §1.2 global period → Task 4. §2 child refactor → Task 2. §3 Overview (strip + combo + links) → Task 3. §4 InfoTooltip → Task 1. §5 i18n → Tasks 1+5. §6 testing → per-task + Finalization. §7 GSC-combo fallback → Task 3 Step 5 (logged).
- Type consistency: `days: number` prop name identical across Tasks 2 & 4; `selectedPeriod` (page) → `days` (children); `buildSummaryCards`/`SummaryCard` defined Task 3 Step 3, used Step 1 test & Step 5 component; `connected={{ gsc, instagram, threads, app }}` shape identical in Tasks 3 & 4; `activeChannel` ids (`overview/website/search/instagram/threads/app`) consistent Tasks 3-4.
- Deferred per spec non-goals: new backend endpoints, GSC advanced-filter overhaul, channel chart internals.
