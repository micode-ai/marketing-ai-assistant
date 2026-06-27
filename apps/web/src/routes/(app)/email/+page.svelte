<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, currentProjectStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';
  import { currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';

  let items: any[] = [];
  let loading = true;

  $: ctx = $contextStore;
  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;

  async function loadData() {
    if (!ctx.organizationId) return;
    loading = true;
    try {
      const params: Record<string, string> = ctx.type === 'project' && ctx.projectId
        ? { projectId: ctx.projectId }
        : { organizationId: ctx.organizationId };
      const res = await api.get<any[]>('/email/lists', params);
      items = res;
    } catch (e) {
      console.error('Failed to load email lists:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  $: $contextStore, loadData();
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center gap-1.5 text-sm text-ink-muted mb-1">
    <span>{currentOrg?.name || $_('header.orgContext')}</span>
    {#if $currentProjectStore}
      <span class="text-ink-subtle">›</span>
      <span class="text-indigo-600 dark:text-indigo-400">{$currentProjectStore.name}</span>
    {/if}
    <span class="text-ink-subtle">›</span>
    <span class="text-ink">{$_('nav.orgEmail')}</span>
  </div>

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('nav.orgEmail')}</h1>
    {#if $currentProjectStore}
      <a href="/projects/{$currentProjectStore.id}/email" class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
        + {$_('common.create')}
      </a>
    {:else}
      <button disabled class="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-ink-subtle text-sm font-medium rounded-lg cursor-not-allowed" title={$_('common.selectProjectToCreate')}>
        + {$_('common.create')}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-ink-muted">
      <p>{$_('common.noData')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <a href="/projects/{item.projectId}/email" class="block bg-surface rounded-lg border border-border p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all cursor-pointer">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-ink">{item.name}</h3>
              <p class="text-sm text-ink-muted">
                {item._count?.subscribers ?? item.subscriberCount ?? 0} subscribers
              </p>
            </div>
            {#if ctx.type === 'organization'}
              <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {item.projectName || $_('org.scopeProject')}
              </span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
