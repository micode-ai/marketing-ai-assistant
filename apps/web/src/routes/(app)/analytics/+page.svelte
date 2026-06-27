<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, currentProjectStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';
  import { currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';
  import MobileAnalyticsDashboard from '$lib/components/analytics/MobileAnalyticsDashboard.svelte';

  let items: any[] = [];
  let loading = true;

  $: ctx = $contextStore;
  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;
  $: hasProject = !!$currentProjectStore;
  $: isMobileApp = $currentProjectStore?.projectType === 'MOBILE_APP';
  $: projectId = $currentProjectStore?.id;

  async function loadOrgData() {
    if (!ctx.organizationId || hasProject) return;
    loading = true;
    try {
      const res = await api.get<any>('/analytics/organization', { organizationId: ctx.organizationId });
      items = Array.isArray(res) ? res : [];
    } catch (e) {
      console.error('Failed to load analytics:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  $: if (!hasProject && ctx.organizationId) {
    loadOrgData();
  }
  $: if (hasProject) {
    loading = false;
  }
</script>

<div class="p-4 sm:p-6">
  {#if hasProject && isMobileApp && projectId}
    <!-- Mobile App project: show Google Play dashboard -->
    <MobileAnalyticsDashboard {projectId} days={30} />
  {:else if hasProject && projectId}
    <!-- Non-mobile project: link to project analytics -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-ink">{$_('nav.orgAnalytics')}</h1>
    </div>
    <div class="text-center py-12">
      <a href="/projects/{projectId}/analytics" class="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors">
        {$_('nav.orgAnalytics')} → {$currentProjectStore?.name}
      </a>
    </div>
  {:else}
    <!-- Org-level analytics -->
    <div class="flex items-center gap-1.5 text-sm text-ink-muted mb-1">
      <span>{currentOrg?.name || $_('header.orgContext')}</span>
      <span class="text-ink-subtle">›</span>
      <span class="text-ink">{$_('nav.orgAnalytics')}</span>
    </div>

    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-ink">{$_('nav.orgAnalytics')}</h1>
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
          <a href="/projects/{item.projectId}/analytics" class="block bg-surface rounded-lg border border-border p-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium text-ink">{item.name || item.title || 'Analytics'}</h3>
                <p class="text-sm text-ink-muted">{item.type || ''}</p>
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>
