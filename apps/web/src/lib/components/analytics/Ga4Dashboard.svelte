<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let projectId: string;
  export let days: number = 30;

  type Ga4 = {
    connected: boolean;
    sessions: number | null;
    users: number | null;
    newUsers: number | null;
    pageViews: number | null;
    engagementRate: number | null;
    keyEvents: number | null;
    topSources: Array<{ source: string; sessions: number }>;
    topLandingPages: Array<{ page: string; sessions: number }>;
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
  const fmt = (v: number | null) => (v === null ? '—' : v.toLocaleString());

  $: hasFigures = !!data?.connected && data.sessions !== null;
  $: maxSourceSessions = Math.max(1, ...(data?.topSources ?? []).map((s) => s.sessions));
</script>

{#if loading}
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
    {#each Array(5) as _skeleton}<div class="bg-surface-2 rounded-xl h-24 animate-pulse"></div>{/each}
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
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {#each [
        { label: 'analytics.ga4.sessions', value: fmt(data.sessions) },
        { label: 'analytics.ga4.users', value: fmt(data.users) },
        { label: 'analytics.ga4.newUsers', value: fmt(data.newUsers) },
        { label: 'analytics.ga4.pageViews', value: fmt(data.pageViews) },
        {
          label: 'analytics.ga4.engagementRate',
          value: data.engagementRate === null ? '—' : `${data.engagementRate}%`,
        },
      ] as kpi (kpi.label)}
        <div class="card p-4">
          <p class="text-xs text-ink-subtle mb-1">{$_(kpi.label)}</p>
          <p class="text-xl font-semibold text-ink tabular-nums">{kpi.value}</p>
        </div>
      {/each}
    </div>

    {#if data.keyEvents !== null}
      <div class="card p-4">
        <p class="text-xs text-ink-subtle mb-1">{$_('analytics.ga4.keyEvents')}</p>
        <p class="text-xl font-semibold text-ink tabular-nums">{fmt(data.keyEvents)}</p>
      </div>
    {/if}

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.channels')}</h3>
        {#if data.topSources.length === 0}
          <p class="text-sm text-ink-muted">{$_('analytics.ga4.noData')}</p>
        {:else}
          <div class="space-y-2">
            {#each data.topSources as source (source.source)}
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-ink">{source.source}</span>
                  <span class="text-ink-muted tabular-nums">{fmt(source.sessions)}</span>
                </div>
                <div class="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-brand rounded-full"
                    style={`width: ${Math.round((source.sessions / maxSourceSessions) * 100)}%`}
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="card p-5">
        <h3 class="text-sm font-semibold text-ink mb-3">{$_('analytics.ga4.landingPages')}</h3>
        {#if data.topLandingPages.length === 0}
          <p class="text-sm text-ink-muted">{$_('analytics.ga4.noData')}</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <tbody>
                {#each data.topLandingPages as page (page.page)}
                  <tr class="border-b border-border last:border-0">
                    <td class="py-2 pr-3 text-ink truncate max-w-xs">{page.page}</td>
                    <td class="py-2 text-right text-ink-muted tabular-nums">{fmt(page.sessions)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>

    <p class="text-xs text-ink-subtle">{$_('analytics.ga4.differsFromTracker')}</p>
  </div>
{/if}
