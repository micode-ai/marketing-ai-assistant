<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let organizationId: string;
  export let period: 7 | 30 | 90 = 30;

  type Summary = {
    contentCountAll: number;
    campaignCount: number;
    subscriberCount: number;
    socialAccountCount: number;
  };

  type Totals = {
    total: Record<string, number>;
    change: Record<string, number>;
    trend: Record<string, 'up' | 'down' | 'stable'>;
  };

  let summary: Summary | null = null;
  let summaryLoading = true;
  let summaryError = false;

  let totals: Totals | null = null;
  let totalsLoading = true;
  let totalsError = false;

  onMount(async () => {
    await Promise.all([loadSummary(), loadTotals()]);
  });

  async function loadSummary() {
    summaryLoading = true;
    summaryError = false;
    try {
      summary = await api.get<Summary>('/analytics/summary', { organizationId });
    } catch {
      summaryError = true;
      summary = null;
    } finally {
      summaryLoading = false;
    }
  }

  async function loadTotals() {
    totalsLoading = true;
    totalsError = false;
    try {
      totals = await api.get<Totals>('/analytics/metrics/totals', { organizationId, days: period });
    } catch {
      totalsError = true;
      totals = null;
    } finally {
      totalsLoading = false;
    }
  }

  function setPeriod(p: 7 | 30 | 90) {
    if (period === p) return;
    period = p;
    loadTotals();
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  function trendClass(trend: string | undefined): string {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-red-600';
    return 'text-gray-400';
  }

  function trendArrow(trend: string | undefined): string {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '—';
  }

  const kpiIconContent = 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z';
  const kpiIconCampaign = 'M3 5a2 2 0 012-2h1.28a2 2 0 011.664.89l.812 1.22A2 2 0 0010.42 6H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V5z';
  const kpiIconSubs = 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z';
  const kpiIconSocial = 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z';
</script>

<div class="space-y-4 mb-6">
  <!-- KPI block -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    {#each [
      { label: $_('dashboard.kpiTotalContent'), value: summary?.contentCountAll, icon: kpiIconContent, bg: 'bg-blue-50', fg: 'text-blue-600' },
      { label: $_('dashboard.kpiCampaigns'), value: summary?.campaignCount, icon: kpiIconCampaign, bg: 'bg-amber-50', fg: 'text-amber-600' },
      { label: $_('dashboard.kpiSubscribers'), value: summary?.subscriberCount, icon: kpiIconSubs, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
      { label: $_('dashboard.kpiSocialAccounts'), value: summary?.socialAccountCount, icon: kpiIconSocial, bg: 'bg-violet-50', fg: 'text-violet-600' },
    ] as card}
      <div class="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <div class="w-10 h-10 {card.bg} rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 {card.fg}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d={card.icon} />
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-xs text-gray-500 truncate">{card.label}</p>
          {#if summaryLoading}
            <div class="h-6 w-14 bg-gray-100 rounded animate-pulse mt-1"></div>
          {:else if summaryError}
            <p class="text-base font-semibold text-gray-300">—</p>
          {:else}
            <p class="text-xl font-bold text-gray-900">{formatNumber(card.value ?? 0)}</p>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Activity block -->
  <div class="bg-white border border-gray-200 rounded-xl p-4">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
      <h2 class="text-sm font-semibold text-gray-700">{$_('dashboard.activityTitle')}</h2>
      <div class="inline-flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
        {#each [{ v: 7, label: $_('analytics.period7') }, { v: 30, label: $_('analytics.period30') }, { v: 90, label: $_('analytics.period90') }] as opt}
          <button
            type="button"
            class="px-3 py-1.5 transition-colors cursor-pointer {period === opt.v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}"
            on:click={() => setPeriod(opt.v as 7 | 30 | 90)}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      {#each [
        { key: 'visitors', label: $_('analytics.visitors') },
        { key: 'leads', label: $_('analytics.leads') },
        { key: 'conversions', label: $_('analytics.conversions') },
        { key: 'emailOpens', label: $_('analytics.emailOpens') },
      ] as metric}
        <div class="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-3">
          <p class="text-xs text-gray-500 truncate">{metric.label}</p>
          {#if totalsLoading}
            <div class="h-6 w-16 bg-gray-200 rounded animate-pulse mt-1.5"></div>
            <div class="h-3 w-10 bg-gray-100 rounded animate-pulse mt-2"></div>
          {:else if totalsError || !totals}
            <p class="text-lg font-semibold text-gray-300 mt-1">—</p>
          {:else}
            <p class="text-lg font-bold text-gray-900 mt-1">{formatNumber(totals.total[metric.key] ?? 0)}</p>
            <p class="text-xs mt-1 flex items-center gap-1 {trendClass(totals.trend[metric.key])}">
              <span>{trendArrow(totals.trend[metric.key])}</span>
              {#if (totals.change[metric.key] ?? 0) !== 0}
                <span>{Math.abs(totals.change[metric.key] ?? 0)}%</span>
              {:else}
                <span class="text-gray-400">{$_('analytics.noChange')}</span>
              {/if}
              <span class="text-gray-400 ml-1 truncate">{$_('analytics.vsLastPeriod')}</span>
            </p>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
