<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/client';
  import InfoTooltip from '$lib/components/InfoTooltip.svelte';
  import { buildSummaryCards, type SummaryCard } from './overview-summary';

  export let projectId: string;
  export let days: number = 30;
  export let expanded = false;
  export let connected: { gsc: boolean; instagram: boolean; threads: boolean; app: boolean };

  const dispatch = createEventDispatcher<{ goto: string }>();

  // State
  let cards: SummaryCard[] = [];
  let dailyMetrics: any[] = [];
  let gscDailySeries: { date: string; clicks: number }[] | null = null;
  let loading = true;
  let error: string | null = null;

  // Chart
  let ChartJS: any = null;
  let comboCanvas: HTMLCanvasElement;
  let comboChart: any = null;

  // Guard to avoid fetch on initial days reactive trigger before mount
  let mounted = false;
  let prevDays = days;

  // Channel quick-link headline stats
  let channelStats: { gsc: string; instagram: string; threads: string; app: string } = {
    gsc: '',
    instagram: '',
    threads: '',
    app: '',
  };

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await loadData();
    prevDays = days;
    mounted = true;
  });

  onDestroy(() => {
    comboChart?.destroy();
    comboChart = null;
  });

  // Reactive watcher: refetch when `days` changes after mount
  $: if (mounted && days !== prevDays) {
    prevDays = days;
    loadData();
  }

  // Render/destroy chart when expanded changes
  $: if (mounted && expanded) {
    renderComboChart();
  }
  $: if (!expanded) {
    comboChart?.destroy();
    comboChart = null;
  }

  async function loadData() {
    if (!projectId) return;
    loading = true;
    error = null;

    try {
      const fetches: Promise<any>[] = [
        api.get<any>('/analytics/metrics/totals', { projectId, days }),
        api.get<any[]>('/analytics/metrics', { projectId, days }),
      ];

      if (connected.gsc) {
        fetches.push(api.get<any>('/google/search-console/summary', { projectId, days }));
      }
      if (connected.instagram) {
        fetches.push(api.get<any>('/instagram/metrics', { projectId, days }));
      }
      if (connected.threads) {
        fetches.push(api.get<any>('/threads/metrics', { projectId, days }));
      }

      const results = await Promise.allSettled(fetches);

      let idx = 0;
      const totalsResult = results[idx++];
      const dailyResult = results[idx++];

      const totals =
        totalsResult.status === 'fulfilled'
          ? totalsResult.value
          : { total: { visitors: 0, conversions: 0 }, change: { visitors: 0, conversions: 0 }, trend: {} };

      dailyMetrics =
        dailyResult.status === 'fulfilled' && Array.isArray(dailyResult.value)
          ? dailyResult.value
          : [];

      // GSC summary
      let gscData: { connected: boolean; clicks?: number; clicksChange?: number } = { connected: false };
      if (connected.gsc) {
        const r = results[idx++];
        if (r.status === 'fulfilled' && r.value) {
          const v = r.value;
          gscData = {
            connected: true,
            clicks: v.clicks ?? v.totalClicks ?? 0,
            clicksChange: v.clicksChange ?? v.change?.clicks ?? 0,
          };
          // Try to extract daily GSC series for combo chart
          if (Array.isArray(v.daily)) {
            gscDailySeries = v.daily.map((d: any) => ({ date: d.date, clicks: d.clicks ?? 0 }));
          } else {
            gscDailySeries = null;
          }
          channelStats.gsc = formatNumber(gscData.clicks ?? 0) + ' ' + $_('analytics.gscClicks');
        }
      }

      // Instagram
      let igData: { connected: boolean; followers?: number; followersChange?: number } = { connected: false };
      if (connected.instagram) {
        const r = results[idx++];
        if (r.status === 'fulfilled' && r.value) {
          const v = r.value;
          const account: any[] = Array.isArray(v.account) ? v.account : [];
          const latest = account.length > 0 ? account[account.length - 1] : null;
          const followers = latest?.followersCount ?? 0;
          igData = { connected: true, followers, followersChange: 0 };
          channelStats.instagram = formatNumber(followers) + ' ' + $_('instagram.followers');
        }
      }

      // Threads
      let threadsData: { connected: boolean; engagement?: number; engagementChange?: number } = { connected: false };
      if (connected.threads) {
        const r = results[idx++];
        if (r.status === 'fulfilled' && r.value) {
          const v = r.value;
          // Sum interactions from posts array or use summary field
          let engagement = 0;
          if (typeof v.totalInteractions === 'number') {
            engagement = v.totalInteractions;
          } else if (Array.isArray(v.posts)) {
            engagement = (v.posts as any[]).reduce(
              (sum: number, p: any) => sum + (p.likeCount ?? 0) + (p.replyCount ?? 0) + (p.repostCount ?? 0),
              0
            );
          }
          threadsData = {
            connected: true,
            engagement,
            engagementChange: v.engagementChange ?? 0,
          };
          channelStats.threads = formatNumber(engagement) + ' ' + $_('threads.engagement');
        }
      }

      // Explicit reassignment so Svelte reactivity picks up in-place mutations
      channelStats = { ...channelStats };

      cards = buildSummaryCards({ totals, gsc: gscData, instagram: igData, threads: threadsData });
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }

    if (expanded && ChartJS) {
      await tick();
      renderComboChart();
    }
  }

  async function renderComboChart() {
    if (!ChartJS || !comboCanvas || dailyMetrics.length === 0) return;

    comboChart?.destroy();
    comboChart = null;

    const labels = dailyMetrics.map((d: any) => formatDate(d.date));
    const visitorsData = dailyMetrics.map((d: any) => d.metrics?.visitors ?? 0);
    const pointRadius = days <= 30 ? 2 : 0;

    // Determine if we have a usable daily GSC clicks series aligned with web dates
    const hasGscDailyAligned =
      gscDailySeries !== null &&
      gscDailySeries.length > 0 &&
      gscDailySeries.length === dailyMetrics.length;

    if (hasGscDailyAligned) {
      console.info('[AnalyticsOverview] Combo chart: dual-axis (visitors + GSC clicks)');
    } else {
      console.info('[AnalyticsOverview] Combo chart: visitors-only fallback (no aligned GSC daily series)');
    }

    const datasets: any[] = [
      {
        label: $_('analytics.visitors'),
        data: visitorsData,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59,130,246,0.10)',
        fill: true,
        tension: 0.3,
        pointRadius,
        yAxisID: 'y',
      },
    ];

    const scales: any = {
      x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
      y: { type: 'linear', position: 'left', beginAtZero: true },
    };

    if (hasGscDailyAligned) {
      const gscData = gscDailySeries!.map((d) => d.clicks);
      datasets.push({
        label: $_('analytics.gscClicks'),
        data: gscData,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16,185,129,0.08)',
        fill: false,
        tension: 0.3,
        pointRadius,
        yAxisID: 'y1',
      });
      scales.y1 = {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
      };
    }

    await tick();
    if (!comboCanvas || !comboCanvas.getContext('2d')) return;

    comboChart = new ChartJS(comboCanvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales,
      },
    });
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const channelColors: Record<string, string> = {
    site: 'bg-blue-500/12 text-blue-600',
    gsc: 'bg-green-500/12 text-green-600',
    instagram: 'bg-pink-500/12 text-pink-600',
    threads: 'bg-purple-500/12 text-purple-600',
    app: 'bg-indigo-500/12 text-indigo-600',
  };

  const channelIcons: Record<string, string> = {
    site: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3M3 12h18" /></svg>`,
    gsc: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>`,
    instagram: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>`,
    threads: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25c0 0 1-2.25 4.5-2.25s5.25 2.016 5.25 4.5c0 5.25-9 5.25-9 5.25s5.25 0 5.25-3c0-1.5-1.5-3-3.75-3S7.5 10.5 7.5 11.25" /></svg>`,
    app: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>`,
  };

  const quickLinkChannels = [
    { id: 'gsc', labelKey: 'analytics.tabSearch', condition: () => connected.gsc },
    { id: 'instagram', labelKey: 'instagram.title', condition: () => connected.instagram },
    { id: 'threads', labelKey: 'threads.title', condition: () => connected.threads },
    { id: 'app', labelKey: 'analytics.tabApp', condition: () => connected.app },
  ];
</script>

{#if loading}
  <!-- Skeleton -->
  <div class="animate-pulse">
    {#if !expanded}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {#each Array(4) as _}
          <div class="bg-surface-2 rounded-xl h-24"></div>
        {/each}
      </div>
    {:else}
      <div class="bg-surface-2 rounded-xl h-72"></div>
    {/if}
  </div>
{:else if error}
  <div class="text-red-500 text-sm py-4">{error}</div>
{:else if !expanded}
  <!-- Summary strip: KPI cards grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
    {#each cards as card (card.key)}
      {@const color = channelColors[card.channel] ?? 'bg-surface-2 text-ink-muted'}
      <div class="bg-surface rounded-xl border border-border p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between">
          <span class="w-7 h-7 rounded-lg {color} flex items-center justify-center flex-shrink-0">
            {@html channelIcons[card.channel] ?? ''}
          </span>
          {#if card.change !== 0}
            <span class="text-xs font-medium flex items-center gap-0.5
              {card.trend === 'up' ? 'text-green-600' : card.trend === 'down' ? 'text-red-500' : 'text-ink-subtle'}">
              {#if card.trend === 'up'}
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              {:else if card.trend === 'down'}
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
                </svg>
              {/if}
              {card.change > 0 ? '+' : ''}{card.change}%
            </span>
          {/if}
        </div>

        <div class="text-2xl font-bold text-ink leading-none">{formatNumber(card.value)}</div>

        <div class="flex items-center gap-1 text-xs text-ink-muted">
          <span>{$_(card.labelKey)}</span>
          <InfoTooltip key={card.hintKey} />
        </div>
      </div>
    {/each}
  </div>
{:else}
  <!-- Expanded Overview tab body: combo chart + channel quick-links -->
  <div class="space-y-6">
    <!-- Combo chart -->
    <div class="bg-surface rounded-xl border border-border p-5">
      <h3 class="text-sm font-semibold text-ink mb-4">{$_('analytics.trafficOverview')}</h3>
      {#if dailyMetrics.length === 0}
        <div class="flex items-center justify-center py-12 text-ink-muted text-sm">
          {$_('analytics.empty')}
        </div>
      {:else}
        <div class="relative" style="height: 288px;">
          <canvas bind:this={comboCanvas} style="width: 100%; height: 100%;"></canvas>
        </div>
      {/if}
    </div>

    <!-- Channel quick-links -->
    {#if connected.gsc || connected.instagram || connected.threads || connected.app}
      <div class="bg-surface rounded-xl border border-border p-5">
        <h3 class="text-sm font-semibold text-ink mb-4">{$_('analytics.channelsDrilldown')}</h3>
        <div class="divide-y divide-border">
          {#each quickLinkChannels as ch}
            {#if ch.condition()}
              {@const color = channelColors[ch.id] ?? 'bg-surface-2 text-ink-muted'}
              <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div class="flex items-center gap-3">
                  <span class="w-8 h-8 rounded-lg {color} flex items-center justify-center flex-shrink-0">
                    {@html channelIcons[ch.id] ?? ''}
                  </span>
                  <div>
                    <p class="text-sm font-medium text-ink">{$_(ch.labelKey)}</p>
                    {#if channelStats[ch.id as keyof typeof channelStats]}
                      <p class="text-xs text-ink-muted">{channelStats[ch.id as keyof typeof channelStats]}</p>
                    {/if}
                  </div>
                </div>
                <button
                  type="button"
                  on:click={() => dispatch('goto', ch.id)}
                  class="text-xs font-medium text-brand hover:underline cursor-pointer"
                >
                  {$_('analytics.viewDetails')} →
                </button>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
