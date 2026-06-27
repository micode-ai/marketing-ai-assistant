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
    open = false;
    const path = $page.url.pathname;
    // Navigate first, clear the store AFTER the project page unmounts. If we cleared the
    // store first, the project page's `$:` sync-reactive would fire (sees store=null,
    // projectId=X in URL) and re-set the store back to the project, defeating the switch.
    if (path.startsWith('/projects/')) {
      const match = path.match(/^\/projects\/[^/]+\/(.+)/);
      const section = match?.[1]?.split('/')[0];
      const target = section && orgSections.includes(section) ? `/${section}` : '/dashboard';
      goto(target).then(() => currentProjectStore.set(null));
    } else {
      currentProjectStore.set(null);
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
      {!loaded ? 'bg-surface-2 text-ink-subtle animate-pulse' :
       current
        ? 'bg-brand-subtle/15 text-brand-subtle-fg hover:bg-brand-subtle/25'
        : 'bg-surface-2 text-ink-muted hover:bg-surface-2'}"
    title={$_('header.switchContext')}
  >
    {#if !loaded}
      <div class="w-4 h-4 rounded-full border-2 border-border border-t-transparent animate-spin"></div>
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
    <div class="absolute left-0 top-full mt-1 w-64 bg-surface rounded-lg shadow-lg border border-border z-50 py-1 max-h-80 overflow-y-auto">
      <button
        on:click|stopPropagation={selectOrg}
        class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer
          {!current ? 'bg-surface-2 text-ink font-medium' : 'text-ink-muted hover:bg-surface-2'}"
      >
        <svg class="w-4 h-4 flex-shrink-0 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
        <span>{currentOrg?.name || $_('header.orgContext')}</span>
        {#if !current}
          <svg class="w-4 h-4 ml-auto text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        {/if}
      </button>

      <div class="border-t border-border my-1"></div>

      {#if projects.length === 0}
        <a
          href="/dashboard"
          class="block px-3 py-2 text-sm text-ink-subtle hover:text-brand transition-colors"
          on:click={() => open = false}
        >
          {$_('header.noProjects')}
        </a>
      {:else}
        {#each projects as project}
          <button
            on:click|stopPropagation={() => selectProject(project)}
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer
              {current?.id === project.id ? 'bg-brand-subtle/15 text-brand-subtle-fg font-medium' : 'text-ink-muted hover:bg-surface-2'}"
          >
            <svg class="w-4 h-4 flex-shrink-0 {current?.id === project.id ? 'text-brand' : 'text-ink-subtle'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
            <span class="truncate">{project.name}</span>
            {#if current?.id === project.id}
              <svg class="w-4 h-4 ml-auto text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
