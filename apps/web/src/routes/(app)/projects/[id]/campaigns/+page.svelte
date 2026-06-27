<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  let campaigns: any[] = [];
  let loading = true;
  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  // Reload when the URL project id changes. SvelteKit reuses this component
  // across /projects/A → /projects/B, so onMount does NOT fire again — without
  // this watcher the page keeps showing the previous project's data.
  let mounted = false;
  let prevProjectId: string | undefined = '';
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    reloadForProject();
  }

  async function reloadForProject() {
    loading = true;
    campaigns = [];
    try {
      campaigns = await api.get<any[]>('/campaigns', { projectId });
    } finally {
      loading = false;
    }
  }

  // Create modal
  let showCreateModal = false;
  let creating = false;
  let createForm = { name: '', type: 'EMAIL', startDate: '', endDate: '', budget: '' as string | number, goals: '' };

  // Edit modal
  let editingCampaign: any = null;
  let editForm = { name: '', type: 'EMAIL', status: 'DRAFT', startDate: '', endDate: '', budget: '' as string | number, goals: '' };
  let editSaving = false;

  // Delete confirm
  let deletingId: string | null = null;

  const CAMPAIGN_TYPES = ['EMAIL', 'SOCIAL', 'BLOG', 'MULTI_CHANNEL'];
  const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED'];

  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-surface-2 text-ink-muted',
    SCHEDULED: 'bg-yellow-100 text-yellow-700',
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-orange-100 text-orange-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };

  const statusBorderAccent: Record<string, string> = {
    DRAFT: 'border-l-gray-300',
    SCHEDULED: 'border-l-yellow-400',
    ACTIVE: 'border-l-green-500',
    PAUSED: 'border-l-orange-400',
    COMPLETED: 'border-l-blue-500',
  };

  const typeBadge: Record<string, string> = {
    EMAIL: 'bg-indigo-100 text-indigo-700',
    SOCIAL: 'bg-green-100 text-green-700',
    BLOG: 'bg-purple-100 text-purple-700',
    MULTI_CHANNEL: 'bg-orange-100 text-orange-700',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'campaigns.draft',
    SCHEDULED: 'campaigns.scheduled',
    ACTIVE: 'campaigns.active',
    PAUSED: 'campaigns.paused',
    COMPLETED: 'campaigns.completed',
  };

  const typeLabel: Record<string, string> = {
    EMAIL: 'campaigns.email',
    SOCIAL: 'campaigns.social',
    BLOG: 'campaigns.blog',
    MULTI_CHANNEL: 'campaigns.multiChannel',
  };

  onMount(async () => {
    campaigns = await api.get<any[]>('/campaigns', { projectId });
    loading = false;
    prevProjectId = projectId;
    mounted = true;
  });

  async function createCampaign() {
    if (!createForm.name.trim()) return;
    creating = true;
    try {
      const payload: any = { projectId, name: createForm.name.trim(), type: createForm.type };
      if (createForm.startDate) payload.startDate = new Date(createForm.startDate).toISOString();
      if (createForm.endDate) payload.endDate = new Date(createForm.endDate).toISOString();
      if (createForm.budget !== '' && createForm.budget !== undefined) payload.budget = Number(createForm.budget);
      if (createForm.goals.trim()) payload.goals = createForm.goals.trim();

      const created = await api.post<any>('/campaigns', payload);
      campaigns = [created, ...campaigns];
      showCreateModal = false;
      createForm = { name: '', type: 'EMAIL', startDate: '', endDate: '', budget: '', goals: '' };
    } catch (e: any) {
      alert(e.message);
    } finally {
      creating = false;
    }
  }

  function openEdit(campaign: any) {
    editingCampaign = campaign;
    editForm = {
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      startDate: campaign.startDate ? campaign.startDate.substring(0, 10) : '',
      endDate: campaign.endDate ? campaign.endDate.substring(0, 10) : '',
      budget: campaign.budget ?? '',
      goals: campaign.goals ?? '',
    };
  }

  async function saveEdit() {
    if (!editingCampaign) return;
    editSaving = true;
    try {
      const payload: any = { name: editForm.name.trim(), type: editForm.type, status: editForm.status };
      payload.startDate = editForm.startDate ? new Date(editForm.startDate).toISOString() : null;
      payload.endDate = editForm.endDate ? new Date(editForm.endDate).toISOString() : null;
      payload.budget = editForm.budget !== '' && editForm.budget !== undefined ? Number(editForm.budget) : null;
      payload.goals = editForm.goals.trim() || null;

      const updated = await api.put<any>(`/campaigns/${editingCampaign.id}`, payload);
      campaigns = campaigns.map(c => c.id === updated.id ? { ...c, ...updated } : c);
      editingCampaign = null;
    } catch (e: any) {
      alert(e.message);
    } finally {
      editSaving = false;
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const updated = await api.put<any>(`/campaigns/${id}`, { status });
      campaigns = campaigns.map(c => c.id === id ? { ...c, ...updated } : c);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteCampaign(id: string) {
    try {
      await api.delete(`/campaigns/${id}`);
      campaigns = campaigns.filter(c => c.id !== id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  }
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="campaigns" titleKey="hints.campaigns.title" descKey="hints.campaigns.desc" />
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('campaigns.title')}</h1>
    <button
      on:click={() => showCreateModal = true}
      class="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {$_('campaigns.create')}
    </button>
  </div>

  {#if loading}
    <div class="space-y-3">
      {#each Array(4) as _}
        <div class="bg-surface rounded-xl border border-border p-4 animate-pulse h-24"></div>
      {/each}
    </div>
  {:else if campaigns.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-brand-subtle/10 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-ink mb-2">{$_('campaigns.empty')}</h2>
      <p class="text-ink-muted mb-6">{$_('campaigns.emptyDesc')}</p>
      <button
        on:click={() => showCreateModal = true}
        class="bg-brand text-white px-6 py-3 rounded-xl font-medium hover:brightness-110 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('campaigns.create')}
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each campaigns as campaign}
        <a href="/projects/{projectId}/campaigns/{campaign.id}" class="block bg-surface rounded-xl border border-border border-l-4 {statusBorderAccent[campaign.status] || 'border-l-gray-300'} p-5 hover:shadow-sm transition-shadow duration-150 cursor-pointer">
          <div class="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5 mb-2">
                <span class="text-xs px-2 py-0.5 rounded font-medium {typeBadge[campaign.type] || 'bg-surface-2 text-ink-muted'}">{$_(typeLabel[campaign.type] || 'campaigns.email')}</span>
                <span class="text-xs px-2 py-0.5 rounded {statusBadge[campaign.status] || 'bg-surface-2 text-ink-muted'}">{$_(statusLabel[campaign.status] || 'campaigns.draft')}</span>
                {#if campaign._count?.content > 0}
                  <span class="text-xs px-2 py-0.5 bg-surface-2 text-ink-muted rounded">{$_('campaigns.contentCount', { values: { count: campaign._count.content } })}</span>
                {/if}
              </div>
              <h3 class="font-medium text-ink truncate">{campaign.name}</h3>
              <div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-ink-muted">
                {#if campaign.startDate || campaign.endDate}
                  <span class="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    {#if campaign.startDate}{formatDate(campaign.startDate)}{/if}
                    {#if campaign.startDate && campaign.endDate}&nbsp;—&nbsp;{/if}
                    {#if campaign.endDate}{formatDate(campaign.endDate)}{/if}
                  </span>
                {/if}
                {#if campaign.budget}
                  <span class="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    {formatCurrency(campaign.budget)}
                  </span>
                {/if}
              </div>
              {#if campaign.goals}
                <p class="text-sm text-ink-muted mt-1.5 line-clamp-1">{campaign.goals}</p>
              {/if}
            </div>
            <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <select
                value={campaign.status}
                on:click|preventDefault|stopPropagation
                on:change={e => updateStatus(campaign.id, (e.target as HTMLSelectElement).value)}
                class="text-xs px-2 py-1.5 border border-border rounded-lg bg-surface hover:bg-surface-2 transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {#each CAMPAIGN_STATUSES as s}
                  <option value={s}>{$_(statusLabel[s])}</option>
                {/each}
              </select>
              <button
                on:click|preventDefault|stopPropagation={() => openEdit(campaign)}
                class="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 cursor-pointer"
              >
                {$_('common.edit')}
              </button>
              <button
                on:click|preventDefault|stopPropagation={() => deletingId = campaign.id}
                class="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                title={$_('campaigns.deleteCampaign')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- Create campaign modal -->
{#if showCreateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCreateModal = false}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[calc(100vh-2rem)] flex flex-col">
      <div class="p-6 border-b border-border flex items-center gap-2.5 flex-shrink-0">
        <div class="w-8 h-8 bg-brand-subtle/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('campaigns.create')}</h2>
      </div>
      <div class="p-6 space-y-4 overflow-y-auto flex-1">
        <div>
          <label for="c-name" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.name')} *</label>
          <input id="c-name" type="text" bind:value={createForm.name} placeholder={$_('campaigns.namePlaceholder')} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label for="c-type" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.type')}</label>
          <select id="c-type" bind:value={createForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            {#each CAMPAIGN_TYPES as t}
              <option value={t}>{$_(typeLabel[t])}</option>
            {/each}
          </select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="c-start" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.startDate')}</label>
            <input id="c-start" type="date" bind:value={createForm.startDate} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label for="c-end" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.endDate')}</label>
            <input id="c-end" type="date" bind:value={createForm.endDate} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
        </div>
        <div>
          <label for="c-budget" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.budget')}</label>
          <input id="c-budget" type="number" step="0.01" min="0" bind:value={createForm.budget} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label for="c-goals" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.goals')}</label>
          <textarea id="c-goals" bind:value={createForm.goals} rows="3" placeholder={$_('campaigns.goalsPlaceholder')} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3 flex-shrink-0">
        <button
          on:click={createCampaign}
          disabled={creating || !createForm.name.trim()}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if creating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('campaigns.creating')}
          {:else}
            {$_('campaigns.create')}
          {/if}
        </button>
        <button on:click={() => showCreateModal = false} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit campaign modal -->
{#if editingCampaign}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => editingCampaign = null}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col">
      <div class="p-6 border-b border-border flex items-center gap-2.5 flex-shrink-0">
        <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('campaigns.editCampaign')}</h2>
      </div>
      <div class="p-6 space-y-4 overflow-y-auto flex-1">
        <div>
          <label for="e-name" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.name')} *</label>
          <input id="e-name" type="text" bind:value={editForm.name} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="e-type" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.type')}</label>
            <select id="e-type" bind:value={editForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {#each CAMPAIGN_TYPES as t}
                <option value={t}>{$_(typeLabel[t])}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="e-status" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.status')}</label>
            <select id="e-status" bind:value={editForm.status} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {#each CAMPAIGN_STATUSES as s}
                <option value={s}>{$_(statusLabel[s])}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="e-start" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.startDate')}</label>
            <input id="e-start" type="date" bind:value={editForm.startDate} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label for="e-end" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.endDate')}</label>
            <input id="e-end" type="date" bind:value={editForm.endDate} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
        </div>
        <div>
          <label for="e-budget" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.budget')}</label>
          <input id="e-budget" type="number" step="0.01" min="0" bind:value={editForm.budget} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label for="e-goals" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.goals')}</label>
          <textarea id="e-goals" bind:value={editForm.goals} rows="3" placeholder={$_('campaigns.goalsPlaceholder')} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3 flex-shrink-0">
        <button
          on:click={saveEdit}
          disabled={editSaving}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if editSaving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('campaigns.saving')}
          {:else}
            {$_('common.save')}
          {/if}
        </button>
        <button on:click={() => editingCampaign = null} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete confirm modal -->
{#if deletingId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => deletingId = null}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6">
        <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink mb-2">{$_('campaigns.deleteCampaign')}</h2>
        <p class="text-sm text-ink-muted mb-6">{$_('campaigns.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteCampaign(deletingId!)}
            class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
          >
            {$_('common.delete')}
          </button>
          <button on:click={() => deletingId = null} class="flex-1 px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer">
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
