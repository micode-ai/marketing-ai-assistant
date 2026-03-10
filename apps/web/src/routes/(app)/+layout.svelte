<script lang="ts">
  import { isAuthenticated, authStore, currentUser } from '$lib/stores/auth';
  import { goto, afterNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Header from '$lib/components/layout/Header.svelte';
  import InvitationsBanner from '$lib/components/layout/InvitationsBanner.svelte';

  let sidebarOpen = true;
  let appReady = false;
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
        organizationIdStore.set(user.memberships[0].organization.id);
      }
    } catch {
      authStore.logout();
      goto('/login');
      return;
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
  </div>
{:else}
  <div class="flex items-center justify-center h-screen bg-gray-50">
    <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
  </div>
{/if}
