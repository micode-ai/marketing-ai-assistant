<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { GooglePlayMetricsTotals, AppStoreMetricsDto } from '@marketing-ai/shared-types';

  export let totals: GooglePlayMetricsTotals | null = null;
  export let metrics: AppStoreMetricsDto[] = [];

  // Compute simple totals from metrics array when API totals not available
  $: computedTotals = totals || computeFromMetrics(metrics);

  function computeFromMetrics(m: AppStoreMetricsDto[]): GooglePlayMetricsTotals | null {
    if (!m || m.length === 0) return null;
    const totalInstalls = m.reduce((s, r) => s + (r.installs || 0), 0);
    const avgRating = m.reduce((s, r) => s + (r.averageRating || 0), 0) / m.length;
    const totalRevenue = m.reduce((s, r) => s + (r.revenue || 0), 0);
    const avgCrashRate = m.reduce((s, r) => s + (r.crashRate || 0), 0) / m.length;
    return {
      installs: { value: totalInstalls, change: 0, trend: 'flat' },
      averageRating: { value: Math.round(avgRating * 100) / 100, change: 0, trend: 'flat' },
      revenue: { value: totalRevenue || null, change: null, trend: null },
      crashRate: { value: Math.round(avgCrashRate * 1000) / 1000, change: 0, trend: 'flat' },
    };
  }

  function formatNumber(n: number | null | undefined): string {
    if (n == null) return '--';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  function formatRating(n: number | null | undefined): string {
    if (n == null) return '--';
    return n.toFixed(2);
  }

  function formatPercent(n: number | null | undefined): string {
    if (n == null) return '--';
    return n.toFixed(2) + '%';
  }

  function formatRevenue(n: number | null | undefined): string {
    if (n == null) return '--';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  $: cards = [
    {
      labelKey: 'googlePlay.kpi.installs',
      value: computedTotals ? formatNumber(computedTotals.installs.value) : '--',
      change: computedTotals?.installs.change ?? 0,
      trend: computedTotals?.installs.trend ?? 'flat',
      color: 'bg-blue-50 text-blue-600',
      borderColor: 'border-t-blue-400',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`,
    },
    {
      labelKey: 'googlePlay.kpi.rating',
      value: computedTotals ? formatRating(computedTotals.averageRating.value) : '--',
      change: computedTotals?.averageRating.change ?? 0,
      trend: computedTotals?.averageRating.trend ?? 'flat',
      color: 'bg-yellow-50 text-yellow-600',
      borderColor: 'border-t-yellow-400',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>`,
    },
    {
      labelKey: 'googlePlay.kpi.revenue',
      value: computedTotals ? formatRevenue(computedTotals.revenue.value) : '--',
      change: computedTotals?.revenue.change ?? null,
      trend: computedTotals?.revenue.trend ?? null,
      color: 'bg-green-50 text-green-600',
      borderColor: 'border-t-green-400',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    },
    {
      labelKey: 'googlePlay.kpi.crashRate',
      value: computedTotals ? formatPercent(computedTotals.crashRate.value) : '--',
      change: computedTotals?.crashRate.change ?? 0,
      trend: computedTotals?.crashRate.trend ?? 'flat',
      color: 'bg-red-50 text-red-600',
      borderColor: 'border-t-red-400',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`,
    },
  ];
</script>

<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
  {#each cards as card}
    <div class="bg-surface rounded-xl border border-border p-4 border-t-4 {card.borderColor}">
      <div class="flex items-center justify-between mb-3">
        <div class="w-9 h-9 {card.color} rounded-lg flex items-center justify-center flex-shrink-0">{@html card.icon}</div>
        {#if card.change != null && card.change !== 0}
          <span class="text-xs font-medium flex items-center gap-0.5 {card.trend === 'up' ? 'text-green-600' : card.trend === 'down' ? 'text-red-500' : 'text-ink-subtle'}">
            {#if card.trend === 'up'}
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
            {:else if card.trend === 'down'}
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" /></svg>
            {/if}
            {card.change > 0 ? '+' : ''}{card.change}%
          </span>
        {/if}
      </div>
      <div class="text-2xl font-bold text-ink">{card.value}</div>
      <div class="text-xs text-ink-muted mt-1">{$_(card.labelKey)}</div>
    </div>
  {/each}
</div>
