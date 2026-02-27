<script lang="ts">
  import { isAuthenticated, authStore, currentUser } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Header from '$lib/components/layout/Header.svelte';

  let sidebarOpen = true;
  let appReady = false;

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
    appReady = true;
  });
</script>

{#if appReady}
  <div class="flex h-screen bg-gray-50 overflow-hidden">
    <Sidebar bind:open={sidebarOpen} />
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Header bind:sidebarOpen />
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
