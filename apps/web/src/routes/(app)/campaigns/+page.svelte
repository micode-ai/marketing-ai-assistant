<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore } from '$lib/stores/projects';
  import { api } from '$lib/api/client';

  let activeTab: 'organization' | 'all' = 'organization';
  let items: any[] = [];
  let loading = true;

  $: orgId = $organizationIdStore;

  async function loadData() {
    if (!orgId) return;
    loading = true;
    try {
      const params: Record<string, string> = { organizationId: orgId };
      if (activeTab === 'all') params.aggregated = 'true';
      const res = await api.get<any[]>('/campaigns', params);
      items = res;
    } catch (e) {
      console.error('Failed to load campaigns:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  $: activeTab, orgId && loadData();
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgCampaigns')}</h1>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer
        {activeTab === 'organization' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
      on:click={() => activeTab = 'organization'}
    >
      {$_('org.tabOrganization')}
    </button>
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer
        {activeTab === 'all' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
      on:click={() => activeTab = 'all'}
    >
      {$_('org.tabAllProjects')}
    </button>
  </div>

  <!-- List -->
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
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-gray-900 dark:text-white">{item.name}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">{item.type || ''}{item.status ? ' · ' + item.status : ''}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full
              {item.scope === 'ORGANIZATION' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}">
              {item.scope === 'ORGANIZATION' ? $_('org.scopeOrg') : $_('org.scopeProject')}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
