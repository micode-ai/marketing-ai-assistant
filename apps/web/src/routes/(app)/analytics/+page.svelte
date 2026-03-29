<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import { api } from '$lib/api/client';

  let activeTab: 'organization' | 'all' | 'compare' = 'organization';
  let loading = true;
  let summary: any = null;
  let projectBreakdown: any[] = [];

  // Compare tab state
  let selectedProjectIds: string[] = [];
  let comparePeriod = '30d';
  let compareData: any = null;
  let compareLoading = false;

  $: orgId = $organizationIdStore;
  $: projects = $projectsStore;

  async function loadData() {
    if (!orgId) return;
    loading = true;
    try {
      if (activeTab === 'organization' || activeTab === 'all') {
        const params: Record<string, string> = { organizationId: orgId };
        if (activeTab === 'all') params.aggregated = 'true';
        const res = await api.get<any>('/analytics/organization', params);
        summary = res;
        projectBreakdown = res?.projects || [];
      }
    } catch (e) {
      console.error('Failed to load analytics:', e);
      summary = null;
      projectBreakdown = [];
    } finally {
      loading = false;
    }
  }

  async function loadCompare() {
    if (selectedProjectIds.length < 2) return;
    compareLoading = true;
    try {
      const res = await api.get<any>('/analytics/organization/compare', {
        projectIds: selectedProjectIds.join(','),
        period: comparePeriod,
      });
      compareData = res;
    } catch (e) {
      console.error('Failed to load comparison:', e);
      compareData = null;
    } finally {
      compareLoading = false;
    }
  }

  function toggleProject(id: string) {
    if (selectedProjectIds.includes(id)) {
      selectedProjectIds = selectedProjectIds.filter((p) => p !== id);
    } else {
      selectedProjectIds = [...selectedProjectIds, id];
    }
  }

  $: activeTab, orgId && loadData();
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgAnalytics')}</h1>
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
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer
        {activeTab === 'compare' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
      on:click={() => activeTab = 'compare'}
    >
      {$_('org.tabCompare')}
    </button>
  </div>

  {#if activeTab === 'organization' || activeTab === 'all'}
    {#if loading}
      <div class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    {:else if !summary}
      <div class="text-center py-12 text-gray-500 dark:text-gray-400">
        <p>{$_('common.noData')}</p>
      </div>
    {:else}
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">{$_('org.analyticsContent')}</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalContent ?? 0}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">{$_('org.analyticsCampaigns')}</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalCampaigns ?? 0}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">{$_('org.analyticsSubscribers')}</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalSubscribers ?? 0}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">{$_('org.analyticsKeywords')}</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalKeywords ?? 0}</p>
        </div>
      </div>

      <!-- Project Breakdown (All Projects tab) -->
      {#if activeTab === 'all' && projectBreakdown.length > 0}
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{$_('org.projectBreakdown')}</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead class="text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th class="px-4 py-3">{$_('common.name')}</th>
                <th class="px-4 py-3">{$_('org.analyticsContent')}</th>
                <th class="px-4 py-3">{$_('org.analyticsCampaigns')}</th>
                <th class="px-4 py-3">{$_('org.analyticsSubscribers')}</th>
              </tr>
            </thead>
            <tbody>
              {#each projectBreakdown as proj}
                <tr class="border-b border-gray-100 dark:border-gray-700">
                  <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{proj.name}</td>
                  <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.contentCount ?? 0}</td>
                  <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.campaignCount ?? 0}</td>
                  <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.subscriberCount ?? 0}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}

  {:else if activeTab === 'compare'}
    <!-- Compare Tab -->
    <div class="mb-6">
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">{$_('org.compareSelectProjects')}</p>
      <div class="flex flex-wrap gap-2 mb-4">
        {#each projects as project}
          <button
            class="px-3 py-1.5 text-sm rounded-full border transition-colors cursor-pointer
              {selectedProjectIds.includes(project.id) ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}"
            on:click={() => toggleProject(project.id)}
          >
            {project.name}
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-3 mb-4">
        <select
          bind:value={comparePeriod}
          class="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
        </select>
        <button
          class="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer transition-colors"
          disabled={selectedProjectIds.length < 2 || compareLoading}
          on:click={loadCompare}
        >
          {$_('org.compareBtn')}
        </button>
      </div>
    </div>

    {#if compareLoading}
      <div class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    {:else if compareData?.projects}
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="px-4 py-3">{$_('common.name')}</th>
              <th class="px-4 py-3">{$_('org.analyticsContent')}</th>
              <th class="px-4 py-3">{$_('org.analyticsCampaigns')}</th>
              <th class="px-4 py-3">{$_('org.analyticsSubscribers')}</th>
              <th class="px-4 py-3">{$_('org.analyticsKeywords')}</th>
            </tr>
          </thead>
          <tbody>
            {#each compareData.projects as proj}
              <tr class="border-b border-gray-100 dark:border-gray-700">
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{proj.name}</td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.contentCount ?? 0}</td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.campaignCount ?? 0}</td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.subscriberCount ?? 0}</td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{proj.keywordCount ?? 0}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if selectedProjectIds.length < 2}
      <div class="text-center py-12 text-gray-500 dark:text-gray-400">
        <p>{$_('org.compareHint')}</p>
      </div>
    {/if}
  {/if}
</div>
