<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '$lib/api/client';

  export let projectId: string;

  type PeriodOption = 7 | 28 | 90;

  interface GSCSummaryMetric {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }

  interface GSCSummary {
    totals: GSCSummaryMetric;
    byDate: Array<{ date: string } & GSCSummaryMetric>;
    topQueries: Array<{ query: string } & GSCSummaryMetric>;
    topPages: Array<{ page: string } & GSCSummaryMetric>;
    byDevice: Array<{ device: string; clicks: number; impressions: number }>;
    byCountry: Array<{ country: string; clicks: number; impressions: number }>;
  }

  let integration: any = null;
  let summary: GSCSummary | null = null;
  let integrationLoading = true;
  let dataLoading = false;
  let error: string | null = null;
  let period: PeriodOption = 28;

  // Chart instances
  let ChartJS: any = null;
  let sparklineCanvases: HTMLCanvasElement[] = [];
  let sparklineCharts: any[] = [];
  let deviceCanvas: HTMLCanvasElement;
  let deviceChart: any = null;

  // Sortable tables
  type SortKey = 'clicks' | 'impressions' | 'ctr' | 'position';
  let querySort: SortKey = 'clicks';
  let querySortDir: 'asc' | 'desc' = 'desc';
  let pageSort: SortKey = 'clicks';
  let pageSortDir: 'asc' | 'desc' = 'desc';

  const PERIOD_OPTIONS: PeriodOption[] = [7, 28, 90];

  const DEVICE_COLORS: Record<string, string> = {
    MOBILE: '#3B82F6',
    DESKTOP: '#10B981',
    TABLET: '#F59E0B',
  };

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await loadIntegration();
  });

  onDestroy(() => {
    destroyCharts();
  });

  function destroyCharts() {
    sparklineCharts.forEach(c => c?.destroy());
    sparklineCharts = [];
    deviceChart?.destroy();
    deviceChart = null;
  }

  async function loadIntegration() {
    integrationLoading = true;
    try {
      integration = await api.get('/google/integration', { projectId });
    } catch {
      integration = null;
    } finally {
      integrationLoading = false;
    }

    if (integration?.accessToken && integration?.siteUrl) {
      await loadSummary();
    }
  }

  async function loadSummary() {
    dataLoading = true;
    error = null;
    destroyCharts();
    try {
      summary = await api.get<GSCSummary>('/google/search-console/summary', {
        projectId,
        days: period,
      });
      await tick();
      renderCharts();
    } catch (e: any) {
      if (e?.response?.data?.code === 'GSC_NOT_CONFIGURED' || e?.body?.code === 'GSC_NOT_CONFIGURED') {
        // show not-connected state
        integration = null;
      } else {
        error = $_('seo.searchConsolePanel.loadError');
      }
    } finally {
      dataLoading = false;
    }
  }

  function renderCharts() {
    if (!ChartJS || !summary) return;

    const dates = summary.byDate.map(d => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });

    // Sparklines for each metric card
    const sparklineMetrics = [
      { key: 'clicks', color: '#3B82F6' },
      { key: 'impressions', color: '#8B5CF6' },
      { key: 'ctr', color: '#10B981' },
      { key: 'position', color: '#F59E0B' },
    ] as const;

    sparklineCanvases.forEach((canvas, i) => {
      if (!canvas) return;
      const { key, color } = sparklineMetrics[i];
      const data = summary!.byDate.map(d => (d as any)[key]);
      sparklineCharts[i]?.destroy();
      sparklineCharts[i] = new ChartJS(canvas, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{ data, borderColor: color, backgroundColor: color + '22', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { display: false },
            y: {
              display: false,
              reverse: key === 'position',
            },
          },
        },
      });
    });

    // Device chart
    if (deviceCanvas && summary.byDevice.length > 0) {
      deviceChart?.destroy();
      const labels = summary.byDevice.map(d => d.device);
      const data = summary.byDevice.map(d => d.clicks);
      const colors = labels.map(l => DEVICE_COLORS[l] || '#94A3B8');

      deviceChart = new ChartJS(deviceCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
          },
        },
      });
    }
  }

  async function changePeriod(p: PeriodOption) {
    period = p;
    await loadSummary();
  }

  function toggleQuerySort(key: SortKey) {
    if (querySort === key) querySortDir = querySortDir === 'asc' ? 'desc' : 'asc';
    else { querySort = key; querySortDir = 'desc'; }
  }

  function togglePageSort(key: SortKey) {
    if (pageSort === key) pageSortDir = pageSortDir === 'asc' ? 'desc' : 'asc';
    else { pageSort = key; pageSortDir = 'desc'; }
  }

  $: sortedQueries = summary
    ? [...summary.topQueries].sort((a, b) => {
        const v = (a[querySort] ?? 0) - (b[querySort] ?? 0);
        return querySortDir === 'asc' ? v : -v;
      })
    : [];

  $: sortedPages = summary
    ? [...summary.topPages].sort((a, b) => {
        const v = (a[pageSort] ?? 0) - (b[pageSort] ?? 0);
        return pageSortDir === 'asc' ? v : -v;
      })
    : [];

  function formatCtr(v: number) {
    return (v * 100).toFixed(2) + '%';
  }

  function formatPosition(v: number) {
    return v.toFixed(1);
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function getPath(url: string): string {
    try {
      return new URL(url).pathname || url;
    } catch {
      return url;
    }
  }

  function getCountryName(code: string): string {
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      return dn.of(code.toUpperCase()) || code;
    } catch {
      return code;
    }
  }

  function sortIcon(key: SortKey, currentKey: SortKey, dir: 'asc' | 'desc') {
    if (currentKey !== key) return '↕';
    return dir === 'asc' ? '↑' : '↓';
  }

  $: isConnected = !!(integration?.accessToken && integration?.siteUrl);
  $: settingsUrl = `/projects/${projectId}/settings`;
</script>

<div class="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
  <!-- Header -->
  <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
      </div>
      <div>
        <h2 class="text-sm font-semibold text-gray-900">{$_('seo.searchConsolePanel.title')}</h2>
        <p class="text-xs text-gray-500">{$_('seo.searchConsolePanel.description')}</p>
      </div>
    </div>

    {#if isConnected}
      <!-- Period selector -->
      <div class="flex bg-gray-100 rounded-lg p-0.5">
        {#each PERIOD_OPTIONS as p}
          <button
            on:click={() => changePeriod(p)}
            disabled={dataLoading}
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150
              {period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">
            {$_(`seo.searchConsolePanel.period${p}d`)}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Not connected state -->
  {#if integrationLoading}
    <div class="px-5 py-10 flex justify-center">
      <div class="animate-pulse flex flex-col items-center gap-3">
        <div class="w-16 h-16 bg-gray-200 rounded-2xl"></div>
        <div class="w-48 h-4 bg-gray-200 rounded"></div>
        <div class="w-64 h-3 bg-gray-200 rounded"></div>
      </div>
    </div>

  {:else if !isConnected}
    <div class="flex flex-col items-center justify-center py-10 px-5 text-center">
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

  {:else if error}
    <div class="flex flex-col items-center justify-center py-10 px-5 text-center">
      <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p class="text-sm text-gray-700 mb-3">{error}</p>
      <button
        on:click={loadSummary}
        class="px-4 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
        {$_('seo.searchConsolePanel.retry')}
      </button>
    </div>

  {:else if dataLoading}
    <!-- Skeleton loader -->
    <div class="p-5 space-y-6 animate-pulse">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="bg-gray-100 rounded-xl h-24"></div>
        {/each}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="bg-gray-100 rounded-xl h-56"></div>
        <div class="bg-gray-100 rounded-xl h-56"></div>
      </div>
    </div>

  {:else if summary}
    <div class="p-5 space-y-6">

      <!-- KPI Metric Cards with sparklines -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Clicks -->
        <div class="bg-white border border-gray-200 rounded-xl p-4 border-t-4 border-t-blue-400">
          <div class="text-xs text-gray-500 mb-1">{$_('seo.searchConsolePanel.totalClicks')}</div>
          <div class="text-2xl font-bold text-gray-900">{formatNumber(summary.totals.clicks)}</div>
          <div class="relative mt-2" style="height: 40px;">
            <canvas bind:this={sparklineCanvases[0]} style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <!-- Impressions -->
        <div class="bg-white border border-gray-200 rounded-xl p-4 border-t-4 border-t-purple-400">
          <div class="text-xs text-gray-500 mb-1">{$_('seo.searchConsolePanel.totalImpressions')}</div>
          <div class="text-2xl font-bold text-gray-900">{formatNumber(summary.totals.impressions)}</div>
          <div class="relative mt-2" style="height: 40px;">
            <canvas bind:this={sparklineCanvases[1]} style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <!-- CTR -->
        <div class="bg-white border border-gray-200 rounded-xl p-4 border-t-4 border-t-green-400">
          <div class="text-xs text-gray-500 mb-1">{$_('seo.searchConsolePanel.avgCtr')}</div>
          <div class="text-2xl font-bold text-gray-900">{formatCtr(summary.totals.ctr)}</div>
          <div class="relative mt-2" style="height: 40px;">
            <canvas bind:this={sparklineCanvases[2]} style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <!-- Position -->
        <div class="bg-white border border-gray-200 rounded-xl p-4 border-t-4 border-t-amber-400">
          <div class="text-xs text-gray-500 mb-1">{$_('seo.searchConsolePanel.avgPosition')}</div>
          <div class="text-2xl font-bold text-gray-900">{formatPosition(summary.totals.position)}</div>
          <div class="relative mt-2" style="height: 40px;">
            <canvas bind:this={sparklineCanvases[3]} style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Queries + Top Pages tables -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">

        <!-- Top Queries -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-3">{$_('seo.searchConsolePanel.topQueries')}</h3>
          {#if sortedQueries.length === 0}
            <div class="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl">{$_('seo.searchConsolePanel.loadError')}</div>
          {:else}
            <div class="rounded-xl border border-gray-200 overflow-x-auto">
              <table class="w-full text-sm min-w-[420px]">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{$_('seo.searchConsolePanel.query')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => toggleQuerySort('clicks')}>{$_('seo.searchConsolePanel.clicks')} {sortIcon('clicks', querySort, querySortDir)}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => toggleQuerySort('impressions')}>{$_('seo.searchConsolePanel.impressions')} {sortIcon('impressions', querySort, querySortDir)}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => toggleQuerySort('ctr')}>{$_('seo.searchConsolePanel.ctr')} {sortIcon('ctr', querySort, querySortDir)}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => toggleQuerySort('position')}>{$_('seo.searchConsolePanel.position')} {sortIcon('position', querySort, querySortDir)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sortedQueries as row}
                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                      <td class="px-3 py-2 text-gray-800 max-w-[160px] truncate" title={row.query}>{row.query}</td>
                      <td class="px-3 py-2 text-right text-gray-700 font-medium">{formatNumber(row.clicks)}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{formatNumber(row.impressions)}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{formatCtr(row.ctr)}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{formatPosition(row.position)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <!-- Top Pages -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-3">{$_('seo.searchConsolePanel.topPages')}</h3>
          {#if sortedPages.length === 0}
            <div class="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-xl">{$_('seo.searchConsolePanel.loadError')}</div>
          {:else}
            <div class="rounded-xl border border-gray-200 overflow-x-auto">
              <table class="w-full text-sm min-w-[420px]">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{$_('seo.searchConsolePanel.page')}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => togglePageSort('clicks')}>{$_('seo.searchConsolePanel.clicks')} {sortIcon('clicks', pageSort, pageSortDir)}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => togglePageSort('impressions')}>{$_('seo.searchConsolePanel.impressions')} {sortIcon('impressions', pageSort, pageSortDir)}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => togglePageSort('ctr')}>{$_('seo.searchConsolePanel.ctr')} {sortIcon('ctr', pageSort, pageSortDir)}</th>
                    <th class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none" on:click={() => togglePageSort('position')}>{$_('seo.searchConsolePanel.position')} {sortIcon('position', pageSort, pageSortDir)}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sortedPages as row}
                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                      <td class="px-3 py-2 max-w-[160px]">
                        <span class="text-gray-800 truncate block" title={row.page}>{getPath(row.page)}</span>
                      </td>
                      <td class="px-3 py-2 text-right text-gray-700 font-medium">{formatNumber(row.clicks)}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{formatNumber(row.impressions)}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{formatCtr(row.ctr)}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{formatPosition(row.position)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- Devices + Countries -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Devices donut -->
        <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">{$_('seo.searchConsolePanel.devices')}</h3>
          {#if summary.byDevice.length === 0}
            <div class="text-sm text-gray-400 py-6 text-center">{$_('seo.searchConsolePanel.loadError')}</div>
          {:else}
            <div class="relative mx-auto" style="height: 180px; max-width: 240px;">
              <canvas bind:this={deviceCanvas} style="width: 100%; height: 100%;"></canvas>
            </div>
          {/if}
        </div>

        <!-- Countries table -->
        <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">{$_('seo.searchConsolePanel.countries')}</h3>
          {#if summary.byCountry.length === 0}
            <div class="text-sm text-gray-400 py-6 text-center">{$_('seo.searchConsolePanel.loadError')}</div>
          {:else}
            <div class="space-y-1.5">
              {#each summary.byCountry as row}
                {@const maxClicks = summary.byCountry[0]?.clicks || 1}
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-600 w-28 flex-shrink-0">{getCountryName(row.country)}</span>
                  <div class="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      class="h-2 rounded-full bg-blue-400 transition-all duration-300"
                      style="width: {Math.max(2, (row.clicks / maxClicks) * 100)}%">
                    </div>
                  </div>
                  <span class="text-xs font-medium text-gray-700 w-12 text-right">{formatNumber(row.clicks)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

    </div>
  {/if}
</div>
