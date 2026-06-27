<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, onDestroy, tick } from 'svelte';
  import type { AppStoreMetricsDto } from '@marketing-ai/shared-types';

  export let metrics: AppStoreMetricsDto[] = [];
  export let days: number = 30;

  let canvas: HTMLCanvasElement;
  let chart: any = null;
  let ChartJS: any = null;

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function renderChart() {
    if (!ChartJS || !canvas || metrics.length === 0) return;
    chart?.destroy();

    const labels = metrics.map(d => formatDate(d.date));

    chart = new ChartJS(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: $_('googlePlay.metrics.visitors'),
            data: metrics.map(d => d.storeListingVisitors),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderRadius: 4,
          },
          {
            label: $_('googlePlay.metrics.conversion'),
            data: metrics.map(d => d.storeListingConversions),
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: { legend: { position: 'top' as const } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true },
        },
      },
    });
  }

  onMount(async () => {
    const { Chart } = await import('chart.js/auto');
    ChartJS = Chart;
    await tick();
    requestAnimationFrame(() => renderChart());
  });

  onDestroy(() => {
    chart?.destroy();
    chart = null;
  });

  $: if (ChartJS && metrics.length > 0 && canvas) {
    tick().then(() => requestAnimationFrame(() => renderChart()));
  }

  $: totalVisitors = metrics.reduce((sum, d) => sum + d.storeListingVisitors, 0);
  $: totalConversions = metrics.reduce((sum, d) => sum + d.storeListingConversions, 0);
  $: conversionRate = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : '0.0';
</script>

<div class="bg-surface rounded-xl border border-border p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-sm font-semibold text-ink">{$_('googlePlay.metrics.visitors')} vs {$_('googlePlay.metrics.conversion')}</h3>
    <div class="flex items-center gap-4 text-xs text-ink-muted">
      <span>{$_('googlePlay.metrics.visitors')}: <strong class="text-ink">{totalVisitors.toLocaleString()}</strong></span>
      <span>{$_('googlePlay.metrics.conversion')}: <strong class="text-ink">{conversionRate}%</strong></span>
    </div>
  </div>
  <div class="relative" style="height: 288px;">
    <canvas bind:this={canvas} style="width: 100%; height: 100%;"></canvas>
  </div>
</div>
