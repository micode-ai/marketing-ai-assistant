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
- Dropdown with two sections: "Organization" (always first, with building icon) + project list from `projectsStore`
- Current selection shown as pill/badge: icon + name
- Organization = gray pill, project = indigo pill
- On select project → `currentProjectStore.set(project)`, saved to `localStorage.currentProjectId`
- On select "Organization" → `currentProjectStore.set(null)`, clear localStorage key
- Dropdown closes on click outside
- Mobile: same dropdown, full-width

**Loading state:** While projects are being fetched, show a skeleton pill with spinner. Dropdown disabled until loaded.

**Empty state:** If no projects exist, show "No projects — Create one" link to `/dashboard`.

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
else → API call with organizationId (org-scoped items only, NOT aggregated)
```
Note: In org context, pages show only organization-scoped items (same as the current "Organization" tab). The "All Projects" aggregated view is removed — users who want project-specific data should select that project in the picker.

**Breadcrumb** under page title (rendered in component, using i18n keys for labels):
- Project context: `Organization Name › Project Name › Content`
- Org context: `Organization Name › Content`

**Action buttons** (Add, Create):
- Project selected → creates in project context (passes `projectId` to API)
- Organization context → **disable** create/add button with tooltip: "Select a project to create content" (i18n key `common.selectProjectToCreate`). Reason: most creation APIs require `projectId` (e.g., `POST /agent/run`).

**List items are clickable** — navigate to edit/detail page. For project-scoped items, navigate to `/projects/${item.projectId}/content/${item.id}` (preserving existing edit routes).

### 4. Stores

**`projectsStore` initialization (critical change):**
- Currently only populated in `dashboard/+page.svelte` on mount
- **Must be fetched in `+layout.svelte` onMount** (alongside existing `/users/me` call) so that:
  - ProjectPicker has data immediately on any page entry
  - Project restoration can validate stored projectId
- Fetch: `GET /projects?organizationId=${orgId}` → `projectsStore.set(projects)`
- Re-fetch when `organizationIdStore` changes

**`currentProjectStore` (updated):**
- Initialize from `localStorage.currentProjectId` on app load
- On set → save to `localStorage`
- On organization switch → reset to null, clear localStorage

**`contextStore` (new derived store in `apps/web/src/lib/stores/context.ts`):**
```ts
export const contextStore = derived(
  [currentProjectStore, organizationIdStore],
  ([$project, $orgId]) => ({
    type: $project ? 'project' as const : 'organization' as const,
    projectId: $project?.id || null,
    organizationId: $orgId
  })
);
```
Note: `label` is NOT in the store — components derive display labels using `$_()` i18n function to avoid hardcoded strings.

**Project restoration on load (in `+layout.svelte` onMount, after projectsStore is populated):**
1. Read `localStorage.currentProjectId`
2. If value exists, find project in freshly-loaded `projectsStore`
3. If found AND belongs to current org → `currentProjectStore.set(project)`
4. If not found or wrong org → `currentProjectStore.set(null)`, clear localStorage

**Organization switch (`switchOrg` in Sidebar.svelte):**
- Add `currentProjectStore.set(null)` and `localStorage.removeItem('currentProjectId')` before `window.location.href = '/dashboard'`

**Leave organization (`leaveOrg` in Sidebar.svelte):**
- Also add `currentProjectStore.set(null)` and `localStorage.removeItem('currentProjectId')` before redirect, same as `switchOrg`

**Dashboard project fetch deduplication:**
- Once `projectsStore` is loaded in `+layout.svelte`, remove the duplicate fetch from `dashboard/+page.svelte` onMount

### 5. Routing

**Deep link redirects (`/projects/[id]/*`):**
- `/projects/[id]/content` → redirect to `/content`
- `/projects/[id]/checklists` → redirect to `/checklists`
- Same pattern for: documents, campaigns, email, analytics, seo, competitors, experiments, sequences, calendar

**Implementation:** Each redirect route uses a `+page.svelte` with reactive block to handle the race condition where `projectsStore` may not yet be populated on direct navigation (bookmark/refresh):
```svelte
<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  const projectId = $page.params.id;

  // Save projectId to localStorage immediately so +layout.svelte restoration
  // can pick it up even if projectsStore hasn't loaded yet
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('currentProjectId', projectId);
  }

  // Wait for projectsStore to be populated (loaded by +layout.svelte),
  // then set the full project object and redirect
  $: if ($projectsStore.length > 0) {
    const project = $projectsStore.find(p => p.id === projectId);
    if (project) currentProjectStore.set(project);
    goto('/content' + $page.url.search, { replaceState: true });
  }
</script>
```
Reason: SvelteKit `+page.ts` load functions cannot access client-side stores. Using a reactive `$:` block ensures we wait for store data before redirecting.

**Query parameters:** Redirects forward query params: `goto('/content' + $page.url.search, { replaceState: true })`.

**Sub-paths** (e.g., `/projects/[id]/content/[contentId]`): NOT redirected. Edit/detail pages remain at their current project-scoped URLs since they are unique to a specific item. Only the list pages redirect.

**Exceptions (keep current routes unchanged):**
- `/projects/[id]/overview` — unique project page, stays as-is
- `/projects/[id]/settings` — unique project page, stays as-is
- `/projects/[id]/content/[contentId]` and similar detail/edit routes — stay as-is

**Dashboard (`/dashboard`):**
- Unchanged — org-level, shows project cards
- Click project card → set picker to project + navigate to `/projects/${id}/overview`

**Picker context change behavior:**
- On Marketing page → data reloads reactively via `$:` statements watching `$contextStore`
- If on `/projects/[id]/overview` and picker switched to "Organization" → `goto('/dashboard')`
- If on `/projects/X/overview` and picker switched to project Y → `goto('/projects/Y/overview')`
- Owner of this redirect: ProjectPicker's onChange handler checks `$page.url.pathname` — if it starts with `/projects/`, either navigate to `/dashboard` (org selected) or replace the project ID in the URL (different project selected)

**URL sharing / bookmarking:**
- `/content` without context params shows data based on the viewer's own picker state. This is acceptable because Marketing pages are workspace-scoped, not shareable public URLs.

### 6. Sidebar Active State

Update `isActive()` to handle unified marketing routes. Marketing links (`/content`, `/checklists`, etc.) should be active when:
- Current path matches exactly, OR
- Current path is a project sub-route for the same section (e.g., `/projects/abc/content/xyz` → Content link active)

Implementation: add a mapping check for `/projects/*/content` → `/content` in the active detection logic.

## Files Changed

### New Files
- `apps/web/src/lib/components/layout/ProjectPicker.svelte`
- `apps/web/src/lib/stores/context.ts` (contextStore)

### Modified Files
- `apps/web/src/lib/components/layout/Header.svelte` — add ProjectPicker
- `apps/web/src/lib/components/layout/Sidebar.svelte` — remove project section, unify Marketing links, add conditional Overview, update `isActive()`, update `switchOrg()` to clear project
- `apps/web/src/lib/stores/projects.ts` — localStorage persistence for currentProjectStore
- `apps/web/src/routes/(app)/+layout.svelte` — fetch projectsStore on mount, project restoration logic
- `apps/web/src/routes/(app)/content/+page.svelte` — use contextStore, clickable items, add button (disabled in org context), breadcrumb
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
- `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` — redirect to `/content` via onMount+goto
- `apps/web/src/routes/(app)/projects/[id]/checklists/+page.svelte` — redirect to `/checklists`
- (same for all other Marketing sub-routes under `/projects/[id]/`)
- `apps/web/src/routes/(app)/dashboard/+page.svelte` — project card click navigates to overview

### i18n Keys (new, all three locales: en/pl/ru)
- `header.orgContext` — "Organization" / "Организация" / "Organizacja"
- `header.selectProject` — "Select project..." / "Выбрать проект..." / "Wybierz projekt..."
- `header.switchContext` — "Switch context" / "Переключить контекст" / "Przełącz kontekst"
- `header.noProjects` — "No projects — Create one" / "Нет проектов — Создайте" / "Brak projektów — Utwórz"
- `common.selectProjectToCreate` — "Select a project to create" / "Выберите проект для создания" / "Wybierz projekt, aby utworzyć"
- `breadcrumb.organization` — (reuse existing `org.scopeOrg` key if suitable)
