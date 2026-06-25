<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import MobileAnalyticsDashboard from '$lib/components/analytics/MobileAnalyticsDashboard.svelte';
  import SearchConsolePanel from '$lib/components/analytics/SearchConsolePanel.svelte';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  // Refetch when the URL project id changes. SvelteKit reuses this component
  // across /projects/A → /projects/B, so onMount does NOT fire again — without
  // this watcher the page keeps showing the previous project's data.
  let mounted = false;
  let prevProjectId: string | undefined = '';
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    reloadForProjectChange();
  }

  async function reloadForProjectChange() {
    // Reset cached per-tab + per-surface state so everything refetches for the
    // newly selected project. The mobile dashboard refetches via its own watcher.
    utmData = [];
    funnelData = null;
    pagesData = [];
    dailyData = [];
    totals = null;
    webLoaded = false;
    surfacesLoaded = false;
    await detectSurfaces();
    if (activeSurface === 'web') await ensureWebData();
  }

  let loading = true;
  let chartsReady = false;
  let selectedPeriod = 30;
  let activeTab: 'overview' | 'utm' | 'funnel' | 'pages' = 'overview';
  let dailyData: any[] = [];
  let totals: { total: Record<string, number>; change: Record<string, number>; trend: Record<string, string> } | null = null;

  // UTM data
  let utmData: any[] = [];
  let utmLoading = false;

  // Funnel data
  let funnelData: any = null;
  let funnelLoading = false;

  // Page analytics data
  let pagesData: any[] = [];
  let pagesLoading = false;

  let ChartJS: any = null;
  let trafficCanvas: HTMLCanvasElement;
  let emailCanvas: HTMLCanvasElement;
  let funnelCanvas: HTMLCanvasElement;

  let trafficChart: any = null;
  let emailChart: any = null;
  let funnelChart: any = null;

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;

    await detectSurfaces();
    if (activeSurface === 'web') await ensureWebData();

    prevProjectId = projectId;
    mounted = true;
  });

  onDestroy(() => {
    destroyCharts();
  });

  function destroyCharts() {
    trafficChart?.destroy();
    emailChart?.destroy();
    funnelChart?.destroy();
    trafficChart = null;
    emailChart = null;
    funnelChart = null;
  }

  async function fetchData() {
    if (!projectId) return;
    loading = true;
    chartsReady = false;
    try {
      const [metrics, tots] = await Promise.all([
        api.get<any[]>('/analytics/metrics', { projectId, days: selectedPeriod }),
        api.get<any>('/analytics/metrics/totals', { projectId, days: selectedPeriod }),
      ]);
      dailyData = metrics;
      totals = tots;
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      loading = false;
    }

    if (dailyData.length > 0 && ChartJS) {
      await tick();
      requestAnimationFrame(() => {
        renderCharts();
        chartsReady = true;
      });
    }
  }

  async function fetchUtmData() {
    if (!projectId) return;
    utmLoading = true;
    try {
      utmData = await api.get<any[]>('/analytics/utm-breakdown', { projectId, days: selectedPeriod });
    } catch { utmData = []; }
    finally { utmLoading = false; }
  }

  async function fetchFunnelData() {
    if (!projectId) return;
    funnelLoading = true;
    try {
      funnelData = await api.get<any>('/analytics/funnel', { projectId, days: selectedPeriod });
    } catch { funnelData = null; }
    finally { funnelLoading = false; }
  }

  async function fetchPagesData() {
    if (!projectId) return;
    pagesLoading = true;
    try {
      pagesData = await api.get<any[]>('/analytics/pages', { projectId, days: selectedPeriod });
    } catch { pagesData = []; }
    finally { pagesLoading = false; }
  }

  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
    if (tab === 'utm' && utmData.length === 0) fetchUtmData();
    if (tab === 'funnel' && !funnelData) fetchFunnelData();
    if (tab === 'pages' && pagesData.length === 0) fetchPagesData();
  }

  function switchPeriod(period: number) {
    selectedPeriod = period;
    fetchData();
    if (activeTab === 'utm') fetchUtmData();
    if (activeTab === 'funnel') fetchFunnelData();
    if (activeTab === 'pages') fetchPagesData();
  }

  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderCharts() {
    const labels = dailyData.map(d => formatDate(d.date));
    const pointRadius = selectedPeriod <= 30 ? 2 : 0;
    destroyCharts();

    if (trafficCanvas && trafficCanvas.getContext('2d')) {
      trafficChart = new ChartJS(trafficCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: $_('analytics.visitors'), data: dailyData.map((d: any) => d.metrics.visitors),
              borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3, pointRadius,
            },
            {
              label: $_('analytics.leads'), data: dailyData.map((d: any) => d.metrics.leads),
              borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3, yAxisID: 'y1', pointRadius,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
            y: { type: 'linear', position: 'left', beginAtZero: true },
            y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    if (emailCanvas && emailCanvas.getContext('2d')) {
      emailChart = new ChartJS(emailCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: $_('analytics.emailsSent'), data: dailyData.map((d: any) => d.metrics.emailsSent), backgroundColor: '#6366F1' },
            { label: $_('analytics.emailOpens'), data: dailyData.map((d: any) => d.metrics.emailOpens), backgroundColor: '#8B5CF6' },
            { label: $_('analytics.emailClicks'), data: dailyData.map((d: any) => d.metrics.emailClicks), backgroundColor: '#A78BFA' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { beginAtZero: true } },
        },
      });
    }

    if (funnelCanvas && totals) {
      funnelChart = new ChartJS(funnelCanvas, {
        type: 'doughnut',
        data: {
          labels: [$_('analytics.visitors'), $_('analytics.leads'), $_('analytics.conversions')],
          datasets: [{
            data: [totals.total.visitors, totals.total.leads, totals.total.conversions],
            backgroundColor: ['#3B82F6', '#10B981', '#8B5CF6'], borderWidth: 0,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      });
    }
  }

  $: conversionRate = totals && totals.total.visitors > 0
    ? ((totals.total.conversions / totals.total.visitors) * 100).toFixed(1)
    : '0.0';

  $: kpiCards = [
    {
      labelKey: 'analytics.visitors', value: totals ? formatNumber(totals.total.visitors) : '—',
      change: totals?.change?.visitors ?? 0, trend: totals?.trend?.visitors ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>`,
      color: 'bg-blue-50 text-blue-600', borderColor: 'border-t-blue-400',
    },
    {
      labelKey: 'analytics.leads', value: totals ? formatNumber(totals.total.leads) : '—',
      change: totals?.change?.leads ?? 0, trend: totals?.trend?.leads ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>`,
      color: 'bg-green-50 text-green-600', borderColor: 'border-t-green-400',
    },
    {
      labelKey: 'analytics.conversions', value: totals ? formatNumber(totals.total.conversions) : '—',
      change: totals?.change?.conversions ?? 0, trend: totals?.trend?.conversions ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
      color: 'bg-purple-50 text-purple-600', borderColor: 'border-t-purple-400',
    },
    {
      labelKey: 'analytics.conversionRate', value: totals ? conversionRate + '%' : '—',
      change: totals?.change?.conversions ?? 0, trend: totals?.trend?.conversions ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>`,
      color: 'bg-orange-50 text-orange-600', borderColor: 'border-t-orange-400',
    },
  ];

  const tabs = [
    { id: 'overview' as const, labelKey: 'analytics.tabOverview' },
    { id: 'utm' as const, labelKey: 'analytics.tabUtm' },
    { id: 'funnel' as const, labelKey: 'analytics.tabFunnel' },
    { id: 'pages' as const, labelKey: 'analytics.tabPages' },
  ];

  $: projectType = $currentProjectStore?.projectType;

  // Which analytics surfaces are available for this project. Driven by which
  // integrations are actually connected — NOT by projectType — so a mobile
  // project that also has a website (GSC) shows both.
  let appConnected = false;
  let gscConnected = false;
  let surfacesLoaded = false;
  let activeSurface: 'web' | 'app' = 'web';
  let webLoaded = false;

  $: showApp = appConnected || projectType === 'MOBILE_APP';
  $: showWeb = gscConnected || projectType !== 'MOBILE_APP';
  $: showSurfaceTabs = showApp && showWeb;

  async function detectSurfaces() {
    const [play, gsc] = await Promise.allSettled([
      api.get<any>('/google-play/status', { projectId }),
      api.get<any>('/google/integration', { projectId }),
    ]);
    appConnected = play.status === 'fulfilled' && !!play.value?.connected;
    gscConnected =
      gsc.status === 'fulfilled' && !!(gsc.value?.accessToken && gsc.value?.siteUrl);
    surfacesLoaded = true;
    activeSurface = pickDefaultSurface();
  }

  function pickDefaultSurface(): 'web' | 'app' {
    // Recompute locally: called inside detectSurfaces() before Svelte flushes the reactive $: statements.
    const app = appConnected || projectType === 'MOBILE_APP';
    const web = gscConnected || projectType !== 'MOBILE_APP';
    if (projectType === 'MOBILE_APP' && app) return 'app';
    if (web) return 'web';
    return app ? 'app' : 'web';
  }

  async function ensureWebData() {
    if (webLoaded) return;
    webLoaded = true;
    await fetchData();
  }

  function switchSurface(s: 'web' | 'app') {
    activeSurface = s;
    if (s === 'web') ensureWebData();
  }
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="analytics" titleKey="hints.analytics.title" descKey="hints.analytics.desc" />

  {#if !surfacesLoaded}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 rounded-full border-2 border-gray-200 border-t-primary-600 animate-spin"></div>
    </div>
  {:else}
    {#if showSurfaceTabs}
      <div class="inline-flex bg-gray-100 rounded-lg p-0.5 mb-6">
        <button on:click={() => switchSurface('web')}
          class="px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
            {activeSurface === 'web' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
          {$_('analytics.surface.web')}
        </button>
        <button on:click={() => switchSurface('app')}
          class="px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer
            {activeSurface === 'app' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
          {$_('analytics.surface.app')}
        </button>
      </div>
    {/if}

    {#if activeSurface === 'app'}
      <!-- projectId is always defined here (route [id] segment); ?? '' only satisfies the type -->
      <MobileAnalyticsDashboard projectId={projectId ?? ''} days={selectedPeriod} />
    {:else}
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('analytics.title')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('analytics.subtitle')}</p>
    </div>
    <div class="flex bg-gray-100 rounded-lg p-0.5">
      {#each [7, 30, 90] as period}
        <button on:click={() => switchPeriod(period)}
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150
            {selectedPeriod === period ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
          {$_('analytics.period' + period)}
        </button>
      {/each}
    </div>
  </div>

  <!-- Google Search Console Performance Panel -->
  <SearchConsolePanel projectId={projectId ?? ''} />

  <!-- Tabs -->
  <div class="flex border-b border-gray-200 mb-6">
    {#each tabs as tab}
      <button on:click={() => switchTab(tab.id)}
        class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px cursor-pointer
          {activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
        {$_(tab.labelKey)}
      </button>
    {/each}
  </div>

  {#if loading && activeTab === 'overview'}
    <div class="animate-pulse space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}<div class="bg-gray-200 rounded-xl h-28"></div>{/each}
      </div>
      <div class="bg-gray-200 rounded-xl h-80"></div>
    </div>
  {:else if activeTab === 'overview'}
    {#if dailyData.length === 0}
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
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {#each kpiCards as card}
          <div class="bg-white rounded-xl border border-gray-200 p-4 border-t-4 {card.borderColor}">
            <div class="flex items-center justify-between mb-3">
              <div class="w-9 h-9 {card.color} rounded-lg flex items-center justify-center flex-shrink-0">{@html card.icon}</div>
              {#if card.change !== 0}
                <span class="text-xs font-medium flex items-center gap-0.5 {card.trend === 'up' ? 'text-green-600' : card.trend === 'down' ? 'text-red-500' : 'text-gray-400'}">
                  {#if card.trend === 'up'}<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                  {:else if card.trend === 'down'}<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" /></svg>{/if}
                  {card.change > 0 ? '+' : ''}{card.change}%
                </span>
              {/if}
            </div>
            <div class="text-2xl font-bold text-gray-900">{card.value}</div>
            <div class="text-xs text-gray-500 mt-1">{$_(card.labelKey)}</div>
          </div>
        {/each}
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('analytics.trafficOverview')}</h3>
        <div class="relative" style="height: 288px;"><canvas bind:this={trafficCanvas} style="width: 100%; height: 100%;"></canvas></div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('analytics.emailPerformance')}</h3>
        <div class="relative" style="height: 256px;"><canvas bind:this={emailCanvas} style="width: 100%; height: 100%;"></canvas></div>
      </div>

      <div class="max-w-md mx-auto">
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-4 text-center">{$_('analytics.conversionFunnel')}</h3>
          <div class="relative" style="height: 256px;"><canvas bind:this={funnelCanvas} style="width: 100%; height: 100%;"></canvas></div>
        </div>
      </div>
    {/if}

  {:else if activeTab === 'utm'}
    {#if utmLoading}
      <div class="animate-pulse space-y-3">{#each Array(5) as _}<div class="bg-gray-200 rounded-lg h-12"></div>{/each}</div>
    {:else if utmData.length === 0}
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('analytics.utmEmpty')}</h2>
        <p class="text-sm text-gray-500 max-w-sm">{$_('analytics.utmEmptyDesc')}</p>
      </div>
    {:else}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.utmSource')}</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.utmMedium')}</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.utmCampaign')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.visits')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.conversions')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.conversionRate')}</th>
            </tr>
          </thead>
          <tbody>
            {#each utmData as row}
              <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{row.source || '(direct)'}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{row.medium || '—'}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{row.campaign || '—'}</td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">{formatNumber(row.visits)}</td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(row.conversions)}</td>
                <td class="px-4 py-3 text-right">
                  <span class="text-sm font-medium {row.conversionRate > 5 ? 'text-green-600' : row.conversionRate > 2 ? 'text-amber-600' : 'text-gray-600'}">
                    {row.conversionRate?.toFixed(1)}%
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

  {:else if activeTab === 'funnel'}
    {#if funnelLoading}
      <div class="animate-pulse space-y-4">{#each Array(5) as _}<div class="bg-gray-200 rounded-lg h-16"></div>{/each}</div>
    {:else if !funnelData || !funnelData.steps || funnelData.steps.length === 0}
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('analytics.funnelEmpty')}</h2>
        <p class="text-sm text-gray-500 max-w-sm">{$_('analytics.funnelEmptyDesc')}</p>
      </div>
    {:else}
      <div class="max-w-2xl mx-auto space-y-3">
        {#each funnelData.steps as step, i}
          {@const maxCount = funnelData.steps[0]?.count || 1}
          {@const widthPct = Math.max(10, (step.count / maxCount) * 100)}
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 bg-primary-100 text-primary-700 rounded-full text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span class="text-sm font-medium text-gray-900">{step.name}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-gray-900">{formatNumber(step.count)}</span>
                {#if i > 0}
                  <span class="text-xs font-medium {step.dropOff > 50 ? 'text-red-500' : step.dropOff > 25 ? 'text-amber-500' : 'text-green-500'}">
                    -{step.dropOff?.toFixed(1)}%
                  </span>
                {/if}
              </div>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-3">
              <div class="h-3 rounded-full transition-all duration-500 {i === 0 ? 'bg-primary-500' : i === funnelData.steps.length - 1 ? 'bg-green-500' : 'bg-primary-400'}"
                style="width: {widthPct}%"></div>
            </div>
          </div>
        {/each}
        {#if funnelData.overallConversionRate !== undefined}
          <div class="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center mt-6">
            <p class="text-sm text-primary-700">{$_('analytics.overallConversion')}</p>
            <p class="text-3xl font-bold text-primary-800 mt-1">{funnelData.overallConversionRate?.toFixed(1)}%</p>
          </div>
        {/if}
      </div>
    {/if}

  {:else if activeTab === 'pages'}
    {#if pagesLoading}
      <div class="animate-pulse space-y-3">{#each Array(5) as _}<div class="bg-gray-200 rounded-lg h-12"></div>{/each}</div>
    {:else if pagesData.length === 0}
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('analytics.pagesEmpty')}</h2>
        <p class="text-sm text-gray-500 max-w-sm">{$_('analytics.pagesEmptyDesc')}</p>
      </div>
    {:else}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.pagePath')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.pageViews')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.uniqueVisitors')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.conversions')}</th>
              <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{$_('analytics.conversionRate')}</th>
            </tr>
          </thead>
          <tbody>
            {#each pagesData as pg}
              <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs truncate">{pg.path}</td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(pg.views)}</td>
                <td class="px-4 py-3 text-sm text-gray-600 text-right">{formatNumber(pg.uniqueVisitors)}</td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(pg.conversions)}</td>
                <td class="px-4 py-3 text-right">
                  <span class="text-sm font-medium {pg.conversionRate > 5 ? 'text-green-600' : pg.conversionRate > 2 ? 'text-amber-600' : 'text-gray-600'}">
                    {pg.conversionRate?.toFixed(1)}%
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {/if}
    {/if}
  {/if}
</div>
