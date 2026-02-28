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
    <div class="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    </div>
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
      <h2 class="text-lg font-semibold text-gray-900 mb-4">{$_('onboarding.addFirstProject')}</h2>
      <div class="space-y-4">
        <div>
          <label for="ob-name" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.name')} *</label>
          <input id="ob-name" type="text" bind:value={projectName} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" placeholder={$_('onboarding.projectNamePlaceholder')} />
        </div>
        <div>
          <label for="ob-desc" class="block text-sm font-medium text-gray-700 mb-1">{$_('projects.description')}</label>
          <textarea id="ob-desc" bind:value={projectDescription} rows="2" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none" placeholder={$_('onboarding.projectDescPlaceholder')}></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="ob-website" class="block text-sm font-medium text-gray-700 mb-1">{$_('onboarding.website')}</label>
            <input id="ob-website" type="url" bind:value={projectWebsite} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" placeholder="https://..." />
          </div>
          <div>
            <label for="ob-industry" class="block text-sm font-medium text-gray-700 mb-1">{$_('onboarding.industry')}</label>
            <select id="ob-industry" bind:value={projectIndustry} class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm cursor-pointer">
              <option value="">{$_('onboarding.selectIndustry')}</option>
              <option>SaaS</option><option>E-commerce</option><option>FinTech</option>
              <option>Agency</option><option>B2B</option><option>Other</option>
            </select>
          </div>
        </div>
      </div>
      <div class="mt-6 flex gap-3">
        <button on:click={createAndContinue} disabled={!projectName || loading} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm cursor-pointer">
          {loading ? $_('onboarding.creating') : $_('onboarding.createAndContinue')}
        </button>
        <button on:click={() => goto('/dashboard')} class="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors duration-150 cursor-pointer">
          {$_('onboarding.skip')}
        </button>
      </div>
    {/if}
  </div>
</div>
