# Unified Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate sidebar navigation (org + project sections) with a single Marketing menu controlled by a Project Picker in the header bar.

**Architecture:** A `ProjectPicker` dropdown in the header sets `currentProjectStore` (persisted to localStorage). A derived `contextStore` provides the active scope. All Marketing pages (`/content`, `/checklists`, etc.) read from `contextStore` to load org-scoped or project-scoped data. Items are clickable — clicking navigates to the full project page (`/projects/[id]/content`) where all CRUD modals live. Project pages stay as-is and set `currentProjectStore` on mount.

**Key insight:** Project-level pages (`/projects/[id]/content`, etc.) contain all create/edit/delete functionality via inline modals. They are NOT replaced. The unified pages (`/content`, etc.) serve as context-aware navigation hubs.

**Tech Stack:** SvelteKit 2, Svelte stores, TailwindCSS, svelte-i18n

**Spec:** `docs/superpowers/specs/2026-03-31-unified-navigation-design.md`
**Issue:** #30

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/web/src/lib/stores/context.ts` | Derived `contextStore` from currentProject + organizationId |
| `apps/web/src/lib/components/layout/ProjectPicker.svelte` | Header dropdown for org/project switching |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/src/lib/stores/projects.ts` | Add localStorage persistence for `currentProjectStore`, export `projectsLoaded` flag |
| `apps/web/src/routes/(app)/+layout.svelte` | Fetch projects on mount, restore project from localStorage |
| `apps/web/src/lib/components/layout/Header.svelte` | Mount `ProjectPicker` between hamburger and right section |
| `apps/web/src/lib/components/layout/Sidebar.svelte` | Remove project section, unify Marketing links, update `isActive()`, clear project on org switch/leave |
| `packages/i18n/src/locales/en.json` | Add header/common i18n keys |
| `packages/i18n/src/locales/ru.json` | Same keys in Russian |
| `packages/i18n/src/locales/pl.json` | Same keys in Polish |
| `apps/web/src/routes/(app)/content/+page.svelte` | Rewrite: contextStore, clickable items linking to project page, breadcrumb, create button |
| `apps/web/src/routes/(app)/checklists/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/documents/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/campaigns/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/email/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/analytics/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/seo/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/competitors/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/experiments/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/sequences/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/calendar/+page.svelte` | Same pattern |
| `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` | Add `currentProjectStore.set()` on mount |
| (same for all 11 project marketing pages) | Same pattern |
| `apps/web/src/routes/(app)/dashboard/+page.svelte` | Use projectsStore from layout, set picker on card click |

### NOT changed (kept as-is)
- `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte` — full CRUD page, not redirected
- All other `projects/[id]/*` pages — kept with all their modal/form functionality

---

## Task 1: Stores — contextStore + localStorage persistence

**Files:**
- Create: `apps/web/src/lib/stores/context.ts`
- Modify: `apps/web/src/lib/stores/projects.ts` (lines 1-16)

- [ ] **Step 1: Create `context.ts` with derived store**

```ts
// apps/web/src/lib/stores/context.ts
import { derived } from 'svelte/store';
import { currentProjectStore, organizationIdStore } from './projects';

export const contextStore = derived(
  [currentProjectStore, organizationIdStore],
  ([$project, $orgId]) => ({
    type: $project ? 'project' as const : 'organization' as const,
    projectId: $project?.id || null,
    organizationId: $orgId
  })
);
```

- [ ] **Step 2: Add localStorage persistence and `projectsLoaded` flag to `projects.ts`**

Replace the entire content of `apps/web/src/lib/stores/projects.ts` with:

```ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Project } from '@marketing-ai/shared-types';

export const projectsStore = writable<Project[]>([]);
export const projectsLoaded = writable(false);

// currentProjectStore: full Project object, restored in +layout.svelte
export const currentProjectStore = writable<Project | null>(null);

// Exported so +layout.svelte can attempt restoration before projectsStore loads
export const _storedProjectId: string | null = browser ? localStorage.getItem('currentProjectId') : null;

// Persist currentProjectStore to localStorage
if (browser) {
  currentProjectStore.subscribe((project) => {
    if (project) localStorage.setItem('currentProjectId', project.id);
    else localStorage.removeItem('currentProjectId');
  });
}

const storedOrgId = browser ? localStorage.getItem('organizationId') : null;
export const organizationIdStore = writable<string | null>(storedOrgId);

if (browser) {
  organizationIdStore.subscribe((id) => {
    if (id) localStorage.setItem('organizationId', id);
    else localStorage.removeItem('organizationId');
  });
}
```

- [ ] **Step 3: Verify imports still work**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`
Expected: No errors related to `projects.ts` or `context.ts` imports.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/stores/context.ts apps/web/src/lib/stores/projects.ts
git commit -m "feat(web): add contextStore and localStorage persistence for currentProjectStore (#30)"
```

---

## Task 2: i18n — Add new keys to all three locales

**Files:**
- Modify: `packages/i18n/src/locales/en.json`
- Modify: `packages/i18n/src/locales/ru.json`
- Modify: `packages/i18n/src/locales/pl.json`

- [ ] **Step 1: Add keys to `en.json`**

Add a new `"header"` section (after the `"nav"` section):

```json
"header": {
  "orgContext": "Organization",
  "selectProject": "Select project...",
  "switchContext": "Switch context",
  "noProjects": "No projects — Create one"
}
```

Add to the existing `"common"` section:

```json
"selectProjectToCreate": "Select a project to create",
"openInProject": "Open in project"
```

- [ ] **Step 2: Add keys to `ru.json`**

```json
"header": {
  "orgContext": "Организация",
  "selectProject": "Выбрать проект...",
  "switchContext": "Переключить контекст",
  "noProjects": "Нет проектов — Создайте"
}
```

In `"common"`:
```json
"selectProjectToCreate": "Выберите проект для создания",
"openInProject": "Открыть в проекте"
```

- [ ] **Step 3: Add keys to `pl.json`**

```json
"header": {
  "orgContext": "Organizacja",
  "selectProject": "Wybierz projekt...",
  "switchContext": "Przełącz kontekst",
  "noProjects": "Brak projektów — Utwórz"
}
```

In `"common"`:
```json
"selectProjectToCreate": "Wybierz projekt, aby utworzyć",
"openInProject": "Otwórz w projekcie"
```

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales/en.json packages/i18n/src/locales/ru.json packages/i18n/src/locales/pl.json
git commit -m "i18n: add project picker and breadcrumb keys in en/ru/pl (#30)"
```

---

## Task 3: Layout — Fetch projects on mount + restore project

**Files:**
- Modify: `apps/web/src/routes/(app)/+layout.svelte` (lines 1-81)

- [ ] **Step 1: Update imports (line 6)**

Replace:
```ts
import { organizationIdStore } from '$lib/stores/projects';
```

With:
```ts
import { organizationIdStore, projectsStore, currentProjectStore, projectsLoaded, _storedProjectId } from '$lib/stores/projects';
```

- [ ] **Step 2: Add project fetch + restoration inside onMount**

After the org validation block (after line 70's closing `}`) and before the mobile sidebar check (line 77), add:

```ts
      // Fetch projects for the validated org — needed by ProjectPicker and project restoration
      const orgId = $organizationIdStore;
      if (orgId) {
        try {
          const projects = await api.get<any[]>('/projects', { organizationId: orgId });
          projectsStore.set(projects);
          projectsLoaded.set(true);

          // Restore sticky project from localStorage
          if (_storedProjectId) {
            const savedProject = projects.find((p: any) => p.id === _storedProjectId);
            if (savedProject) {
              currentProjectStore.set(savedProject);
            } else {
              // Project no longer exists or belongs to different org — clear
              currentProjectStore.set(null);
            }
          }
        } catch {
          projectsStore.set([]);
          projectsLoaded.set(true);
        }
      }
```

- [ ] **Step 3: Verify the app boots correctly**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/'(app)'/+layout.svelte
git commit -m "feat(web): fetch projectsStore on mount and restore sticky project (#30)"
```

---

## Task 4: ProjectPicker component

**Files:**
- Create: `apps/web/src/lib/components/layout/ProjectPicker.svelte`
- Modify: `apps/web/src/lib/components/layout/Header.svelte` (lines 1-71)

- [ ] **Step 1: Create `ProjectPicker.svelte`**

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { currentProjectStore, projectsStore, organizationIdStore, projectsLoaded } from '$lib/stores/projects';
  import { currentUser } from '$lib/stores/auth';

  let open = false;

  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;
  $: projects = $projectsStore;
  $: current = $currentProjectStore;
  $: loaded = $projectsLoaded;

  function selectOrg() {
    currentProjectStore.set(null);
    open = false;
    // If on a project-specific route, navigate away
    if ($page.url.pathname.startsWith('/projects/')) {
      goto('/dashboard');
    }
  }

  function selectProject(project: any) {
    const prevId = $currentProjectStore?.id;
    currentProjectStore.set(project);
    open = false;
    // If on a project-specific route, update the project ID in URL
    const path = $page.url.pathname;
    if (path.startsWith('/projects/') && prevId !== project.id) {
      const newPath = path.replace(/\/projects\/[^/]+/, `/projects/${project.id}`);
      goto(newPath);
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.project-picker')) {
      open = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="project-picker relative">
  <button
    on:click|stopPropagation={() => open = !open}
    disabled={!loaded}
    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer max-w-[220px]
      {!loaded ? 'bg-gray-100 text-gray-400 animate-pulse' :
       current
        ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
    title={$_('header.switchContext')}
  >
    {#if !loaded}
      <div class="w-4 h-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin"></div>
      <span class="truncate">...</span>
    {:else if current}
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
      <span class="truncate">{current.name}</span>
    {:else}
      <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
      <span class="truncate">{currentOrg?.name || $_('header.orgContext')}</span>
    {/if}
    <svg class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 {open ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <div class="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1 max-h-80 overflow-y-auto">
      <!-- Organization option -->
      <button
        on:click|stopPropagation={selectOrg}
        class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer
          {!current ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}"
      >
        <svg class="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
        <span>{currentOrg?.name || $_('header.orgContext')}</span>
        {#if !current}
          <svg class="w-4 h-4 ml-auto text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        {/if}
      </button>

      <div class="border-t border-gray-100 my-1"></div>

      <!-- Projects -->
      {#if projects.length === 0}
        <a
          href="/dashboard"
          class="block px-3 py-2 text-sm text-gray-400 hover:text-indigo-600 transition-colors"
          on:click={() => open = false}
        >
          {$_('header.noProjects')}
        </a>
      {:else}
        {#each projects as project}
          <button
            on:click|stopPropagation={() => selectProject(project)}
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer
              {current?.id === project.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}"
          >
            <svg class="w-4 h-4 flex-shrink-0 {current?.id === project.id ? 'text-indigo-500' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
            <span class="truncate">{project.name}</span>
            {#if current?.id === project.id}
              <svg class="w-4 h-4 ml-auto text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Mount ProjectPicker in Header.svelte**

In `apps/web/src/lib/components/layout/Header.svelte`:

Add import at line 5 (after the `setLocale` import):
```ts
  import ProjectPicker from './ProjectPicker.svelte';
```

In the `<header>` element, after the hamburger button's closing `</button>` (after line 31) and before `<div class="flex items-center gap-3">` (line 34), add:

```svelte

  <ProjectPicker />

```

- [ ] **Step 3: Verify it renders**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/layout/ProjectPicker.svelte apps/web/src/lib/components/layout/Header.svelte
git commit -m "feat(web): add ProjectPicker dropdown in header bar (#30)"
```

---

## Task 5: Sidebar — Remove project section, unify Marketing links

**Files:**
- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte`

- [ ] **Step 1: Update `switchOrg` and `leaveOrg` to clear project**

In `switchOrg()` function (line 18), add before `window.location.href = '/dashboard'`:
```ts
    currentProjectStore.set(null);
```

In `leaveOrg()` function (around line 30), add before `organizationIdStore.set(null)`:
```ts
      currentProjectStore.set(null);
```

- [ ] **Step 2: Replace link arrays**

Replace `orgMarketingLinks` (lines 76-88) with split essential + advanced:

```ts
  const marketingLinks = [
    { href: '/content',     iconKey: 'pencil',       labelKey: 'nav.orgContent' },
    { href: '/checklists',  iconKey: 'checkcircle',  labelKey: 'nav.orgChecklists' },
    { href: '/documents',   iconKey: 'document',     labelKey: 'nav.orgDocuments' },
    { href: '/campaigns',   iconKey: 'megaphone',    labelKey: 'nav.orgCampaigns' },
    { href: '/email',       iconKey: 'envelope',     labelKey: 'nav.orgEmail' },
    { href: '/analytics',   iconKey: 'presentation', labelKey: 'nav.orgAnalytics' },
  ];

  const advancedMarketingLinks = [
    { href: '/seo',         iconKey: 'globe',         labelKey: 'nav.orgSeo' },
    { href: '/competitors', iconKey: 'eye',           labelKey: 'nav.orgCompetitors' },
    { href: '/experiments', iconKey: 'beaker',        labelKey: 'nav.orgExperiments' },
    { href: '/sequences',   iconKey: 'mailstack',     labelKey: 'nav.orgSequences' },
    { href: '/calendar',    iconKey: 'calendar',      labelKey: 'nav.orgCalendar' },
  ];
```

Remove `essentialLinks` (lines 99-105) and `advancedLinks` (lines 107-115) arrays entirely.

- [ ] **Step 3: Update `isActive` function**

Find the existing `isActive` function and replace with:

```ts
  const marketingPathSegments = ['content', 'checklists', 'documents', 'campaigns', 'email', 'analytics', 'seo', 'competitors', 'experiments', 'sequences', 'calendar'];

  function isActive(href: string): boolean {
    if (currentPath === href || currentPath.startsWith(href + '/')) return true;
    // Check if on a project sub-route that maps to this marketing link
    const segment = href.replace('/', '');
    if (marketingPathSegments.includes(segment)) {
      const projectRouteMatch = currentPath.match(/^\/projects\/[^/]+\/(.+)/);
      if (projectRouteMatch) {
        const subPath = projectRouteMatch[1].split('/')[0];
        return subPath === segment;
      }
    }
    return false;
  }
```

- [ ] **Step 4: Update the auto-expand reactive block**

Find the existing reactive block that auto-expands advanced links when navigating to an advanced route (references `advancedLinks` and `projectId`). Replace it with:

```ts
  // Auto-expand advanced section when user navigates to an advanced route
  $: {
    const advancedHrefs = advancedMarketingLinks.map(l => l.href);
    const isOnAdvanced = advancedHrefs.some(h => isActive(h));
    if (isOnAdvanced && !showAdvanced) {
      showAdvanced = true;
      if (browser) localStorage.setItem('sidebarAdvanced', 'true');
    }
  }
```

- [ ] **Step 5: Replace the Marketing + Project template sections**

Replace the org marketing section (lines ~246-265) and the entire project navigation section (lines ~267-327) with a single unified Marketing section:

```svelte
      <!-- Marketing -->
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">{$_('nav.marketing')}</p>
        <ul class="space-y-0.5">
          <!-- Overview — only when project selected -->
          {#if $currentProjectStore}
            {@const overviewHref = `/projects/${$currentProjectStore.id}/overview`}
            <li>
              <a
                href={overviewHref}
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                  {currentPath === overviewHref || currentPath.startsWith(overviewHref)
                    ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
              >
                {@html icons['chartbar']}
                <span>{$_('projects.overview')}</span>
              </a>
            </li>
          {/if}

          {#each marketingLinks as link}
            <li>
              <a
                href={link.href}
                class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                  {isActive(link.href)
                    ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
              >
                {@html icons[link.iconKey]}
                <span>{$_(link.labelKey)}</span>
              </a>
            </li>
          {/each}

          <!-- Advanced toggle -->
          <li>
            <button
              on:click={toggleAdvanced}
              class="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 cursor-pointer transition-colors duration-150 mt-1"
            >
              <span>{showAdvanced ? $_('nav.hideAdvanced') : $_('nav.showAdvanced')}</span>
              <svg
                class="w-3.5 h-3.5 transition-transform duration-200 {showAdvanced ? 'rotate-180' : ''}"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </li>

          {#if showAdvanced}
            {#each advancedMarketingLinks as link}
              <li>
                <a
                  href={link.href}
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer
                    {isActive(link.href)
                      ? 'bg-primary-50 text-primary-700 border-l-2 border-primary-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent'}"
                >
                  {@html icons[link.iconKey]}
                  <span>{$_(link.labelKey)}</span>
                </a>
              </li>
            {/each}
          {/if}
        </ul>
      </div>
```

- [ ] **Step 6: Verify sidebar renders correctly**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/components/layout/Sidebar.svelte
git commit -m "feat(web): unify sidebar Marketing section, remove project nav duplication (#30)"
```

---

## Task 6: Rewrite 5 core org-level Marketing pages

**Files:**
- Modify: `apps/web/src/routes/(app)/content/+page.svelte`
- Modify: `apps/web/src/routes/(app)/checklists/+page.svelte`
- Modify: `apps/web/src/routes/(app)/documents/+page.svelte`
- Modify: `apps/web/src/routes/(app)/campaigns/+page.svelte`
- Modify: `apps/web/src/routes/(app)/email/+page.svelte`

All five pages follow the same pattern. Key difference from old approach: **items link to project pages** (which have all CRUD modals), and "Create" navigates to the project page too.

- [ ] **Step 1: Rewrite `content/+page.svelte`**

Replace entire file:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, currentProjectStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';
  import { currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';

  let items: any[] = [];
  let loading = true;

  $: ctx = $contextStore;
  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;

  async function loadData() {
    if (!ctx.organizationId) return;
    loading = true;
    try {
      const params: Record<string, string> = ctx.type === 'project' && ctx.projectId
        ? { projectId: ctx.projectId }
        : { organizationId: ctx.organizationId };
      const res = await api.get<any[]>('/content', params);
      items = res;
    } catch (e) {
      console.error('Failed to load content:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  $: $contextStore, loadData();
</script>

<div class="p-4 sm:p-6">
  <!-- Breadcrumb -->
  <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-1">
    <span>{currentOrg?.name || $_('header.orgContext')}</span>
    {#if $currentProjectStore}
      <span class="text-gray-300">›</span>
      <span class="text-indigo-600 dark:text-indigo-400">{$currentProjectStore.name}</span>
    {/if}
    <span class="text-gray-300">›</span>
    <span class="text-gray-700 dark:text-gray-200">{$_('nav.orgContent')}</span>
  </div>

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgContent')}</h1>
    {#if $currentProjectStore}
      <a
        href="/projects/{$currentProjectStore.id}/content"
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        + {$_('common.create')}
      </a>
    {:else}
      <button
        disabled
        class="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
        title={$_('common.selectProjectToCreate')}
      >
        + {$_('common.create')}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p>{$_('common.noData')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <a
          href="/projects/{item.projectId}/content"
          class="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all cursor-pointer"
        >
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-gray-900 dark:text-white">{item.title}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">{item.type || ''}{item.status ? ' · ' + item.status : ''}</p>
            </div>
            {#if ctx.type === 'organization'}
              <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {item.projectName || $_('org.scopeProject')}
              </span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

**Note:** "Create" button and item links both navigate to `/projects/{id}/content` — the project page has the create modal and edit modals. This avoids duplicating CRUD logic.

- [ ] **Step 2: Rewrite `checklists/+page.svelte`**

Same pattern as content. Differences:
- API endpoint: `/checklists`
- Title key: `nav.orgChecklists`
- Item display: `item.name` (not `item.title`), `item.type`
- Item link: `/projects/{item.projectId}/checklists`
- Create link: `/projects/{$currentProjectStore.id}/checklists`

- [ ] **Step 3: Rewrite `documents/+page.svelte`**

Differences:
- API endpoint: `/documents`
- Title key: `nav.orgDocuments`
- Item display: `item.title`, `item.type`
- Item link: `/projects/{item.projectId}/documents`
- Create link: `/projects/{$currentProjectStore.id}/documents`

- [ ] **Step 4: Rewrite `campaigns/+page.svelte`**

Differences:
- API endpoint: `/campaigns`
- Title key: `nav.orgCampaigns`
- Item display: `item.name`, `item.type · item.status`
- Item link: `/projects/{item.projectId}/campaigns`
- Create link: `/projects/{$currentProjectStore.id}/campaigns`

- [ ] **Step 5: Rewrite `email/+page.svelte`**

Differences:
- API endpoint: `/email/lists`
- Title key: `nav.orgEmail`
- Item display: `item.name`, subscriber count (`{item._count?.subscribers ?? item.subscriberCount ?? 0} subscribers`)
- Item link: `/projects/{item.projectId}/email`
- Create link: `/projects/{$currentProjectStore.id}/email`

- [ ] **Step 6: Verify all pages compile**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/'(app)'/content/+page.svelte apps/web/src/routes/'(app)'/checklists/+page.svelte apps/web/src/routes/'(app)'/documents/+page.svelte apps/web/src/routes/'(app)'/campaigns/+page.svelte apps/web/src/routes/'(app)'/email/+page.svelte
git commit -m "feat(web): rewrite 5 marketing pages with contextStore, clickable items, breadcrumb (#30)"
```

---

## Task 7: Rewrite 6 advanced org-level Marketing pages

**Files:**
- Modify: `apps/web/src/routes/(app)/analytics/+page.svelte`
- Modify: `apps/web/src/routes/(app)/seo/+page.svelte`
- Modify: `apps/web/src/routes/(app)/competitors/+page.svelte`
- Modify: `apps/web/src/routes/(app)/experiments/+page.svelte`
- Modify: `apps/web/src/routes/(app)/sequences/+page.svelte`
- Modify: `apps/web/src/routes/(app)/calendar/+page.svelte`

- [ ] **Step 1: Read each page first to understand its current structure**

Before rewriting, read each page. They may have different item fields than the 5 core pages. Preserve the existing item display fields.

- [ ] **Step 2: Apply the same pattern from Task 6 to all 6 pages**

Each page gets:
- Import `contextStore`, `currentProjectStore`, `organizationIdStore`, `currentUser`
- `$contextStore` for data loading (projectId or organizationId)
- Breadcrumb (Org › Project › Section)
- Create button (disabled in org context, links to project page when project selected)
- Clickable list items linking to project page
- Remove tabs

Details per page:

| Page | API | Title key | Item title field | Link pattern |
|------|-----|-----------|-----------------|--------------|
| analytics | `/analytics` | `nav.orgAnalytics` | (read current page) | `/projects/{item.projectId}/analytics` |
| seo | `/seo` | `nav.orgSeo` | (read current page) | `/projects/{item.projectId}/seo` |
| competitors | `/competitors` | `nav.orgCompetitors` | (read current page) | `/projects/{item.projectId}/competitors` |
| experiments | `/experiments` | `nav.orgExperiments` | (read current page) | `/projects/{item.projectId}/experiments` |
| sequences | `/sequences` | `nav.orgSequences` | (read current page) | `/projects/{item.projectId}/sequences` |
| calendar | `/calendar` | `nav.orgCalendar` | (read current page) | `/projects/{item.projectId}/calendar` |

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/'(app)'/analytics/+page.svelte apps/web/src/routes/'(app)'/seo/+page.svelte apps/web/src/routes/'(app)'/competitors/+page.svelte apps/web/src/routes/'(app)'/experiments/+page.svelte apps/web/src/routes/'(app)'/sequences/+page.svelte apps/web/src/routes/'(app)'/calendar/+page.svelte
git commit -m "feat(web): rewrite 6 advanced marketing pages with contextStore (#30)"
```

---

## Task 8: Project pages — set currentProjectStore on mount

**Files:**
- Modify: `apps/web/src/routes/(app)/projects/[id]/content/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/checklists/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/documents/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/campaigns/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/email/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/analytics/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/seo/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/competitors/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/experiments/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/sequences/+page.svelte`
- Modify: `apps/web/src/routes/(app)/projects/[id]/calendar/+page.svelte`

When a user navigates directly to `/projects/[id]/content` (from a link or bookmark), the picker should show that project as active.

- [ ] **Step 1: Add currentProjectStore sync to each project page**

In each project page's `<script>` section, add imports:

```ts
import { currentProjectStore, projectsStore } from '$lib/stores/projects';
```

And in the existing `onMount` (or add one if missing), after the project data loads, add:

```ts
  // Sync picker with current project
  const project = $projectsStore.find((p: any) => p.id === projectId);
  if (project) currentProjectStore.set(project);
```

For pages that already have `onMount` (like `content/+page.svelte`), add this at the beginning of the onMount callback. For pages without `onMount`, wrap the sync in a reactive block:

```ts
  $: if ($projectsStore.length > 0) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }
```

- [ ] **Step 2: Also update `projects/[id]/overview/+page.svelte`**

The overview page should also sync the picker. Add the same pattern.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/'(app)'/projects/
git commit -m "feat(web): sync currentProjectStore from project pages for picker (#30)"
```

---

## Task 9: Dashboard — Remove duplicate fetch, set picker on card click

**Files:**
- Modify: `apps/web/src/routes/(app)/dashboard/+page.svelte`

- [ ] **Step 1: Remove the duplicate projectsStore fetch**

Find the `onMount` that fetches projects:
```ts
const projects = await api.get<any[]>('/projects', { organizationId: orgId });
projectsStore.set(projects);
```

Replace with reading from the store (projects are already loaded by `+layout.svelte`):
```ts
// Projects already loaded by +layout.svelte
```

Use a reactive binding for the local `projects` variable:
```ts
$: projects = $projectsStore;
```

- [ ] **Step 2: Wire project card to set picker**

Find the project card link (around line 181):
```html
<a href="/projects/{project.id}/overview" ...>
```

Add an `on:click` handler to set the picker before navigating:

```svelte
<a
  href="/projects/{project.id}/overview"
  on:click={() => currentProjectStore.set(project)}
  ...>
```

Make sure `currentProjectStore` is imported at the top of the script.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx svelte-check --threshold error 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/'(app)'/dashboard/+page.svelte
git commit -m "refactor(web): use projectsStore from layout, set picker on card click (#30)"
```

---

## Task 10: Manual smoke test

- [ ] **Step 1: Start the app**

```bash
pnpm dev
```

Open http://localhost:5173 and log in with `demo@marketingai.app` / `demo123456`.

- [ ] **Step 2: Test picker switching**

1. Verify ProjectPicker appears in header showing "Organization" (gray pill)
2. Click picker → verify dropdown shows org name + project list
3. Select a project → verify pill turns indigo with project name
4. Navigate to Content → verify project data loads
5. Switch to Organization in picker → verify org data loads
6. Refresh page → verify sticky project persists (still showing same project)

- [ ] **Step 3: Test sidebar navigation**

1. Verify only one Marketing section (no project-scoped duplication)
2. With project selected → verify "Overview" link appears first in Marketing
3. Click Content, Checklists, etc. → verify pages load with correct context
4. Verify active state highlights correctly in sidebar
5. Click Overview → verify navigates to `/projects/{id}/overview`

- [ ] **Step 4: Test item click-through**

1. On `/content` with project selected → click an item → verify navigates to `/projects/{id}/content`
2. On `/content` with org selected → click an item → verify navigates to correct project page
3. On `/checklists` → click Create → verify navigates to `/projects/{id}/checklists`

- [ ] **Step 5: Test edge cases**

1. Switch organization → verify project clears to org context
2. On Overview (`/projects/X/overview`), switch picker to different project → verify URL updates to `/projects/Y/overview`
3. On Overview, switch to Organization → verify redirect to `/dashboard`
4. Create button disabled in org context → verify tooltip shows
5. From dashboard, click project card → verify picker updates + navigates to overview

- [ ] **Step 6: Test persistence**

1. Select project in picker → navigate to `/checklists` → close browser
2. Reopen → verify same project still selected
3. Navigate to `/projects/{id}/content` directly (paste URL) → verify picker updates

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): smoke test fixes for unified navigation (#30)"
```
