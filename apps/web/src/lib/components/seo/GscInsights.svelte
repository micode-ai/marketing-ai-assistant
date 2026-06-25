<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let projectId: string;
  export let days: number;
  export let searchType: string;
  export let filters: Array<{ dimension: string; operator: string; expression: string }>;

  interface InsightRow {
    key: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }

  interface LowCtrRow extends InsightRow {
    missedClicks: number;
  }

  interface CannibalPage {
    page: string;
    clicks: number;
    impressions: number;
    position: number;
  }

  interface CannibalRow {
    query: string;
    totalImpressions: number;
    pages: CannibalPage[];
  }

  interface MoverRow {
    key: string;
    clicks: number;
    impressions: number;
    position: number;
    deltaClicks: number;
    deltaPosition: number;
  }

  interface GscInsightsResult {
    strikingDistance: InsightRow[];
    lowCtr: LowCtrRow[];
    cannibalization: CannibalRow[];
    moversQueries: { gainers: MoverRow[]; losers: MoverRow[] };
    moversPages: { gainers: MoverRow[]; losers: MoverRow[] };
  }

  let data: GscInsightsResult | null = null;
  let loading = false;
  let error: string | null = null;

  // Race-condition guard: only the latest request token wins
  let reqToken = 0;

  let mounted = false;
  let lastSig = '';
  $: sig = JSON.stringify({ projectId, days, searchType, filters });

  $: if (mounted && sig !== lastSig) {
    lastSig = sig;
    fetchInsights();
  }

  onMount(async () => {
    lastSig = sig;
    await fetchInsights();
    mounted = true;
  });

  async function fetchInsights() {
    const token = ++reqToken;
    loading = true;
    error = null;
    try {
      const params: Record<string, string | number | undefined> = {
        projectId,
        days,
        type: searchType,
      };
      if (filters.length) {
        params.filters = JSON.stringify(filters);
      }
      const result = await api.get<GscInsightsResult>('/google/search-console/insights', params);
      if (token !== reqToken) return;
      data = result;
    } catch {
      if (token !== reqToken) return;
      error = $_('gscDetail.loadError');
    } finally {
      if (token === reqToken) loading = false;
    }
  }

  // --- Formatting helpers (mirrored from GscPerformanceTable) ---
  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function formatCtr(v: number): string {
    return (v * 100).toFixed(2) + '%';
  }

  function formatPosition(v: number): string {
    return v.toFixed(1);
  }

  function getPath(url: string): string {
    try {
      return new URL(url).pathname || url;
    } catch {
      return url;
    }
  }

  /** deltaPosition negative = improved (lower rank number = higher position) → green */
  function positionDeltaClass(delta: number): string {
    if (Math.abs(delta) < 0.0001) return 'text-gray-400';
    return delta < 0 ? 'text-green-600' : 'text-red-500';
  }

  function clicksDeltaClass(delta: number): string {
    if (Math.abs(delta) < 0.0001) return 'text-gray-400';
    return delta > 0 ? 'text-green-600' : 'text-red-500';
  }

  function fmtIntDelta(delta: number): string {
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${formatNumber(delta)}`;
  }

  function fmtPosDelta(delta: number): string {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}`;
  }
</script>

{#if loading}
  <div class="space-y-4 animate-pulse mt-6">
    {#each Array(4) as _}
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="h-4 bg-gray-100 rounded w-1/3 mb-2"></div>
        <div class="h-3 bg-gray-100 rounded w-2/3 mb-4"></div>
        {#each Array(3) as _}
          <div class="h-9 bg-gray-100 rounded mb-1.5"></div>
        {/each}
      </div>
    {/each}
  </div>

{:else if error}
  <div class="mt-6 bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-10 px-5 text-center">
    <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-3">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    </div>
    <p class="text-sm text-gray-700 mb-3">{error}</p>
    <button
      on:click={fetchInsights}
      class="px-4 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
      {$_('seo.searchConsolePanel.retry')}
    </button>
  </div>

{:else if data}
  <div class="mt-8 space-y-6">

    <!-- 1. Striking distance -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100">
        <h3 class="text-sm font-semibold text-gray-900">{$_('gscDetail.strikingDistance')}</h3>
        <p class="text-xs text-gray-500 mt-0.5">{$_('gscDetail.strikingDistanceDesc')}</p>
      </div>

      {#if data.strikingDistance.length === 0}
        <div class="text-sm text-gray-400 py-8 text-center">{$_('gscDetail.noData')}</div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[400px]">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                  {$_('seo.searchConsolePanel.query')}
                </th>
                <th class="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {$_('seo.searchConsolePanel.position')}
                </th>
                <th class="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {$_('seo.searchConsolePanel.impressions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {#each data.strikingDistance as row (row.key)}
                <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2.5 max-w-[300px]">
                    <span class="text-gray-800 truncate block" title={row.key}>{row.key}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right text-gray-600">{formatPosition(row.position)}</td>
                  <td class="px-4 py-2.5 text-right text-gray-600">{formatNumber(row.impressions)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- 2. Low CTR -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100">
        <h3 class="text-sm font-semibold text-gray-900">{$_('gscDetail.lowCtr')}</h3>
        <p class="text-xs text-gray-500 mt-0.5">{$_('gscDetail.lowCtrDesc')}</p>
      </div>

      {#if data.lowCtr.length === 0}
        <div class="text-sm text-gray-400 py-8 text-center">{$_('gscDetail.noData')}</div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[480px]">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                  {$_('seo.searchConsolePanel.query')}
                </th>
                <th class="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {$_('seo.searchConsolePanel.position')}
                </th>
                <th class="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {$_('seo.searchConsolePanel.ctr')}
                </th>
                <th class="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  {$_('gscDetail.missedClicks')}
                </th>
              </tr>
            </thead>
            <tbody>
              {#each data.lowCtr as row (row.key)}
                <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2.5 max-w-[280px]">
                    <span class="text-gray-800 truncate block" title={row.key}>{row.key}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right text-gray-600">{formatPosition(row.position)}</td>
                  <td class="px-4 py-2.5 text-right text-gray-600">{formatCtr(row.ctr)}</td>
                  <td class="px-4 py-2.5 text-right text-amber-600 font-medium">{formatNumber(row.missedClicks)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- 3. Cannibalization -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100">
        <h3 class="text-sm font-semibold text-gray-900">{$_('gscDetail.cannibalization')}</h3>
        <p class="text-xs text-gray-500 mt-0.5">{$_('gscDetail.cannibalizationDesc')}</p>
      </div>

      {#if data.cannibalization.length === 0}
        <div class="text-sm text-gray-400 py-8 text-center">{$_('gscDetail.noData')}</div>
      {:else}
        <div class="divide-y divide-gray-100">
          {#each data.cannibalization as item (item.query)}
            <div class="px-5 py-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-medium text-gray-800 truncate">{item.query}</span>
                <span class="text-xs text-gray-400 whitespace-nowrap">
                  {formatNumber(item.totalImpressions)} {$_('seo.searchConsolePanel.impressions').toLowerCase()}
                </span>
              </div>
              <div class="space-y-1 pl-3 border-l-2 border-gray-200">
                {#each item.pages as pg (pg.page)}
                  <div class="flex items-center justify-between gap-4 text-xs text-gray-600">
                    <span class="truncate text-blue-600" title={pg.page}>{getPath(pg.page)}</span>
                    <span class="whitespace-nowrap shrink-0">
                      pos {formatPosition(pg.position)}
                      &middot; {formatNumber(pg.clicks)} {$_('seo.searchConsolePanel.clicks').toLowerCase()}
                      &middot; {formatNumber(pg.impressions)} {$_('seo.searchConsolePanel.impressions').toLowerCase()}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- 4. Movers (gainers / losers from moversQueries) -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100">
        <h3 class="text-sm font-semibold text-gray-900">{$_('gscDetail.movers')}</h3>
        <p class="text-xs text-gray-500 mt-0.5">{$_('gscDetail.moversDesc')}</p>
      </div>

      {#if data.moversQueries.gainers.length === 0 && data.moversQueries.losers.length === 0}
        <div class="text-sm text-gray-400 py-8 text-center">{$_('gscDetail.noData')}</div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">

          <!-- Gainers -->
          <div>
            <div class="px-4 py-3 bg-green-50 border-b border-gray-100">
              <span class="text-xs font-semibold text-green-700 uppercase tracking-wide">{$_('gscDetail.gainers')}</span>
            </div>
            {#if data.moversQueries.gainers.length === 0}
              <div class="text-xs text-gray-400 py-6 text-center">{$_('gscDetail.noData')}</div>
            {:else}
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-2 font-semibold text-gray-500">{$_('seo.searchConsolePanel.query')}</th>
                    <th class="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{$_('seo.searchConsolePanel.clicks')}</th>
                    <th class="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{$_('seo.searchConsolePanel.position')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.moversQueries.gainers as row (row.key)}
                    <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-2 max-w-[160px]">
                        <span class="text-gray-800 truncate block" title={row.key}>{row.key}</span>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <span class="text-gray-700 font-medium">{formatNumber(row.clicks)}</span>
                        {#if row.deltaClicks !== 0}
                          <br /><span class="text-xs {clicksDeltaClass(row.deltaClicks)}">{fmtIntDelta(row.deltaClicks)}</span>
                        {/if}
                      </td>
                      <td class="px-3 py-2 text-right">
                        <span class="text-gray-600">{formatPosition(row.position)}</span>
                        {#if Math.abs(row.deltaPosition) >= 0.0001}
                          <br /><span class="text-xs {positionDeltaClass(row.deltaPosition)}">{fmtPosDelta(row.deltaPosition)}</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>

          <!-- Losers -->
          <div>
            <div class="px-4 py-3 bg-red-50 border-b border-gray-100">
              <span class="text-xs font-semibold text-red-700 uppercase tracking-wide">{$_('gscDetail.losers')}</span>
            </div>
            {#if data.moversQueries.losers.length === 0}
              <div class="text-xs text-gray-400 py-6 text-center">{$_('gscDetail.noData')}</div>
            {:else}
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-100">
                    <th class="text-left px-4 py-2 font-semibold text-gray-500">{$_('seo.searchConsolePanel.query')}</th>
                    <th class="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{$_('seo.searchConsolePanel.clicks')}</th>
                    <th class="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{$_('seo.searchConsolePanel.position')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.moversQueries.losers as row (row.key)}
                    <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-2 max-w-[160px]">
                        <span class="text-gray-800 truncate block" title={row.key}>{row.key}</span>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <span class="text-gray-700 font-medium">{formatNumber(row.clicks)}</span>
                        {#if row.deltaClicks !== 0}
                          <br /><span class="text-xs {clicksDeltaClass(row.deltaClicks)}">{fmtIntDelta(row.deltaClicks)}</span>
                        {/if}
                      </td>
                      <td class="px-3 py-2 text-right">
                        <span class="text-gray-600">{formatPosition(row.position)}</span>
                        {#if Math.abs(row.deltaPosition) >= 0.0001}
                          <br /><span class="text-xs {positionDeltaClass(row.deltaPosition)}">{fmtPosDelta(row.deltaPosition)}</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>

        </div>
      {/if}
    </div>

  </div>
{/if}
