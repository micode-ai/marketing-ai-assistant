<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import { goto } from '$app/navigation';
  import type { Project } from '@marketing-ai/shared-types';

  let name = '';
  let projectType = 'WEBSITE';
  let description = '';
  let websiteUrl = '';
  let targetAudience = '';
  let industry = '';
  let loading = false;
  let error = '';

  const projectTypes = ['WEBSITE', 'MOBILE_APP', 'SAAS', 'ECOMMERCE', 'BLOG', 'OTHER'] as const;
  const industries = ['SaaS', 'E-commerce', 'FinTech', 'HealthTech', 'EdTech', 'Agency', 'B2B', 'B2C', 'Marketplace', 'Other'];

  $: showWebsiteUrl = projectType !== 'MOBILE_APP';

  async function handleCreate() {
    if (!$organizationIdStore) { error = 'No organization found'; return; }
    loading = true;
    error = '';
    try {
      const project = await api.post<Project>(`/projects?organizationId=${$organizationIdStore}`, {
        name, projectType, description,
        websiteUrl: showWebsiteUrl ? websiteUrl : undefined,
        targetAudience, industry,
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
    <a href="/dashboard" class="text-sm text-gray-500 hover:text-primary-600 flex items-center gap-1 transition-colors duration-150 cursor-pointer">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      {$_('common.back')}
    </a>
    <h1 class="text-2xl font-bold text-gray-900 mt-3">{$_('projects.create')}</h1>
    <p class="text-gray-500 mt-1 text-sm">{$_('projects.createDesc')}</p>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
  {/if}

  <div class="bg-white rounded-xl border border-gray-200 border-t-4 border-t-primary-500 p-6">
    <form on:submit|preventDefault={handleCreate} class="space-y-5">
      <div>
        <label for="new-name" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.name')} <span class="text-red-400">*</span></label>
        <input id="new-name" type="text" bind:value={name} required class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" placeholder={$_('projects.namePlaceholder')} />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">{$_('projects.projectType')}</label>
        <div class="grid grid-cols-3 gap-2">
          {#each projectTypes as pt}
            <button
              type="button"
              on:click={() => projectType = pt}
              class="px-3 py-2 text-sm rounded-lg border transition-colors duration-150 cursor-pointer {projectType === pt ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}"
            >
              {$_(`projects.types.${pt}`)}
            </button>
          {/each}
        </div>
      </div>
      <div>
        <label for="new-desc" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.description')}</label>
        <textarea id="new-desc" bind:value={description} rows="3" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm resize-none" placeholder={$_('projects.descriptionPlaceholder')}></textarea>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#if showWebsiteUrl}
          <div>
            <label for="new-website" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.website')}</label>
            <input id="new-website" type="url" bind:value={websiteUrl} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder={$_('projects.websitePlaceholder')} />
          </div>
        {/if}
        <div>
          <label for="new-industry" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.industry')}</label>
          <select id="new-industry" bind:value={industry} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
            <option value="">{$_('projects.selectIndustry')}</option>
            {#each industries as ind}
              <option value={ind}>{ind}</option>
            {/each}
          </select>
        </div>
      </div>
      <div>
        <label for="new-audience" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.targetAudience')}</label>
        <textarea id="new-audience" bind:value={targetAudience} rows="2" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm resize-none" placeholder={$_('projects.targetAudiencePlaceholder')}></textarea>
      </div>
      <div class="flex gap-3 pt-2 border-t border-gray-100">
        <button type="submit" disabled={loading || !name} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2 cursor-pointer">
          {#if loading}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {loading ? $_('common.loading') : $_('projects.create')}
        </button>
        <a href="/dashboard" class="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-150 text-center text-sm cursor-pointer">
          {$_('common.cancel')}
        </a>
      </div>
    </form>
  </div>
</div>
