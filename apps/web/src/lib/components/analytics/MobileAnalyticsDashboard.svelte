<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import type { AppStoreMetricsDto, GooglePlayMetricsTotals, GooglePlayStatusDto } from '@marketing-ai/shared-types';
  import MobileKpiCards from './MobileKpiCards.svelte';
  import InstallsChart from './InstallsChart.svelte';
  import StabilityChart from './StabilityChart.svelte';
  import RevenueChart from './RevenueChart.svelte';
  import StoreListingStats from './StoreListingStats.svelte';
  import ReviewsList from './ReviewsList.svelte';

  export let projectId: string;
  export let days: number = 30;

  let activeTab: 'overview' | 'installs' | 'storeListing' | 'stability' | 'revenue' | 'reviews' = 'overview';
  let loading = true;
  let metrics: AppStoreMetricsDto[] = [];
  let totals: GooglePlayMetricsTotals | null = null;
  let status: GooglePlayStatusDto | null = null;
  let selectedPeriod = days;

  const tabs = [
    { id: 'overview' as const, labelKey: 'googlePlay.tabs.overview' },
    { id: 'installs' as const, labelKey: 'googlePlay.tabs.installs' },
    { id: 'storeListing' as const, labelKey: 'googlePlay.tabs.storeListing' },
    { id: 'stability' as const, labelKey: 'googlePlay.tabs.stability' },
    { id: 'revenue' as const, labelKey: 'googlePlay.tabs.revenue' },
    { id: 'reviews' as const, labelKey: 'googlePlay.tabs.reviews' },
  ];

  onMount(async () => {
    await checkStatus();
    if (status?.connected) {
      await fetchData();
    } else {
      loading = false;
    }
  });

  async function checkStatus() {
    try {
      status = await api.get<GooglePlayStatusDto>('/google-play/status', { projectId });
    } catch (e) {
      console.error('Failed to check Google Play status:', e);
      status = { connected: false, authMethod: null, packageName: null, lastSyncAt: null, initialSyncCompleted: false, consecutiveFailures: 0, status: null };
    }
  }

  async function fetchData() {
    loading = true;
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - selectedPeriod * 86400000).toISOString().split('T')[0];

      const [metricsResult, totalsResult] = await Promise.all([
        api.get<AppStoreMetricsDto[]>('/google-play/metrics', { projectId, startDate, endDate }),
        api.get<GooglePlayMetricsTotals>('/google-play/metrics/totals', { projectId, days: selectedPeriod }),
      ]);
      metrics = metricsResult;
      totals = totalsResult;
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
  <!-- Header with period selector -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('googlePlay.title')}</h1>
      {#if status.packageName}
        <p class="text-sm text-gray-500 mt-1">{status.packageName}</p>
      {/if}
    </div>
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
    {#if metrics.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="w-20 h-20 bg-pink-50 rounded-2xl flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('analytics.empty')}</h2>
        <p class="text-gray-500 max-w-md">{$_('analytics.emptyDesc')}</p>
      </div>
    {:else}
      <MobileKpiCards {totals} />

      <div class="space-y-6">
        <InstallsChart {metrics} days={selectedPeriod} />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StoreListingStats {metrics} days={selectedPeriod} />
          <StabilityChart {metrics} days={selectedPeriod} />
        </div>

        <RevenueChart {metrics} days={selectedPeriod} />
      </div>
    {/if}

  {:else if activeTab === 'installs'}
    <MobileKpiCards {totals} />
    <InstallsChart {metrics} days={selectedPeriod} />

  {:else if activeTab === 'storeListing'}
    <StoreListingStats {metrics} days={selectedPeriod} />

  {:else if activeTab === 'stability'}
    <StabilityChart {metrics} days={selectedPeriod} />

  {:else if activeTab === 'revenue'}
    <RevenueChart {metrics} days={selectedPeriod} />

  {:else if activeTab === 'reviews'}
    <ReviewsList {projectId} />
  {/if}
{/if}
