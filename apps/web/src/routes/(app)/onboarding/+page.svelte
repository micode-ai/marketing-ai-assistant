<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import type { Project } from '@marketing-ai/shared-types';

  let step = 1;
  let projectName = '';
  let projectDescription = '';
  let projectWebsite = '';
  let projectIndustry = '';
  let loading = false;

  async function createAndContinue() {
    if (!$organizationIdStore || !projectName) return;
    loading = true;
    try {
      const project = await api.post<Project>(`/projects?organizationId=${$organizationIdStore}`, {
        name: projectName, description: projectDescription, websiteUrl: projectWebsite, industry: projectIndustry,
      });
      projectsStore.set([project]);
      goto(`/projects/${project.id}/overview`);
    } finally { loading = false; }
  }
</script>

<div class="p-6 max-w-lg mx-auto">
  <div class="text-center mb-8">
    <div class="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">M</div>
    <h1 class="text-2xl font-bold text-gray-900">{$_('onboarding.welcome')}</h1>
    <p class="text-gray-500 mt-2 text-sm">{$_('onboarding.welcomeDesc')}</p>
  </div>

  <div class="flex justify-center gap-2 mb-8">
    {#each [1, 2] as s}
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold {step >= s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}">{s}</div>
        {#if s < 2}<div class="w-8 h-0.5 {step > s ? 'bg-primary-600' : 'bg-gray-200'}"></div>{/if}
      </div>
    {/each}
  </div>

  <div class="bg-white rounded-2xl border border-gray-200 p-6">
    {#if step === 1}
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Add Your First Project</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.name')} *</label>
          <input type="text" bind:value={projectName} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="My SaaS Product" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.description')}</label>
          <textarea bind:value={projectDescription} rows="2" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm resize-none" placeholder="What does your product do?"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input type="url" bind:value={projectWebsite} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" placeholder="https://..." />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <select bind:value={projectIndustry} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
              <option value="">Select...</option>
              <option>SaaS</option><option>E-commerce</option><option>FinTech</option>
              <option>Agency</option><option>B2B</option><option>Other</option>
            </select>
          </div>
        </div>
      </div>
      <div class="mt-6 flex gap-3">
        <button on:click={createAndContinue} disabled={!projectName || loading} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition text-sm">
          {loading ? 'Creating...' : 'Create Project & Continue →'}
        </button>
        <button on:click={() => goto('/dashboard')} class="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition">
          {$_('onboarding.skip')}
        </button>
      </div>
    {/if}
  </div>
</div>
