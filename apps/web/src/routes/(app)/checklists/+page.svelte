<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { organizationIdStore, currentProjectStore, projectsStore } from '$lib/stores/projects';
  import { contextStore } from '$lib/stores/context';
  import { currentUser } from '$lib/stores/auth';
  import { api } from '$lib/api/client';
  import { goto } from '$app/navigation';

  let items: any[] = [];
  let loading = true;

  $: ctx = $contextStore;
  $: memberships = ($currentUser as any)?.memberships || [];
  $: currentOrg = memberships.find((m: any) => m.organization?.id === $organizationIdStore)?.organization;
  $: projects = $projectsStore || [];

  // Create modal
  let showCreateModal = false;
  let creating = false;
  let createForm = {
    name: '',
    type: 'CUSTOM' as string,
    description: '',
    projectId: '' as string, // '' = org-level
  };

  const checklistTypes = ['LAUNCH', 'WEEKLY', 'CAMPAIGN_PREP', 'SEO', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN', 'COMPETITIVE_ANALYSIS', 'CUSTOM'];

  async function loadData() {
    if (!ctx.organizationId) return;
    loading = true;
    try {
      const params: Record<string, string> = ctx.type === 'project' && ctx.projectId
        ? { projectId: ctx.projectId }
        : { organizationId: ctx.organizationId };
      const res = await api.get<any[]>('/checklists', params);
      items = res;
    } catch (e) {
      console.error('Failed to load checklists:', e);
      items = [];
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    createForm = { name: '', type: 'CUSTOM', description: '', projectId: $currentProjectStore?.id || '' };
    showCreateModal = true;
  }

  async function createChecklist() {
    if (creating || !createForm.name.trim()) return;
    creating = true;
    try {
      const body: any = {
        name: createForm.name.trim(),
        type: createForm.type,
        description: createForm.description || undefined,
      };
      if (createForm.projectId) {
        body.projectId = createForm.projectId;
        body.scope = 'PROJECT';
      } else {
        body.organizationId = ctx.organizationId;
        body.scope = 'ORGANIZATION';
      }
      const created = await api.post<any>('/checklists', body);
      showCreateModal = false;
      // Navigate to the checklist
      if (created.projectId) {
        goto(`/projects/${created.projectId}/checklists`);
      } else {
        await loadData();
      }
    } catch (e) {
      console.error('Failed to create checklist:', e);
    } finally {
      creating = false;
    }
  }

  $: $contextStore, loadData();
</script>

<div class="p-4 sm:p-6">
  <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-1">
    <span>{currentOrg?.name || $_('header.orgContext')}</span>
    {#if $currentProjectStore}
      <span class="text-gray-300">›</span>
      <span class="text-indigo-600 dark:text-indigo-400">{$currentProjectStore.name}</span>
    {/if}
    <span class="text-gray-300">›</span>
    <span class="text-gray-700 dark:text-gray-200">{$_('nav.orgChecklists')}</span>
  </div>

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{$_('nav.orgChecklists')}</h1>
    <button on:click={openCreateModal} class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer">
      + {$_('common.create')}
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if items.length === 0}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p>{$_('common.noData')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <a href={item.projectId ? `/projects/${item.projectId}/checklists` : '#'}
          on:click|preventDefault={() => { if (item.projectId) goto(`/projects/${item.projectId}/checklists`); }}
          class="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all cursor-pointer">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-gray-900 dark:text-white">{item.name}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">{item.type || ''}{item.description ? ' · ' + item.description.substring(0, 60) : ''}</p>
            </div>
            <div class="flex items-center gap-2">
              {#if item.items?.length}
                <span class="text-xs text-gray-400">{item.items.filter((i) => i.isCompleted).length}/{item.items.length}</span>
              {/if}
              <span class="text-xs px-2 py-1 rounded-full {item.scope === 'ORGANIZATION' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}">
                {item.scope === 'ORGANIZATION' ? (currentOrg?.name || 'Organization') : (item.projectName || $_('org.scopeProject'))}
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Checklist Modal -->
{#if showCreateModal}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCreateModal = false}>
  <div class="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-6 shadow-xl">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{$_('common.create')} {$_('nav.orgChecklists')}</h3>

    <!-- Project assignment -->
    <div class="mb-4">
      <label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">Project</label>
      <select bind:value={createForm.projectId} class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
        <option value="">Organization (general)</option>
        {#each projects as proj}
          <option value={proj.id}>{proj.name}</option>
        {/each}
      </select>
    </div>

    <div class="mb-4">
      <label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">{$_('checklists.name') || 'Name'}</label>
      <input type="text" bind:value={createForm.name} class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white" placeholder="Checklist name..." />
    </div>

    <div class="mb-4">
      <label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">{$_('checklists.type') || 'Type'}</label>
      <select bind:value={createForm.type} class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
        {#each checklistTypes as t}
          <option value={t}>{t.replace(/_/g, ' ')}</option>
        {/each}
      </select>
    </div>

    <div class="mb-4">
      <label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">{$_('checklists.description') || 'Description'}</label>
      <textarea bind:value={createForm.description} rows="2" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white" placeholder="Optional description..."></textarea>
    </div>

    <div class="flex gap-3 justify-end">
      <button on:click={() => showCreateModal = false} class="px-4 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white cursor-pointer">{$_('finances.cancel') || 'Cancel'}</button>
      <button on:click={createChecklist} disabled={creating || !createForm.name.trim()} class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer">
        {creating ? '...' : $_('common.create')}
      </button>
    </div>
  </div>
</div>
{/if}
