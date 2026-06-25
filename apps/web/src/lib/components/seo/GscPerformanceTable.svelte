<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let projectId: string;
  export let dimension: 'query' | 'page';
  export let days: number;
  export let searchType: string;
  export let compare: boolean;
  export let filters: Array<{ dimension: string; operator: string; expression: string }>;

  interface MergedRow {
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    prevClicks?: number;
    prevImpressions?: number;
    prevCtr?: number;
    prevPosition?: number;
  }

  interface DrillState {
    loading: boolean;
    rows: MergedRow[];
    error: string | null;
  }

  const ROW_LIMIT = 25;
  const DRILL_LIMIT = 10;

  let rows: MergedRow[] = [];
  let loading = false;
  let error: string | null = null;
  let currentPage = 0;
  let hasMore = false;

  type SortKey = 'value' | 'clicks' | 'impressions' | 'ctr' | 'position';
  let sortKey: SortKey = 'clicks';
  let sortDir: 'asc' | 'desc' = 'desc';

  let expanded: Record<string, DrillState> = {};

  // Race-condition guard: only the latest request token wins
  let reqToken = 0;

  let mounted = false;
  let lastSig = '';
  $: sig = JSON.stringify({ projectId, dimension, days, searchType, compare, filters });

  $: if (mounted && sig !== lastSig) {
    lastSig = sig;
    currentPage = 0;
    expanded = {};
    fetchRows();
  }

  onMount(async () => {
    lastSig = sig;
    await fetchRows();
    mounted = true;
  });

  async function fetchRows() {
    const token = ++reqToken;
    loading = true;
    error = null;
    try {
      const params: Record<string, string | number | undefined> = {
        projectId,
        dimensions: dimension,
        rowLimit: ROW_LIMIT,
        startRow: currentPage * ROW_LIMIT,
        compare: String(compare),
        type: searchType,
        days,
      };
      if (filters.length) {
        params.filters = JSON.stringify(filters);
      }
      const data = await api.get<{ rows: MergedRow[] }>('/google/search-console/query', params);
      if (token !== reqToken) return;
      rows = data.rows;
      hasMore = data.rows.length >= ROW_LIMIT;
    } catch {
      if (token !== reqToken) return;
      error = $_('gscDetail.loadError');
    } finally {
      if (token === reqToken) loading = false;
    }
  }

  async function goToPrevPage() {
    if (currentPage === 0 || loading) return;
    currentPage--;
    expanded = {};
    await fetchRows();
  }

  async function goToNextPage() {
    if (!hasMore || loading) return;
    currentPage++;
    expanded = {};
    await fetchRows();
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = key === 'position' ? 'asc' : 'desc';
    }
  }

  $: sortedRows = [...rows].sort((a, b) => {
    if (sortKey === 'value') {
      const av = a.keys[0] ?? '';
      const bv = b.keys[0] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    }
    const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
    const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function oppDim(dim: 'query' | 'page'): 'query' | 'page' {
    return dim === 'query' ? 'page' : 'query';
  }

  async function toggleDrillDown(rowKey: string) {
    if (expanded[rowKey]) {
      const { [rowKey]: _removed, ...rest } = expanded;
      expanded = rest;
      return;
    }
    expanded = { ...expanded, [rowKey]: { loading: true, rows: [], error: null } };
    try {
      const drillDim = oppDim(dimension);
      const drillFilters = [
        ...filters,
        { dimension, operator: 'equals', expression: rowKey },
      ];
      const data = await api.get<{ rows: MergedRow[] }>('/google/search-console/query', {
        projectId,
        dimensions: drillDim,
        rowLimit: DRILL_LIMIT,
        compare: 'false',
        type: searchType,
        days,
        filters: JSON.stringify(drillFilters),
      });
      expanded = { ...expanded, [rowKey]: { loading: false, rows: data.rows, error: null } };
    } catch {
      expanded = { ...expanded, [rowKey]: { loading: false, rows: [], error: $_('gscDetail.loadError') } };
    }
  }

  // ---- Formatting helpers (mirrored from SearchConsolePanel) ----
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

  function formatDimValue(key: string, dim: 'query' | 'page'): string {
    return dim === 'page' ? getPath(key) : key;
  }

  function sortIcon(key: SortKey): string {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  /** Returns Tailwind colour class for a delta. lowerIsBetter inverts green/red. */
  function deltaClass(delta: number, lowerIsBetter = false): string {
    if (Math.abs(delta) < 0.0001) return 'text-gray-400';
    const positive = lowerIsBetter ? delta < 0 : delta > 0;
    return positive ? 'text-green-600' : 'text-red-500';
  }

  function fmtIntDelta(delta: number): string {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${formatNumber(Math.abs(delta))}${delta < 0 ? '' : ''}`.replace(
      /^(\+|-)(\d)/,
      (_, s, d) => `${s}${d}`
    );
  }

  function fmtCtrDelta(delta: number): string {
    const pp = delta * 100;
    const sign = pp > 0 ? '+' : '';
    return `${sign}${pp.toFixed(2)}pp`;
  }

  function fmtPosDelta(delta: number): string {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}`;
  }
</script>

<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
  {#if loading}
    <!-- Skeleton loader -->
    <div class="p-5 space-y-2 animate-pulse">
      <div class="h-9 bg-gray-100 rounded-lg mb-3"></div>
      {#each Array(5) as _}
        <div class="h-11 bg-gray-100 rounded-lg"></div>
      {/each}
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
        on:click={fetchRows}
        class="px-4 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
        {$_('seo.searchConsolePanel.retry')}
      </button>
    </div>

  {:else if rows.length === 0}
    <div class="text-sm text-gray-400 py-10 text-center">{$_('gscDetail.noData')}</div>

  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm min-w-[520px]">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th
              class="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 select-none"
              on:click={() => toggleSort('value')}>
              {dimension === 'query'
                ? $_('seo.searchConsolePanel.query')
                : $_('seo.searchConsolePanel.page')}
              {sortIcon('value')}
            </th>
            <th
              class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none"
              on:click={() => toggleSort('clicks')}>
              {$_('seo.searchConsolePanel.clicks')} {sortIcon('clicks')}
            </th>
            <th
              class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none"
              on:click={() => toggleSort('impressions')}>
              {$_('seo.searchConsolePanel.impressions')} {sortIcon('impressions')}
            </th>
            <th
              class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none"
              on:click={() => toggleSort('ctr')}>
              {$_('seo.searchConsolePanel.ctr')} {sortIcon('ctr')}
            </th>
            <th
              class="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none"
              on:click={() => toggleSort('position')}>
              {$_('seo.searchConsolePanel.position')} {sortIcon('position')}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sortedRows as row (row.keys[0])}
            {@const rowKey = row.keys[0]}
            {@const isExpanded = !!expanded[rowKey]}
            <!-- Main row — click to drill down -->
            <tr
              class="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
              class:bg-blue-50={isExpanded}
              on:click={() => toggleDrillDown(rowKey)}>
              <td class="px-3 py-2 max-w-[200px]">
                <span class="text-gray-800 truncate block" title={rowKey}>
                  {formatDimValue(rowKey, dimension)}
                </span>
              </td>

              <!-- Clicks -->
              <td class="px-3 py-2 text-right">
                <span class="text-gray-700 font-medium">{formatNumber(row.clicks)}</span>
                {#if compare && row.prevClicks !== undefined}
                  {@const d = row.clicks - row.prevClicks}
                  <br /><span class="text-xs {deltaClass(d)}">{fmtIntDelta(d)}</span>
                {/if}
              </td>

              <!-- Impressions -->
              <td class="px-3 py-2 text-right">
                <span class="text-gray-600">{formatNumber(row.impressions)}</span>
                {#if compare && row.prevImpressions !== undefined}
                  {@const d = row.impressions - row.prevImpressions}
                  <br /><span class="text-xs {deltaClass(d)}">{fmtIntDelta(d)}</span>
                {/if}
              </td>

              <!-- CTR -->
              <td class="px-3 py-2 text-right">
                <span class="text-gray-600">{formatCtr(row.ctr)}</span>
                {#if compare && row.prevCtr !== undefined}
                  {@const d = row.ctr - row.prevCtr}
                  <br /><span class="text-xs {deltaClass(d)}">{fmtCtrDelta(d)}</span>
                {/if}
              </td>

              <!-- Position (lower = better) -->
              <td class="px-3 py-2 text-right">
                <span class="text-gray-600">{formatPosition(row.position)}</span>
                {#if compare && row.prevPosition !== undefined}
                  {@const d = row.position - row.prevPosition}
                  <br /><span class="text-xs {deltaClass(d, true)}">{fmtPosDelta(d)}</span>
                {/if}
              </td>
            </tr>

            <!-- Drill-down sub-row -->
            {#if isExpanded}
              {@const drill = expanded[rowKey]}
              <tr class="border-b border-gray-100">
                <td colspan="5" class="p-0 bg-blue-50">
                  <div class="px-6 py-3 border-l-4 border-blue-300">
                    <p class="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">
                      {oppDim(dimension) === 'query'
                        ? $_('seo.searchConsolePanel.query')
                        : $_('seo.searchConsolePanel.page')}
                      — top {DRILL_LIMIT}
                    </p>

                    {#if drill.loading}
                      <div class="space-y-1.5 animate-pulse">
                        {#each Array(3) as _}
                          <div class="h-7 bg-blue-100 rounded"></div>
                        {/each}
                      </div>

                    {:else if drill.error}
                      <p class="text-xs text-red-500">{drill.error}</p>

                    {:else if drill.rows.length === 0}
                      <p class="text-xs text-gray-400">{$_('gscDetail.noData')}</p>

                    {:else}
                      <table class="w-full text-xs min-w-[400px]">
                        <thead>
                          <tr class="border-b border-blue-200">
                            <th class="text-left py-1.5 pr-3 font-semibold text-gray-500">
                              {oppDim(dimension) === 'query'
                                ? $_('seo.searchConsolePanel.query')
                                : $_('seo.searchConsolePanel.page')}
                            </th>
                            <th class="text-right py-1.5 px-2 font-semibold text-gray-500 whitespace-nowrap">
                              {$_('seo.searchConsolePanel.clicks')}
                            </th>
                            <th class="text-right py-1.5 px-2 font-semibold text-gray-500 whitespace-nowrap">
                              {$_('seo.searchConsolePanel.impressions')}
                            </th>
                            <th class="text-right py-1.5 px-2 font-semibold text-gray-500 whitespace-nowrap">
                              {$_('seo.searchConsolePanel.ctr')}
                            </th>
                            <th class="text-right py-1.5 pl-2 font-semibold text-gray-500 whitespace-nowrap">
                              {$_('seo.searchConsolePanel.position')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each drill.rows as dr (dr.keys[0])}
                            <tr class="border-b border-blue-100 last:border-0">
                              <td class="py-1.5 pr-3 max-w-[180px]">
                                <span class="text-gray-700 truncate block" title={dr.keys[0]}>
                                  {formatDimValue(dr.keys[0], oppDim(dimension))}
                                </span>
                              </td>
                              <td class="py-1.5 px-2 text-right text-gray-700 font-medium">{formatNumber(dr.clicks)}</td>
                              <td class="py-1.5 px-2 text-right text-gray-600">{formatNumber(dr.impressions)}</td>
                              <td class="py-1.5 px-2 text-right text-gray-600">{formatCtr(dr.ctr)}</td>
                              <td class="py-1.5 pl-2 text-right text-gray-600">{formatPosition(dr.position)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <button
        on:click={goToPrevPage}
        disabled={currentPage === 0 || loading}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
          {currentPage === 0 || loading
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-600 hover:bg-gray-100'}">
        ← {$_('common.previous')}
      </button>

      <span class="text-xs text-gray-400">
        {currentPage + 1} / {hasMore ? '…' : currentPage + 1}
      </span>

      <button
        on:click={goToNextPage}
        disabled={!hasMore || loading}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
          {!hasMore || loading
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-600 hover:bg-gray-100'}">
        {$_('common.next')} →
      </button>
    </div>
  {/if}
</div>
