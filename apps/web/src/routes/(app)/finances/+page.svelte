<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { currentProjectStore } from '$lib/stores/projects';

  $: if ($currentProjectStore) {
    goto(`/projects/${$currentProjectStore.id}/finances`, { replaceState: true });
  }
</script>

<div class="p-4 sm:p-6">
  <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">{$_('finances.title')}</h1>

  {#if !$currentProjectStore}
    <div class="text-center py-16">
      <div class="mx-auto w-16 h-16 mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
        </svg>
      </div>
      <p class="text-gray-400 text-lg mb-2">{$_('finances.subtitle')}</p>
      <p class="text-gray-500">{$_('common.selectProjectToCreate')}</p>
    </div>
  {:else}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {/if}
</div>
