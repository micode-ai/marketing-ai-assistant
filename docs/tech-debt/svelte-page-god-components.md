---
id: svelte-page-god-components
title: 'Four Svelte route pages exceed 1 000 lines each'
status: open
priority: P2
module: 'apps/web'
created_at: 2026-05-12
---

# Four Svelte route pages exceed 1 000 lines each

## What's wrong

Four `+page.svelte` files have grown into god-components that mix data loading, business logic, modal state, and dozens of inline sub-views:

| File | Lines |
|---|---|
| `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` | 1 385 |
| `apps/web/src/routes/(app)/projects/[id]/checklists/+page.svelte` | 1 216 |
| `apps/web/src/routes/(app)/projects/[id]/documents/+page.svelte` | 1 037 |
| `apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte` | 1 036 |

Each page hosts multiple modals (create, edit, delete, confirm), filter/sort controls, polling logic, and card-rendering markup — all in one file.

## Why it matters

Files this large are slow to review and easy to break: a change to the create modal risks a regression in the delete confirmation because they share reactive state. Merge conflicts are frequent because every feature touch lands on the same file (the git log shows `content/+page.svelte` and `seo/+page.svelte` among the most-touched files in recent history). New contributors spend significant time finding the right section before they can make a change.

## Proposed fix

- Extract each modal into a named component: e.g. `CreateContentModal.svelte`, `EditContentModal.svelte`, `DeleteContentConfirm.svelte` under `src/lib/components/content/`.
- Move polling and API-call logic into a dedicated `+page.ts` load function or a scoped Svelte store/service module.
- Keep `+page.svelte` as a composition root: import and arrange components, hold minimal top-level state.
- Prioritize `content/+page.svelte` first — it is the largest and most frequently changed.
- Target: each page file under 300 lines.

## Files involved

- `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/checklists/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/documents/+page.svelte`
- `apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte`
