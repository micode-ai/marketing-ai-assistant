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
            label: $_('googlePlay.metrics.crashes'),
            data: metrics.map(d => d.crashes),
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius,
            yAxisID: 'y',
          },
          {
            label: $_('googlePlay.metrics.anrs'),
            data: metrics.map(d => d.anrs),
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius,
            yAxisID: 'y',
          },
          {
            label: $_('googlePlay.kpi.crashRate'),
            data: metrics.map(d => d.crashRate),
            borderColor: '#8B5CF6',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius,
            borderDash: [5, 5],
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
          y: { type: 'linear' as const, position: 'left' as const, beginAtZero: true, title: { display: true, text: 'Count' } },
          y1: { type: 'linear' as const, position: 'right' as const, beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } },
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
  <h3 class="text-sm font-semibold text-gray-700 mb-4">{$_('googlePlay.metrics.crashes')} & {$_('googlePlay.metrics.anrs')}</h3>
  <div class="relative" style="height: 288px;">
    <canvas bind:this={canvas} style="width: 100%; height: 100%;"></canvas>
  </div>
</div>
