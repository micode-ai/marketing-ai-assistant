<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api/client';
  import type { AppStoreMetricsDto, GooglePlayStatusDto } from '@marketing-ai/shared-types';
  import MobileKpiCards from './MobileKpiCards.svelte';
  import InstallsChart from './InstallsChart.svelte';
  import StabilityChart from './StabilityChart.svelte';
  import RevenueChart from './RevenueChart.svelte';
  import StoreListingStats from './StoreListingStats.svelte';
  import ReviewsList from './ReviewsList.svelte';

  export let projectId: string;
  export let days: number = 30;

  let activeTab: 'overview' | 'installs' | 'storeListing' | 'stability' | 'revenue' | 'reviews' = 'overview';
  let hasGcsBucket = false;
  let loading = true;
  let syncing = false;
  let metrics: AppStoreMetricsDto[] = [];
  let status: GooglePlayStatusDto | null = null;
  let selectedPeriod = days;
  let syncInterval: ReturnType<typeof setInterval> | null = null;
  let lastSyncLabel = '';
  let refreshKey = 0;

  const SYNC_STALE_MS = 10 * 60 * 1000; // 10 minutes
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  const allTabs = [
    { id: 'overview', labelKey: 'googlePlay.tabs.overview', needsBucket: false },
    { id: 'installs', labelKey: 'googlePlay.tabs.installs', needsBucket: true },
    { id: 'storeListing', labelKey: 'googlePlay.tabs.storeListing', needsBucket: true },
    { id: 'stability', labelKey: 'googlePlay.tabs.stability', needsBucket: false },
    { id: 'revenue', labelKey: 'googlePlay.tabs.revenue', needsBucket: true },
    { id: 'reviews', labelKey: 'googlePlay.tabs.reviews', needsBucket: false },
  ];
  $: tabs = allTabs.filter(t => !t.needsBucket || hasGcsBucket);

  async function init() {
    await checkStatus();
    if (status?.connected) {
      await syncIfStale();
      await fetchData();
      // Periodic sync while on page
      syncInterval = setInterval(async () => {
        await syncAndRefresh();
      }, SYNC_INTERVAL_MS);
    } else {
      loading = false;
    }
  }

  onMount(async () => {
    await init();
    prevProjectId = projectId;
    mounted = true;
  });

  // Re-initialise when the parent passes a different project (component is reused
  // across project switches), otherwise the dashboard keeps the old app's data.
  let mounted = false;
  let prevProjectId = '';
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    reinit();
  }

  async function reinit() {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    metrics = [];
    status = null;
    hasGcsBucket = false;
    activeTab = 'overview';
    loading = true;
    await init();
  }

  onDestroy(() => {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  });

  async function checkStatus() {
    try {
      status = await api.get<GooglePlayStatusDto>('/google-play/status', { projectId });
      hasGcsBucket = !!status?.gcsBucketUri;
      updateSyncLabel();
    } catch (e) {
      console.error('Failed to check Google Play status:', e);
      status = { connected: false, authMethod: null, packageName: null, lastSyncAt: null, initialSyncCompleted: false, consecutiveFailures: 0, status: null };
    }
  }

  function updateSyncLabel() {
    if (!status?.lastSyncAt) {
      lastSyncLabel = '';
      return;
    }
    const ago = Date.now() - new Date(status.lastSyncAt).getTime();
    if (ago < 60_000) lastSyncLabel = '< 1 min ago';
    else if (ago < 3600_000) lastSyncLabel = `${Math.round(ago / 60_000)} min ago`;
    else lastSyncLabel = `${Math.round(ago / 3600_000)}h ago`;
  }

  async function syncIfStale() {
    const lastSync = status?.lastSyncAt ? new Date(status.lastSyncAt).getTime() : 0;
    if (Date.now() - lastSync > SYNC_STALE_MS) {
      await triggerSync();
    }
  }

  async function triggerSync() {
    syncing = true;
    try {
      await api.post('/google-play/sync?projectId=' + projectId);
      await checkStatus();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      syncing = false;
    }
  }

  async function syncAndRefresh() {
    await triggerSync();
    await fetchData();
    refreshKey++;
  }

  async function fetchData() {
    loading = true;
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - selectedPeriod * 86400000).toISOString().split('T')[0];

      metrics = await api.get<AppStoreMetricsDto[]>('/google-play/metrics', { projectId, startDate, endDate });
    } catch (e) {
      console.error('Failed to load Google Play metrics:', e);
    } finally {
      loading = false;
    }
  }

  function switchPeriod(period: number) {
    selectedPeriod = period;
    fetchData();
  }

  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
  }
</script>

{#if !status?.connected}
  <!-- Not connected banner -->
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <div class="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mb-6">
      <svg class="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    </div>
    <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('googlePlay.notConnected.title')}</h2>
    <p class="text-gray-500 max-w-md mb-6">{$_('googlePlay.notConnected.description')}</p>
    <a
      href="/projects/{projectId}/settings"
      class="px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150"
    >
      {$_('googlePlay.notConnected.connectButton')}
    </a>
  </div>
{:else}
  <!-- Header with period selector + sync status -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-gray-900">{$_('googlePlay.title')}</h1>
        {#if syncing}
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {$_('googlePlay.connection.syncing')}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 mt-1">
        {#if status.packageName}
          <span class="text-sm text-gray-500">{status.packageName}</span>
        {/if}
        {#if lastSyncLabel}
          <span class="text-xs text-gray-400">· {$_('googlePlay.connection.lastSync', { values: { time: lastSyncLabel } })}</span>
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-3">
      <button
        on:click={syncAndRefresh}
        disabled={syncing}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
      >
        {#if syncing}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        {/if}
        {$_('googlePlay.connection.syncNow')}
      </button>
      <div class="flex bg-gray-100 rounded-lg p-0.5">
        {#each [7, 30, 90] as period}
          <button on:click={() => switchPeriod(period)}
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
              {selectedPeriod === period ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
            {$_('analytics.period' + period)}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex border-b border-gray-200 mb-6 overflow-x-auto">
    {#each tabs as tab}
      <button on:click={() => switchTab(tab.id)}
        class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px cursor-pointer whitespace-nowrap
          {activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
        {$_(tab.labelKey)}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="animate-pulse space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}<div class="bg-gray-200 rounded-xl h-28"></div>{/each}
      </div>
      <div class="bg-gray-200 rounded-xl h-80"></div>
    </div>
  {:else if activeTab === 'overview'}
    {#if hasGcsBucket}
      <MobileKpiCards totals={null} {metrics} />
      <div class="mt-6">
        <InstallsChart {metrics} days={selectedPeriod} />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <StoreListingStats {metrics} days={selectedPeriod} />
        <StabilityChart {metrics} days={selectedPeriod} />
      </div>
    {:else}
      <StabilityChart {metrics} days={selectedPeriod} />
    {/if}

    <div class="mt-6">
      {#key refreshKey}<ReviewsList {projectId} />{/key}
    </div>

  {:else if activeTab === 'installs'}
    <InstallsChart {metrics} days={selectedPeriod} />

  {:else if activeTab === 'storeListing'}
    <StoreListingStats {metrics} days={selectedPeriod} />

  {:else if activeTab === 'stability'}
    <StabilityChart {metrics} days={selectedPeriod} />

  {:else if activeTab === 'revenue'}
    <RevenueChart {metrics} days={selectedPeriod} />

  {:else if activeTab === 'reviews'}
    {#key refreshKey}<ReviewsList {projectId} />{/key}
  {/if}
{/if}
