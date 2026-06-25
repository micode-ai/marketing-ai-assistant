<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import GscOverview from '$lib/components/seo/GscOverview.svelte';
  import GscPerformanceTable from '$lib/components/seo/GscPerformanceTable.svelte';
  import GscFilters from '$lib/components/seo/GscFilters.svelte';
  import GscInsights from '$lib/components/seo/GscInsights.svelte';

  $: projectId = $page.params['id'];

  let days = 28;
  let compare = true;
  let searchType: 'web' | 'image' | 'video' | 'news' | 'discover' = 'web';
  let filters: Array<{ dimension: string; operator: string; expression: string }> = [];
  let brandTerm = '';

  let loading = true;
  let error: string | null = null;
  let notConnected = false;
  let totalsRow: any = null;
  let byDate: any[] = [];

  function filtersParam(): string | undefined {
    return filters.length ? JSON.stringify(filters) : undefined;
  }

  async function loadOverview() {
    loading = true;
    error = null;
    notConnected = false;
    try {
      const [totals, dated] = await Promise.all([
        api.get<{ rows: any[] }>('/google/search-console/query', {
          projectId,
          days,
          dimensions: '',
          type: searchType,
          compare: String(compare),
          filters: filtersParam(),
        }),
        api.get<{ rows: any[] }>('/google/search-console/query', {
          projectId,
          days,
          dimensions: 'date',
          type: searchType,
          rowLimit: days + 5,
          filters: filtersParam(),
        }),
      ]);
      totalsRow = totals.rows[0] ?? null;
      byDate = dated.rows;
    } catch (e: any) {
      if (
        e?.body?.code === 'GSC_NOT_CONFIGURED' ||
        e?.message?.includes('GSC_NOT_CONFIGURED')
      ) {
        notConnected = true;
      } else {
        error = $_('gscDetail.loadError');
      }
    } finally {
      loading = false;
    }
  }

  let mounted = false;
  let prevProjectId: string | undefined = '';
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    reload();
  }

  async function reload() {
    await loadOverview();
    // tables + insights reload added in later tasks
  }

  onMount(async () => {
    try {
      const project = await api.get<{ name?: string }>(`/projects/${projectId}`);
      brandTerm = (project?.name ?? '').toLowerCase();
    } catch {
      // best-effort; leave brandTerm as ''
    }
    await loadOverview();
    prevProjectId = projectId;
    mounted = true;
  });

  $: settingsUrl = `/projects/${projectId}/settings`;

  let activeTableDim: 'query' | 'page' = 'query';
</script>

<div class="p-6 max-w-7xl mx-auto">
  <!-- Page header -->
  <div class="mb-6">
    <h1 class="text-2xl font-semibold text-gray-900">{$_('gscDetail.title')}</h1>
    <p class="text-sm text-gray-500 mt-1">{$_('gscDetail.subtitle')}</p>
  </div>

  <!-- Filters bar -->
  <GscFilters
    bind:days
    bind:compare
    bind:searchType
    bind:filters
    bind:brandTerm
    on:apply={reload} />

  <!-- Not connected state -->
  {#if notConnected}
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="flex flex-col items-center justify-center py-14 px-5 text-center">
        <div class="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-gray-900 mb-1">{$_('seo.searchConsolePanel.notConnectedTitle')}</h3>
        <p class="text-sm text-gray-500 max-w-sm mb-4">{$_('seo.searchConsolePanel.notConnectedDescription')}</p>
        <a
          href={settingsUrl}
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {$_('seo.searchConsolePanel.notConnectedCta')}
        </a>
      </div>
    </div>

  <!-- Error state -->
  {:else if error}
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="flex flex-col items-center justify-center py-14 px-5 text-center">
        <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p class="text-sm text-gray-700 mb-3">{error}</p>
        <button
          on:click={reload}
          class="px-4 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
          {$_('seo.searchConsolePanel.retry')}
        </button>
      </div>
    </div>

  <!-- Loading skeleton -->
  {:else if loading}
    <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-6 animate-pulse">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="bg-gray-100 rounded-xl h-24"></div>
        {/each}
      </div>
      <div class="bg-gray-100 rounded-xl h-56"></div>
    </div>

  <!-- Overview content -->
  {:else}
    <GscOverview totals={totalsRow} {byDate} {compare} />

    <!-- Queries / Pages tab switch -->
    <div class="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mt-6 mb-3">
      <button
        on:click={() => (activeTableDim = 'query')}
        class="px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150
          {activeTableDim === 'query'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'}">
        {$_('gscDetail.tabQueries')}
      </button>
      <button
        on:click={() => (activeTableDim = 'page')}
        class="px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150
          {activeTableDim === 'page'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'}">
        {$_('gscDetail.tabPages')}
      </button>
    </div>

    <GscPerformanceTable
      projectId={projectId ?? ''}
      dimension={activeTableDim}
      {days}
      {searchType}
      {compare}
      {filters} />

    <!-- Insights section -->
    <div class="mt-10">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">{$_('gscDetail.insights')}</h2>
      <GscInsights
        projectId={projectId ?? ''}
        {days}
        {searchType}
        {filters} />
    </div>
  {/if}
</div>
