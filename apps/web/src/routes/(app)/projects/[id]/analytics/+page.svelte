<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '$lib/api/client';

  $: projectId = $page.params['id'];

  let loading = true;
  let chartsReady = false;
  let selectedPeriod = 30;
  let dailyData: any[] = [];
  let totals: { total: Record<string, number>; change: Record<string, number>; trend: Record<string, string> } | null = null;

  let ChartJS: any = null;
  let trafficCanvas: HTMLCanvasElement;
  let emailCanvas: HTMLCanvasElement;
  let socialCanvas: HTMLCanvasElement;
  let funnelCanvas: HTMLCanvasElement;

  let trafficChart: any = null;
  let emailChart: any = null;
  let socialChart: any = null;
  let funnelChart: any = null;

  onMount(async () => {
    // chart.js/auto registers ALL components — avoids missing scale/element issues
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;

    await fetchData();
  });

  onDestroy(() => {
    destroyCharts();
  });

  function destroyCharts() {
    trafficChart?.destroy();
    emailChart?.destroy();
    socialChart?.destroy();
    funnelChart?.destroy();
    trafficChart = null;
    emailChart = null;
    socialChart = null;
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
      // Wait for Svelte to render the {:else} block with canvas elements
      await tick();
      // Extra frame to ensure canvas elements are fully in DOM and sized
      requestAnimationFrame(() => {
        renderCharts();
        chartsReady = true;
      });
    }
  }

  function switchPeriod(period: number) {
    selectedPeriod = period;
    fetchData();
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

    // Destroy existing charts
    destroyCharts();

    // Traffic Overview (Line)
    if (trafficCanvas && trafficCanvas.getContext('2d')) {
      trafficChart = new ChartJS(trafficCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: $_('analytics.visitors'),
              data: dailyData.map((d: any) => d.metrics.visitors),
              borderColor: '#3B82F6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius,
            },
            {
              label: $_('analytics.leads'),
              data: dailyData.map((d: any) => d.metrics.leads),
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.3,
              yAxisID: 'y1',
              pointRadius,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
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

    // Email Performance (Bar)
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
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { beginAtZero: true },
          },
        },
      });
    }

    // Social Performance (Line)
    if (socialCanvas && socialCanvas.getContext('2d')) {
      socialChart = new ChartJS(socialCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: $_('analytics.socialReach'),
              data: dailyData.map((d: any) => d.metrics.socialReach),
              borderColor: '#F59E0B',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius,
            },
            {
              label: $_('analytics.socialEngagements'),
              data: dailyData.map((d: any) => d.metrics.socialEngagements),
              borderColor: '#EF4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              fill: true,
              tension: 0.3,
              yAxisID: 'y1',
              pointRadius,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { type: 'linear', position: 'left', beginAtZero: true },
            y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    // Conversion Funnel (Doughnut)
    if (funnelCanvas && totals) {
      funnelChart = new ChartJS(funnelCanvas, {
        type: 'doughnut',
        data: {
          labels: [$_('analytics.visitors'), $_('analytics.leads'), $_('analytics.conversions')],
          datasets: [{
            data: [totals.total.visitors, totals.total.leads, totals.total.conversions],
            backgroundColor: ['#3B82F6', '#10B981', '#8B5CF6'],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }
  }

  $: conversionRate = totals && totals.total.visitors > 0
    ? ((totals.total.conversions / totals.total.visitors) * 100).toFixed(1)
    : '0.0';

  $: kpiCards = [
    {
      labelKey: 'analytics.visitors',
      value: totals ? formatNumber(totals.total.visitors) : '—',
      change: totals?.change?.visitors ?? 0,
      trend: totals?.trend?.visitors ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>`,
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-t-blue-400',
    },
    {
      labelKey: 'analytics.leads',
      value: totals ? formatNumber(totals.total.leads) : '—',
      change: totals?.change?.leads ?? 0,
      trend: totals?.trend?.leads ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>`,
      color: 'bg-green-50 text-green-600',
      borderColor: 'border-t-green-400',
    },
    {
      labelKey: 'analytics.conversions',
      value: totals ? formatNumber(totals.total.conversions) : '—',
      change: totals?.change?.conversions ?? 0,
      trend: totals?.trend?.conversions ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
      color: 'bg-purple-50 text-purple-600',
      borderColor: 'border-t-purple-400',
    },
    {
      labelKey: 'analytics.conversionRate',
      value: totals ? conversionRate + '%' : '—',
      change: totals?.change?.conversions ?? 0,
      trend: totals?.trend?.conversions ?? 'stable',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>`,
      color: 'bg-orange-50 text-orange-600',
      borderColor: 'border-t-orange-400',
    },
  ];
</script>

<div class="p-6">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('analytics.title')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('analytics.subtitle')}</p>
    </div>
    <div class="flex bg-gray-100 rounded-lg p-0.5">
      {#each [7, 30, 90] as period}
        <button
          on:click={() => switchPeriod(period)}
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150
            {selectedPeriod === period ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
        >
          {$_('analytics.period' + period)}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="animate-pulse space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="bg-gray-200 rounded-xl h-28"></div>
        {/each}
      </div>
      <div class="bg-gray-200 rounded-xl h-80"></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-gray-200 rounded-xl h-64"></div>
        <div class="bg-gray-200 rounded-xl h-64"></div>
      </div>
    </div>
  {:else if dailyData.length === 0}
    <!-- Empty state -->
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
    <!-- KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {#each kpiCards as card}
        <div class="bg-white rounded-xl border border-gray-200 p-4 border-t-4 {card.borderColor}">
          <div class="flex items-center justify-between mb-3">
            <div class="w-9 h-9 {card.color} rounded-lg flex items-center justify-center flex-shrink-0">
              {@html card.icon}
            </div>
            {#if card.change !== 0}
              <span class="text-xs font-medium flex items-center gap-0.5
                {card.trend === 'up' ? 'text-green-600' : card.trend === 'down' ? 'text-red-500' : 'text-gray-400'}">
                {#if card.trend === 'up'}
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                {:else if card.trend === 'down'}
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" /></svg>
                {/if}
                {card.change > 0 ? '+' : ''}{card.change}%
              </span>
            {/if}
          </div>
          <div class="text-2xl font-bold text-gray-900">{card.value}</div>
          <div class="text-xs text-gray-500 mt-1">{$_(card.labelKey)}</div>
        </div>
      {/each}
    </div>

    <!-- Traffic Overview Chart -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('analytics.trafficOverview')}</h3>
      <div class="relative" style="height: 288px;">
        <canvas bind:this={trafficCanvas} style="width: 100%; height: 100%;"></canvas>
      </div>
    </div>

    <!-- Email + Social Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('analytics.emailPerformance')}</h3>
        <div class="relative" style="height: 256px;">
          <canvas bind:this={emailCanvas} style="width: 100%; height: 100%;"></canvas>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('analytics.socialPerformance')}</h3>
        <div class="relative" style="height: 256px;">
          <canvas bind:this={socialCanvas} style="width: 100%; height: 100%;"></canvas>
        </div>
      </div>
    </div>

    <!-- Conversion Funnel -->
    <div class="max-w-md mx-auto">
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-semibold text-gray-700 mb-4 text-center">{$_('analytics.conversionFunnel')}</h3>
        <div class="relative" style="height: 256px;">
          <canvas bind:this={funnelCanvas} style="width: 100%; height: 100%;"></canvas>
        </div>
      </div>
    </div>
  {/if}
</div>
