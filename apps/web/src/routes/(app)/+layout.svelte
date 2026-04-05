<script lang="ts">
  import { isAuthenticated, authStore, currentUser } from '$lib/stores/auth';
  import { goto, afterNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore, projectsStore, currentProjectStore, projectsLoaded, _storedProjectId } from '$lib/stores/projects';
  import { page } from '$app/stores';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Header from '$lib/components/layout/Header.svelte';
  import InvitationsBanner from '$lib/components/layout/InvitationsBanner.svelte';
  import HelpDrawer from '$lib/components/HelpDrawer.svelte';

  let sidebarOpen = true;
  let appReady = false;
  let showHelpDrawer = false;

  const helpContextMap: [RegExp, string][] = [
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

  $: helpSlug = helpContextMap.find(([re]) => re.test($page.url.pathname))?.[1] || '01-getting-started';
  $: isHelpPage = $page.url.pathname.startsWith('/help');
  let innerWidth = 768;
  $: isMobile = innerWidth < 768;

  // Auto-close sidebar on navigation when mobile
  afterNavigate(() => {
    if (isMobile && sidebarOpen) {
      sidebarOpen = false;
    }
  });

  onMount(async () => {
    if (!$isAuthenticated) {
      goto('/login');
      return;
    }
    try {
      const user = await api.get<any>('/users/me');
      authStore.setUser(user);
      if (user.memberships?.length > 0) {
        const currentOrgId = $organizationIdStore;
        const validOrg = currentOrgId && user.memberships.some((m: any) => m.organization.id === currentOrgId);
        if (!validOrg) {
          organizationIdStore.set(user.memberships[0].organization.id);
        }
      }
    } catch {
      authStore.logout();
      goto('/login');
      return;
    }

      // Fetch projects for the validated org — needed by ProjectPicker and project restoration
      const orgId = $organizationIdStore;
      if (orgId) {
        try {
          const projects = await api.get<any[]>('/projects', { organizationId: orgId });
          projectsStore.set(projects);
          projectsLoaded.set(true);

          // Restore sticky project from localStorage — but only if on a project page
          // (if user navigated to an org-level section like /finances, don't restore)
          const currentPath = window.location.pathname;
          const isProjectPage = currentPath.startsWith('/projects/');
          if (_storedProjectId && !$currentProjectStore) {
            const savedProject = projects.find((p: any) => p.id === _storedProjectId);
            if (savedProject && isProjectPage) {
              currentProjectStore.set(savedProject);
            } else if (!isProjectPage) {
              // On org page — don't restore, clear the stored id
              currentProjectStore.set(null);
            } else {
              currentProjectStore.set(null);
            }
          }
        } catch {
          projectsStore.set([]);
          projectsLoaded.set(true);
        }
      }

    // Default sidebar closed on mobile
    if (window.innerWidth < 768) {
      sidebarOpen = false;
    }
    appReady = true;
  });
</script>

<svelte:window bind:innerWidth />

{#if appReady}
  <div class="flex h-screen bg-gray-50 overflow-hidden">
    <!-- Mobile backdrop overlay -->
    {#if isMobile && sidebarOpen}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="fixed inset-0 bg-black/50 z-30 transition-opacity duration-200"
        on:click={() => sidebarOpen = false}
      ></div>
    {/if}

    <Sidebar bind:open={sidebarOpen} {isMobile} />
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Header bind:sidebarOpen />
      <InvitationsBanner />
      <main class="flex-1 overflow-auto">
        <slot />
      </main>
    </div>

    <!-- Floating help button -->
    {#if !isHelpPage}
      <button
        on:click={() => showHelpDrawer = true}
        class="fixed bottom-6 right-6 z-40 w-10 h-10 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 hover:shadow-xl transition-all duration-200 flex items-center justify-center cursor-pointer"
        title="Help"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </button>
    {/if}

    <HelpDrawer bind:show={showHelpDrawer} slug={helpSlug} />
  </div>
{:else}
  <div class="flex items-center justify-center h-screen bg-gray-50">
    <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
  </div>
{/if}
