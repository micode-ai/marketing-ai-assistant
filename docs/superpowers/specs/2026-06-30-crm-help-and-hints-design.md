# CRM In-App Help & Hints — Design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)
**Issue:** (to be created — English, label `enhancement`)

## Problem

The CRM module (Contacts, Companies, Deals/Pipeline, Activities/Tasks, AI deal
insights) shipped across four phases, but there is no in-app guidance. A user
landing on the CRM does not know what each section is for, how contacts get
populated, how the pipeline/forecast works, what "Win" does, or what the AI
score means. Quote: *"Теперь мне нужны подсказки и справка, так как я не понимаю
как это использовать."*

## Goal

Make the CRM self-explanatory from inside the app, in EN/PL/RU, by adding:

1. A complete **CRM help article** wired into the existing Help System (opens on
   `/help` and via the floating `?` HelpDrawer on CRM pages).
2. **Dense inline hints** (`InfoTooltip`) next to the controls that aren't
   self-evident.
3. **Helpful empty states** that tell the user what to do next instead of bare
   "no data" text.

No new API endpoints, no DB/schema changes, no new dependencies. Content +
targeted markup only.

## Global Constraints

- **Source language: English.** `user_docs/eng/10-crm.md` and the `en` i18n
  keys are authored first; `pl` and `ru` are faithful translations with the
  **same headings and same key set** (exact parity).
- **i18n parity:** every new key exists in all three locale files
  (`packages/i18n/src/locales/{en,pl,ru}/*`) with no missing or extra keys.
- GitHub artefacts (issue, PR, commits) in English; conversation may be Russian.
- Reuse existing components — do **not** create a new tooltip/help component.
- No plan-gating on help content (help is universal).

## Existing Infrastructure (reused, not rebuilt)

- **Help API** — `apps/api/src/docs/docs.service.ts` reads `user_docs/{eng,pl,ru}/`
  from disk, lists every `*.md` sorted by filename, and derives each article's
  title from its first `# ` heading. **A new numbered file is auto-listed — no
  API change needed.** Falls back to English when a locale file is missing.
- **Help UI** — `/help` page + `HelpDrawer.svelte` (400px slide-in from the
  floating `?` button). Article shown by the drawer is chosen by `helpContextMap`
  in `apps/web/src/routes/(app)/+layout.svelte` (first regex match on the
  pathname; falls back to `01-getting-started`).
- **`InfoTooltip.svelte`** — `apps/web/src/lib/components/InfoTooltip.svelte`.
  Props: `key` (i18n key, preferred) **or** `text`, and `side: 'top' | 'bottom'`.
  Renders a small `?` affordance with a hover/focus tooltip. Already used on the
  analytics overview.

## Components

### 1. Help article — `user_docs/{eng,pl,ru}/10-crm.md`

A single Markdown article. First line `# CRM — Sales Pipeline` (EN) /
localized equivalent (the first `# ` becomes the title in the docs list and
drawer header). Sections (identical structure across the three languages):

1. **What the CRM is for** — a lightweight sales pipeline living inside the
   marketing project; turn audience → contacts → deals → revenue.
2. **Contacts** — Sync (auto-import from email subscribers and identified site
   visitors, dedup by email), manual add, CSV import (PRO+), and the
   fields/columns: status, source, tags, owner. Note the plan limit
   (FREE 100 / PRO 2000).
3. **Companies** — organisations; link contacts to a company.
4. **Deals & pipeline** — the Kanban board; stages (Lead → Qualified →
   Proposal → Negotiation) and their probabilities; drag a card to change
   stage; the forecast strip (weighted = Σ value × probability over open
   deals); Win/Lose/Reopen and that **Win books an income record in Finance**;
   "Manage stages" (rename / reorder / probability); plan limit
   (FREE 50 / PRO 1000 open deals).
5. **Activities & tasks** — the timeline on contact/deal detail (log a
   call/email/meeting/note, add a task with due date + owner); the **Tasks**
   page buckets Overdue / Today / Upcoming; one-click complete; the morning
   email digest of each owner's open/overdue tasks.
6. **AI deal insights** — on a deal, "Generate" produces a score 0–100 (close
   likelihood) with reason, a suggested **next step** (→ create a task), and a
   **draft email** (→ copy or log as an activity). Score bands hot ≥70 /
   warm 40–69 / cold <40; board badges + "hot first" sort.
7. **Plan limits & FAQ** — short table of contact/deal limits; a few common
   questions ("Why is my contact list empty?", "What does Win do?", "Who gets
   the task digest?").

### 2. Help context mapping

In `apps/web/src/routes/(app)/+layout.svelte`, add to `helpContextMap`, placed
**before** the generic `[/\/projects/, '02-projects']` catch-all so it wins:

```ts
[/\/projects\/[^/]+\/crm/, '10-crm'],
```

This makes the floating `?` on every CRM sub-page open the CRM article.

### 3. Inline hints (`InfoTooltip`) — dense coverage

New i18n keys under `crm.help.*` (one short sentence each, ≤ ~140 chars).
Hints are placed next to the listed controls/labels. "Dense" = cover every
control whose meaning isn't obvious, not literally every field.

**Contacts list (`crm/contacts/+page.svelte`):**
- `crm.help.sync` — next to the **Sync** button (what it imports, dedup by email).
- `crm.help.source` — next to the **Source** column header (MANUAL/IMPORT/
  SUBSCRIBER/TRACKED_USER and precedence).
- `crm.help.status` — next to the **Status** column header.
- `crm.help.csvImport` — next to the **Import CSV** control (PRO+).

**Contact detail (`crm/contacts/[contactId]/+page.svelte`):**
- `crm.help.owner` — next to the **Owner** field.
- `crm.help.timeline` — next to the **Timeline** section heading.

**Deals board (`crm/deals/+page.svelte`):**
- `crm.help.forecast` — next to the **Forecast** strip (weighted formula).
- `crm.help.stageProbability` — next to a stage column header / probability.
- `crm.help.dragStage` — short hint that cards are dragged between stages.
- `crm.help.hotFirst` — next to the **"Hot first"** toggle.
- `crm.help.scoreBadge` — next to a deal-card score badge.

**Deal detail (`crm/deals/[dealId]/+page.svelte`):**
- `crm.help.dealStatus` — next to **Win / Lose / Reopen** controls (Win → income).
- `crm.help.aiScore` — next to the AI **score**.
- `crm.help.nextStep` — next to **Next step**.
- `crm.help.draft` — next to the **draft email**.

**Stages settings (`crm/deals/stages/+page.svelte`):**
- `crm.help.manageStages` — next to the page heading (reorder/probability,
  delete reassigns open deals).

**Tasks (`crm/tasks/+page.svelte`):**
- `crm.help.taskBuckets` — next to the Overdue/Today/Upcoming grouping.
- `crm.help.taskDigest` — note about the morning email digest.

(≈18 tooltips. Each is a value in all three locales.)

### 4. Helpful empty states

New keys under `crm.empty.*`, replacing bare "no data" copy where present:

- `crm.empty.contacts` — "No contacts yet — click **Sync** to import from
  subscribers and site visitors, or add one manually."
- `crm.empty.companies` — "No companies yet — add one, then link contacts to it."
- `crm.empty.deals` — "No deals yet — create your first deal on the board."
- `crm.empty.tasks` — "No tasks — add one from a contact or deal timeline."

Each empty state keeps its existing CTA button if one exists; only the
explanatory text is added/replaced.

## Data Flow

Help drawer: route change → `helpSlug` recomputed from `helpContextMap` →
`HelpDrawer` fetches `GET /api/help/10-crm?lang=<locale>` → renders Markdown.
`/help` page lists `10-crm` automatically (filesystem scan). Tooltips and empty
states are pure presentational i18n lookups — no network.

## Error Handling

- Missing locale file → Help API already falls back to English (existing
  behaviour; `pl`/`ru` files are provided, so no fallback expected).
- Missing i18n key → svelte-i18n renders the key string; mitigated by the parity
  constraint and an i18n-parity check before merge.

## Testing

- **i18n parity:** the new `crm.help.*` / `crm.empty.*` keys exist in en/pl/ru
  with identical key sets (scripted diff or `i18n-translator` audit).
- **Help listing/article:** `GET /api/help?lang=ru` includes `10-crm`;
  `GET /api/help/10-crm?lang=ru` returns the RU content (and `lang: 'en'`
  fallback if a locale file were absent).
- **Context mapping:** unit-style assertion that a `/projects/x/crm/deals`
  pathname resolves to `10-crm` and that the CRM regex precedes the `/projects`
  catch-all.
- **Lint:** `corepack pnpm --filter web lint` clean (no unused imports, no raw
  English literals where an i18n key is expected).
- **Manual:** `?` on each CRM sub-page opens the CRM article; tooltips render;
  empty states show on a fresh project.

## Out of Scope (YAGNI)

- No guided/interactive product tour or coachmarks overlay.
- No new help/tooltip component.
- No changes to CRM business logic, API, or schema.
- No screenshots/images in the article (text only, matching existing docs).
