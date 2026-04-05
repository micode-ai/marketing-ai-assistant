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
    if ($page.url.pathname.startsWith('/projects/')) {
      // Extract the section from project URL (e.g. /projects/123/finances → /finances)
      const match = $page.url.pathname.match(/^\/projects\/[^/]+\/(.+)/);
      const section = match?.[1]?.split('/')[0];
      if (section && orgSections.includes(section)) {
        goto(`/${section}`);
      } else {
        goto('/dashboard');
      }
    }
  }

  const orgSections = ['content', 'checklists', 'documents', 'campaigns', 'email', 'analytics', 'finances', 'seo', 'competitors', 'experiments', 'sequences', 'calendar'];

  function selectProject(project: any) {
    const prevId = $currentProjectStore?.id;
    currentProjectStore.set(project);
    // Sync org store with the project's organization
    if (project.organizationId && project.organizationId !== $organizationIdStore) {
      organizationIdStore.set(project.organizationId);
    }
    open = false;
    const path = $page.url.pathname;
    if (path.startsWith('/projects/') && prevId !== project.id) {
      // Switch between projects
      const newPath = path.replace(/\/projects\/[^/]+/, `/projects/${project.id}`);
      goto(newPath);
    } else if (!path.startsWith('/projects/')) {
      // On org-level section page — redirect to project-level equivalent
      const section = path.split('/').filter(Boolean)[0];
      if (section && orgSections.includes(section)) {
        goto(`/projects/${project.id}/${section}`);
      }
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
