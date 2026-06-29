<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { api } from '$lib/api/client';
  import {
    resolveInstagramView,
    isSyncStale,
    type InstagramStatus,
  } from './instagram-dashboard-state';
  import { pickTotal } from './pick-total';

  export let projectId: string;
  export let days: number = 30;

  interface AccountPoint {
    date: string;
    followersCount: number | null;
    reach: number | null;
    views: number | null;
    accountsEngaged: number | null;
    totalInteractions: number | null;
  }

  interface MediaPost {
    id: string;
    igMediaId: string;
    mediaType: string;
    caption: string | null;
    permalink: string | null;
    timestamp: string;
    likeCount: number | null;
    commentsCount: number | null;
    reach: number | null;
    views: number | null;
    engagementRate: number | null;
  }

  interface Metrics {
    account: AccountPoint[];
    topPosts: MediaPost[];
    worstPosts: MediaPost[];
    periodTotals?: {
      reach?: number;
      views?: number;
      accountsEngaged?: number;
      totalInteractions?: number;
    };
  }

  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // periodic refresh while mounted

  let status: InstagramStatus | null = null;
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

  $: view = resolveInstagramView({ loading, status });

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await init();
    prevProjectId = projectId;
    mounted = true;
  });

  // Re-initialise when the parent passes a different project. This component is
  // reused across project switches (the analytics page is not remounted), so
  // without this watcher it keeps showing the previous project's IG data.
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
      await loadStoredAdvice();
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
      status = await api.get<InstagramStatus>('/instagram/status', { projectId });
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
      await api.post('/instagram/sync?projectId=' + projectId);
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
      metrics = await api.get<Metrics>('/instagram/metrics', { projectId, days });
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
            label: $_('instagram.followers'),
            data: metrics.account.map((d) => d.followersCount ?? 0),
            borderColor: '#EC4899',
            backgroundColor: 'rgba(236, 72, 153, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
            yAxisID: 'y1',
          },
          {
            label: $_('instagram.reach'),
            data: metrics.account.map((d) => d.reach ?? 0),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: false,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
          },
          {
            label: $_('instagram.views'),
            data: metrics.account.map((d) => d.views ?? 0),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
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
  $: totalReach = pickTotal(metrics.periodTotals?.reach, metrics.account.reduce((s, d) => s + (d.reach ?? 0), 0));
  $: totalViews = pickTotal(metrics.periodTotals?.views, metrics.account.reduce((s, d) => s + (d.views ?? 0), 0));

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
  // Restore the last advice persisted server-side so the card survives page
  // re-entry / tab switches / reloads. Best-effort: stays empty on any failure.
  async function loadStoredAdvice() {
    try {
      const res = await api.get<{ advice: string | null; contextSummary: string | null }>(
        '/instagram/advice',
        { projectId },
      );
      if (res?.advice) {
        advice = res.advice;
        contextSummary = res.contextSummary ?? '';
      }
    } catch {
      /* no stored advice yet — keep empty */
    }
  }

  async function getAdvice() {
    adviceLoading = true;
    adviceError = '';
    try {
      const res = await api.post<{ advice: string; contextSummary: string }>(
        `/instagram/advice?projectId=${projectId}`,
        { language: $locale || 'en' },
      );
      advice = res.advice;
      contextSummary = res.contextSummary;
    } catch {
      adviceError = $_('instagram.adviceError');
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
        title: `Instagram advice — ${new Date().toISOString().slice(0, 10)}`,
      });
      await api.post(`/chat/sessions/${session.id}/messages`, {
        role: 'user',
        content: `${contextSummary}\n\nAdvise how to improve these Instagram metrics.`,
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
  <!-- nothing while resolving status (avoids a flash before we know IG is linked) -->
{:else if view === 'hidden'}
  <!-- No Instagram account linked: keep a quiet inline hint -->
  <!-- self-hides; rendered nothing keeps the analytics page clean -->
{:else if view === 'reconnect'}
  <div class="bg-amber-500/12 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
    <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
    <div class="flex-1">
      <h3 class="text-sm font-semibold text-amber-900">{$_('instagram.reconnectTitle')}</h3>
      <p class="text-sm text-amber-700 mt-0.5">{$_('instagram.reconnectDescription')}</p>
      <a href="/settings/integrations"
         class="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 hover:underline">
        {$_('instagram.reconnectCta')} →
      </a>
    </div>
  </div>
{:else}
  <!-- Connected with insights -->
  <div class="bg-surface rounded-xl border border-border overflow-hidden mb-6">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-pink-500/12 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-pink-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
          </svg>
        </div>
        <div>
          <h2 class="text-sm font-semibold text-ink">{$_('instagram.title')}</h2>
          <p class="text-xs text-ink-muted">
            {status?.accountName ? '@' + status.accountName : $_('instagram.subtitle')}
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
            {$_('instagram.syncing')}
          {:else}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {$_('instagram.syncNow')}
          {/if}
        </button>
      </div>
    </div>

    {#if dataLoading && metrics.account.length === 0}
      <div class="p-5 space-y-6 animate-pulse">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {#each Array(3) as _skeleton}<div class="bg-surface-2 rounded-xl h-24"></div>{/each}
        </div>
        <div class="bg-surface-2 rounded-xl h-64"></div>
      </div>
    {:else if metrics.account.length === 0}
      <div class="px-5 py-12 text-center text-sm text-ink-muted">{$_('instagram.noData')}</div>
    {:else}
      <div class="p-5 space-y-6">
        <!-- KPI cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-pink-400">
            <div class="text-xs text-ink-muted mb-1">{$_('instagram.currentFollowers')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(currentFollowers)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-purple-400">
            <div class="text-xs text-ink-muted mb-1">{$_('instagram.totalReach')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalReach)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-blue-400">
            <div class="text-xs text-ink-muted mb-1">{$_('instagram.totalViews')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalViews)}</div>
          </div>
        </div>

        <!-- Trend chart -->
        <div>
          <h3 class="text-sm font-semibold text-ink mb-3">{$_('instagram.trend')}</h3>
          <div class="relative" style="height: 264px;">
            <canvas bind:this={chartCanvas} style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <!-- Posts & Reels -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {#each [{ key: 'best', title: 'instagram.bestPosts', rows: metrics.topPosts }, { key: 'worst', title: 'instagram.worstPosts', rows: metrics.worstPosts }] as group (group.key)}
            <div>
              <h3 class="text-sm font-semibold text-ink mb-3">{$_(group.title)}</h3>
              {#if group.rows.length === 0}
                <div class="text-sm text-ink-subtle py-6 text-center bg-surface-2 rounded-xl">{$_('instagram.noPosts')}</div>
              {:else}
                <div class="rounded-xl border border-border overflow-x-auto">
                  <table class="w-full text-sm min-w-[460px]">
                    <thead>
                      <tr class="bg-surface-2 border-b border-border">
                        <th class="text-left px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.caption')}</th>
                        <th class="text-left px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.type')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.likes')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.comments')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.reach')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('instagram.engagement')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each group.rows as post (post.id)}
                        <tr class="border-b border-border hover:bg-surface-2">
                          <td class="px-3 py-2 text-ink max-w-[180px] truncate" title={post.caption ?? ''}>
                            {#if post.permalink}
                              <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                                 class="text-brand hover:underline">{truncate(post.caption)}</a>
                            {:else}
                              {truncate(post.caption)}
                            {/if}
                          </td>
                          <td class="px-3 py-2">
                            <span class="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-pink-500/12 text-pink-700">{post.mediaType}</span>
                          </td>
                          <td class="px-3 py-2 text-right text-ink font-medium">{formatNumber(post.likeCount)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(post.commentsCount)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(post.reach)}</td>
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
            <h3 class="text-sm font-semibold text-ink">{$_('instagram.advice')}</h3>
            {#if !advice}
              <button on:click={getAdvice} disabled={adviceLoading}
                class="px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
                {adviceLoading ? $_('instagram.generating') : $_('instagram.generateAdvice')}
              </button>
            {/if}
          </div>
          {#if adviceError}<p class="text-sm text-red-600">{adviceError}</p>{/if}
          {#if advice}
            <div class="prose prose-sm max-w-none text-ink">{@html DOMPurify.sanitize(marked.parse(advice, { async: false }) as string)}</div>
            <div class="flex items-center gap-2 mt-4">
              <button on:click={continueInChat} disabled={openingChat}
                class="px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
                {$_('instagram.continueInChat')}
              </button>
              <button on:click={getAdvice} disabled={adviceLoading}
                class="px-3 py-1.5 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 cursor-pointer">
                {adviceLoading ? $_('instagram.generating') : $_('instagram.regenerate')}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
