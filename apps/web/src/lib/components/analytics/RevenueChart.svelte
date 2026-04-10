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
    const pointRadius = days <= 30 ? 2 : 0;

    chart = new ChartJS(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: $_('googlePlay.kpi.revenue'),
            data: metrics.map(d => d.revenue ?? 0),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius,
            yAxisID: 'y',
          },
          {
            label: $_('googlePlay.metrics.newSubscriptions'),
            data: metrics.map(d => d.newSubscriptions ?? 0),
            borderColor: '#3B82F6',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius,
            yAxisID: 'y1',
          },
          {
            label: $_('googlePlay.metrics.cancelledSubscriptions'),
            data: metrics.map(d => d.cancelledSubscriptions ?? 0),
            borderColor: '#EF4444',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius,
            borderDash: [5, 5],
            yAxisID: 'y1',
          },
          {
            label: $_('googlePlay.metrics.activeSubscriptions'),
            data: metrics.map(d => d.activeSubscriptions ?? 0),
            borderColor: '#8B5CF6',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius,
            yAxisID: 'y1',
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
          y: { type: 'linear' as const, position: 'left' as const, beginAtZero: true, title: { display: true, text: '$' } },
          y1: { type: 'linear' as const, position: 'right' as const, beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Subscriptions' } },
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
</script>

<div class="bg-white rounded-xl border border-gray-200 p-5">
  <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('googlePlay.kpi.revenue')}</h3>
  <div class="relative" style="height: 288px;">
    <canvas bind:this={canvas} style="width: 100%; height: 100%;"></canvas>
  </div>
</div>
