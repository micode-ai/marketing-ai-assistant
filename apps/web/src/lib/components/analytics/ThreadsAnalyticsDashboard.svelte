<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { api } from '$lib/api/client';
  import {
    resolveThreadsView,
    isSyncStale,
    type ThreadsStatus,
  } from './threads-dashboard-state';
  import { pickTotal } from './pick-total';

  export let projectId: string;
  export let days: number = 30;

  interface AccountPoint {
    date: string;
    followersCount: number | null;
    views: number | null;
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    quotes: number | null;
  }

  interface ThreadsPost {
    text: string | null;
    permalink: string | null;
    timestamp: string;
    views: number | null;
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    quotes: number | null;
    shares: number | null;
    engagementRate: number | null;
  }

  interface Metrics {
    account: AccountPoint[];
    topPosts: ThreadsPost[];
    worstPosts: ThreadsPost[];
    periodTotals?: {
      views?: number;
      likes?: number;
      replies?: number;
      reposts?: number;
      quotes?: number;
    };
  }

  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // periodic refresh while mounted

  let status: ThreadsStatus | null = null;
  let metrics: Metrics = { account: [], topPosts: [], worstPosts: [], periodTotals: {} };
  let loading = true;
  let dataLoading = false;
  let syncing = false;
  let syncInterval: ReturnType<typeof setInterval> | null = null;

  // Chart
  let ChartJS: any = null;
  let chartCanvas: HTMLCanvasElement;
  let chart: any = null;

  // AI advice
  let advice = '';
  let contextSummary = '';
  let adviceLoading = false;
  let adviceError = '';
  let openingChat = false;

  $: view = resolveThreadsView({ loading, status });

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await init();
    prevProjectId = projectId;
    mounted = true;
  });

  // Re-initialise when the parent passes a different project. This component is
  // reused across project switches (the analytics page is not remounted), so
  // without this watcher it keeps showing the previous project's Threads data.
  let mounted = false;
  let prevProjectId = '';
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    reinit();
  }

  let prevDays = days;
  $: if (mounted && days !== prevDays) { prevDays = days; fetchMetrics(); }

  async function init() {
    loading = true;
    await checkStatus();
    if (status?.connected && status.insightsGranted) {
      await syncIfStale();
      await fetchMetrics();
      syncInterval = setInterval(syncAndRefresh, SYNC_INTERVAL_MS);
    }
    loading = false;
  }

  async function reinit() {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    destroyChart();
    status = null;
    metrics = { account: [], topPosts: [], worstPosts: [] };
    advice = '';
    contextSummary = '';
    adviceError = '';
    await init();
  }

  onDestroy(() => {
    if (syncInterval) clearInterval(syncInterval);
    destroyChart();
  });

  function destroyChart() {
    chart?.destroy();
    chart = null;
  }

  async function checkStatus() {
    try {
      status = await api.get<ThreadsStatus>('/threads/status', { projectId });
    } catch {
      status = { connected: false, insightsGranted: false };
    }
  }

  async function syncIfStale() {
    if (isSyncStale(status?.lastSyncAt)) {
      await triggerSync();
    }
  }

  async function triggerSync() {
    syncing = true;
    try {
      await api.post('/threads/sync?projectId=' + projectId);
      await checkStatus();
    } catch {
      /* best effort — keep showing existing data */
    } finally {
      syncing = false;
    }
  }

  async function syncAndRefresh() {
    await triggerSync();
    await fetchMetrics();
  }

  async function fetchMetrics() {
    dataLoading = true;
    try {
      metrics = await api.get<Metrics>('/threads/metrics', { projectId, days });
      await tick();
      renderChart();
    } catch {
      metrics = { account: [], topPosts: [], worstPosts: [], periodTotals: {} };
    } finally {
      dataLoading = false;
    }
  }

  function renderChart() {
    if (!ChartJS || !chartCanvas || metrics.account.length === 0) return;
    destroyChart();
    const labels = metrics.account.map((d) =>
      new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );
    chart = new ChartJS(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: $_('threads.followers'),
            data: metrics.account.map((d) => d.followersCount ?? 0),
            borderColor: '#1C1C1E',
            backgroundColor: 'rgba(28, 28, 30, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
            yAxisID: 'y1',
          },
          {
            label: $_('threads.views'),
            data: metrics.account.map((d) => d.views ?? 0),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: false,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
          },
          {
            label: $_('threads.likes'),
            data: metrics.account.map((d) => d.likes ?? 0),
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: false,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
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
          y1: { type: 'linear', position: 'right', beginAtZero: false, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  // --- KPIs ---
  $: currentFollowers = metrics.account.length
    ? metrics.account[metrics.account.length - 1].followersCount ?? 0
    : 0;
  $: totalViews    = pickTotal(metrics.periodTotals?.views,   metrics.account.reduce((s, d) => s + (d.views    ?? 0), 0));
  $: totalLikes    = pickTotal(metrics.periodTotals?.likes,   metrics.account.reduce((s, d) => s + (d.likes    ?? 0), 0));
  $: totalReplies  = pickTotal(metrics.periodTotals?.replies, metrics.account.reduce((s, d) => s + (d.replies  ?? 0), 0));
  $: totalReposts  = pickTotal(metrics.periodTotals?.reposts, metrics.account.reduce((s, d) => s + (d.reposts  ?? 0), 0));
  $: totalQuotes   = pickTotal(metrics.periodTotals?.quotes,  metrics.account.reduce((s, d) => s + (d.quotes   ?? 0), 0));

  function formatNumber(n: number | null | undefined): string {
    const v = n ?? 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toLocaleString();
  }

  function formatEngagement(rate: number | null | undefined): string {
    if (rate == null) return '—';
    return (rate * 100).toFixed(1) + '%';
  }

  function truncate(text: string | null, len = 60): string {
    if (!text) return '—';
    return text.length > len ? text.slice(0, len) + '…' : text;
  }

  // --- AI advice ---
  async function getAdvice() {
    adviceLoading = true;
    adviceError = '';
    try {
      const res = await api.post<{ advice: string; contextSummary: string }>(
        `/threads/advice?projectId=${projectId}`,
        { language: $locale || 'en' },
      );
      advice = res.advice;
      contextSummary = res.contextSummary;
    } catch {
      adviceError = $_('threads.adviceError');
    } finally {
      adviceLoading = false;
    }
  }

  async function continueInChat() {
    if (!advice) return;
    openingChat = true;
    try {
      const session = await api.post<{ id: string }>('/chat/sessions', {
        projectId,
        title: `Threads advice — ${new Date().toISOString().slice(0, 10)}`,
      });
      await api.post(`/chat/sessions/${session.id}/messages`, {
        role: 'user',
        content: `${contextSummary}\n\nAdvise how to improve these Threads metrics.`,
      });
      await api.post(`/chat/sessions/${session.id}/messages`, {
        role: 'assistant',
        content: advice,
      });
      goto(`/ai-chat?session=${session.id}`);
    } finally {
      openingChat = false;
    }
  }
</script>

{#if view === 'loading'}
  <!-- nothing while resolving status (avoids a flash before we know Threads is linked) -->
{:else if view === 'hidden'}
  <!-- No Threads account linked: self-hides to keep the analytics page clean -->
{:else if view === 'reconnect'}
  <div class="bg-amber-500/12 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
    <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
    <div class="flex-1">
      <h3 class="text-sm font-semibold text-amber-900">{$_('threads.reconnectTitle')}</h3>
      <p class="text-sm text-amber-700 mt-0.5">{$_('threads.reconnectDescription')}</p>
      <a href="/settings/integrations"
         class="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 hover:underline">
        {$_('threads.reconnectCta')} →
      </a>
    </div>
  </div>
{:else}
  <!-- Connected with insights -->
  <div class="bg-surface rounded-xl border border-border overflow-hidden mb-6">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-neutral-900/8 rounded-lg flex items-center justify-center flex-shrink-0">
          <!-- Threads logo mark (stylised @ / thread shape) -->
          <svg class="w-5 h-5 text-ink" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.001 2C6.477 2 2 6.477 2 12s4.477 10 10.001 10C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm3.964 10.42c-.04-.186-.089-.37-.147-.55a4.43 4.43 0 00-.274-.638 3.72 3.72 0 00-.493-.71 3.27 3.27 0 00-.745-.573 3.63 3.63 0 00-.985-.35 5.04 5.04 0 00-1.145-.117c-.46 0-.9.05-1.318.148a3.977 3.977 0 00-1.128.46 3.418 3.418 0 00-.846.762 3.213 3.213 0 00-.53 1.055 4.13 4.13 0 00-.175 1.21c0 .47.063.912.188 1.323.125.412.311.778.557 1.098.247.32.549.588.906.802.357.213.767.366 1.23.455.462.09.968.135 1.516.135.46 0 .91-.033 1.348-.099a5.25 5.25 0 001.215-.325c.37-.152.707-.35 1.01-.593v1.04a5.37 5.37 0 01-1.09.58 6.81 6.81 0 01-1.334.333 9.15 9.15 0 01-1.483.112 7.42 7.42 0 01-2.016-.259 5.3 5.3 0 01-1.612-.77 4.426 4.426 0 01-1.098-1.249 4.627 4.627 0 01-.536-1.683 6.935 6.935 0 01-.088-1.1c0-.576.077-1.13.232-1.66a5.26 5.26 0 01.677-1.46 4.667 4.667 0 011.107-1.146 4.93 4.93 0 011.54-.73 6.853 6.853 0 011.974-.26c.55 0 1.082.055 1.596.163.513.109.99.276 1.43.504.44.227.835.515 1.186.864.35.35.645.754.884 1.215.239.46.413.975.52 1.546.108.57.162 1.186.162 1.845v.285h-6.53c.013.404.073.77.18 1.099.107.328.259.607.457.836.197.23.432.408.703.534.27.126.572.19.905.19.36 0 .692-.065.994-.196.303-.13.565-.316.787-.559l.95.67a3.14 3.14 0 01-1.149.844 3.68 3.68 0 01-1.52.305 3.7 3.7 0 01-1.333-.234 3.041 3.041 0 01-1.03-.67 3.046 3.046 0 01-.668-1.06 3.96 3.96 0 01-.237-1.405c0-.507.08-.98.242-1.42a3.3 3.3 0 01.693-1.12 3.14 3.14 0 011.095-.738 3.69 3.69 0 011.433-.267c.508 0 .974.088 1.397.263.423.176.787.424 1.09.745.304.32.538.707.702 1.16.164.452.246.954.246 1.505v.285zm-1.218-.92a2.6 2.6 0 00-.131-.622 1.88 1.88 0 00-.311-.543 1.49 1.49 0 00-.52-.381 1.71 1.71 0 00-.722-.143c-.273 0-.524.05-.754.148a1.71 1.71 0 00-.585.407 1.95 1.95 0 00-.385.618 2.49 2.49 0 00-.148.516h3.556z"/>
          </svg>
        </div>
        <div>
          <h2 class="text-sm font-semibold text-ink">{$_('threads.title')}</h2>
          <p class="text-xs text-ink-muted">
            {status?.accountName ? '@' + status.accountName : $_('threads.subtitle')}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button on:click={syncAndRefresh} disabled={syncing}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-ink-muted border border-border rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-40 cursor-pointer">
          {#if syncing}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {$_('threads.syncing')}
          {:else}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {$_('threads.syncNow')}
          {/if}
        </button>
      </div>
    </div>

    {#if dataLoading && metrics.account.length === 0}
      <div class="p-5 space-y-6 animate-pulse">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {#each Array(6) as _skeleton}<div class="bg-surface-2 rounded-xl h-24"></div>{/each}
        </div>
        <div class="bg-surface-2 rounded-xl h-64"></div>
      </div>
    {:else if metrics.account.length === 0}
      <div class="px-5 py-12 text-center text-sm text-ink-muted">{$_('threads.noData')}</div>
    {:else}
      <div class="p-5 space-y-6">
        <!-- KPI cards — 6 metrics in 2+3 responsive grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-neutral-700">
            <div class="text-xs text-ink-muted mb-1">{$_('threads.currentFollowers')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(currentFollowers)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-blue-400">
            <div class="text-xs text-ink-muted mb-1">{$_('threads.totalViews')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalViews)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-red-400">
            <div class="text-xs text-ink-muted mb-1">{$_('threads.totalLikes')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalLikes)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-purple-400">
            <div class="text-xs text-ink-muted mb-1">{$_('threads.totalReplies')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalReplies)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-green-400">
            <div class="text-xs text-ink-muted mb-1">{$_('threads.totalReposts')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalReposts)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
            <div class="text-xs text-ink-muted mb-1">{$_('threads.totalQuotes')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalQuotes)}</div>
          </div>
        </div>

        <!-- Trend chart -->
        <div>
          <h3 class="text-sm font-semibold text-ink mb-3">{$_('threads.trend')}</h3>
          <div class="relative" style="height: 264px;">
            <canvas bind:this={chartCanvas} style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <!-- Best / Worst posts -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {#each [
            { key: 'best',  title: 'threads.bestPosts',  rows: metrics.topPosts },
            { key: 'worst', title: 'threads.worstPosts', rows: metrics.worstPosts },
          ] as group (group.key)}
            <div>
              <h3 class="text-sm font-semibold text-ink mb-3">{$_(group.title)}</h3>
              {#if group.rows.length === 0}
                <div class="text-sm text-ink-muted py-6 text-center bg-surface-2 rounded-xl">{$_('threads.noPosts')}</div>
              {:else}
                <div class="rounded-xl border border-border overflow-x-auto">
                  <table class="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr class="bg-surface-2 border-b border-border">
                        <th class="text-left px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('threads.postText')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('threads.views')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('threads.likes')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('threads.replies')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('threads.engagement')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each group.rows as post, i (i)}
                        <tr class="border-b border-border hover:bg-surface-2">
                          <td class="px-3 py-2 text-ink max-w-[200px] truncate" title={post.text ?? ''}>
                            {#if post.permalink}
                              <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                                 class="text-brand hover:underline">{truncate(post.text)}</a>
                            {:else}
                              {truncate(post.text)}
                            {/if}
                          </td>
                          <td class="px-3 py-2 text-right text-ink font-medium">{formatNumber(post.views)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(post.likes)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(post.replies)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatEngagement(post.engagementRate)}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- AI advice -->
        <div class="bg-surface-2 rounded-xl border border-border p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-ink">{$_('threads.advice')}</h3>
            {#if !advice}
              <button on:click={getAdvice} disabled={adviceLoading}
                class="px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
                {adviceLoading ? $_('threads.generating') : $_('threads.generateAdvice')}
              </button>
            {/if}
          </div>
          {#if adviceError}<p class="text-sm text-red-600">{adviceError}</p>{/if}
          {#if advice}
            <div class="prose prose-sm max-w-none text-ink">{@html DOMPurify.sanitize(marked.parse(advice, { async: false }) as string)}</div>
            <div class="flex items-center gap-2 mt-4">
              <button on:click={continueInChat} disabled={openingChat}
                class="px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
                {$_('threads.continueInChat')}
              </button>
              <button on:click={getAdvice} disabled={adviceLoading}
                class="px-3 py-1.5 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 cursor-pointer">
                {adviceLoading ? $_('threads.generating') : $_('threads.regenerate')}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
