# Unified Navigation Design

## Problem

Sidebar has duplicate navigation sections (Marketing org-level + Project-level) causing confusion. Org-level Marketing pages (`/content`, `/checklists`, etc.) show data in tabs (Organization | All Projects) but items are not clickable, have no add buttons, and the user cannot tell which project is active.

## Solution

Unified navigation with a **Project Picker in the header** and a **single set of Marketing links** in the sidebar. The picker determines the data context for all Marketing pages.

## Design Decisions

1. **Project Picker in header** — not sidebar, not breadcrumb
2. **Sticky project** — persisted to localStorage, survives navigation and page reloads
3. **One set of Marketing links** — picker determines org vs project context
4. **No tabs on pages** — picker is the single point of context switching
5. **Approach: Unified routing** — one set of pages, not redirect bridge

## Components

### 1. ProjectPicker (Header)

**Location:** `apps/web/src/lib/components/layout/ProjectPicker.svelte`, rendered in `Header.svelte`.

**Behavior:**
- Dropdown with two sections: "Organization" (always first) + project list from `projectsStore`
- Current selection shown as pill/badge: icon + name
- Organization = gray pill, project = indigo pill
- On select project → `currentProjectStore.set(project)`, saved to `localStorage.currentProjectId`
- On select "Organization" → `currentProjectStore.set(null)`, clear localStorage
- Dropdown closes on click outside
- Mobile: same dropdown, full-width

### 2. Sidebar (Simplified)

**Two navigation sections** (down from three):

**Navigation:**
- Dashboard, Projects, AI Chat, Templates (unchanged)

**Marketing:**
- Overview (visible only when project selected, links to `/projects/${projectId}/overview`)
- Content (`/content`)
- Checklists (`/checklists`)
- Documents (`/documents`)
- Campaigns (`/campaigns`)
- Email (`/email`)
- Analytics (`/analytics`)
- Advanced (collapsible): SEO, Competitors, Experiments, Sequences, Calendar

**Removed:**
- Entire project-scoped navigation section (`{#if $currentProjectStore && projectId}` block with essentialLinks + advancedLinks)
- The "Project Name" header in sidebar

### 3. Unified Marketing Pages

Each Marketing page (`/content`, `/checklists`, `/campaigns`, `/email`, `/documents`, `/analytics`, `/seo`, `/competitors`, `/experiments`, `/sequences`, `/calendar`) follows the same pattern:

**Data loading:**
```
if ($currentProjectStore) → API call with projectId
else → API call with organizationId
```

**Breadcrumb** under page title:
- Project context: `My Organization > My Project > Content`
- Org context: `My Organization > Content`

**Action buttons** (Add, Create):
- Project selected → creates in project context
- Organization → creates in org context

**List items are clickable** — navigate to edit/detail page.

### 4. Stores

**`currentProjectStore` (updated):**
- Initialize from `localStorage.currentProjectId` on app load
- On set → save to `localStorage`
- On organization switch → reset to null, clear localStorage

**`contextStore` (new derived store):**
```ts
export const contextStore = derived(
  [currentProjectStore, organizationIdStore],
  ([$project, $orgId]) => ({
    type: $project ? 'project' : 'organization',
    projectId: $project?.id || null,
    organizationId: $orgId,
    label: $project?.name || 'Organization'
  })
);
```

Pages use `$contextStore` for API requests — single source of truth.

**Project restoration on load:**
- Read `localStorage.currentProjectId`
- Verify project exists in `projectsStore` (loaded during app init)
- If project deleted or from different org → reset to null

### 5. Routing

**Deep link redirects (`/projects/[id]/*`):**
- `/projects/[id]/content` → set project in picker → redirect to `/content`
- `/projects/[id]/checklists` → set project in picker → redirect to `/checklists`
- Same pattern for: documents, campaigns, email, analytics, seo, competitors, experiments, sequences, calendar

**Implementation:** A `+layout.ts` (or `+page.ts`) in each `/projects/[id]/<section>` route that reads projectId, sets the store, and redirects.

**Exceptions (keep current routes):**
- `/projects/[id]/overview` — unique project page, stays as-is
- `/projects/[id]/settings` — unique project page, stays as-is

**Dashboard (`/dashboard`):**
- Unchanged — org-level, shows project cards
- Click project card → set picker to project + navigate to overview

**Picker context change behavior:**
- On Marketing page → data reloads reactively via `$:` statements
- If on Overview and picker switched to "Organization" → redirect to `/dashboard`

## Files Changed

### New Files
- `apps/web/src/lib/components/layout/ProjectPicker.svelte`
- `apps/web/src/lib/stores/context.ts` (contextStore)

### Modified Files
- `apps/web/src/lib/components/layout/Header.svelte` — add ProjectPicker
- `apps/web/src/lib/components/layout/Sidebar.svelte` — remove project section, unify Marketing links, add conditional Overview
- `apps/web/src/lib/stores/projects.ts` — localStorage persistence for currentProjectStore
- `apps/web/src/routes/(app)/+layout.svelte` — project restoration on load
- `apps/web/src/routes/(app)/content/+page.svelte` — use contextStore, clickable items, add button, breadcrumb
- `apps/web/src/routes/(app)/checklists/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/campaigns/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/email/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/documents/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/analytics/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/seo/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/competitors/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/experiments/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/sequences/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/calendar/+page.svelte` — same pattern
- `apps/web/src/routes/(app)/projects/[id]/content/+page.ts` — redirect to `/content`
- `apps/web/src/routes/(app)/projects/[id]/checklists/+page.ts` — redirect to `/checklists`
- (same for all other Marketing sub-routes under `/projects/[id]/`)
- `apps/web/src/routes/(app)/dashboard/+page.svelte` — project card click → set picker + navigate

### i18n Keys (new)
- `header.orgContext` — "Organization"
- `header.selectProject` — "Select project..."
- `header.switchContext` — "Switch context"
- `breadcrumb.organization` — "Organization" (if not already covered by existing keys)
