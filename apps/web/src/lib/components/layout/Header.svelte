<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { authStore, currentUser } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { setLocale } from '$lib/i18n';
  import { locale } from 'svelte-i18n';

  export let sidebarOpen: boolean;

  function logout() {
    authStore.logout();
    goto('/login');
  }

  const locales = [
    { code: 'en', label: 'EN' },
    { code: 'pl', label: 'PL' },
    { code: 'ru', label: 'RU' },
  ];
</script>

<header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
  <button
    on:click={() => sidebarOpen = !sidebarOpen}
    class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
    title="Toggle sidebar"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>

  <div class="flex items-center gap-3">
    <!-- Language switcher -->
    <div class="flex items-center bg-gray-100 rounded-lg p-0.5">
      {#each locales as loc}
        <button
          on:click={() => setLocale(loc.code)}
          class="px-2.5 py-1 text-xs rounded-md font-medium transition-all {$locale?.startsWith(loc.code) ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
        >
          {loc.label}
        </button>
      {/each}
    </div>

    <!-- User -->
    {#if $currentUser}
      <div class="flex items-center gap-2 pl-2 border-l border-gray-200">
        <div class="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-semibold text-xs">
          {$currentUser.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <span class="text-sm text-gray-700 hidden sm:block max-w-32 truncate">{$currentUser.name}</span>
        <button on:click={logout} class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition" title={$_('auth.logout')}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    {/if}
  </div>
</header>
