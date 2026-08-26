<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let projectId: string;
  export let days: number = 30;

  type Ga4 = {
    connected: boolean;
    lagHours: number;
    sessions: number | null;
    users: number | null;
    newUsers: number | null;
    pageViews: number | null;
    engagementRate: number | null;
    avgSessionDuration: number | null;
    keyEvents: number | null;
    keyEventsConfigured: boolean;
    previous: { sessions: number | null; users: number | null; keyEvents: number | null } | null;
    change: { sessions: number | null; users: number | null; keyEvents: number | null } | null;
    channels: Array<{ channel: string; sessions: number }>;
    sources: Array<{ source: string; medium: string; sessions: number }>;
    landingPages: Array<{
      page: string;
      sessions: number;
      keyEvents: number | null;
      engagementRate: number | null;
    }>;
    devices: Array<{ device: string; sessions: number; engagementRate: number | null }>;
    events: Array<{ event: string; count: number }>;
    countries: Array<{ country: string; sessions: number }>;
  };

  let data: Ga4 | null = null;
  let loading = true;
  let lastKey = '';

  // The page reuses this route when the project changes, and the period is a
  // prop — so refetch on either, not just on mount.
  $: if (projectId && `${projectId}:${days}` !== lastKey) {
    lastKey = `${projectId}:${days}`;
    load();
  }

  onMount(load);

  async function load() {
    if (!projectId) return;
    loading = true;
    try {
      data = await api.get<Ga4>('/analytics/ga4', { projectId, days });
    } catch {
      data = null;
    } finally {
      loading = false;
    }
  }

  // null means Analytics did not measure it — showing 0 would claim it did.
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : v.toLocaleString();

  const duration = (sec: number | null) =>
    sec === null ? '—' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  // A null change next to a previous value of 0 is growth from nothing;
  // printing "+100%" would be an invention.
  function delta(pct: number | null | undefined, prev: number | null | undefined): string {
    if (pct === null || pct === undefined) {
      return prev === 0 ? $_('analytics.ga4.fromZero') : '';
    }
    return `${pct > 0 ? '+' : ''}${pct}%`;
  }

  function deltaClass(pct: number | null | undefined): string {
    if (pct === null || pct === undefined) return 'text-ink-subtle';
    return pct > 0 ? 'text-emerald-500' : pct < 0 ? 'text-red-500' : 'text-ink-subtle';
  }

  $: hasFigures = !!data?.connected && data.sessions !== null;
  $: maxChannelSessions = Math.max(1, ...(data?.channels ?? []).map((c) => c.sessions));
  $: kpis = data
    ? [
        {
          label: 'analytics.ga4.sessions',
          value: fmt(data.sessions),
          pct: data.change?.sessions,
          prev: data.previous?.sessions,
          compared: !!data.previous,
        },
        {
          label: 'analytics.ga4.users',
          value: fmt(data.users),
          pct: data.change?.users,
          prev: data.previous?.users,
          compared: !!data.previous,
        },
        { label: 'analytics.ga4.newUsers', value: fmt(data.newUsers), compared: false },
        { label: 'analytics.ga4.pageViews', value: fmt(data.pageViews), compared: false },
        {
          label: 'analytics.ga4.engagementRate',
          value: data.engagementRate === null ? '—' : `${data.engagementRate}%`,
          compared: false,
        },
        {
          label: 'analytics.ga4.avgDuration',
          value: duration(data.avgSessionDuration),
          compared: false,
        },
      ]
    : [];
</script>

{#if loading}
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
    {#each Array(6) as _skeleton}<div class="bg-surface-2 rounded-xl h-24 animate-pulse"></div>{/each}
  </div>
{:else if !data?.connected}
  <div class="card p-5 text-sm text-ink-muted">
    {$_('analytics.ga4.notConnected')}
    <a href={`/projects/${projectId}/settings`} class="text-brand underline ml-1">
      {$_('analytics.ga4.goToSettings')}
    </a>
  </div>
{:else if !hasFigures}
  <!-- Connected but silent: a new property, or a tag that was never installed.
       Saying so beats a wall of zeros that looks like a dead site. -->
  <div class="card p-5 text-sm text-ink-muted">{$_('analytics.ga4.noData')}</div>
{:else}
  <div class="space-y-6">
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {#each kpis as kpi (kpi.label)}
        <div class="card p-4">
          <p class="text-xs text-ink-subtle mb-1">{$_(kpi.label)}</p>
          <p class="text-xl font-semibold text-ink tabular-nums">{kpi.value}</p>
          {#if kpi.compared}
            <p class="text-xs mt-0.5 {deltaClass(kpi.pct)}">{delta(kpi.pct, kpi.prev)}</p>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Conversions. "Never configured" and "zero this period" are different
         statements and get different words. -->
    <div class="card p-4">
      <p class="text-xs text-ink-subtle mb-1">{$_('analytics.ga4.keyEvents')}</p>
      {#if !data.keyEventsConfigured}
        <p class="text-sm text-amber-500">{$_('analytics.ga4.keyEventsNotConfigured')}</p>
      {:else}
        <p class="text-xl font-semibold text-ink tabular-nums">
          {fmt(data.keyEvents)}
          <span class="text-xs font-normal ml-1 {deltaClass(data.change?.keyEvents)}">
            {delta(data.change?.keyEvents, data.previous?.keyEvents)}
          </span>
        </p>
      {/if}
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.channels')}</h3>
        {#each data.channels as channel (channel.channel)}
          <div class="mb-2">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-ink">{channel.channel}</span>
              <span class="text-ink-muted tabular-nums">{fmt(channel.sessions)}</span>
            </div>
            <div class="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                class="h-full bg-brand rounded-full"
                style={`width: ${Math.round((channel.sessions / maxChannelSessions) * 100)}%`}
              ></div>
            </div>
          </div>
        {:else}
          <p class="text-sm text-ink-muted">{$_('analytics.ga4.noData')}</p>
        {/each}
      </div>

      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.sources')}</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <tbody>
              {#each data.sources as src (src.source + src.medium)}
                <tr class="border-b border-border last:border-0">
                  <td class="py-2 pr-3 text-ink">{src.source}</td>
                  <td class="py-2 pr-3 text-ink-muted text-xs">{src.medium}</td>
                  <td class="py-2 text-right text-ink-muted tabular-nums">{fmt(src.sessions)}</td>
                </tr>
              {:else}
                <tr><td class="py-2 text-sm text-ink-muted">{$_('analytics.ga4.noData')}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card p-5">
      <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.landingPages')}</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-ink-subtle text-left">
              <th class="pb-2 font-medium">{$_('analytics.ga4.page')}</th>
              <th class="pb-2 font-medium text-right">{$_('analytics.ga4.sessions')}</th>
              <th class="pb-2 font-medium text-right">{$_('analytics.ga4.engagementRate')}</th>
              <th class="pb-2 font-medium text-right">{$_('analytics.ga4.keyEvents')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.landingPages as page (page.page)}
              <tr class="border-t border-border">
                <td class="py-2 pr-3 text-ink truncate max-w-xs">{page.page}</td>
                <td class="py-2 text-right text-ink-muted tabular-nums">{fmt(page.sessions)}</td>
                <td class="py-2 text-right text-ink-muted tabular-nums">
                  {page.engagementRate === null ? '—' : `${page.engagementRate}%`}
                </td>
                <td class="py-2 text-right text-ink-muted tabular-nums">{fmt(page.keyEvents)}</td>
              </tr>
            {:else}
              <tr><td class="py-2 text-sm text-ink-muted">{$_('analytics.ga4.noData')}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.devices')}</h3>
        {#each data.devices as device (device.device)}
          <div class="flex justify-between text-sm py-1">
            <span class="text-ink">{device.device}</span>
            <span class="text-ink-muted tabular-nums">
              {fmt(device.sessions)}
              {#if device.engagementRate !== null}
                <span class="text-xs text-ink-subtle ml-1">{device.engagementRate}%</span>
              {/if}
            </span>
          </div>
        {:else}
          <p class="text-sm text-ink-muted">{$_('analytics.ga4.noData')}</p>
        {/each}
      </div>

      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.events')}</h3>
        {#each data.events as event (event.event)}
          <div class="flex justify-between text-sm py-1">
            <span class="text-ink truncate">{event.event}</span>
            <span class="text-ink-muted tabular-nums">{fmt(event.count)}</span>
          </div>
        {:else}
          <p class="text-sm text-ink-muted">{$_('analytics.ga4.noData')}</p>
        {/each}
      </div>

      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.countries')}</h3>
        {#each data.countries as country (country.country)}
          <div class="flex justify-between text-sm py-1">
            <span class="text-ink">{country.country}</span>
            <span class="text-ink-muted tabular-nums">{fmt(country.sessions)}</span>
          </div>
        {:else}
          <p class="text-sm text-ink-muted">{$_('analytics.ga4.noData')}</p>
        {/each}
      </div>
    </div>

    <p class="text-xs text-ink-subtle">
      {$_('analytics.ga4.differsFromTracker')}
      {$_('analytics.ga4.lag', { values: { hours: data.lagHours } })}
    </p>
  </div>
{/if}
