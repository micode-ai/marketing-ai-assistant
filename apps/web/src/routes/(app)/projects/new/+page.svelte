<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import { goto } from '$app/navigation';
  import type { Project } from '@marketing-ai/shared-types';

  let name = '';
  let description = '';
  let websiteUrl = '';
  let targetAudience = '';
  let industry = '';
  let loading = false;
  let error = '';

  const industries = ['SaaS', 'E-commerce', 'FinTech', 'HealthTech', 'EdTech', 'Agency', 'B2B', 'B2C', 'Marketplace', 'Other'];

  async function handleCreate() {
    if (!$organizationIdStore) { error = 'No organization found'; return; }
    loading = true;
    error = '';
    try {
      const project = await api.post<Project>(`/projects?organizationId=${$organizationIdStore}`, {
        name, description, websiteUrl, targetAudience, industry,
      });
      projectsStore.update(p => [...p, project]);
      goto(`/projects/${project.id}/overview`);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto p-6">
  <div class="mb-6">
    <a href="/dashboard" class="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      {$_('common.back')}
    </a>
    <h1 class="text-2xl font-bold text-gray-900 mt-3">{$_('projects.create')}</h1>
    <p class="text-gray-500 mt-1 text-sm">Add a new project to manage its marketing</p>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
  {/if}

  <div class="bg-white rounded-xl border border-gray-200 p-6">
    <form on:submit|preventDefault={handleCreate} class="space-y-5">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.name')} <span class="text-red-400">*</span></label>
        <input type="text" bind:value={name} required class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" placeholder={$_('projects.namePlaceholder')} />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.description')}</label>
        <textarea bind:value={description} rows="3" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm resize-none" placeholder={$_('projects.descriptionPlaceholder')}></textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.website')}</label>
          <input type="url" bind:value={websiteUrl} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="https://example.com" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.industry')}</label>
          <select bind:value={industry} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
            <option value="">Select industry</option>
            {#each industries as ind}
              <option value={ind}>{ind}</option>
            {/each}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.targetAudience')}</label>
        <textarea bind:value={targetAudience} rows="2" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm resize-none" placeholder={$_('projects.targetAudiencePlaceholder')}></textarea>
      </div>
      <div class="flex gap-3 pt-2 border-t border-gray-100">
        <button type="submit" disabled={loading || !name} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm">
          {loading ? $_('common.loading') : $_('projects.create')}
        </button>
        <a href="/dashboard" class="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-center text-sm">
          {$_('common.cancel')}
        </a>
      </div>
    </form>
  </div>
</div>
