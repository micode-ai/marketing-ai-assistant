# UI Redesign — "Iris" / Bold Modern, dark-first

**Date:** 2026-06-27
**Status:** Approved design — ready for implementation planning
**Scope owner:** Web (`apps/web`)

## Goal

Move the logged-in app from a generic "indie SaaS 2021" look (soft purple gradients, inconsistent type, half-wired dark mode) to a **bold, modern, enterprise-grade** visual identity for 2026: a refined violet-indigo brand ("Iris"), high-contrast surfaces, large display headlines, and a **genuinely finished dual light + dark theme** with dark as the default interior. Also fix the navigation information architecture so organization vs. project context is always unambiguous.

This is a **foundation + app-shell + flagship-pages** redesign. Because the app is token- and component-driven, a foundation-level change cascades to most of the ~50 pages. Bespoke hand-polish of every individual feature page is explicitly a later pass.

## Locked decisions

| Decision | Choice |
|---|---|
| Aesthetic direction | Bold modern, deep brand color, high contrast, big headlines |
| Brand accent | Refine (not replace) the violet/indigo identity → "Iris" |
| Theme strategy | Full dual light + dark, built now via semantic tokens |
| Default interior theme | **Dark** |
| Navigation | Contextual two-mode sidebar (Organization ↔ Project) |
| Org-level rollups | **Kept** (Analytics, Finances across all projects) |
| AI Chat & Templates | Available in **both** org and project scopes |
| Project-menu reorder/rename | Deferred — revisit after the redesign lands |

## Non-goals (this spec)

- Hand-polishing every individual feature page (Content list, SEO detail, Email, etc.). They receive the token cascade + codemod and will look consistent, but bespoke per-page polish is a separate effort.
- Public marketing/landing page and auth screens (`(auth)` group) redesign — separate spec.
- Any backend (`apps/api`, `apps/ai-agent`) or schema changes.
- New features. This is purely visual + IA.

---

## 1. Design tokens

The core architectural move: stop hardcoding `bg-white` / `bg-gray-50` / `text-gray-900` / `bg-primary-600` and route everything through **semantic CSS custom properties** that flip between light and dark via the existing `.dark` class on `<html>`.

### 1.1 Token storage format

Tokens are stored as **space-separated RGB channel triplets** so Tailwind's alpha modifiers (`bg-surface/80`, `border-default/50`) work:

```css
:root {            /* light */
  --canvas: 246 246 251;       /* #F6F6FB */
  --surface: 255 255 255;      /* #FFFFFF */
  --surface-2: 243 243 248;    /* #F3F3F8 */
  --border: 236 236 244;       /* #ECECF4 */
  --border-strong: 221 221 232;
  --text: 26 23 38;            /* #1A1726 */
  --text-muted: 116 112 138;   /* #74708A */
  --text-subtle: 152 147 168;  /* #9893A8 */
  --brand: 91 61 232;          /* iris-600 #5B3DE8 (action) */
  --brand-fg: 255 255 255;
  --brand-subtle: 238 240 255; /* iris-50  (active nav/chips bg) */
  --brand-subtle-fg: 75 47 196;/* iris-700 (active nav/chips text) */
  --ring: 110 86 240;          /* iris-500 focus ring */
  --ok: 22 163 74; --warn: 245 158 11; --bad: 229 72 77;
}
.dark {            /* dark (default interior) */
  --canvas: 11 11 20;          /* #0B0B14 */
  --surface: 19 19 30;         /* #13131E */
  --surface-2: 22 22 31;       /* #16161F */
  --border: 32 32 46;          /* #20202E */
  --border-strong: 42 42 58;
  --text: 237 237 246;         /* #EDEDF6 */
  --text-muted: 148 148 174;   /* #9494AE */
  --text-subtle: 108 108 134;  /* #6C6C86 */
  --brand: 110 86 240;         /* iris-500 (brighter for dark) */
  --brand-fg: 255 255 255;
  --brand-subtle: 110 86 240;  /* used at low alpha, e.g. bg-brand-subtle/15 */
  --brand-subtle-fg: 201 194 255;
  --ring: 138 130 251;
  --ok: 74 222 128; --warn: 251 191 36; --bad: 248 113 113;
}
```

### 1.2 Brand ramp — "Iris" (refined violet-indigo)

Replaces the current `primary` ramp. Slightly cooler/deeper than the existing pinkish `#8b5cf6`.

| Step | Hex | Step | Hex |
|---|---|---|---|
| 50 | `#EEF0FF` | 500 | `#6E56F0` |
| 100 | `#E0E2FF` | 600 | `#5B3DE8` |
| 200 | `#C7C8FF` | 700 | `#4B2FC4` |
| 300 | `#A5A4FF` | 800 | `#3C2599` |
| 400 | `#8A82FB` | 900 | `#2E1B73` |
| | | 950 | `#1C0F47` |

Keep `primary` as an **alias** of the iris ramp during migration so any un-migrated `primary-*` utility still renders on-brand instead of breaking.

### 1.3 Tailwind config exposure

`tailwind.config.js` `theme.extend.colors` maps semantic names to the channel vars, e.g.:

```js
canvas:  'rgb(var(--canvas) / <alpha-value>)',
surface: 'rgb(var(--surface) / <alpha-value>)',
'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
border:  'rgb(var(--border) / <alpha-value>)',
ink:     { DEFAULT: 'rgb(var(--text) / <alpha-value>)', muted: 'rgb(var(--text-muted) / <alpha-value>)', subtle: 'rgb(var(--text-subtle) / <alpha-value>)' },
brand:   { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', fg: 'rgb(var(--brand-fg) / <alpha-value>)', subtle: 'rgb(var(--brand-subtle) / <alpha-value>)', 'subtle-fg': 'rgb(var(--brand-subtle-fg) / <alpha-value>)' },
iris:    { 50:'#EEF0FF', /* …full ramp… */ 950:'#1C0F47' },
primary: '/* alias → iris during migration */',
ok: 'rgb(var(--ok) / <alpha-value>)', warn: 'rgb(var(--warn) / <alpha-value>)', bad: 'rgb(var(--bad) / <alpha-value>)',
```

Yields utilities like `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-brand text-brand-fg`, `bg-ok/15 text-ok`.

> **Naming decision (committed):** the text color key is **`ink`** (`text-ink`, `text-ink-muted`, `text-ink-subtle`), not `text` — `text-text` is too awkward. CSS vars stay named `--text*`; only the Tailwind key differs. The whole codebase uses `ink`.

## 2. Typography & shape

- **Standardize fonts.** Display = **Space Grotesk** (headings `h1–h4`, page titles, KPI numbers). Body/UI = **Inter**. Remove **DM Sans** entirely (currently declared as `sans` but the look is inconsistent and `app.html` separately loads Inter).
- `app.css`: single Google Fonts import for Space Grotesk + Inter. Remove the DM Sans import.
- `app.html`: remove the duplicate standalone Inter `<link>` (consolidate into `app.css`), keep the preconnects.
- `tailwind.config.js`: `fontFamily.display = Space Grotesk`, `fontFamily.sans = Inter`.
- **Type scale:** page titles `text-2xl`/`text-3xl` `font-bold tracking-tight` in Space Grotesk; section headings `text-sm`/`text-base font-semibold`; body `text-sm`; KPI values `text-2xl`/`text-3xl` Space Grotesk.
- **Radius tokens:** `--r-sm: 8px`, `--r: 10px`, `--r-lg: 12px`, `--r-xl: 16px` (cards `--r-lg`, controls `--r-sm`/`--r`, modals `--r-xl`).
- **Elevation:** light mode → subtle layered shadows; dark mode → rely on `border` + a `.glow-brand` utility (soft iris box-shadow) on primary buttons, the logo, and the active-nav / hero blocks.

## 3. Component primitives

Extract the repeated inline-utility patterns into `@layer components` classes in `app.css` (and/or a few thin Svelte wrappers where stateful). Target set:

- `.btn`, `.btn-primary` (iris gradient + glow), `.btn-secondary` (surface + border), `.btn-ghost`, `.btn-danger`
- `.card` (surface + border + radius)
- `.kpi` (card + label/value/delta structure) and a `.kpi-feature` "confident color block" variant (iris gradient, used for the hero KPI)
- `.badge` / `.chip` with `.badge-ok` / `.badge-warn` / `.badge-bad` / `.badge-brand`
- `.input`, `.select`, `.textarea` (theme-aware, replacing reliance on `@tailwindcss/forms` defaults)
- `.modal` shell (overlay + panel + header/body/footer)
- `.nav-item` (sidebar link, with `.is-active` state)
- `.glow-brand` utility

These classes reference the semantic tokens, so they are dark-ready by construction. Keep them minimal — they encode the design language, not business logic.

## 4. Reaching all ~50 pages (codemod)

Semantic tokens only cascade where referenced, and much of the app hardcodes neutral utilities. The migration therefore includes a **scripted, reviewable find-and-replace** over `apps/web/src/**/*.svelte` for the highest-frequency patterns:

| From | To |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-canvas` (page) / `bg-surface-2` (insets) — context-judged |
| `bg-gray-100` | `bg-surface-2` |
| `text-gray-900` / `text-gray-800` | `text-ink` |
| `text-gray-500` / `text-gray-600` | `text-ink-muted` |
| `text-gray-400` | `text-ink-subtle` |
| `border-gray-200` / `border-gray-100` | `border-border` |
| `bg-primary-600` / `hover:bg-primary-700` | `bg-brand` / `hover:bg-brand` (or `.btn-primary`) |
| `text-primary-600/700` | `text-brand` |
| `bg-primary-50` | `bg-brand-subtle/10` (dark) / `bg-brand-subtle` (light) |
| `divide-gray-200` | `divide-border` |
| `ring-primary-500` / `focus:ring-primary-500` | `ring-ring` |

Process: run the replacement, then **manually review the diff** (the `bg-gray-50` → canvas/surface-2 split and any `dark:` collisions need eyes). Existing `dark:` variants that conflict with the new tokens are removed in the same pass. This is what makes dark mode genuinely complete rather than half-wired.

Edge cases to leave alone / handle by hand: gradient avatars/logos (intentional brand color), status colors already using green/amber/red semantics (map to `ok/warn/bad`), and any third-party widget styling (Chart.js, MarkdownEditor).

## 5. Navigation information architecture

### 5.1 The model

One sidebar, two mutually exclusive **contexts**, driven by whether a project is active (`currentProjectStore` + route):

**Organization mode** (no project selected):
- Context switcher at top shows **Organization** (amber accent) with the org name.
- **Workspace:** Dashboard *(labelled "all projects")*, Projects, AI Chat, Templates.
- **All projects · rollups:** Analytics, Finances (org-wide aggregates — kept).
- **Settings:** Organization, Billing, Team, Integrations, Email accounts, Webhooks.

**Project mode** (a project is open):
- A persistent **"← All projects"** link returns to org mode.
- Context switcher shows **Project** (iris accent) with the project name; clicking it switches between projects without leaving the current page type.
- **This project:** Overview *(= this project's dashboard)*, Content, Checklists, Documents, Campaigns, Email, Analytics, AI Chat, Templates.
- **Advanced** (collapsible, existing pattern): SEO, Competitors, Experiments, Sequences, Calendar.
- **Settings:** Project settings.

### 5.2 Behavior

- The **header project picker** and the **sidebar context switcher** are the same control. Selecting a project → enter project mode and (by default) land on that project's Overview; choosing "All projects" → org mode.
- Switching projects while on, e.g., a Content page keeps you on the Content page of the newly selected project (preserve the section, swap the project) — consistent with the existing project-switch refetch pattern.
- **AI Chat & Templates in both scopes:** the links exist in both menus. In project mode they pre-scope to the current project (set `currentProjectStore` / pass the project context the existing pages already restore). Routes are unchanged (`/ai-chat`, `/templates`); no new routes required.
- Org rollup pages (`/analytics`, `/finances`, `/content`, etc.) remain reachable **only** in org mode and are labelled as rollups, so they never visually collide with a project's own same-named pages.
- Existing behaviors preserved: multi-org switcher, mobile drawer + backdrop, advanced-section auto-expand, theme toggle, help link, user/logout block.

### 5.3 Dark-by-default

`app.html` bootstrap currently defaults to system preference. Change so the **app interior defaults to dark** unless the user has explicitly chosen light (persisted in `localStorage.theme`). The light/dark toggle stays. (Auth/landing pages, out of scope here, keep their current behavior.)

## 6. Phased delivery

### Phase 1 — Foundation (tokens + primitives + codemod)
- Add semantic tokens (light + dark) to `app.css`; pick `ink` vs `text` naming.
- Rework `tailwind.config.js`: iris ramp, semantic color mappings, fonts, `primary` alias.
- Fix fonts in `app.css` + `app.html` (Space Grotesk + Inter; drop DM Sans).
- Add `@layer components` primitives + `.glow-brand`.
- Run + hand-review the utility codemod across `apps/web/src`.
- **Exit criteria:** app builds, both themes render coherently on a sampling of pages, no raw `bg-white`/`text-gray-900` left in shared surfaces.

### Phase 2 — App shell + IA
- Rebuild `Sidebar.svelte` with the two-mode contextual model + context switcher + "← All projects".
- Update `Header.svelte` (picker as mode switch, theme toggle, language switcher restyle).
- Update `(app)/+layout.svelte` canvas (`bg-canvas`), loading state, help button.
- Make AI Chat + Templates appear and pre-scope in both modes.
- Set dark-by-default bootstrap in `app.html`.
- **Exit criteria:** org mode and project mode are visually distinct and unambiguous; both confusions from the brief are gone; shell fully themed in light + dark.

### Phase 3 — Flagship pages
- **Dashboard** (`(app)/dashboard`): new KPI cards, project cards, empty state, import modal restyle.
- **Project Overview** (`projects/[id]/overview`): hero "confident color block" KPI, getting-started steps, recent activity, quick actions.
- Restyle `DashboardKpiCards.svelte`, `ProjectCardStats.svelte` to the new `.kpi` primitives.
- **Exit criteria:** dashboard + overview look like the approved mockups in both themes.

## 7. Verification

- `pnpm --filter web build` and `pnpm --filter web lint` pass.
- Existing web Vitest suite passes (`cd apps/web && pnpm test`); update snapshots/selectors only where the redesign legitimately changes them.
- Manual walkthrough in **both themes**: shell, dashboard, project overview, and a sampling of cascaded pages (Content, Settings, SEO) to confirm no unreadable/low-contrast or unthemed surfaces.
- Accessibility checks: text contrast ≥ 4.5:1 on `text` and `text-muted` over `canvas`/`surface` in both themes; visible focus rings (`ring-ring`); icon-only buttons keep `aria-label`/`title`; `prefers-reduced-motion` block retained.
- Responsive sanity at 375 / 768 / 1024 / 1440.

## 8. Risks & mitigations

- **Codemod over-reach** (a `bg-gray-50` that should stay an inset becomes a page canvas). → Manual diff review; the `bg-gray-50` split is judged per occurrence, not blind-replaced.
- **`@tailwindcss/forms` default styling** fights theme tokens on inputs. → `.input`/`.select` primitives set explicit themed colors.
- **Chart.js / MarkdownEditor** don't inherit tokens. → Pass theme-aware colors explicitly; out-of-scope deep polish noted.
- **`primary-*` left in un-migrated pages.** → `primary` aliased to iris so nothing renders off-brand mid-migration.
- **Dark-by-default surprises returning users.** → Respect an explicit stored `light` choice; only default to dark when unset.

## 9. Visual reference

Approved mockups live in `.superpowers/brainstorm/27906-1782575803/content/` (gitignored): `direction-v1.html` (token system + light/dark dashboard shell) and `nav-ia-v1.html` (two-mode sidebar). These are the visual source of truth for implementation.
