# CRM In-App Help & Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM self-explanatory in-app (EN/PL/RU) via a Help-System article, dense `InfoTooltip` hints, and improved empty states.

**Architecture:** Pure content + presentational markup. A new Markdown article is auto-served by the existing Help API (filesystem scan). The route→article mapping is extracted to a small testable module and gains a CRM entry. ~18 `InfoTooltip` hints (new `crm.help.*` i18n keys) and two empty-state copy tweaks (`crm.tasks.emptyHint`, `crm.contacts.emptyHint`) are added across the six CRM pages. No API endpoints, no DB/schema, no new dependencies.

**Tech Stack:** SvelteKit 2, svelte-i18n, NestJS (DocsService), Vitest (web), Jest (api), Markdown.

## Global Constraints

- **Source language English.** Author `user_docs/eng/10-crm.md` and the `en` i18n values first; `pl`/`ru` are faithful translations with identical headings and identical key sets.
- **i18n parity:** every new key exists in all three of `packages/i18n/src/locales/{en,pl,ru}.json` with no missing/extra keys.
- GitHub artefacts (commits, PR) in English; issue #139.
- Reuse `apps/web/src/lib/components/InfoTooltip.svelte` — do NOT create a new tooltip/help component.
- No plan-gating on help content.
- The CRM help-context regex MUST precede the generic `/projects` catch-all in the map array (first match wins).
- Article filename `10-crm.md` (the leading number controls sort order and the slug becomes `10-crm`). First line must be a single `# ` heading (it becomes the article title in the docs list and drawer).

## Reference — existing facts (do not re-derive)

- Help API: `apps/api/src/docs/docs.service.ts` — `getDocsList(lang)` reads `user_docs/{eng,pl,ru}/`, lists every `*.md` sorted by filename, title = first `# ` heading; `getDoc(slug, lang)` returns `{slug,title,content,lang}`, English fallback when a locale file is missing. `lang` map: `{ en:'eng', pl:'pl', ru:'ru' }`. cwd-relative candidates resolve from `apps/api` (jest) and repo root (prod).
- `InfoTooltip` props: `key` (i18n key, preferred) **or** `text`; `side: 'top' | 'bottom'` (default `'top'`). Usage: `<InfoTooltip key="crm.help.sync" />`.
- `crm` i18n namespace already exists (subkeys: contacts, status, source, contact, nav, companies, company, deals, deal, tasks, activities, timeline, pipeline, insights, …). `crm.help` and `crm.empty` do NOT exist yet.
- Existing empty states: `crm.contacts.empty`/`emptyHint`, `crm.companies.empty`/`emptyHint`, `crm.deals.empty`/`emptyHint`, `crm.tasks.empty` (NO `emptyHint`), `crm.insights.empty`.

---

### Task 1: Extract & test the help-context map, add the CRM entry

Extract the inline `helpContextMap` from `+layout.svelte` into a small pure module so the route→slug resolution is unit-testable, then add the CRM mapping.

**Files:**
- Create: `apps/web/src/lib/help/help-context-map.ts`
- Create: `apps/web/src/lib/help/help-context-map.test.ts`
- Modify: `apps/web/src/routes/(app)/+layout.svelte` (lines 17–45: remove inline `const helpContextMap` array and the `$: helpSlug = …find(…)` expression; import and call the new helper)

**Interfaces:**
- Produces: `export const helpContextMap: [RegExp, string][]`; `export function helpSlugForPath(pathname: string): string` — returns the slug of the first matching entry, else `'01-getting-started'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/help/help-context-map.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { helpContextMap, helpSlugForPath } from './help-context-map';

describe('helpSlugForPath', () => {
  it('maps CRM sub-pages to the CRM article', () => {
    expect(helpSlugForPath('/projects/abc123/crm/contacts')).toBe('10-crm');
    expect(helpSlugForPath('/projects/abc123/crm/deals')).toBe('10-crm');
    expect(helpSlugForPath('/projects/abc123/crm/tasks')).toBe('10-crm');
  });

  it('places the CRM entry before the generic /projects catch-all', () => {
    const crmIdx = helpContextMap.findIndex(([, slug]) => slug === '10-crm');
    const projIdx = helpContextMap.findIndex(([, slug]) => slug === '02-projects');
    expect(crmIdx).toBeGreaterThanOrEqual(0);
    expect(projIdx).toBeGreaterThanOrEqual(0);
    expect(crmIdx).toBeLessThan(projIdx);
  });

  it('keeps existing routes working', () => {
    expect(helpSlugForPath('/projects/x/analytics')).toBe('08-advanced-features');
    expect(helpSlugForPath('/settings/billing')).toBe('05-team-and-billing');
    expect(helpSlugForPath('/dashboard')).toBe('01-getting-started');
  });

  it('falls back to getting-started for unknown paths', () => {
    expect(helpSlugForPath('/totally/unknown')).toBe('01-getting-started');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && corepack pnpm test -- src/lib/help/help-context-map.test.ts`
Expected: FAIL — cannot resolve `./help-context-map`.

- [ ] **Step 3: Create the module**

Create `apps/web/src/lib/help/help-context-map.ts` (copy the existing entries verbatim, then insert the CRM entry immediately before the `/projects` catch-all):

```ts
// Route → help-article slug. First match wins, so more specific patterns
// (e.g. per-project sub-pages, /crm) must precede the generic /projects entry.
export const helpContextMap: [RegExp, string][] = [
  [/\/dashboard/, '01-getting-started'],
  [/\/projects\/[^/]+\/content/, '03-ai-features'],
  [/\/projects\/[^/]+\/checklists/, '03-ai-features'],
  [/\/projects\/[^/]+\/documents/, '03-ai-features'],
  [/\/projects\/[^/]+\/campaigns/, '03-ai-features'],
  [/\/projects\/[^/]+\/email/, '04-email-marketing'],
  [/\/projects\/[^/]+\/seo/, '08-advanced-features'],
  [/\/projects\/[^/]+\/analytics/, '08-advanced-features'],
  [/\/projects\/[^/]+\/competitors/, '08-advanced-features'],
  [/\/projects\/[^/]+\/experiments/, '08-advanced-features'],
  [/\/projects\/[^/]+\/sequences/, '04-email-marketing'],
  [/\/projects\/[^/]+\/crm/, '10-crm'],
  [/\/projects/, '02-projects'],
  [/\/ai-chat/, '03-ai-features'],
  [/\/templates/, '03-ai-features'],
  [/\/content/, '03-ai-features'],
  [/\/checklists/, '03-ai-features'],
  [/\/documents/, '03-ai-features'],
  [/\/email/, '04-email-marketing'],
  [/\/settings\/billing/, '05-team-and-billing'],
  [/\/settings\/team/, '05-team-and-billing'],
  [/\/settings\/integrations/, '07-social-publishing'],
  [/\/settings/, '05-team-and-billing'],
  [/\/analytics/, '08-advanced-features'],
  [/\/seo/, '08-advanced-features'],
];

export function helpSlugForPath(pathname: string): string {
  return helpContextMap.find(([re]) => re.test(pathname))?.[1] ?? '01-getting-started';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && corepack pnpm test -- src/lib/help/help-context-map.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the module into `+layout.svelte`**

In `apps/web/src/routes/(app)/+layout.svelte`:
- Add to the script imports: `import { helpSlugForPath } from '$lib/help/help-context-map';`
- Delete the inline `const helpContextMap: [RegExp, string][] = [ … ];` block (lines ~17–43).
- Replace the line `$: helpSlug = helpContextMap.find(([re]) => re.test($page.url.pathname))?.[1] || '01-getting-started';` with:
  `$: helpSlug = helpSlugForPath($page.url.pathname);`

- [ ] **Step 6: Lint & build**

Run: `cd apps/web && corepack pnpm lint && corepack pnpm build`
Expected: no errors (no unused `helpContextMap`, no missing import).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/help/help-context-map.ts apps/web/src/lib/help/help-context-map.test.ts "apps/web/src/routes/(app)/+layout.svelte"
git commit -m "feat(web): extract help-context map and add CRM article mapping (#139)"
```

---

### Task 2: CRM help article (en/pl/ru) + DocsService coverage

Author the article in three languages and lock in that the Help API serves it.

**Files:**
- Create: `user_docs/eng/10-crm.md`
- Create: `user_docs/pl/10-crm.md`
- Create: `user_docs/ru/10-crm.md`
- Create: `apps/api/src/docs/docs.service.spec.ts`

**Interfaces:**
- Consumes: `DocsService.getDocsList(lang)`, `DocsService.getDoc(slug, lang)` from `apps/api/src/docs/docs.service.ts`.
- Produces: article slug `10-crm`, English title `CRM — Sales Pipeline`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/docs/docs.service.spec.ts`:

```ts
import { DocsService } from './docs.service';

describe('DocsService — CRM article', () => {
  const service = new DocsService();

  it('lists the CRM article for each locale', () => {
    for (const lang of ['en', 'pl', 'ru']) {
      const slugs = service.getDocsList(lang).map((d) => d.slug);
      expect(slugs).toContain('10-crm');
    }
  });

  it('returns CRM content with an English title', () => {
    const doc = service.getDoc('10-crm', 'en');
    expect(doc).not.toBeNull();
    expect(doc!.slug).toBe('10-crm');
    expect(doc!.title).toBe('CRM — Sales Pipeline');
    expect(doc!.content).toContain('## Contacts');
    expect(doc!.content).toContain('## Deals');
  });

  it('serves the localized RU article (no English fallback)', () => {
    const doc = service.getDoc('10-crm', 'ru');
    expect(doc).not.toBeNull();
    expect(doc!.lang).toBe('ru');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && corepack pnpm test -- src/docs/docs.service.spec.ts`
Expected: FAIL — `10-crm` not found / `doc` is null.

- [ ] **Step 3: Write the English article**

Create `user_docs/eng/10-crm.md`. First line must be exactly `# CRM — Sales Pipeline`. Use these section headings verbatim (the spec and tests depend on `## Contacts` and `## Deals`): `## What the CRM is for`, `## Contacts`, `## Companies`, `## Deals`, `## Activities & tasks`, `## AI deal insights`, `## Plan limits & FAQ`. Write 2–5 short paragraphs/bullet lists per section covering, in plain product language:

```markdown
# CRM — Sales Pipeline

The CRM turns your audience into a sales pipeline that lives inside your
marketing project: capture people as **contacts**, group them into
**companies**, move **deals** through pipeline stages, and let AI suggest the
next move. Open it from the **CRM** entry in the sidebar — sub-tabs:
Contacts · Companies · Deals · Tasks.

## What the CRM is for

Use it to track who you are selling to and how close each opportunity is to
closing. Contacts and companies are your address book; deals are the money;
activities and tasks keep the follow-ups on track; AI insights tell you where
to spend your time.

## Contacts

A contact is a person you might sell to.

- **Sync** — click *Sync* to import contacts automatically from your email
  subscribers and from identified website visitors (anyone with a known
  email). Duplicates are merged by email, so syncing repeatedly is safe.
- **Add manually** — *Add* creates a single contact.
- **Import CSV** — bulk-import from a spreadsheet (Pro plan and above).
- Each contact has a **status** (active / unsubscribed / archived), a
  **source** (manual, CSV import, subscriber, or tracked visitor), **tags**,
  and an **owner** (the responsible team member).
- **Plan limit:** Free 100 contacts, Pro 2,000, Enterprise unlimited.

## Companies

A company is an organisation that contacts belong to. Create a company, then
set it on a contact to group everyone from the same organisation together.

## Deals

A deal is a single sales opportunity, shown on a **Kanban board** where each
column is a pipeline stage.

- **Stages** — the default pipeline is Lead → Qualified → Proposal →
  Negotiation. Each stage carries a **win probability**.
- **Move a deal** — drag its card to another column to change its stage.
- **Forecast** — the strip above the board shows the **weighted forecast**
  (the sum of every open deal's value × its stage probability), the total
  **open** value, and the value **won** in the period.
- **Win / Lose / Reopen** — marking a deal *Won* automatically books an
  **income record in Finance** for the deal's value. Reopening or losing the
  deal removes that record. This keeps revenue and pipeline in sync.
- **Manage stages** — rename, reorder, and set probabilities. Deleting a
  stage moves its open deals to the previous stage.
- **Plan limit:** Free 50 open deals, Pro 1,000, Enterprise unlimited.

## Activities & tasks

Every contact and deal has a **timeline**.

- **Log an activity** — record a note, call, email, or meeting.
- **Add a task** — a to-do with a due date and an owner.
- The **Tasks** page groups your tasks into **Overdue**, **Today**, and
  **Upcoming**, with one-click complete. Toggle *My tasks* to see only yours.
- **Morning digest** — each task owner receives a daily email summarising
  their overdue and due-today tasks.

## AI deal insights

Open a deal and click **Generate** on the AI insights panel to get:

- a **score 0–100** estimating how likely the deal is to close, with the
  reasoning behind it (hot ≥ 70, warm 40–69, cold < 40);
- a suggested **next step** you can add as a task in one click;
- a **draft outreach email** you can copy or log as an activity.

On the board, scored deals show a score badge, and the **Hot first** toggle
sorts the hottest deals to the top.

## Plan limits & FAQ

| Plan | Contacts | Open deals |
| --- | --- | --- |
| Free | 100 | 50 |
| Pro | 2,000 | 1,000 |
| Enterprise | unlimited | unlimited |

**Why is my contact list empty?** Click *Sync* to import subscribers and
tracked visitors, or add a contact manually. Contacts are not created until
you sync or add them.

**What does Win do?** It books an income record in Finance for the deal's
value and marks the deal closed-won. Reopening or losing removes the record.

**Who gets the task digest?** The owner of each open task receives the
morning email, in their own language.
```

- [ ] **Step 4: Write the Polish translation**

Create `user_docs/pl/10-crm.md` — a faithful Polish translation. Keep the **same heading structure** but localize the heading text (e.g. `# CRM — Lejek sprzedaży`, `## Kontakty`, `## Firmy`, `## Szanse sprzedaży`, `## Działania i zadania`, `## Wskazówki AI`, `## Limity planów i FAQ`). Translate all body copy and the FAQ; keep the plan-limit table.

- [ ] **Step 5: Write the Russian translation**

Create `user_docs/ru/10-crm.md` — a faithful Russian translation (e.g. `# CRM — Воронка продаж`, `## Контакты`, `## Компании`, `## Сделки`, `## Активности и задачи`, `## AI-подсказки по сделкам`, `## Лимиты тарифов и FAQ`). Translate all body copy and FAQ; keep the plan-limit table.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/api && corepack pnpm test -- src/docs/docs.service.spec.ts`
Expected: PASS (3 tests). (English title assertion checks the `eng/` file; the `## Contacts`/`## Deals` assertions check the English headings are present.)

- [ ] **Step 7: Commit**

```bash
git add user_docs/eng/10-crm.md user_docs/pl/10-crm.md user_docs/ru/10-crm.md apps/api/src/docs/docs.service.spec.ts
git commit -m "docs(crm): add CRM help article (en/pl/ru) + DocsService coverage (#139)"
```

---

### Task 3: Add `crm.help.*` hints and empty-state copy (en/pl/ru)

Add the 18 tooltip strings plus two empty-state strings to all three locale files, with exact key parity.

**Files:**
- Modify: `packages/i18n/src/locales/en.json` (`crm` object)
- Modify: `packages/i18n/src/locales/pl.json` (`crm` object)
- Modify: `packages/i18n/src/locales/ru.json` (`crm` object)

**Interfaces:**
- Produces (consumed by Task 4) — keys under `crm.help`: `sync`, `csvImport`, `status`, `source`, `owner`, `timeline`, `forecast`, `stageProbability`, `dragStage`, `hotFirst`, `scoreBadge`, `dealStatus`, `aiScore`, `nextStep`, `draft`, `manageStages`, `taskBuckets`, `taskDigest`; plus `crm.tasks.emptyHint` and updated `crm.contacts.emptyHint`.

- [ ] **Step 1: Add the English keys**

In `packages/i18n/src/locales/en.json`, inside the existing `"crm"` object, add a `"help"` child and a `"tasks.emptyHint"`, and replace `crm.contacts.emptyHint`. Use these exact English values:

```jsonc
// crm.help.*
"sync": "Imports contacts from your email subscribers and identified site visitors. Duplicates are merged by email.",
"csvImport": "Bulk-import contacts from a CSV file. Available on Pro and above.",
"status": "The contact's lifecycle: active, unsubscribed, or archived.",
"source": "Where the contact came from: added manually, CSV import, an email subscriber, or a tracked site visitor.",
"owner": "The team member responsible for this contact.",
"timeline": "Log calls, emails, meetings and notes, and add follow-up tasks — newest first.",
"forecast": "Weighted forecast = the sum of each open deal's value × its stage probability.",
"stageProbability": "Each stage has a win probability, used to weight the forecast.",
"dragStage": "Drag a deal card to another column to move it through the pipeline.",
"hotFirst": "Sort deals so AI-scored 'hot' ones appear first.",
"scoreBadge": "AI close-likelihood score (0–100). Hot ≥ 70, warm 40–69, cold < 40.",
"dealStatus": "Mark the deal Won or Lost. Winning books an income record in Finance; reopening or losing removes it.",
"aiScore": "AI estimate of how likely this deal is to close (0–100), with the reasoning below.",
"nextStep": "AI-suggested next action — add it as a task in one click.",
"draft": "AI-drafted outreach email — copy it or log it as an activity.",
"manageStages": "Rename, reorder and set the probability of pipeline stages. Deleting a stage moves its open deals to the previous stage.",
"taskBuckets": "Tasks grouped by due date: overdue, due today, and upcoming.",
"taskDigest": "Each morning, task owners get an email digest of their overdue and due-today tasks."
```

Empty-state copy (English):
- `crm.tasks.emptyHint`: `"Add a task from a contact or deal timeline to see it here."`
- replace `crm.contacts.emptyHint` value with: `"Click Sync to import subscribers and site visitors, add a contact manually, or import a CSV."`

- [ ] **Step 2: Add the Polish keys**

In `packages/i18n/src/locales/pl.json`, add the same `crm.help.*` keys and `crm.tasks.emptyHint`, and replace `crm.contacts.emptyHint`, with faithful Polish translations of each value above. Key names identical to English.

- [ ] **Step 3: Add the Russian keys**

In `packages/i18n/src/locales/ru.json`, add the same `crm.help.*` keys and `crm.tasks.emptyHint`, and replace `crm.contacts.emptyHint`, with faithful Russian translations. Key names identical to English.

- [ ] **Step 4: Verify JSON validity and key parity**

Run this parity check (compares the full key set under `crm.help` plus the two empty keys across locales):

```bash
node -e '
const fs=require("fs");
const load=(l)=>JSON.parse(fs.readFileSync(`packages/i18n/src/locales/${l}.json`,"utf8"));
const flat=(o,p="")=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==="object"?flat(v,p+k+"."):[p+k]);
const locales=["en","pl","ru"].map(load);
const sets=locales.map(o=>flat(o.crm.help).sort().join(","));
if(new Set(sets).size!==1){console.error("crm.help parity MISMATCH");process.exit(1);}
for(const k of ["tasks.emptyHint","contacts.emptyHint"]){
  const present=locales.map(o=>k.split(".").reduce((a,x)=>a&&a[x],o.crm));
  if(present.some(v=>typeof v!=="string")){console.error("missing "+k);process.exit(1);}
}
console.log("i18n crm.help + empty parity OK ("+flat(locales[0].crm.help).length+" help keys)");
'
```

Expected: `i18n crm.help + empty parity OK (18 help keys)`.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/pl.json packages/i18n/src/locales/ru.json
git commit -m "i18n(crm): add help tooltip strings and empty-state copy (en/pl/ru) (#139)"
```

---

### Task 4: Wire tooltips and empty-state text into the CRM pages

Place each `InfoTooltip` next to its anchor and render the new `tasks.emptyHint`. Every file that adds a tooltip must import `InfoTooltip` once.

**Files (modify):**
- `apps/web/src/routes/(app)/projects/[id]/crm/contacts/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/crm/contacts/[contactId]/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/crm/deals/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/crm/deals/[dealId]/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/crm/deals/stages/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/crm/tasks/+page.svelte`

**Interfaces:**
- Consumes: `crm.help.*` keys (Task 3), `crm.tasks.emptyHint` (Task 3), `InfoTooltip` component (`$lib/components/InfoTooltip.svelte`).

**Import pattern (add once per file that gains a tooltip, with the other component imports):**
```svelte
import InfoTooltip from '$lib/components/InfoTooltip.svelte';
```

**Placement pattern:** put the tooltip immediately after the anchor label's text, inside the same element where reasonable, e.g.:
```svelte
<p class="…">{$_('crm.pipeline.forecast.weighted')} <InfoTooltip key="crm.help.forecast" /></p>
```
For a button, place it as a sibling right after the button so the icon doesn't sit inside the clickable area:
```svelte
<button …>{$_('crm.contacts.syncNow')}</button>
<InfoTooltip key="crm.help.sync" />
```

**Anchor map (anchor i18n key already in the file → tooltip key to add):**

Contacts list (`contacts/+page.svelte`):
- after Sync button text `crm.contacts.syncNow` → `crm.help.sync`
- after Import button text `crm.contacts.import` → `crm.help.csvImport`
- in the Status column header `crm.contacts.columns.status` (the `<th>`) → `crm.help.status`

Contact detail (`contacts/[contactId]/+page.svelte`):
- after the Owner label `crm.contact.owner` → `crm.help.owner`
- after the Source label (the details card label rendering the source field; search the file for the source label near `crm.contact` / `crm.contacts.columns.source` / a label above the source value) → `crm.help.source`
- after the timeline section heading where `CrmTimeline` is rendered (add a small heading or attach to the nearest section title above `<CrmTimeline …>`) → `crm.help.timeline`

Deals board (`deals/+page.svelte`):
- after the Forecast label `crm.pipeline.forecast.weighted` → `crm.help.forecast`
- after the Hot-first toggle label `crm.insights.hotFirst` → `crm.help.hotFirst`
- next to the board/stages area heading, add a `dragStage` hint (attach to the toolbar row that holds the Hot-first toggle / Manage-stages link) → `crm.help.dragStage`
- next to a deal card's score badge (the element rendered when `scoreBand(...)` is shown on a card) → `crm.help.scoreBadge`. If adding one per card is noisy, attach a single `scoreBadge` tooltip to the board header instead and note it.

Deal detail (`deals/[dealId]/+page.svelte`):
- next to the Win/Lose/Reopen control group (attach to the group's heading or the first button) → `crm.help.dealStatus`
- after the AI score label `crm.insights.score` → `crm.help.aiScore`
- after the next-step label (search for the next-step block near `insight.nextStep`; attach to its label) → `crm.help.nextStep`
- after the draft label (search near `insight.draftBody`; attach to its label) → `crm.help.draft`

Stages settings (`deals/stages/+page.svelte`):
- after the page heading → `crm.help.manageStages`
- after the probability column/label → `crm.help.stageProbability`

Tasks (`tasks/+page.svelte`):
- after the page heading or the Overdue/Today/Upcoming group → `crm.help.taskBuckets`
- next to the My-tasks toggle / header, add → `crm.help.taskDigest`
- in the empty state, render the new hint under `crm.tasks.empty`:
  ```svelte
  <h2 class="…">{$_('crm.tasks.empty')}</h2>
  <p class="text-ink-muted mb-6 max-w-sm text-sm">{$_('crm.tasks.emptyHint')}</p>
  ```

- [ ] **Step 1: Add the tooltips and empty-state line**

Edit the six files per the anchor map above. Add the `InfoTooltip` import once to each file that gains a tooltip. Use `side="bottom"` for anchors in the top ~80px of the page (page headings, board toolbar) to keep the tooltip on-screen; default `side="top"` elsewhere.

- [ ] **Step 2: Verify every new key is referenced**

Run (confirms all 18 help keys + the empty hint are wired, so none renders as a raw key string):

```bash
node -e '
const {execSync}=require("child_process");
const dir="apps/web/src/routes/(app)/projects/[id]/crm";
const keys=["sync","csvImport","status","source","owner","timeline","forecast","stageProbability","dragStage","hotFirst","scoreBadge","dealStatus","aiScore","nextStep","draft","manageStages","taskBuckets","taskDigest"].map(k=>"crm.help."+k).concat(["crm.tasks.emptyHint"]);
const hay=execSync(`grep -rho "crm\\.\\(help\\|tasks\\)\\.[a-zA-Z]*" "${dir}" || true`,{shell:"/bin/bash"}).toString();
const missing=keys.filter(k=>!hay.includes(k));
if(missing.length){console.error("Not referenced:",missing.join(", "));process.exit(1);}
console.log("All "+keys.length+" CRM help/empty keys referenced in pages");
'
```

Expected: `All 19 CRM help/empty keys referenced in pages`.

- [ ] **Step 3: Lint & build**

Run: `cd apps/web && corepack pnpm lint && corepack pnpm build`
Expected: no errors (each tooltip file imports `InfoTooltip`; no unused imports; no stray raw text).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/routes/(app)/projects/[id]/crm"
git commit -m "feat(web): add CRM tooltips and tasks empty-state hint (#139)"
```

---

## Self-Review

**Spec coverage:**
- Help article `10-crm.md` ×3 → Task 2. ✅
- Help context mapping (CRM before catch-all) → Task 1. ✅
- ~18 `InfoTooltip` hints + `crm.help.*` keys → Task 3 (keys) + Task 4 (wiring). ✅
- Empty states (`crm.tasks.emptyHint`, `crm.contacts.emptyHint`) → Task 3 (copy) + Task 4 (render tasks hint). ✅ (Other empty states already exist and are adequate — spec §4 reduced to these two; documented.)
- EN source + en/pl/ru parity → Global Constraints + Task 2/3 translation steps + parity checks. ✅
- No API/DB/deps → confirmed; only DocsService **spec** added (no service change). ✅
- Testing: context-map unit test (Task 1), DocsService spec (Task 2), i18n parity command (Task 3), key-reference + lint/build (Task 4). ✅

**Placeholder scan:** No TBD/TODO. Task 4 anchors that can't be pinned to a stable existing i18n key (source label, next-step label, draft label, score badge, win/lose group) include explicit "search for X near Y" instructions and a documented fallback — these are location hints for living markup, not requirement placeholders.

**Type/name consistency:** `helpSlugForPath`/`helpContextMap` (Task 1) used consistently. The 18 `crm.help.*` key names in Task 3 (Produces) exactly match the keys wired in Task 4 (anchor map) and the verification list in Task 4 Step 2. Article slug `10-crm` and title `CRM — Sales Pipeline` consistent across Tasks 1, 2.
