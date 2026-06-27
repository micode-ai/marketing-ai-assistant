<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy, tick } from 'svelte';

  export let totals: any = null;
  export let byDate: any[] = [];
  export let compare: boolean = false;

  // Chart
  let ChartJS: any = null;
  let lineCanvas: HTMLCanvasElement;
  let lineChart: any = null;

  function destroyChart() {
    lineChart?.destroy();
    lineChart = null;
  }

  function renderChart() {
    if (!ChartJS || !lineCanvas || byDate.length === 0) return;
    destroyChart();

    const labels = byDate.map((d: any) => {
      const dt = new Date(d.keys?.[0] ?? d.date ?? '');
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    const clicksData = byDate.map((d: any) => d.clicks ?? 0);
    const impressionsData = byDate.map((d: any) => d.impressions ?? 0);

    lineChart = new ChartJS(lineCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: $_('seo.searchConsolePanel.clicks'),
            data: clicksData,
            borderColor: '#3B82F6',
            backgroundColor: '#3B82F622',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2,
            yAxisID: 'yClicks',
          },
          {
            label: $_('seo.searchConsolePanel.impressions'),
            data: impressionsData,
            borderColor: '#8B5CF6',
            backgroundColor: '#8B5CF622',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2,
            yAxisID: 'yImpressions',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, boxWidth: 12 } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxTicksLimit: 12 } },
          yClicks: {
            type: 'linear',
            position: 'left',
            grid: { color: '#F3F4F6' },
            ticks: { font: { size: 11 } },
          },
          yImpressions: {
            type: 'linear',
            position: 'right',
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });
  }

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await tick();
    renderChart();
  });

  onDestroy(() => {
    destroyChart();
  });

  // Re-render when byDate changes after mount
  let prevByDate = byDate;
  $: if (ChartJS && byDate !== prevByDate) {
    prevByDate = byDate;
    tick().then(renderChart);
  }

  // --- Formatting helpers ---
  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n?.toLocaleString() ?? '0';
  }

  function formatCtr(v: number): string {
    return ((v ?? 0) * 100).toFixed(2) + '%';
  }

  function formatPosition(v: number): string {
    return (v ?? 0).toFixed(1);
  }

  function formatDelta(v: number): string {
    if (v > 0) return '+' + (Number.isInteger(v) ? formatNumber(v) : v.toFixed(2));
    return Number.isInteger(v) ? formatNumber(v) : v.toFixed(2);
  }

  // Delta badge: positive delta is green (good), negative is red (bad).
  // For position, the sign is inverted: lower position = better.
  function deltaClass(delta: number, invertGood = false): string {
    if (delta === 0) return 'bg-surface-2 text-ink-muted';
    const good = invertGood ? delta < 0 : delta > 0;
    return good ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  }

  // Derived deltas (only when compare=true and prev* fields present)
  $: clicksDelta = compare && totals?.prevClicks != null ? (totals.clicks ?? 0) - (totals.prevClicks ?? 0) : null;
  $: impressionsDelta = compare && totals?.prevImpressions != null ? (totals.impressions ?? 0) - (totals.prevImpressions ?? 0) : null;
  $: ctrDelta = compare && totals?.prevCtr != null ? (totals.ctr ?? 0) - (totals.prevCtr ?? 0) : null;
  $: positionDelta = compare && totals?.prevPosition != null ? (totals.position ?? 0) - (totals.prevPosition ?? 0) : null;
</script>

<div class="space-y-6">
  <!-- Metric cards -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

    <!-- Clicks -->
    <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-blue-400">
      <div class="text-xs text-ink-muted mb-1">{$_('seo.searchConsolePanel.totalClicks')}</div>
      <div class="text-2xl font-bold text-ink">{totals ? formatNumber(totals.clicks ?? 0) : '—'}</div>
      {#if clicksDelta !== null}
        <span class="inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded {deltaClass(clicksDelta)}">
          {formatDelta(clicksDelta)}
        </span>
      {/if}
    </div>

    <!-- Impressions -->
    <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-purple-400">
      <div class="text-xs text-ink-muted mb-1">{$_('seo.searchConsolePanel.totalImpressions')}</div>
      <div class="text-2xl font-bold text-ink">{totals ? formatNumber(totals.impressions ?? 0) : '—'}</div>
      {#if impressionsDelta !== null}
        <span class="inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded {deltaClass(impressionsDelta)}">
          {formatDelta(impressionsDelta)}
        </span>
      {/if}
    </div>

    <!-- CTR -->
    <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-green-400">
      <div class="text-xs text-ink-muted mb-1">{$_('seo.searchConsolePanel.avgCtr')}</div>
      <div class="text-2xl font-bold text-ink">{totals ? formatCtr(totals.ctr ?? 0) : '—'}</div>
      {#if ctrDelta !== null}
        <span class="inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded {deltaClass(ctrDelta)}">
          {formatDelta(ctrDelta * 100)}%
        </span>
      {/if}
    </div>

    <!-- Average position (lower = better → invert delta color) -->
    <div class="bg-surface border border-border rounded-xl p-4 border-t-4 border-t-amber-400">
      <div class="text-xs text-ink-muted mb-1">{$_('seo.searchConsolePanel.avgPosition')}</div>
      <div class="text-2xl font-bold text-ink">{totals ? formatPosition(totals.position ?? 0) : '—'}</div>
      {#if positionDelta !== null}
        <span class="inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded {deltaClass(positionDelta, true)}">
          {formatDelta(positionDelta)}
        </span>
      {/if}
    </div>
  </div>

  <!-- Clicks + Impressions line chart -->
  {#if byDate.length > 0}
    <div class="bg-surface border border-border rounded-xl p-5">
      <h3 class="text-sm font-semibold text-ink mb-4">{$_('seo.searchConsolePanel.clicks')} &amp; {$_('seo.searchConsolePanel.impressions')}</h3>
      <div class="relative" style="height: 220px;">
        <canvas bind:this={lineCanvas} style="width: 100%; height: 100%;"></canvas>
      </div>
    </div>
  {/if}
</div>
