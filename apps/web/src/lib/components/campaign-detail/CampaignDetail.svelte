<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client';
  import CampaignHeader from './CampaignHeader.svelte';
  import DateTimeline from './DateTimeline.svelte';
  import ProgressSummary from './ProgressSummary.svelte';
  import ContentSection from './ContentSection.svelte';
  import EmailsSection from './EmailsSection.svelte';
  import DocumentsSection from './DocumentsSection.svelte';

  export let campaignId: string;
  export let backHref: string;

  let campaign: any = null;
  let loading = true;
  let error: string | null = null;

  const CAMPAIGN_TYPES = ['EMAIL', 'SOCIAL', 'BLOG', 'MULTI_CHANNEL'];
  const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED'];

  const typeLabel: Record<string, string> = {
    EMAIL: 'campaigns.email',
    SOCIAL: 'campaigns.social',
    BLOG: 'campaigns.blog',
    MULTI_CHANNEL: 'campaigns.multiChannel',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'campaigns.draft',
    SCHEDULED: 'campaigns.scheduled',
    ACTIVE: 'campaigns.active',
    PAUSED: 'campaigns.paused',
    COMPLETED: 'campaigns.completed',
  };

  let editing: any = null;
  let editForm = { name: '', type: 'EMAIL', status: 'DRAFT', startDate: '', endDate: '', budget: '' as string | number, goals: '' };
  let editSaving = false;
  let deletingId: string | null = null;

  async function load() {
    loading = true;
    try {
      campaign = await api.get(`/campaigns/${campaignId}`);
      error = null;
    } catch (e: any) {
      error = e.message ?? 'Failed to load';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function onReload(event: CustomEvent<any>) {
    if (event.detail) campaign = event.detail;
    else load();
  }

  function openEdit(event: CustomEvent<any>) {
    const c = event.detail;
    editing = c;
    editForm = {
      name: c.name,
      type: c.type,
      status: c.status,
      startDate: c.startDate ? c.startDate.substring(0, 10) : '',
      endDate: c.endDate ? c.endDate.substring(0, 10) : '',
      budget: c.budget ?? '',
      goals: c.goals ?? '',
    };
  }

  async function saveEdit() {
    if (!editing) return;
    editSaving = true;
    try {
      const payload: any = { name: editForm.name.trim(), type: editForm.type, status: editForm.status };
      payload.startDate = editForm.startDate ? new Date(editForm.startDate).toISOString() : null;
      payload.endDate = editForm.endDate ? new Date(editForm.endDate).toISOString() : null;
      payload.budget = editForm.budget !== '' && editForm.budget !== undefined ? Number(editForm.budget) : null;
      payload.goals = editForm.goals.trim() || null;

      await api.put(`/campaigns/${editing.id}`, payload);
      editing = null;
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      editSaving = false;
    }
  }

  function openDelete(event: CustomEvent<string>) {
    deletingId = event.detail;
  }

  async function confirmDelete() {
    if (!deletingId) return;
    try {
      await api.delete(`/campaigns/${deletingId}`);
      deletingId = null;
      goto(backHref);
    } catch (e: any) {
      alert(e.message);
      deletingId = null;
    }
  }
</script>

<div class="p-4 sm:p-6 max-w-5xl mx-auto">
  <a href={backHref} class="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-gray-700 mb-4">
    ← {$_('common.back')}
  </a>

  {#if loading}
    <div class="space-y-3">
      <div class="animate-pulse bg-surface border rounded-xl h-28"></div>
      <div class="animate-pulse bg-surface border rounded-xl h-20"></div>
      <div class="animate-pulse bg-surface border rounded-xl h-40"></div>
    </div>
  {:else if error}
    <p class="text-red-500">{error}</p>
  {:else if campaign}
    <div class="space-y-4">
      <CampaignHeader {campaign} on:edit={openEdit} on:delete={openDelete} />
      <DateTimeline startDate={campaign.startDate} endDate={campaign.endDate} />
      <ProgressSummary progress={campaign.progress} />
      <ContentSection {campaign} on:reload={onReload} />
      <EmailsSection {campaign} on:reload={onReload} />
      <DocumentsSection {campaign} on:reload={onReload} />
    </div>
  {/if}
</div>

{#if editing}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (editing = null)}>
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-lg">
      <div class="p-6 border-b border-border">
        <h2 class="text-lg font-semibold text-ink">{$_('campaigns.editCampaign')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="ed-name" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.name')} *</label>
          <input id="ed-name" type="text" bind:value={editForm.name} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="ed-type" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.type')}</label>
            <select id="ed-type" bind:value={editForm.type} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {#each CAMPAIGN_TYPES as t}
                <option value={t}>{$_(typeLabel[t])}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="ed-status" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.status')}</label>
            <select id="ed-status" bind:value={editForm.status} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {#each CAMPAIGN_STATUSES as s}
                <option value={s}>{$_(statusLabel[s])}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="ed-start" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.startDate')}</label>
            <input id="ed-start" type="date" bind:value={editForm.startDate} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label for="ed-end" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.endDate')}</label>
            <input id="ed-end" type="date" bind:value={editForm.endDate} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>
        <div>
          <label for="ed-budget" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.budget')}</label>
          <input id="ed-budget" type="number" step="0.01" min="0" bind:value={editForm.budget} class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label for="ed-goals" class="block text-sm font-medium text-ink mb-1.5">{$_('campaigns.goals')}</label>
          <textarea id="ed-goals" bind:value={editForm.goals} rows="3" class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={saveEdit}
          disabled={editSaving}
          class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 disabled:opacity-50 text-sm cursor-pointer"
        >
          {editSaving ? $_('campaigns.saving') : $_('common.save')}
        </button>
        <button on:click={() => (editing = null)} class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if deletingId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => (deletingId = null)}>
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
          <button on:click={confirmDelete} class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 text-sm cursor-pointer">
            {$_('common.delete')}
          </button>
          <button on:click={() => (deletingId = null)} class="flex-1 px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 text-sm cursor-pointer">
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
