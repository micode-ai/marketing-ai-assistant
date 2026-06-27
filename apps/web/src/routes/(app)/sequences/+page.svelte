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
      const res = await api.get<any[]>('/email-sequences', params);
      items = res;
    } catch (e) {
      console.error('Failed to load sequences:', e);
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
      <span class="text-brand">{$currentProjectStore.name}</span>
    {/if}
    <span class="text-ink-subtle">›</span>
    <span class="text-ink">{$_('nav.orgSequences')}</span>
  </div>

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('nav.orgSequences')}</h1>
    {#if $currentProjectStore}
      <a href="/projects/{$currentProjectStore.id}/sequences" class="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:brightness-110 transition-colors">
        + {$_('common.create')}
      </a>
    {:else}
      <button disabled class="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 text-ink-subtle text-sm font-medium rounded-lg cursor-not-allowed" title={$_('common.selectProjectToCreate')}>
        + {$_('common.create')}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-ink-muted">
      <p>{$_('common.noData')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <a href="/projects/{item.projectId}/sequences" class="block bg-surface rounded-lg border border-border p-4 hover:border-brand/40 hover:shadow-sm transition-all cursor-pointer">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-ink">{item.name || item.title || 'Sequence'}</h3>
              <p class="text-sm text-ink-muted">{item.type || ''}</p>
            </div>
            {#if ctx.type === 'organization'}
              <span class="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {item.projectName || $_('org.scopeProject')}
              </span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
