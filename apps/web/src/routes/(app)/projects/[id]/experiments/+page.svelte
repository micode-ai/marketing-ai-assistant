<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  let experiments: any[] = [];
  let loading = true;
  $: projectId = $page.params['id'];

  // Create modal
  let showCreateModal = false;
  let creating = false;
  let createForm = { name: '', type: 'EMAIL_SUBJECT' };
  let variants: { name: string; isControl: boolean }[] = [
    { name: '', isControl: true },
    { name: '', isControl: false },
  ];

  // Delete confirm
  let deletingId: string | null = null;

  // Results drawer
  let resultsFor: any = null;
  let resultsData: any = null;
  let resultsLoading = false;

  const EXPERIMENT_TYPES = ['EMAIL_SUBJECT', 'CONTENT_VARIANT', 'LANDING_PAGE'];
  const EXPERIMENT_STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'];

  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    RUNNING: 'bg-green-100 text-green-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };

  const statusBorderAccent: Record<string, string> = {
    DRAFT: 'border-l-gray-300',
    RUNNING: 'border-l-green-500',
    PAUSED: 'border-l-yellow-400',
    COMPLETED: 'border-l-blue-500',
  };

  const typeBadge: Record<string, string> = {
    EMAIL_SUBJECT: 'bg-purple-100 text-purple-700',
    CONTENT_VARIANT: 'bg-blue-100 text-blue-700',
    LANDING_PAGE: 'bg-amber-100 text-amber-700',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'experiments.statusDraft',
    RUNNING: 'experiments.statusRunning',
    PAUSED: 'experiments.statusPaused',
    COMPLETED: 'experiments.statusCompleted',
  };

  const typeLabel: Record<string, string> = {
    EMAIL_SUBJECT: 'experiments.typeEmailSubject',
    CONTENT_VARIANT: 'experiments.typeContentVariant',
    LANDING_PAGE: 'experiments.typeLandingPage',
  };

  onMount(async () => {
    experiments = await api.get<any[]>('/ab-testing', { projectId });
    loading = false;
  });

  async function createExperiment() {
    if (!createForm.name.trim()) return;
    const validVariants = variants.filter(v => v.name.trim());
    if (validVariants.length < 2) return;
    creating = true;
    try {
      const payload = {
        projectId,
        name: createForm.name.trim(),
        type: createForm.type,
        variants: validVariants.map(v => ({ name: v.name.trim(), isControl: v.isControl })),
      };
      const created = await api.post<any>('/ab-testing', payload);
      experiments = [created, ...experiments];
      showCreateModal = false;
      createForm = { name: '', type: 'EMAIL_SUBJECT' };
      variants = [
        { name: '', isControl: true },
        { name: '', isControl: false },
      ];
    } catch (e: any) {
      alert(e.message);
    } finally {
      creating = false;
    }
  }

  function addVariant() {
    variants = [...variants, { name: '', isControl: false }];
  }

  function removeVariant(index: number) {
    if (variants.length <= 2) return;
    const wasControl = variants[index].isControl;
    variants = variants.filter((_, i) => i !== index);
    if (wasControl && variants.length > 0) {
      variants[0].isControl = true;
      variants = [...variants];
    }
  }

  function setControl(index: number) {
    variants = variants.map((v, i) => ({ ...v, isControl: i === index }));
  }

  async function startExperiment(id: string) {
    try {
      const updated = await api.post<any>(`/ab-testing/${id}/start`);
      experiments = experiments.map(e => e.id === id ? { ...e, ...updated } : e);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function pauseExperiment(id: string) {
    try {
      const updated = await api.post<any>(`/ab-testing/${id}/pause`);
      experiments = experiments.map(e => e.id === id ? { ...e, ...updated } : e);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function completeExperiment(id: string) {
    try {
      const updated = await api.post<any>(`/ab-testing/${id}/complete`);
      experiments = experiments.map(e => e.id === id ? { ...e, ...updated } : e);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteExperiment(id: string) {
    try {
      await api.delete(`/ab-testing/${id}`);
      experiments = experiments.filter(e => e.id !== id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  async function viewResults(experiment: any) {
    resultsFor = experiment;
    resultsLoading = true;
    resultsData = null;
    try {
      resultsData = await api.get<any>(`/ab-testing/${experiment.id}/results`);
    } catch (e: any) {
      alert(e.message);
      resultsFor = null;
    } finally {
      resultsLoading = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function conversionRate(variant: any): number {
    if (!variant.impressions || variant.impressions === 0) return 0;
    return (variant.conversions / variant.impressions) * 100;
  }

  function maxConversionRate(variantsList: any[]): number {
    if (!variantsList || variantsList.length === 0) return 0;
    return Math.max(...variantsList.map(v => conversionRate(v)), 0.01);
  }

  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('experiments.title')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('experiments.subtitle')}</p>
    </div>
    <button
      on:click={() => showCreateModal = true}
      class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {$_('experiments.create')}
    </button>
  </div>

  {#if loading}
    <div class="space-y-4">
      {#each Array(3) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-40"></div>
      {/each}
    </div>
  {:else if experiments.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('experiments.empty')}</h2>
      <p class="text-gray-500 mb-6">{$_('experiments.emptyDesc')}</p>
      <button
        on:click={() => showCreateModal = true}
        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('experiments.create')}
      </button>
    </div>
  {:else}
    <div class="space-y-4">
      {#each experiments as experiment}
        {@const expVariants = experiment.variants || []}
        {@const maxRate = maxConversionRate(expVariants)}
        <div class="bg-white rounded-xl border border-gray-200 border-l-4 {statusBorderAccent[experiment.status] || 'border-l-gray-300'} p-5 hover:shadow-sm transition-shadow duration-150">
          <!-- Header row -->
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5 mb-2">
                <span class="text-xs px-2 py-0.5 rounded font-medium {typeBadge[experiment.type] || 'bg-gray-100 text-gray-600'}">
                  {$_(typeLabel[experiment.type] || 'experiments.typeEmailSubject')}
                </span>
                <span class="text-xs px-2 py-0.5 rounded {statusBadge[experiment.status] || 'bg-gray-100 text-gray-600'}">
                  {$_(statusLabel[experiment.status] || 'experiments.statusDraft')}
                </span>
                {#if experiment.winnerId}
                  <span class="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.853m0 0H11m3 0a6.023 6.023 0 0 0 2.77.854" />
                    </svg>
                    {$_('experiments.winnerDeclared')}
                  </span>
                {/if}
              </div>
              <h3 class="font-medium text-gray-900">{experiment.name}</h3>
              <div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                {#if experiment.startDate || experiment.endDate}
                  <span class="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    {#if experiment.startDate}{formatDate(experiment.startDate)}{/if}
                    {#if experiment.startDate && experiment.endDate}&nbsp;--&nbsp;{/if}
                    {#if experiment.endDate}{formatDate(experiment.endDate)}{/if}
                  </span>
                {/if}
                <span class="flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                  {$_('experiments.variantCount', { values: { count: expVariants.length } })}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 flex-shrink-0">
              {#if experiment.status === 'DRAFT'}
                <button
                  on:click={() => startExperiment(experiment.id)}
                  class="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors duration-150 cursor-pointer"
                >
                  {$_('experiments.start')}
                </button>
              {/if}
              {#if experiment.status === 'RUNNING'}
                <button
                  on:click={() => pauseExperiment(experiment.id)}
                  class="text-xs px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors duration-150 cursor-pointer"
                >
                  {$_('experiments.pause')}
                </button>
                <button
                  on:click={() => completeExperiment(experiment.id)}
                  class="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors duration-150 cursor-pointer"
                >
                  {$_('experiments.complete')}
                </button>
              {/if}
              {#if experiment.status === 'PAUSED'}
                <button
                  on:click={() => startExperiment(experiment.id)}
                  class="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors duration-150 cursor-pointer"
                >
                  {$_('experiments.resume')}
                </button>
                <button
                  on:click={() => completeExperiment(experiment.id)}
                  class="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors duration-150 cursor-pointer"
                >
                  {$_('experiments.complete')}
                </button>
              {/if}
              {#if experiment.status === 'RUNNING' || experiment.status === 'COMPLETED'}
                <button
                  on:click={() => viewResults(experiment)}
                  class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                >
                  {$_('experiments.viewResults')}
                </button>
              {/if}
              <button
                on:click={() => deletingId = experiment.id}
                class="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                title={$_('experiments.deleteExperiment')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Variants table -->
          {#if expVariants.length > 0}
            <div class="border border-gray-100 rounded-lg overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th class="px-4 py-2.5 font-medium">{$_('experiments.variant')}</th>
                    <th class="px-4 py-2.5 font-medium text-right">{$_('experiments.impressions')}</th>
                    <th class="px-4 py-2.5 font-medium text-right">{$_('experiments.clicks')}</th>
                    <th class="px-4 py-2.5 font-medium text-right">{$_('experiments.conversions')}</th>
                    <th class="px-4 py-2.5 font-medium">{$_('experiments.conversionRate')}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  {#each expVariants as variant}
                    {@const rate = conversionRate(variant)}
                    {@const barWidth = maxRate > 0 ? (rate / maxRate) * 100 : 0}
                    {@const isWinner = experiment.winnerId === variant.id}
                    <tr class="{isWinner ? 'bg-emerald-50/50' : 'bg-white'} hover:bg-gray-50/50 transition-colors">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <span class="font-medium text-gray-900">{variant.name}</span>
                          {#if variant.isControl}
                            <span class="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-medium uppercase">{$_('experiments.control')}</span>
                          {/if}
                          {#if isWinner}
                            <span class="text-[10px] px-1.5 py-0.5 bg-emerald-200 text-emerald-700 rounded font-medium uppercase flex items-center gap-0.5">
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.853m0 0H11m3 0a6.023 6.023 0 0 0 2.77.854" />
                              </svg>
                              {$_('experiments.winner')}
                            </span>
                          {/if}
                        </div>
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(variant.impressions || 0)}</td>
                      <td class="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(variant.clicks || 0)}</td>
                      <td class="px-4 py-3 text-right text-gray-700 tabular-nums">{formatNumber(variant.conversions || 0)}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2.5">
                          <div class="flex-1 bg-gray-100 rounded-full h-2 min-w-[60px]">
                            <div
                              class="h-2 rounded-full transition-all duration-500 {isWinner ? 'bg-emerald-500' : 'bg-primary-500'}"
                              style="width: {barWidth}%"
                            ></div>
                          </div>
                          <span class="text-xs font-medium text-gray-700 tabular-nums w-12 text-right">{rate.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Statistical significance indicator -->
          {#if (experiment.status === 'RUNNING' || experiment.status === 'COMPLETED') && experiment.significance !== undefined}
            <div class="mt-3 flex items-center gap-2 text-xs">
              <div class="flex items-center gap-1.5">
                {#if experiment.significance >= 95}
                  <div class="w-2 h-2 rounded-full bg-green-500"></div>
                  <span class="text-green-700 font-medium">{$_('experiments.significant')}</span>
                {:else if experiment.significance >= 80}
                  <div class="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <span class="text-yellow-700 font-medium">{$_('experiments.approaching')}</span>
                {:else}
                  <div class="w-2 h-2 rounded-full bg-gray-400"></div>
                  <span class="text-gray-500 font-medium">{$_('experiments.notSignificant')}</span>
                {/if}
              </div>
              <span class="text-gray-400">|</span>
              <span class="text-gray-500">{$_('experiments.confidence', { values: { value: experiment.significance.toFixed(1) } })}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create experiment modal -->
{#if showCreateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showCreateModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{$_('experiments.create')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="exp-name" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('experiments.name')} *</label>
          <input id="exp-name" type="text" bind:value={createForm.name} placeholder={$_('experiments.namePlaceholder')} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label for="exp-type" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('experiments.type')}</label>
          <select id="exp-type" bind:value={createForm.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            {#each EXPERIMENT_TYPES as t}
              <option value={t}>{$_(typeLabel[t])}</option>
            {/each}
          </select>
        </div>

        <!-- Variants -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-gray-700">{$_('experiments.variants')} *</label>
            <button
              on:click={addVariant}
              class="text-xs text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
            >
              + {$_('experiments.addVariant')}
            </button>
          </div>
          <div class="space-y-2">
            {#each variants as variant, i}
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  on:click={() => setControl(i)}
                  class="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer {variant.isControl ? 'border-primary-600 bg-primary-600' : 'border-gray-300 hover:border-primary-400'}"
                  title={$_('experiments.setAsControl')}
                >
                  {#if variant.isControl}
                    <div class="w-2 h-2 rounded-full bg-white"></div>
                  {/if}
                </button>
                <input
                  type="text"
                  bind:value={variant.name}
                  placeholder={variant.isControl ? $_('experiments.controlPlaceholder') : $_('experiments.variantPlaceholder', { values: { index: i } })}
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {#if variant.isControl}
                  <span class="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-medium uppercase flex-shrink-0">{$_('experiments.control')}</span>
                {/if}
                {#if variants.length > 2}
                  <button
                    on:click={() => removeVariant(i)}
                    class="text-gray-400 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
          <p class="text-xs text-gray-400 mt-1.5">{$_('experiments.controlHint')}</p>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={createExperiment}
          disabled={creating || !createForm.name.trim() || variants.filter(v => v.name.trim()).length < 2}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if creating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('experiments.creating')}
          {:else}
            {$_('experiments.create')}
          {/if}
        </button>
        <button on:click={() => showCreateModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
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
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6">
        <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('experiments.deleteExperiment')}</h2>
        <p class="text-sm text-gray-500 mb-6">{$_('experiments.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteExperiment(deletingId)}
            class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
          >
            {$_('common.delete')}
          </button>
          <button on:click={() => deletingId = null} class="flex-1 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Results modal -->
{#if resultsFor}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => resultsFor = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <div class="p-6 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-900">{$_('experiments.results')}</h2>
            <p class="text-sm text-gray-500">{resultsFor.name}</p>
          </div>
        </div>
        <button on:click={() => resultsFor = null} class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-6 overflow-y-auto">
        {#if resultsLoading}
          <div class="space-y-4 animate-pulse">
            <div class="bg-gray-200 rounded-lg h-20"></div>
            <div class="bg-gray-200 rounded-lg h-40"></div>
          </div>
        {:else if resultsData}
          <!-- Statistical significance banner -->
          {#if resultsData.significance !== undefined}
            <div class="mb-5 p-4 rounded-lg border {resultsData.significance >= 95 ? 'bg-green-50 border-green-200' : resultsData.significance >= 80 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}">
              <div class="flex items-center gap-3">
                <div class="flex-shrink-0">
                  {#if resultsData.significance >= 95}
                    <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                  {:else if resultsData.significance >= 80}
                    <div class="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                    </div>
                  {:else}
                    <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </div>
                  {/if}
                </div>
                <div>
                  <p class="text-sm font-medium {resultsData.significance >= 95 ? 'text-green-800' : resultsData.significance >= 80 ? 'text-yellow-800' : 'text-gray-700'}">
                    {#if resultsData.significance >= 95}
                      {$_('experiments.significantResult')}
                    {:else if resultsData.significance >= 80}
                      {$_('experiments.approachingResult')}
                    {:else}
                      {$_('experiments.notSignificantResult')}
                    {/if}
                  </p>
                  <p class="text-xs mt-0.5 {resultsData.significance >= 95 ? 'text-green-600' : resultsData.significance >= 80 ? 'text-yellow-600' : 'text-gray-500'}">
                    {$_('experiments.confidence', { values: { value: resultsData.significance.toFixed(1) } })}
                  </p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Variant results -->
          <div class="space-y-3">
            {#each resultsData.variants || [] as variant}
              {@const rate = conversionRate(variant)}
              {@const allVariants = resultsData.variants || []}
              {@const maxRate2 = maxConversionRate(allVariants)}
              {@const barWidth = maxRate2 > 0 ? (rate / maxRate2) * 100 : 0}
              {@const isWinner = resultsData.winnerId === variant.id}
              <div class="border rounded-lg p-4 {isWinner ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900">{variant.name}</span>
                    {#if variant.isControl}
                      <span class="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-medium uppercase">{$_('experiments.control')}</span>
                    {/if}
                    {#if isWinner}
                      <span class="text-[10px] px-1.5 py-0.5 bg-emerald-200 text-emerald-700 rounded font-medium uppercase">{$_('experiments.winner')}</span>
                    {/if}
                  </div>
                  <span class="text-lg font-bold {isWinner ? 'text-emerald-700' : 'text-gray-900'}">{rate.toFixed(2)}%</span>
                </div>
                <div class="bg-gray-100 rounded-full h-3 mb-3">
                  <div
                    class="h-3 rounded-full transition-all duration-700 {isWinner ? 'bg-emerald-500' : 'bg-primary-500'}"
                    style="width: {barWidth}%"
                  ></div>
                </div>
                <div class="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div class="text-lg font-semibold text-gray-900">{formatNumber(variant.impressions || 0)}</div>
                    <div class="text-xs text-gray-500">{$_('experiments.impressions')}</div>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-gray-900">{formatNumber(variant.clicks || 0)}</div>
                    <div class="text-xs text-gray-500">{$_('experiments.clicks')}</div>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-gray-900">{formatNumber(variant.conversions || 0)}</div>
                    <div class="text-xs text-gray-500">{$_('experiments.conversions')}</div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="p-6 border-t border-gray-100">
        <button on:click={() => resultsFor = null} class="w-full px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.close')}
        </button>
      </div>
    </div>
  </div>
{/if}
