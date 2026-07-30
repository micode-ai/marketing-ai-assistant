<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { api } from '$lib/api/client';
  import {
    resolveTikTokView,
    isSyncStale,
    periodDelta,
    deltaSeries,
    followerChange,
    isHistoryTooShort,
    type TikTokStatus,
    type TikTokSnapshot,
  } from './tiktok-dashboard-state';

  export let projectId: string;
  export let days: number = 30;

  interface TikTokVideo {
    tiktokVideoId: string;
    title: string | null;
    description: string | null;
    coverImageUrl: string | null;
    shareUrl: string | null;
    duration: number | null;
    timestamp: string;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    shareCount: number | null;
    engagementRate: number | null;
  }

  interface Metrics {
    account: TikTokSnapshot[];
    topPosts: TikTokVideo[];
    worstPosts: TikTokVideo[];
  }

  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // periodic refresh while mounted

  let status: TikTokStatus | null = null;
  let metrics: Metrics = { account: [], topPosts: [], worstPosts: [] };
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

  $: view = resolveTikTokView({ loading, status });

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await init();
    prevProjectId = projectId;
    mounted = true;
  });

  // Re-initialise when the parent passes a different project: the analytics page
  // is reused across /projects/A → /projects/B, so without this watcher the
  // dashboard keeps showing the previous project's TikTok data.
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
    if (status?.connected && status.statsGranted) {
      // Render whatever we already have, then drop `loading` so the shell
      // appears; the sync runs in the background rather than blocking the tab.
      await fetchMetrics();
      loading = false;
      // The <canvas> only exists in the connected view, so the render inside
      // fetchMetrics() above no-ops on first load. Re-render now it is mounted.
      await tick();
      renderChart();
      loadStoredAdvice();
      syncInterval = setInterval(syncAndRefresh, SYNC_INTERVAL_MS);
      if (isSyncStale(status?.lastSyncAt)) syncAndRefresh();
    } else {
      loading = false;
    }
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
      status = await api.get<TikTokStatus>('/tiktok/status', { projectId });
    } catch {
      status = { connected: false, statsGranted: false };
    }
  }

  async function triggerSync() {
    syncing = true;
    try {
      await api.post('/tiktok/sync?projectId=' + projectId);
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
      metrics = await api.get<Metrics>('/tiktok/metrics', { projectId, days });
      await tick();
      renderChart();
    } catch {
      metrics = { account: [], topPosts: [], worstPosts: [] };
    } finally {
      dataLoading = false;
    }
  }

  function renderChart() {
    if (!ChartJS || !chartCanvas || metrics.account.length === 0) return;
    destroyChart();

    // Views/likes are lifetime counters, so the chart plots day-over-day deltas.
    // Followers are a level, not a counter, so they stay absolute on their own axis.
    const viewDeltas = deltaSeries(metrics.account, 'views');
    const likeDeltas = deltaSeries(metrics.account, 'likes');
    const byDate = new Map(viewDeltas.map((p) => [p.date, p.value]));
    const likesByDate = new Map(likeDeltas.map((p) => [p.date, p.value]));
    const dates = metrics.account.map((d) => d.date).slice(1);

    const labels = dates.map((d) =>
      new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );

    chart = new ChartJS(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: $_('tiktok.followers'),
            data: metrics.account.slice(1).map((d) => d.followersCount ?? 0),
            borderColor: '#25F4EE',
            backgroundColor: 'rgba(37, 244, 238, 0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
            yAxisID: 'y1',
          },
          {
            label: $_('tiktok.viewsPerDay'),
            data: dates.map((d) => byDate.get(d) ?? 0),
            borderColor: '#FE2C55',
            backgroundColor: 'rgba(254, 44, 85, 0.12)',
            fill: false,
            tension: 0.3,
            pointRadius: days <= 30 ? 2 : 0,
          },
          {
            label: $_('tiktok.likesPerDay'),
            data: dates.map((d) => likesByDate.get(d) ?? 0),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.12)',
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
  // Every counter TikTok returns is a lifetime total, so period figures are
  // last − first (see periodDelta), never a sum of the daily snapshots.
  $: currentFollowers = metrics.account.length
    ? metrics.account[metrics.account.length - 1].followersCount ?? 0
    : 0;
  $: followersDelta = followerChange(metrics.account);
  $: totalViews    = periodDelta(metrics.account, 'views');
  $: totalLikes    = periodDelta(metrics.account, 'likes');
  $: totalComments = periodDelta(metrics.account, 'comments');
  $: totalShares   = periodDelta(metrics.account, 'shares');
  $: historyTooShort = isHistoryTooShort(metrics.account);

  function formatNumber(n: number | null | undefined): string {
    const v = n ?? 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toLocaleString();
  }

  function formatSigned(n: number): string {
    if (n === 0) return '±0';
    return (n > 0 ? '+' : '−') + formatNumber(Math.abs(n));
  }

  function formatEngagement(rate: number | null | undefined): string {
    if (rate == null) return '—';
    return (rate * 100).toFixed(1) + '%';
  }

  function videoLabel(v: TikTokVideo): string {
    const raw = v.title || v.description || '';
    if (!raw) return '—';
    return raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // --- AI advice ---
  // Restore the last advice persisted server-side so the card survives page
  // re-entry / tab switches / reloads. Best-effort: stays empty on any failure.
  async function loadStoredAdvice() {
    try {
      const res = await api.get<{ advice: string | null; contextSummary: string | null }>(
        '/tiktok/advice',
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
        `/tiktok/advice?projectId=${projectId}`,
        { language: $locale || 'en' },
      );
      advice = res.advice;
      contextSummary = res.contextSummary;
    } catch {
      adviceError = $_('tiktok.adviceError');
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
        title: `TikTok advice — ${new Date().toISOString().slice(0, 10)}`,
      });
      await api.post(`/chat/sessions/${session.id}/messages`, {
        role: 'user',
        content: `${contextSummary}\n\nAdvise how to improve these TikTok metrics.`,
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
  <!-- Initial status + metrics load: a metrics-shaped skeleton instead of a blank
       panel. The TikTok tab only renders once the account is known-connected, so
       this skeleton cannot flash for unlinked projects. -->
  <div class="bg-surface rounded-xl border border-border overflow-hidden mb-6 animate-pulse">
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-surface-2 rounded-lg"></div>
        <div class="space-y-2">
          <div class="h-3.5 w-32 bg-surface-2 rounded"></div>
          <div class="h-2.5 w-20 bg-surface-2 rounded"></div>
        </div>
      </div>
      <div class="h-8 w-24 bg-surface-2 rounded-lg"></div>
    </div>
    <div class="p-5 space-y-6">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {#each Array(5) as _skeleton}<div class="bg-surface-2 rounded-xl h-24"></div>{/each}
      </div>
      <div class="bg-surface-2 rounded-xl h-64"></div>
    </div>
  </div>
{:else if view === 'hidden'}
  <!-- No TikTok account linked: self-hides to keep the analytics page clean -->
{:else if view === 'reconnect'}
  <div class="bg-amber-500/12 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
    <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
    <div class="flex-1">
      <h3 class="text-sm font-semibold text-amber-900">{$_('tiktok.reconnectTitle')}</h3>
      <p class="text-sm text-amber-700 mt-0.5">{$_('tiktok.reconnectDescription')}</p>
      <a href="/settings/integrations"
         class="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 hover:underline">
        {$_('tiktok.reconnectCta')} →
      </a>
    </div>
  </div>
{:else}
  <!-- Connected with analytics scopes -->
  <div class="bg-surface rounded-xl border border-border overflow-hidden mb-6">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-[#FE2C55]/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-[#FE2C55]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
          </svg>
        </div>
        <div>
          <h2 class="text-sm font-semibold text-ink">{$_('tiktok.title')}</h2>
          <p class="text-xs text-ink-muted">
            {status?.accountName ? '@' + status.accountName : $_('tiktok.subtitle')}
          </p>
        </div>
      </div>
      <button on:click={syncAndRefresh} disabled={syncing}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-ink-muted border border-border rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-40 cursor-pointer">
        {#if syncing}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {$_('tiktok.syncing')}
        {:else}
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          {$_('tiktok.syncNow')}
        {/if}
      </button>
    </div>

    {#if dataLoading && metrics.account.length === 0}
      <div class="p-5 space-y-6 animate-pulse">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {#each Array(5) as _skeleton}<div class="bg-surface-2 rounded-xl h-24"></div>{/each}
        </div>
        <div class="bg-surface-2 rounded-xl h-64"></div>
      </div>
    {:else if metrics.account.length === 0}
      <div class="px-5 py-12 text-center text-sm text-ink-muted">{$_('tiktok.noData')}</div>
    {:else}
      <div class="p-5 space-y-6">
        {#if historyTooShort}
          <!-- TikTok's API exposes lifetime counters only, with no way to fetch
               past days — so a fresh connection genuinely has one data point.
               Say that instead of letting it look like a broken sync. -->
          <p class="text-xs text-ink-muted bg-surface-2 border border-border rounded-lg p-3">
            {$_('tiktok.historyStarts')}
          </p>
        {/if}

        <!-- KPI cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-[#25F4EE]">
            <div class="text-xs text-ink-muted mb-1">{$_('tiktok.currentFollowers')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(currentFollowers)}</div>
            {#if metrics.account.length > 1}
              <div class="text-xs mt-0.5 {followersDelta > 0 ? 'text-green-600' : followersDelta < 0 ? 'text-red-600' : 'text-ink-muted'}">
                {formatSigned(followersDelta)}
              </div>
            {/if}
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-[#FE2C55]">
            <div class="text-xs text-ink-muted mb-1">{$_('tiktok.totalViews')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalViews)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-purple-400">
            <div class="text-xs text-ink-muted mb-1">{$_('tiktok.totalLikes')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalLikes)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-blue-400">
            <div class="text-xs text-ink-muted mb-1">{$_('tiktok.totalComments')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalComments)}</div>
          </div>
          <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-green-400">
            <div class="text-xs text-ink-muted mb-1">{$_('tiktok.totalShares')}</div>
            <div class="text-2xl font-bold text-ink">{formatNumber(totalShares)}</div>
          </div>
        </div>

        <!-- Trend chart -->
        <div>
          <h3 class="text-sm font-semibold text-ink mb-3">{$_('tiktok.trend')}</h3>
          {#if metrics.account.length > 1}
            <div class="relative" style="height: 264px;">
              <canvas bind:this={chartCanvas} style="width: 100%; height: 100%;"></canvas>
            </div>
          {:else}
            <div class="text-sm text-ink-muted py-10 text-center bg-surface-2 rounded-xl">
              {$_('tiktok.trendNeedsTwoDays')}
            </div>
          {/if}
        </div>

        <!-- Best / Worst videos -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {#each [
            { key: 'best',  title: 'tiktok.bestVideos',  rows: metrics.topPosts },
            { key: 'worst', title: 'tiktok.worstVideos', rows: metrics.worstPosts },
          ] as group (group.key)}
            <div>
              <h3 class="text-sm font-semibold text-ink mb-3">{$_(group.title)}</h3>
              {#if group.rows.length === 0}
                <div class="text-sm text-ink-muted py-6 text-center bg-surface-2 rounded-xl">{$_('tiktok.noVideos')}</div>
              {:else}
                <div class="rounded-xl border border-border overflow-x-auto">
                  <table class="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr class="bg-surface-2 border-b border-border">
                        <th class="text-left px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('tiktok.video')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('tiktok.duration')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('tiktok.views')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('tiktok.likes')}</th>
                        <th class="text-right px-3 py-2.5 text-xs font-semibold text-ink-muted">{$_('tiktok.engagement')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each group.rows as video (video.tiktokVideoId)}
                        <tr class="border-b border-border hover:bg-surface-2">
                          <td class="px-3 py-2 text-ink max-w-[220px]">
                            <div class="flex items-center gap-2 min-w-0">
                              {#if video.coverImageUrl}
                                <img src={video.coverImageUrl} alt="" class="w-8 h-10 rounded object-cover flex-shrink-0" loading="lazy" />
                              {/if}
                              <span class="truncate" title={video.title ?? video.description ?? ''}>
                                {#if video.shareUrl}
                                  <a href={video.shareUrl} target="_blank" rel="noopener noreferrer" class="text-brand hover:underline">
                                    {videoLabel(video)}
                                  </a>
                                {:else}
                                  {videoLabel(video)}
                                {/if}
                              </span>
                            </div>
                          </td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatDuration(video.duration)}</td>
                          <td class="px-3 py-2 text-right text-ink font-medium">{formatNumber(video.viewCount)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatNumber(video.likeCount)}</td>
                          <td class="px-3 py-2 text-right text-ink-muted">{formatEngagement(video.engagementRate)}</td>
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
            <h3 class="text-sm font-semibold text-ink">{$_('tiktok.advice')}</h3>
            {#if !advice}
              <button on:click={getAdvice} disabled={adviceLoading}
                class="px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
                {adviceLoading ? $_('tiktok.generating') : $_('tiktok.generateAdvice')}
              </button>
            {/if}
          </div>
          {#if adviceError}<p class="text-sm text-red-600">{adviceError}</p>{/if}
          {#if advice}
            <div class="prose prose-sm max-w-none text-ink">{@html DOMPurify.sanitize(marked.parse(advice, { async: false }) as string)}</div>
            <div class="flex items-center gap-2 mt-4">
              <button on:click={continueInChat} disabled={openingChat}
                class="px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-lg hover:brightness-110 disabled:opacity-50 cursor-pointer">
                {$_('tiktok.continueInChat')}
              </button>
              <button on:click={getAdvice} disabled={adviceLoading}
                class="px-3 py-1.5 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 cursor-pointer">
                {adviceLoading ? $_('tiktok.generating') : $_('tiktok.regenerate')}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
