<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api } from '$lib/api/client';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  $: projectId = $page.params['id'];
  $: keywordId = $page.params['keywordId'];

  // Sync project picker
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  let keyword: any = null;
  let history: any[] = [];
  let loading = true;

  // Record position modal
  let showRecordModal = false;
  let recordRank: number | string = '';
  let recordUrl = '';
  let recordNotInTop100 = false;
  let recordSaving = false;

  // Date range state
  type Range = '7d' | '30d' | '90d' | 'custom';
  let selectedRange: Range = '30d';
  let customFrom = '';
  let customTo = '';

  // Chart state
  let canvas: HTMLCanvasElement;
  let chart: any = null;
  let ChartJS: any = null;

  // Edit / delete modals
  let showEditModal = false;
  let showDeleteModal = false;
  let deleting = false;
  let editForm: { targetRank: number | null; url: string; intent: string } = {
    targetRank: null,
    url: '',
    intent: 'INFORMATIONAL',
  };
  let saving = false;

  // Toast
  let toast: { message: string; type: 'success' | 'error' | 'warning' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' | 'warning' = 'error') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  // ---- Data fetching -------------------------------------------------------

  async function loadData() {
    loading = true;
    try {
      const [kw, hist] = await Promise.all([
        api.get<any>(`/seo/keywords/${keywordId}`),
        api.get<any[]>(`/seo/keywords/${keywordId}/history`, { days: 90 }),
      ]);
      keyword = kw;
      history = hist; // asc order from API
      editForm = {
        targetRank: kw.targetRank ?? null,
        url: kw.url ?? '',
        intent: kw.intent ?? 'INFORMATIONAL',
      };
    } catch (e: any) {
      showToast(e.message || $_('common.error'), 'error');
    } finally {
      loading = false;
    }
  }

  // ---- Filtered history for chart / table -----------------------------------

  function getFilteredHistory(): any[] {
    if (!history.length) return [];
    const now = Date.now();
    let cutoff: Date | null = null;

    if (selectedRange === '7d') {
      cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
    } else if (selectedRange === '30d') {
      cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
    } else if (selectedRange === '90d') {
      cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
    } else if (selectedRange === 'custom' && customFrom && customTo) {
      const from = new Date(customFrom);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      return history.filter((h) => {
        const d = new Date(h.date);
        return d >= from && d <= to;
      });
    } else {
      return history;
    }

    return history.filter((h) => new Date(h.date) >= cutoff!);
  }

  $: filteredHistory = getFilteredHistory();

  // Recalc when range or dates change
  $: { selectedRange; customFrom; customTo; filteredHistory = getFilteredHistory(); }

  // ---- Chart rendering ------------------------------------------------------

  function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function renderChart() {
    if (!ChartJS || !canvas) return;
    chart?.destroy();

    const data = filteredHistory;

    if (data.length === 0) {
      chart = null;
      return;
    }

    const maxRank = Math.max(...data.filter(h => h.rank != null).map(h => h.rank), keyword?.targetRank ?? 0, 1);
    const yMax = Math.min(maxRank + 5, 100);

    const datasets: any[] = [
      {
        label: keyword?.keyword ?? '',
        data: data.map(h => h.rank ?? null),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: data.length <= 30 ? 3 : 1,
        pointHoverRadius: 5,
        spanGaps: false,
      },
    ];

    // Target rank reference line
    if (keyword?.targetRank != null) {
      datasets.push({
        label: $_('seo.history.targetRankLine'),
        data: data.map(() => keyword.targetRank),
        borderColor: '#f59e0b',
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
      });
    }

    chart = new ChartJS(canvas, {
      type: 'line',
      data: {
        labels: data.map(h => formatDateLabel(h.date)),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: { position: 'top' as const },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                if (ctx.datasetIndex === 0) {
                  const rank = ctx.parsed.y;
                  return rank != null
                    ? `${$_('seo.currentRank')}: #${rank}`
                    : $_('seo.history.notRanked');
                }
                return `${$_('seo.history.targetRankLine')}: #${ctx.parsed.y}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          },
          y: {
            reverse: true,
            min: 1,
            max: yMax,
            title: {
              display: true,
              text: $_('seo.currentRank'),
              color: '#6b7280',
              font: { size: 11 },
            },
            ticks: {
              stepSize: 1,
              callback: (val: any) => `#${val}`,
            },
          },
        },
      },
    });
  }

  // Re-render chart when filtered data changes
  $: if (ChartJS && canvas && !loading) {
    tick().then(() => requestAnimationFrame(() => renderChart()));
  }

  // ---- Record position -------------------------------------------------------

  function openRecordModal() {
    recordRank = '';
    recordUrl = keyword?.url || '';
    recordNotInTop100 = false;
    showRecordModal = true;
  }

  function closeRecordModal() {
    showRecordModal = false;
    recordSaving = false;
  }

  async function saveRecordPosition() {
    recordSaving = true;
    try {
      const rank = recordNotInTop100 ? null : Number(recordRank);
      await api.post(`/seo/keywords/${keywordId}/rank`, {
        rank,
        url: recordUrl.trim() || undefined,
      });
      showToast($_('seo.recordPosition.recordSuccess'), 'success');
      closeRecordModal();
      await loadData();
    } catch (e: any) {
      showToast(e.message || $_('seo.recordPosition.recordFailed'), 'error');
    } finally {
      recordSaving = false;
    }
  }

  // ---- Edit / save ----------------------------------------------------------

  async function saveKeyword() {
    saving = true;
    try {
      const updated = await api.put<any>(`/seo/keywords/${keywordId}`, {
        targetRank: editForm.targetRank ?? undefined,
        url: editForm.url.trim() || undefined,
        intent: editForm.intent,
      });
      keyword = { ...keyword, ...updated };
      showEditModal = false;
      showToast($_('common.save'), 'success');
      await renderChart();
    } catch (e: any) {
      showToast(e.message || $_('common.error'), 'error');
    } finally {
      saving = false;
    }
  }

  // ---- Delete ---------------------------------------------------------------

  async function deleteKeyword() {
    deleting = true;
    try {
      await api.delete(`/seo/keywords/${keywordId}`);
      goto(`/projects/${projectId}/seo`);
    } catch (e: any) {
      showToast(e.message || $_('common.error'), 'error');
    } finally {
      deleting = false;
    }
  }

  // ---- Helpers --------------------------------------------------------------

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  function formatRelative(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const intentBadge: Record<string, string> = {
    INFORMATIONAL: 'bg-blue-500/20 text-blue-700',
    NAVIGATIONAL: 'bg-surface-2 text-ink',
    COMMERCIAL: 'bg-amber-500/20 text-amber-700',
    TRANSACTIONAL: 'bg-green-500/20 text-green-700',
  };

  const intentLabel: Record<string, string> = {
    INFORMATIONAL: 'seo.intentInformational',
    NAVIGATIONAL: 'seo.intentNavigational',
    COMMERCIAL: 'seo.intentCommercial',
    TRANSACTIONAL: 'seo.intentTransactional',
  };

  // ---- Lifecycle ------------------------------------------------------------

  onMount(async () => {
    await loadData();
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await tick();
    requestAnimationFrame(() => renderChart());
  });

  onDestroy(() => {
    chart?.destroy();
    chart = null;
    if (toastTimer) clearTimeout(toastTimer);
  });
</script>

<div class="p-4 sm:p-6 max-w-5xl mx-auto">

  <!-- Back link -->
  <a
    href="/projects/{projectId}/seo"
    class="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-5 transition-colors"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
    {$_('seo.title')}
  </a>

  {#if loading}
    <!-- Skeleton -->
    <div class="animate-pulse space-y-4">
      <div class="h-8 bg-surface-2 rounded w-1/3"></div>
      <div class="h-4 bg-surface-2 rounded w-1/4"></div>
      <div class="h-72 bg-surface-2 rounded-xl mt-6"></div>
    </div>

  {:else if keyword}
    <!-- Header block -->
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-bold text-ink break-words">{keyword.keyword}</h1>

        <!-- Badges row -->
        <div class="flex flex-wrap items-center gap-2 mt-2">
          {#if keyword.locale}
            <span class="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-ink-muted font-mono">{keyword.locale}</span>
          {/if}
          {#if keyword.intent}
            <span class="text-xs px-2 py-0.5 rounded-full font-medium {intentBadge[keyword.intent] || 'bg-surface-2 text-ink-muted'}">
              {$_(intentLabel[keyword.intent] || 'seo.intentInformational')}
            </span>
          {/if}
          {#if keyword.currentRank != null}
            <span class="text-xs px-2 py-0.5 rounded-full font-medium
              {keyword.currentRank <= 10 ? 'bg-green-500/20 text-green-700' : keyword.currentRank <= 30 ? 'bg-amber-500/20 text-amber-700' : 'bg-surface-2 text-ink-muted'}">
              #{keyword.currentRank}
            </span>
          {/if}
          {#if keyword.lastCheckedAt}
            <span class="text-xs text-ink-subtle">
              {$_('seo.history.lastCheckedAt', { values: { when: formatRelative(keyword.lastCheckedAt) } })}
            </span>
          {/if}
        </div>

        <!-- Target URL -->
        {#if keyword.url}
          <a
            href={keyword.url}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 mt-2 text-sm text-brand hover:text-primary-700 hover:underline break-all"
          >
            {keyword.url}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        {/if}
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Record position -->
        <button
          on:click={openRecordModal}
          class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
          {$_('seo.recordPosition.title')}
        </button>

        <!-- Edit -->
        <button
          on:click={() => { editForm = { targetRank: keyword.targetRank ?? null, url: keyword.url ?? '', intent: keyword.intent ?? 'INFORMATIONAL' }; showEditModal = true; }}
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink border border-border rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
          {$_('common.edit')}
        </button>

        <!-- Delete -->
        <button
          on:click={() => showDeleteModal = true}
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-500/30 rounded-lg hover:bg-red-500/12 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          {$_('common.delete')}
        </button>
      </div>
    </div>

    <!-- Rank History section -->
    <div class="bg-surface rounded-xl border border-border p-5 mb-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 class="text-base font-semibold text-ink">{$_('seo.history.title')}</h2>

        <!-- Range tabs -->
        <div class="flex items-center gap-1 flex-wrap">
          {#each (['7d', '30d', '90d', 'custom'] as Range[]) as r}
            <button
              on:click={() => selectedRange = r}
              class="px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer
                {selectedRange === r
                  ? 'bg-brand text-white'
                  : 'bg-surface-2 text-ink-muted hover:bg-surface-2'}"
            >
              {#if r === '7d'}{$_('seo.history.range7d')}
              {:else if r === '30d'}{$_('seo.history.range30d')}
              {:else if r === '90d'}{$_('seo.history.range90d')}
              {:else}{$_('seo.history.rangeCustom')}
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Custom date pickers -->
      {#if selectedRange === 'custom'}
        <div class="flex items-center gap-3 mb-4 flex-wrap">
          <label class="flex items-center gap-2 text-sm text-ink-muted">
            {$_('seo.history.customFrom')}
            <input
              type="date"
              bind:value={customFrom}
              class="px-2 py-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <label class="flex items-center gap-2 text-sm text-ink-muted">
            {$_('seo.history.customTo')}
            <input
              type="date"
              bind:value={customTo}
              class="px-2 py-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        </div>
      {/if}

      <!-- Chart -->
      {#if filteredHistory.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-14 h-14 bg-surface-2 rounded-2xl flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <p class="text-sm text-ink-muted max-w-xs">{$_('seo.history.empty')}</p>
          <button
            on:click={openRecordModal}
            class="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 transition-colors cursor-pointer"
          >
            {$_('seo.recordPosition.title')}
          </button>
        </div>
      {:else}
        <div class="relative" style="height: 288px;">
          <canvas bind:this={canvas} style="width: 100%; height: 100%;"></canvas>
        </div>
      {/if}
    </div>

    <!-- Recent history table -->
    {#if filteredHistory.length > 0}
      <div class="bg-surface rounded-xl border border-border overflow-hidden">
        <div class="px-5 py-3 border-b border-border">
          <h3 class="text-sm font-semibold text-ink">{$_('seo.history.title')}</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-2/50">
                <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('seo.history.tableHeaderDate')}</th>
                <th class="text-right text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('seo.history.tableHeaderRank')}</th>
                <th class="text-left text-xs font-medium text-ink-muted uppercase tracking-wider px-5 py-3">{$_('seo.history.tableHeaderUrl')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each [...filteredHistory].reverse().slice(0, 30) as entry}
                <tr class="hover:bg-surface-2/50 transition-colors duration-100">
                  <td class="px-5 py-3 text-ink-muted">{formatDate(entry.date)}</td>
                  <td class="px-5 py-3 text-right">
                    {#if entry.rank != null}
                      <span class="font-medium {entry.rank <= 10 ? 'text-green-600' : entry.rank <= 30 ? 'text-amber-600' : 'text-ink'}">
                        #{entry.rank}
                      </span>
                    {:else}
                      <span class="text-ink-subtle italic">{$_('seo.history.notRanked')}</span>
                    {/if}
                  </td>
                  <td class="px-5 py-3 max-w-[280px]">
                    {#if entry.url}
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-brand hover:text-primary-700 hover:underline truncate block"
                        title={entry.url}
                      >
                        {entry.url}
                      </a>
                    {:else}
                      <span class="text-ink-subtle">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Toast notification -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div class="flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm
      {toast.type === 'warning' ? 'bg-amber-500/12 border-amber-500/30 text-amber-800' :
       toast.type === 'success' ? 'bg-green-500/12 border-green-500/30 text-green-800' :
       'bg-red-500/12 border-red-500/30 text-red-800'}">
      {#if toast.type === 'warning'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      {:else if toast.type === 'success'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      {/if}
      <span>{toast.message}</span>
      <button
        on:click={() => toast = null}
        aria-label={$_('common.close')}
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Edit modal -->
{#if showEditModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showEditModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border">
        <h2 class="text-lg font-semibold text-ink">{$_('common.edit')} — {keyword?.keyword}</h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Target URL -->
        <div>
          <label for="edit-url" class="block text-sm font-medium text-ink mb-1.5">{$_('seo.targetUrl')}</label>
          <input
            id="edit-url"
            type="text"
            bind:value={editForm.url}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="https://your-page.com/path"
          />
        </div>
        <!-- Target Rank -->
        <div>
          <label for="edit-target" class="block text-sm font-medium text-ink mb-1.5">{$_('seo.targetRank')}</label>
          <input
            id="edit-target"
            type="number"
            min="1"
            max="100"
            bind:value={editForm.targetRank}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <!-- Intent -->
        <div>
          <label for="edit-intent" class="block text-sm font-medium text-ink mb-1.5">{$_('seo.intent')}</label>
          <select
            id="edit-intent"
            bind:value={editForm.intent}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="INFORMATIONAL">{$_('seo.intentInformational')}</option>
            <option value="NAVIGATIONAL">{$_('seo.intentNavigational')}</option>
            <option value="COMMERCIAL">{$_('seo.intentCommercial')}</option>
            <option value="TRANSACTIONAL">{$_('seo.intentTransactional')}</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={saveKeyword}
          disabled={saving}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          {#if saving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('common.save')}
        </button>
        <button on:click={() => showEditModal = false} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 text-sm cursor-pointer transition-colors">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete confirmation modal -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showDeleteModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6">
        <div class="w-12 h-12 bg-red-500/12 rounded-xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink mb-2">{$_('seo.deleteKeyword')}</h2>
        <p class="text-sm text-ink-muted mb-6">{$_('seo.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={deleteKeyword}
            disabled={deleting}
            class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 text-sm cursor-pointer transition-colors"
          >
            {$_('common.delete')}
          </button>
          <button on:click={() => showDeleteModal = false} class="flex-1 px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 text-sm cursor-pointer transition-colors">
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Record Position Modal -->
{#if showRecordModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={closeRecordModal}
    on:keydown={(e) => e.key === 'Escape' && closeRecordModal()}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-border flex items-center gap-2.5">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-ink">{$_('seo.recordPosition.title')}</h2>
          {#if keyword}
            <p class="text-xs text-ink-muted truncate">{keyword.keyword}</p>
          {/if}
        </div>
      </div>
      <div class="p-6 space-y-4">
        <p class="text-sm text-ink-muted">{$_('seo.recordPosition.description')}</p>

        <!-- Current rank -->
        <div>
          <label for="detail-record-rank" class="block text-sm font-medium text-ink mb-1.5">{$_('seo.recordPosition.rank')}</label>
          <input
            id="detail-record-rank"
            type="number"
            min="1"
            max="100"
            bind:value={recordRank}
            disabled={recordNotInTop100}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-surface-2 disabled:text-ink-subtle"
            placeholder={$_('seo.recordPosition.rankPlaceholder')}
          />
          <label class="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              bind:checked={recordNotInTop100}
              class="w-4 h-4 text-brand rounded border-border cursor-pointer"
            />
            <span class="text-sm text-ink-muted">{$_('seo.recordPosition.notInTop100')}</span>
          </label>
        </div>

        <!-- Matched URL -->
        <div>
          <label for="detail-record-url" class="block text-sm font-medium text-ink mb-1.5">{$_('seo.recordPosition.url')}</label>
          <input
            id="detail-record-url"
            type="text"
            bind:value={recordUrl}
            class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="https://example.com/page"
          />
          <p class="mt-1 text-xs text-ink-subtle">{$_('seo.recordPosition.urlHelper')}</p>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={saveRecordPosition}
          disabled={recordSaving || (!recordNotInTop100 && (!recordRank || Number(recordRank) < 1 || Number(recordRank) > 100))}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if recordSaving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('common.loading')}
          {:else}
            {$_('seo.recordPosition.save')}
          {/if}
        </button>
        <button on:click={closeRecordModal} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
