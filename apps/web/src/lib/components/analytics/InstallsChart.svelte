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
            label: $_('googlePlay.metrics.installs'),
            data: metrics.map(d => d.installs),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius,
          },
          {
            label: $_('googlePlay.metrics.uninstalls'),
            data: metrics.map(d => d.uninstalls),
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius,
          },
          {
            label: $_('googlePlay.metrics.updates'),
            data: metrics.map(d => d.updates),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius,
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
</script>

<div class="bg-surface rounded-xl border border-border p-5">
  <h3 class="text-sm font-semibold text-ink mb-4">{$_('googlePlay.metrics.installs')}</h3>
  <div class="relative" style="height: 288px;">
    <canvas bind:this={canvas} style="width: 100%; height: 100%;"></canvas>
  </div>
</div>
