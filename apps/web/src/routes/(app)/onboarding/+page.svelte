<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client';
  import { organizationIdStore, projectsStore } from '$lib/stores/projects';
  import type { Project } from '@marketing-ai/shared-types';

  let step = 1;

  // Step 1 — product info
  let projectName = '';
  let projectType = 'WEBSITE';
  let projectDescription = '';
  let projectWebsite = '';
  let projectIndustry = '';

  const projectTypes = ['WEBSITE', 'MOBILE_APP', 'SAAS', 'ECOMMERCE', 'BLOG', 'OTHER'] as const;
  $: showWebsiteUrl = projectType !== 'MOBILE_APP';

  // Step 2 — audience
  let audienceAgeRange = '';
  let audienceDescription = '';
  let audiencePainPoints = '';

  // Step 3 — goals
  let selectedGoals: string[] = [];
  const goalOptions = [
    { value: 'get_visitors',     emoji: '📈', labelKey: 'onboarding.goals.getVisitors' },
    { value: 'convert',          emoji: '💰', labelKey: 'onboarding.goals.convert' },
    { value: 'build_email_list', emoji: '📧', labelKey: 'onboarding.goals.emailList' },
    { value: 'product_hunt',     emoji: '🚀', labelKey: 'onboarding.goals.productHunt' },
    { value: 'grow_social',      emoji: '📣', labelKey: 'onboarding.goals.social' },
    { value: 'brand_awareness',  emoji: '✨', labelKey: 'onboarding.goals.brand' },
  ];

  // Step 4 — confirmation
  let planLoading = false;
  let createdProjectId = '';

  function nextStep() { step++; }
  function prevStep() { step--; }

  function toggleGoal(v: string) {
    selectedGoals = selectedGoals.includes(v)
      ? selectedGoals.filter(g => g !== v)
      : [...selectedGoals, v];
  }

  async function generatePlan() {
    if (!$organizationIdStore || !projectName) return;
    planLoading = true;
    try {
      const project = await api.post<Project>(`/projects?organizationId=${$organizationIdStore}`, {
        name: projectName,
        projectType,
        description: projectDescription,
        websiteUrl: showWebsiteUrl ? projectWebsite : undefined,
        industry: projectIndustry,
        targetAudience: audienceDescription,
        goals: { primary: selectedGoals[0] || 'GENERAL', kpis: selectedGoals },
      });
      createdProjectId = project.id;
      projectsStore.set([project]);

      // Fire-and-forget STRATEGY agent
      api.post('/agent/run', {
        projectId: project.id,
        agentType: 'STRATEGY',
        input: {
          strategyType: 'GO_TO_MARKET',
          context: `Audience: ${audienceDescription}. Age range: ${audienceAgeRange}. Pain points: ${audiencePainPoints}. Goals: ${selectedGoals.join(', ')}. Beginner entrepreneur.`,
        },
      }).catch(() => {});

      step = 4;
    } finally {
      planLoading = false;
    }
  }

  function acceptAndStart() {
    goto(`/projects/${createdProjectId}/overview`);
  }
</script>

<div class="p-6 max-w-lg mx-auto">
  <div class="text-center mb-8">
    <div class="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    </div>
    <h1 class="text-2xl font-bold text-ink">{$_('onboarding.welcome')}</h1>
    <p class="text-ink-muted mt-2 text-sm">{$_('onboarding.welcomeDesc')}</p>
  </div>

  <!-- Step indicator -->
  <div class="flex justify-center gap-2 mb-8">
    {#each [1, 2, 3, 4] as s}
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold {step >= s ? 'bg-brand text-white' : 'bg-gray-200 text-ink-muted'}">{s}</div>
        {#if s < 4}<div class="w-8 h-0.5 {step > s ? 'bg-brand' : 'bg-gray-200'}"></div>{/if}
      </div>
    {/each}
  </div>

  <div class="bg-surface rounded-2xl border border-border p-6">
    <!-- Step 1: Product info -->
    {#if step === 1}
      <h2 class="text-lg font-semibold text-ink mb-1">{$_('onboarding.addFirstProject')}</h2>
      <p class="text-sm text-ink-muted mb-4">{$_('onboarding.step1Desc')}</p>
      <div class="space-y-4">
        <div>
          <label for="ob-name" class="block text-sm font-medium text-ink mb-1">{$_('projects.name')} *</label>
          <input id="ob-name" type="text" bind:value={projectName} class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" placeholder={$_('onboarding.projectNamePlaceholder')} />
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-2">{$_('projects.projectType')}</label>
          <div class="grid grid-cols-3 gap-2">
            {#each projectTypes as pt}
              <button
                type="button"
                on:click={() => projectType = pt}
                class="px-3 py-2 text-sm rounded-lg border transition-colors duration-150 cursor-pointer {projectType === pt ? 'border-primary-500 bg-brand-subtle/10 text-brand font-medium' : 'border-border text-ink-muted hover:border-gray-300 hover:bg-surface-2'}"
              >
                {$_(`projects.types.${pt}`)}
              </button>
            {/each}
          </div>
        </div>
        <div>
          <label for="ob-desc" class="block text-sm font-medium text-ink mb-1">{$_('projects.description')}</label>
          <textarea id="ob-desc" bind:value={projectDescription} rows="2" class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none" placeholder={$_('onboarding.projectDescPlaceholder')}></textarea>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {#if showWebsiteUrl}
            <div>
              <label for="ob-website" class="block text-sm font-medium text-ink mb-1">{$_('onboarding.website')}</label>
              <input id="ob-website" type="url" bind:value={projectWebsite} class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" placeholder="https://..." />
            </div>
          {/if}
          <div>
            <label for="ob-industry" class="block text-sm font-medium text-ink mb-1">{$_('onboarding.industry')}</label>
            <select id="ob-industry" bind:value={projectIndustry} class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm cursor-pointer">
              <option value="">{$_('onboarding.selectIndustry')}</option>
              <option>SaaS</option><option>E-commerce</option><option>FinTech</option>
              <option>Agency</option><option>B2B</option><option>Other</option>
            </select>
          </div>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-between">
        <button on:click={() => goto('/dashboard')} class="text-sm text-ink-subtle hover:text-gray-600 transition-colors duration-150 cursor-pointer">
          {$_('onboarding.skip')}
        </button>
        <button on:click={nextStep} disabled={!projectName} class="bg-brand text-white px-6 py-2.5 rounded-lg font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm cursor-pointer">
          {$_('onboarding.createAndContinue')}
        </button>
      </div>
    {/if}

    <!-- Step 2: Audience -->
    {#if step === 2}
      <h2 class="text-lg font-semibold text-ink mb-1">{$_('onboarding.step2Title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{$_('onboarding.step2Desc')}</p>
      <div class="space-y-4">
        <div>
          <label for="ob-age" class="block text-sm font-medium text-ink mb-1">{$_('onboarding.audienceAge')}</label>
          <select id="ob-age" bind:value={audienceAgeRange} class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm cursor-pointer">
            <option value="">{$_('onboarding.audienceAgeAny')}</option>
            <option value="13-24">13–24</option>
            <option value="25-44">25–44</option>
            <option value="45-65">45–65</option>
            <option value="business">{$_('onboarding.audienceAgeB2B')}</option>
          </select>
        </div>
        <div>
          <label for="ob-audience" class="block text-sm font-medium text-ink mb-1">{$_('onboarding.audienceLabel')}</label>
          <textarea id="ob-audience" bind:value={audienceDescription} rows="2" class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none" placeholder={$_('onboarding.audiencePlaceholder')}></textarea>
        </div>
        <div>
          <label for="ob-pain" class="block text-sm font-medium text-ink mb-1">{$_('onboarding.painPointsLabel')}</label>
          <textarea id="ob-pain" bind:value={audiencePainPoints} rows="2" class="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none" placeholder={$_('onboarding.painPointsPlaceholder')}></textarea>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-between">
        <button on:click={prevStep} class="text-sm text-ink-muted hover:text-gray-700 transition-colors duration-150 cursor-pointer flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
          {$_('common.back')}
        </button>
        <button on:click={nextStep} disabled={!audienceDescription} class="bg-brand text-white px-6 py-2.5 rounded-lg font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.next')} →
        </button>
      </div>
    {/if}

    <!-- Step 3: Goals -->
    {#if step === 3}
      <h2 class="text-lg font-semibold text-ink mb-1">{$_('onboarding.step3Title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{$_('onboarding.step3Desc')}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {#each goalOptions as goal}
          <button
            on:click={() => toggleGoal(goal.value)}
            class="flex items-center gap-2 p-3 rounded-lg border text-left transition-all duration-150 cursor-pointer text-sm
              {selectedGoals.includes(goal.value)
                ? 'border-primary-500 bg-brand-subtle/10 text-brand font-medium'
                : 'border-border hover:border-primary-300 hover:bg-surface-2 text-ink'}"
          >
            <span class="text-base">{goal.emoji}</span>
            <span class="leading-tight">{$_(goal.labelKey)}</span>
          </button>
        {/each}
      </div>
      <div class="mt-6 flex items-center justify-between">
        <button on:click={prevStep} class="text-sm text-ink-muted hover:text-gray-700 transition-colors duration-150 cursor-pointer flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
          {$_('common.back')}
        </button>
        <button on:click={generatePlan} disabled={selectedGoals.length === 0 || planLoading}
          class="bg-brand text-white px-6 py-2.5 rounded-lg font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 text-sm cursor-pointer">
          {planLoading ? $_('onboarding.generatingPlan') : $_('onboarding.createPlan')}
        </button>
      </div>
    {/if}

    <!-- Step 4: Success -->
    {#if step === 4}
      <div class="text-center">
        <div class="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink mb-1">{$_('onboarding.step4Title')}</h2>
        <p class="text-sm text-ink-muted mb-5">{$_('onboarding.planReady')}</p>
        <div class="bg-surface-2 rounded-xl p-4 text-left space-y-2.5 mb-6">
          <div class="flex items-start gap-2.5">
            <div class="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <p class="text-sm text-ink">{$_('onboarding.planReadyAudience')}</p>
          </div>
          <div class="flex items-start gap-2.5">
            <div class="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <p class="text-sm text-ink">{$_('onboarding.planReadyPlan')}</p>
          </div>
          <div class="flex items-start gap-2.5">
            <div class="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <p class="text-sm text-ink">{$_('onboarding.planReadyGoals', { values: { goals: selectedGoals.join(', ') } })}</p>
          </div>
        </div>
        <button on:click={acceptAndStart}
          class="w-full bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 text-sm cursor-pointer">
          {$_('onboarding.acceptAndStart')}
        </button>
      </div>
    {/if}
  </div>
</div>
