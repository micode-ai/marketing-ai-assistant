# UI Redesign "Iris" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the logged-in web app to a bold, modern, dark-first enterprise look ("Iris" violet-indigo) with a genuinely complete dual light/dark theme and an unambiguous two-mode (organization ↔ project) navigation.

**Architecture:** Introduce semantic CSS-variable design tokens (light + dark) exposed through Tailwind, migrate ~1900 hardcoded neutral/`primary` utilities to those tokens via a reviewed codemod, extract repeated patterns into `@layer components` primitives, then rebuild the app shell (Sidebar/Header/ProjectPicker/layout) around a contextual two-mode model and polish the two flagship pages (Dashboard, Project Overview).

**Tech Stack:** SvelteKit 2, TailwindCSS 3 (`darkMode: 'class'`), `@tailwindcss/forms` + `/typography`, svelte-i18n (en/pl/ru).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-ui-redesign-iris-design.md` is the source of truth.
- Tailwind text color key is **`ink`** (`text-ink`, `text-ink-muted`, `text-ink-subtle`). CSS vars stay `--text*`.
- Brand ramp name is **`iris`** (50→950, hexes in spec §1.2). `primary` is aliased to `iris.DEFAULT` during migration — do not delete `primary` until the codemod is verified complete.
- Tokens stored as space-separated RGB channel triplets; Tailwind references via `rgb(var(--x) / <alpha-value>)`.
- Fonts: **Space Grotesk** (display) + **Inter** (body). Remove DM Sans entirely.
- Dark is the **default** interior theme unless `localStorage.theme === 'light'`.
- Org-level rollups (Analytics, Finances) are **kept**, org-mode only.
- AI Chat + Templates appear in **both** scopes.
- GitHub artifacts (commits/PRs) in English. Branch: `redesign/iris-ui` (already created off `origin/development`).
- Out of scope: `(auth)` group + landing redesign, bespoke per-page polish beyond shell/flagship, any backend change.
- Verify each phase with `pnpm --filter web build` and `pnpm --filter web lint`; visual walkthrough in both themes.

---

## Phase 1 — Foundation (tokens, fonts, primitives, codemod)

### Task 1: Semantic design tokens + font cleanup in `app.css`

**Files:**
- Modify: `apps/web/src/app.css`

**Interfaces:**
- Produces: CSS custom properties on `:root` (light) and `.dark` (dark): `--canvas --surface --surface-2 --border --border-strong --text --text-muted --text-subtle --brand --brand-fg --brand-subtle --brand-subtle-fg --ring --ok --warn --bad`, all as space-separated RGB triplets. Consumed by Task 2 (Tailwind) and Task 4 (primitives).

- [ ] **Step 1:** Replace the Google Fonts `@import` (line 2) with a single import for `Space Grotesk` (400;500;600;700) + `Inter` (400;500;600;700). Remove the DM Sans family.
- [ ] **Step 2:** In `@layer base { :root { … } }` replace the existing shadcn-style HSL vars with the light token triplets from spec §1.1. Add a `.dark { … }` block with the dark triplets from spec §1.1. Keep the `prefers-reduced-motion` block.
- [ ] **Step 3:** Update the global `body` rule: `font-family: 'Inter'`, `background-color: rgb(var(--canvas))`, `color: rgb(var(--text))`. Update the `* { border-color }` rule to `rgb(var(--border))`. Update `h1,h2,h3,h4` to Space Grotesk (unchanged). Update `.prose` colors to use `rgb(var(--text-muted))` / heading `rgb(var(--text))`.
- [ ] **Step 4:** Update `.custom-scroll` thumb colors to `rgb(var(--border-strong))` / hover `rgb(var(--text-subtle))` so the scrollbar works in dark.
- [ ] **Step 5: Verify:** `cd apps/web && pnpm build` succeeds. (No utilities migrated yet — page will look mixed; that's expected.) Commit: `style(web): add Iris semantic design tokens + standardize fonts`.

### Task 2: Tailwind config — iris ramp + semantic colors + fonts

**Files:**
- Modify: `apps/web/tailwind.config.js`

**Interfaces:**
- Consumes: CSS vars from Task 1.
- Produces: utilities `bg-canvas bg-surface bg-surface-2 border-border text-ink text-ink-muted text-ink-subtle bg-brand text-brand-fg bg-brand-subtle text-brand-subtle-fg ring-ring bg-ok bg-warn bg-bad` + `iris-50…950` + `primary` alias. Consumed by Tasks 4–11 and the codemod (Task 5).

- [ ] **Step 1:** In `theme.extend.colors`, replace `primary` block with: the full `iris` ramp (hexes from spec §1.2); semantic keys mapping to `rgb(var(--token) / <alpha-value>)` per spec §1.3 (`canvas`, `surface`, `surface-2`, `border`, `ink{DEFAULT,muted,subtle}`, `brand{DEFAULT,fg,subtle,subtle-fg}`, `ring`, `ok`, `warn`, `bad`); and `primary: colors-of-iris` alias (set `primary` to the same ramp object so `primary-600` etc. still resolve).
- [ ] **Step 2:** `fontFamily`: `display: ['"Space Grotesk"', …]`, `sans: ['"Inter"', …]`. Remove DM Sans.
- [ ] **Step 3:** Add `boxShadow.glow: '0 0 0 1px rgb(var(--brand) / 0.12), 0 18px 50px -22px rgb(var(--brand) / 0.5)'` and `borderRadius` tokens (`sm:8px DEFAULT:10px lg:12px xl:16px`).
- [ ] **Step 4: Verify:** `pnpm --filter web build` succeeds. Sanity: a throwaway `<div class="bg-surface text-ink">` resolves (grep the generated CSS or just trust build). Commit: `feat(web): expose Iris tokens + iris ramp via Tailwind`.

### Task 3: `app.html` — font link cleanup + dark-by-default bootstrap

**Files:**
- Modify: `apps/web/src/app.html`

- [ ] **Step 1:** Remove the standalone `<link … Inter …>` (line 10) — fonts now load via `app.css`. Keep the two `preconnect` links.
- [ ] **Step 2:** Change the inline theme bootstrap so the interior defaults to **dark**: `var theme = localStorage.getItem('theme'); if (theme !== 'light') document.documentElement.classList.add('dark');` (i.e. dark unless explicitly light).
- [ ] **Step 3: Verify:** `pnpm --filter web build` succeeds; load `/dashboard` in dev → `<html>` has `dark` class on a fresh profile. Commit: `feat(web): dark-by-default interior + consolidate font loading`.

### Task 4: Component primitives in `@layer components`

**Files:**
- Modify: `apps/web/src/app.css` (append a `@layer components { … }` block)

**Interfaces:**
- Produces CSS classes consumed by Tasks 6–11 and available app-wide: `.btn .btn-primary .btn-secondary .btn-ghost .btn-danger`, `.card`, `.kpi .kpi-feature`, `.badge .badge-ok .badge-warn .badge-bad .badge-brand`, `.input .select .textarea`, `.modal-overlay .modal-panel`, `.nav-item` (+`.is-active`), `.glow-brand`.

- [ ] **Step 1:** Write the primitives using `@apply` against the new tokens. Examples (use these verbatim as the baseline, refine spacing to match mockups):
  - `.btn { @apply inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 cursor-pointer; }`
  - `.btn-primary { @apply bg-brand text-brand-fg shadow-glow hover:brightness-110; }`
  - `.btn-secondary { @apply bg-surface text-ink border border-border hover:bg-surface-2; }`
  - `.btn-ghost { @apply text-ink-muted hover:bg-surface-2 hover:text-ink; }`
  - `.btn-danger { @apply bg-bad text-white hover:brightness-110; }`
  - `.card { @apply bg-surface border border-border rounded-lg; }`
  - `.kpi { @apply card p-4; }` ; `.kpi-feature { @apply rounded-lg p-4 text-white; background: linear-gradient(135deg, rgb(var(--brand)), rgb(var(--iris-700, 75 47 196))); }` (use explicit iris-700 triplet `75 47 196`)
  - `.badge { @apply inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold; }` + `.badge-ok { @apply bg-ok/15 text-ok; }` etc., `.badge-brand { @apply bg-brand-subtle/15 text-brand-subtle-fg; }`
  - `.input,.select,.textarea { @apply w-full rounded-lg bg-surface border border-border text-ink placeholder:text-ink-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50; }`
  - `.modal-overlay { @apply fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4; }` ; `.modal-panel { @apply bg-surface border border-border rounded-xl shadow-xl w-full; }`
  - `.nav-item { @apply flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors duration-150 cursor-pointer; }` ; `.nav-item.is-active { @apply bg-brand-subtle/15 text-brand-subtle-fg font-semibold; box-shadow: inset 2px 0 0 rgb(var(--brand)); }`
  - `.glow-brand { box-shadow: 0 8px 20px -8px rgb(var(--brand) / 0.6); }`
- [ ] **Step 2: Verify:** `pnpm --filter web build` succeeds. Commit: `feat(web): add Iris component primitives (btn/card/kpi/badge/input/modal/nav)`.

### Task 5: Codemod — migrate hardcoded utilities to tokens

**Files:**
- Create: `apps/web/scripts/iris-codemod.mjs` (throwaway, committed for traceability)
- Modify: `apps/web/src/**/*.svelte` (excluding `(auth)/**` and the already-hand-edited shell files if done after Phase 2 — run this BEFORE Phase 2 so the shell starts clean)

**Interfaces:**
- Consumes: token utilities from Task 2.
- Produces: app-wide token usage. No new exports.

- [ ] **Step 1:** Write `iris-codemod.mjs` that walks `apps/web/src/routes/(app)` + `apps/web/src/lib` (skip `routes/(auth)`, `routes/+layout.svelte`, `routes/+page.svelte`, `auth/callback`) and applies ordered, word-boundary-safe replacements for these exact class tokens (longest-first to avoid partial hits):

  | From | To |
  |---|---|
  | `bg-white` | `bg-surface` |
  | `bg-gray-100` | `bg-surface-2` |
  | `bg-gray-50` | `bg-surface-2` |
  | `hover:bg-gray-50` | `hover:bg-surface-2` |
  | `hover:bg-gray-100` | `hover:bg-surface-2` |
  | `text-gray-900` | `text-ink` |
  | `text-gray-800` | `text-ink` |
  | `text-gray-700` | `text-ink` |
  | `text-gray-600` | `text-ink-muted` |
  | `text-gray-500` | `text-ink-muted` |
  | `text-gray-400` | `text-ink-subtle` |
  | `text-gray-300` | `text-ink-subtle` |
  | `border-gray-200` | `border-border` |
  | `border-gray-100` | `border-border` |
  | `border-gray-300` | `border-border` |
  | `divide-gray-200` | `divide-border` |
  | `divide-gray-100` | `divide-border` |
  | `bg-primary-600` | `bg-brand` |
  | `hover:bg-primary-700` | `hover:brightness-110` |
  | `text-primary-600` | `text-brand` |
  | `text-primary-700` | `text-brand` |
  | `bg-primary-50` | `bg-brand-subtle/10` |
  | `text-white` (only inside `bg-brand`/`bg-primary` buttons) | leave as `text-white` (brand-fg is white) |

  Match within `class="…"`, `class:…`, and template-literal class strings. Replace as whole space-delimited tokens (regex `(?<=^|[\s"'\`{])TOKEN(?=$|[\s"'\`}])`).
- [ ] **Step 2:** Run `node apps/web/scripts/iris-codemod.mjs`. It prints a per-file change count.
- [ ] **Step 3: Review the diff** (`git diff --stat` then spot-read 8-10 varied files). Hand-fix:
  - `bg-gray-50` that is a full-page wrapper → change to `bg-canvas` (e.g. page roots). The codemod defaults to `surface-2`; correct page-level ones by hand.
  - Remove now-redundant or conflicting `dark:*` variants the codemod left behind (search `dark:bg-`, `dark:text-` in changed files; tokens already handle dark, so most `dark:` neutral variants should be deleted).
  - Status/semantic colors using `green/amber/red/emerald/violet/blue` left intact (intentional) — only neutrals + `primary` were targeted.
- [ ] **Step 4: Verify:** `pnpm --filter web build` + `pnpm --filter web lint` pass. Visual: open `/dashboard`, `/settings/organization`, `/projects` in **both** themes — no white-on-white or black-on-black, no unreadable text. Note remaining rough pages (they get the shell/flagship passes or a later polish).
- [ ] **Step 5: Commit:** `refactor(web): migrate hardcoded utilities to Iris semantic tokens (codemod)`.

---

## Phase 2 — App shell + navigation IA

### Task 6: i18n keys for the new navigation

**Files:**
- Modify: `packages/i18n/src/locales/en.json`, `pl.json`, `ru.json` (use the i18n-translator agent or edit all three)

**Interfaces:**
- Produces keys consumed by Tasks 7–8: `nav.allProjects`, `nav.organization`, `nav.project`, `nav.workspace`, `nav.rollups`, `nav.thisProject`, `nav.switchProject`, `nav.billingTeam` (if combining). Reuse existing `nav.*` where present.

- [ ] **Step 1:** Add the keys to all three locales (EN baseline; PL/RU translated). EN values: `allProjects:"All projects"`, `organization:"Organization"`, `project:"Project"`, `workspace:"Workspace"`, `rollups:"All projects · rollups"`, `thisProject:"This project"`, `switchProject:"Switch project"`.
- [ ] **Step 2: Verify:** `pnpm --filter web build`. Commit: `i18n: add navigation context strings (en/pl/ru)`.

### Task 7: Sidebar — contextual two-mode rebuild

**Files:**
- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte`

**Interfaces:**
- Consumes: `currentProjectStore`, `organizationIdStore`, `currentUser`, `$page`, i18n keys (Task 6), primitives `.nav-item.is-active` (Task 4).

- [ ] **Step 1:** Derive `inProject = !!$currentProjectStore`. Render **two branches**:
  - **Org mode** (`!inProject`): context chip "Organization" (amber-tinted, org name); group `Workspace` = Dashboard (with "all projects" hint), Projects, AI Chat, Templates; group `nav.rollups` = Analytics, Finances (org `href`s `/analytics`, `/finances`); group Settings = existing `settingsLinks`.
  - **Project mode** (`inProject`): a `← All projects` link (calls the same clear-project action as ProjectPicker `selectOrg`); context chip "Project" (iris-tinted, project name) that toggles the project dropdown; group `nav.thisProject` = Overview, Content, Checklists, Documents, Campaigns, Email, Analytics, AI Chat, Templates (all prefixed `/projects/:id` except AI Chat/Templates which carry project context — see Task 9); collapsible `Advanced` = SEO, Competitors, Experiments, Sequences, Calendar; group Settings = Project settings only.
- [ ] **Step 2:** Replace inline active/inactive class ternaries with `.nav-item` + `:class={{ 'is-active': isActive(...) }}`. Keep the existing `isActive`/`getMarketingSegment` logic, multi-org switcher, user/logout block, theme toggle, help link.
- [ ] **Step 3:** Restyle logo block, context chips, and group labels to the mockup (`nav-ia-v1.html`): logo gradient + `.glow-brand`, chips per spec §5.1 colors.
- [ ] **Step 4: Verify:** build + lint pass. Manually: no project → only org items; pick a project → menu transforms, "← All projects" returns to org mode; both confusions from the brief gone. Check light + dark. Commit: `feat(web): contextual two-mode sidebar (org ↔ project)`.

### Task 8: Header, ProjectPicker, layout canvas

**Files:**
- Modify: `apps/web/src/lib/components/layout/Header.svelte`, `apps/web/src/lib/components/layout/ProjectPicker.svelte`, `apps/web/src/routes/(app)/+layout.svelte`

- [ ] **Step 1 (layout):** Change root `bg-gray-50` → `bg-canvas`; loading spinner border to `border-brand`; help FAB to `.btn-primary`-ish (`bg-brand text-brand-fg glow-brand`). Ensure `<main>` inherits canvas.
- [ ] **Step 2 (Header):** Restyle to tokens (`bg-surface border-border`); language switcher pills use `bg-surface-2` + active `bg-surface text-brand`; keep ProjectPicker mounted (it is the mode switch). Avatar gradient stays.
- [ ] **Step 3 (ProjectPicker):** Replace hardcoded `indigo-*`/`gray-*` with tokens (`bg-brand-subtle/15 text-brand-subtle-fg` for active project state, `bg-surface-2 text-ink-muted` for org state). Keep all navigation logic (`selectOrg`, `selectProject`, `orgSections`) unchanged.
- [ ] **Step 4: Verify:** build + lint; header/picker correct in both themes; switching context still routes correctly. Commit: `feat(web): theme header, project picker, app canvas to Iris tokens`.

### Task 9: AI Chat + Templates available in project mode

**Files:**
- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte` (project-mode links from Task 7)

**Interfaces:**
- Consumes: existing `/ai-chat` + `/templates` pages already restore `currentProjectStore` from their internal scope picker.

- [ ] **Step 1:** In project mode, render AI Chat → `/ai-chat` and Templates → `/templates` as normal links, but `on:click` set `currentProjectStore` to the active project (it already is) so the pages open pre-scoped. (No new routes.) Confirm the pages honor a pre-set `currentProjectStore`; if a page resets it, pass `?projectId=:id` and read it on mount.
- [ ] **Step 2: Verify:** from inside a project, AI Chat opens scoped to that project; from org mode it opens with the scope picker. Commit: `feat(web): surface AI Chat + Templates in project scope`.

---

## Phase 3 — Flagship pages

### Task 10: Dashboard (all-projects) + DashboardKpiCards

**Files:**
- Modify: `apps/web/src/lib/components/DashboardKpiCards.svelte`, `apps/web/src/routes/(app)/dashboard/+page.svelte`, `apps/web/src/lib/components/ProjectCardStats.svelte`

- [ ] **Step 1 (KpiCards):** Convert the 4 KPI tiles to `.kpi` primitive; keep colored icon chips but map to token-tinted backgrounds (`bg-brand-subtle/12 text-brand` for the brand one, `bg-ok/12 text-ok`, `bg-warn/12 text-warn`, `bg-brand-subtle/12`). Period segmented control → token styling (active `bg-brand text-brand-fg`). `trendClass` → `text-ok`/`text-bad`/`text-ink-subtle`. Skeletons `bg-surface-2`.
- [ ] **Step 2 (dashboard page):** Page title to `text-2xl font-bold text-ink` Space Grotesk; New/Import buttons → `.btn-primary` / `.btn-secondary`; project cards → `.card` with `hover:border-brand/40 hover:shadow-glow`; status badge → `.badge-ok`/`.badge` neutral; empty state icon block → `bg-brand-subtle/12 text-brand`; import modal → `.modal-overlay`/`.modal-panel` + `.btn-*`.
- [ ] **Step 3 (ProjectCardStats):** Migrate to tokens.
- [ ] **Step 4: Verify:** build + lint; dashboard matches `direction-v1.html` light shell + dark; both themes. Commit: `feat(web): redesign dashboard + KPI cards (Iris)`.

### Task 11: Project Overview hero + cards

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/overview/+page.svelte`

- [ ] **Step 1:** Add a **`.kpi-feature` hero block** (the "confident color block" from the mockup) for the project's headline metric; convert remaining KPI/stat cards to `.kpi`; getting-started steps, quick-actions, and recent-activity list to `.card` + `.nav-item`/`.badge`. Keep all existing data logic and i18n keys.
- [ ] **Step 2: Verify:** build + lint; overview matches the dark mockup hero; light + dark; project-switch still refetches (existing guarded watcher intact). Commit: `feat(web): redesign project overview with hero KPI (Iris)`.

---

## Finalization

- [ ] **Full build + lint:** `pnpm --filter web build && pnpm --filter web lint`.
- [ ] **Test suite:** `cd apps/web && pnpm test` — update only snapshots/selectors the redesign legitimately changed.
- [ ] **Accessibility sweep:** contrast ≥4.5:1 for `ink`/`ink-muted` over `canvas`/`surface` (both themes); visible `ring-ring` focus; icon-only buttons keep `aria-label`/`title`; reduced-motion block intact.
- [ ] **Responsive:** 375 / 768 / 1024 / 1440 — sidebar drawer + backdrop still work.
- [ ] **Create GitHub issue + PR** (English) per project convention; PR body links the spec + plan; target `development`.

## Self-Review notes (coverage vs spec)

- Spec §1 tokens → Tasks 1–2. §2 type/shape → Tasks 1–2. §3 primitives → Task 4. §4 codemod → Task 5. §5 nav IA → Tasks 6–9. §5.3 dark-default → Task 3. §6 phases → phase headers. §7 verification → Finalization. §8 risks: `primary` alias (Task 2), forms styling (Task 4 `.input`), codemod over-reach (Task 5 Step 3 review), dark-default returning users (Task 3 `!== 'light'`).
- Deferred per spec non-goals: per-page bespoke polish (pages get Task 5 cascade only), `(auth)`/landing, backend.
