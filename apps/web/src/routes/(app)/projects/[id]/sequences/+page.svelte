<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  // ── Types ──────────────────────────────────────────────────────────────
  interface SequenceStep {
    id: string;
    order: number;
    subject: string;
    html: string;
    previewText?: string;
    delayDays: number;
    delayHours: number;
  }

  interface EmailSequence {
    id: string;
    name: string;
    description?: string;
    triggerType: 'SIGNUP' | 'MANUAL' | 'EVENT' | 'DATE';
    status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    steps: SequenceStep[];
    _count?: { enrollments: number };
    createdAt: string;
  }

  // ── State ──────────────────────────────────────────────────────────────
  let sequences: EmailSequence[] = [];
  let loading = true;
  let expandedIds = new Set<string>();

  // Create sequence modal
  let showCreateModal = false;
  let creating = false;
  let createForm = { name: '', description: '', triggerType: 'SIGNUP' as EmailSequence['triggerType'] };

  // Add step modal
  let addStepSequenceId: string | null = null;
  let addingStep = false;
  let stepForm = { subject: '', html: '', previewText: '', delayDays: 0, delayHours: 0 };

  // Delete confirm
  let deletingId: string | null = null;

  // ── Badge maps ─────────────────────────────────────────────────────────
  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };

  const statusBorderAccent: Record<string, string> = {
    DRAFT: 'border-l-gray-300',
    ACTIVE: 'border-l-green-500',
    PAUSED: 'border-l-yellow-400',
    COMPLETED: 'border-l-blue-500',
  };

  const triggerBadge: Record<string, string> = {
    SIGNUP: 'bg-green-100 text-green-700',
    MANUAL: 'bg-gray-100 text-gray-600',
    EVENT: 'bg-purple-100 text-purple-700',
    DATE: 'bg-blue-100 text-blue-700',
  };

  const TRIGGER_TYPES: EmailSequence['triggerType'][] = ['SIGNUP', 'MANUAL', 'EVENT', 'DATE'];

  // ── Lifecycle ──────────────────────────────────────────────────────────
  onMount(async () => {
    await loadSequences();
  });

  async function loadSequences() {
    loading = true;
    try {
      sequences = await api.get<EmailSequence[]>('/email-sequences', { projectId });
    } catch (e: any) {
      alert(e.message);
    } finally {
      loading = false;
    }
  }

  // ── Expand / Collapse ──────────────────────────────────────────────────
  function toggleExpand(id: string) {
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
    expandedIds = expandedIds;
  }

  // ── Create sequence ────────────────────────────────────────────────────
  async function createSequence() {
    if (!createForm.name.trim()) return;
    creating = true;
    try {
      const payload: any = {
        projectId,
        name: createForm.name.trim(),
        triggerType: createForm.triggerType,
      };
      if (createForm.description.trim()) payload.description = createForm.description.trim();

      const created = await api.post<EmailSequence>('/email-sequences', payload);
      sequences = [{ ...created, steps: created.steps || [] }, ...sequences];
      showCreateModal = false;
      createForm = { name: '', description: '', triggerType: 'SIGNUP' };
    } catch (e: any) {
      alert(e.message);
    } finally {
      creating = false;
    }
  }

  // ── Activate / Pause ───────────────────────────────────────────────────
  async function activateSequence(id: string) {
    try {
      const updated = await api.post<EmailSequence>(`/email-sequences/${id}/activate`);
      sequences = sequences.map(s => s.id === id ? { ...s, ...updated, steps: updated.steps || s.steps } : s);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function pauseSequence(id: string) {
    try {
      const updated = await api.post<EmailSequence>(`/email-sequences/${id}/pause`);
      sequences = sequences.map(s => s.id === id ? { ...s, ...updated, steps: updated.steps || s.steps } : s);
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ── Delete sequence ────────────────────────────────────────────────────
  async function deleteSequence(id: string) {
    try {
      await api.delete(`/email-sequences/${id}`);
      sequences = sequences.filter(s => s.id !== id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  // ── Add step ───────────────────────────────────────────────────────────
  function openAddStep(sequenceId: string) {
    addStepSequenceId = sequenceId;
    stepForm = { subject: '', html: '', previewText: '', delayDays: 0, delayHours: 0 };
  }

  async function addStep() {
    if (!addStepSequenceId || !stepForm.subject.trim() || !stepForm.html.trim()) return;
    addingStep = true;
    try {
      const payload: any = {
        subject: stepForm.subject.trim(),
        html: stepForm.html.trim(),
        delayDays: Number(stepForm.delayDays) || 0,
        delayHours: Number(stepForm.delayHours) || 0,
      };
      if (stepForm.previewText.trim()) payload.previewText = stepForm.previewText.trim();

      const newStep = await api.post<SequenceStep>(`/email-sequences/${addStepSequenceId}/steps`, payload);
      sequences = sequences.map(s => {
        if (s.id === addStepSequenceId) {
          return { ...s, steps: [...(s.steps || []), newStep] };
        }
        return s;
      });
      // Auto-expand the sequence so user can see the new step
      expandedIds.add(addStepSequenceId);
      expandedIds = expandedIds;
      addStepSequenceId = null;
    } catch (e: any) {
      alert(e.message);
    } finally {
      addingStep = false;
    }
  }

  // ── Delete step ────────────────────────────────────────────────────────
  async function deleteStep(sequenceId: string, stepId: string) {
    try {
      await api.delete(`/email-sequences/${sequenceId}/steps/${stepId}`);
      sequences = sequences.map(s => {
        if (s.id === sequenceId) {
          const filtered = (s.steps || []).filter(st => st.id !== stepId);
          // Re-order visually
          const reordered = filtered.map((st, i) => ({ ...st, order: i + 1 }));
          return { ...s, steps: reordered };
        }
        return s;
      });
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ── Reorder steps ──────────────────────────────────────────────────────
  async function moveStep(sequenceId: string, stepId: string, direction: 'up' | 'down') {
    const seq = sequences.find(s => s.id === sequenceId);
    if (!seq) return;
    const steps = [...(seq.steps || [])].sort((a, b) => a.order - b.order);
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === steps.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [steps[idx], steps[swapIdx]] = [steps[swapIdx], steps[idx]];

    // Reassign order numbers
    const reordered = steps.map((s, i) => ({ ...s, order: i + 1 }));

    // Optimistic update
    sequences = sequences.map(s => s.id === sequenceId ? { ...s, steps: reordered } : s);

    // Persist both changed steps
    try {
      await api.put(`/email-sequences/${sequenceId}/steps/${reordered[idx].id}`, { order: reordered[idx].order });
      await api.put(`/email-sequences/${sequenceId}/steps/${reordered[swapIdx].id}`, { order: reordered[swapIdx].order });
    } catch (e: any) {
      alert(e.message);
      // Reload to fix state
      await loadSequences();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function formatDelay(days: number, hours: number): string {
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    return parts.length > 0 ? parts.join(' ') : $_('sequences.immediate');
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="sequences" titleKey="hints.sequences.title" descKey="hints.sequences.desc" />
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('sequences.title')}</h1>
    <button
      on:click={() => showCreateModal = true}
      class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {$_('sequences.create')}
    </button>
  </div>

  <!-- Loading skeleton -->
  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-28"></div>
      {/each}
    </div>

  <!-- Empty state -->
  {:else if sequences.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('sequences.empty')}</h2>
      <p class="text-gray-500 mb-6 max-w-sm">{$_('sequences.emptyDesc')}</p>
      <button
        on:click={() => showCreateModal = true}
        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('sequences.create')}
      </button>
    </div>

  <!-- Sequence list -->
  {:else}
    <div class="space-y-4">
      {#each sequences as sequence (sequence.id)}
        {@const steps = (sequence.steps || []).sort((a, b) => a.order - b.order)}
        {@const enrollments = sequence._count?.enrollments ?? 0}
        <div class="bg-white rounded-xl border border-gray-200 border-l-4 {statusBorderAccent[sequence.status] || 'border-l-gray-300'} transition-shadow duration-150 hover:shadow-sm">
          <!-- Card header -->
          <div class="p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <!-- Badges row -->
                <div class="flex flex-wrap items-center gap-1.5 mb-2">
                  <span class="text-xs px-2 py-0.5 rounded font-medium {triggerBadge[sequence.triggerType] || 'bg-gray-100 text-gray-600'}">
                    {$_(`sequences.trigger_${sequence.triggerType.toLowerCase()}`)}
                  </span>
                  <span class="text-xs px-2 py-0.5 rounded {statusBadge[sequence.status] || 'bg-gray-100 text-gray-600'}">
                    {$_(`sequences.status_${sequence.status.toLowerCase()}`)}
                  </span>
                  <span class="text-xs px-2 py-0.5 bg-gray-50 text-gray-500 rounded">
                    {$_('sequences.stepCount', { values: { count: steps.length } })}
                  </span>
                  {#if enrollments > 0}
                    <span class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                      {$_('sequences.enrollmentCount', { values: { count: enrollments } })}
                    </span>
                  {/if}
                </div>

                <!-- Name & description -->
                <h3 class="font-medium text-gray-900 truncate">{sequence.name}</h3>
                {#if sequence.description}
                  <p class="text-sm text-gray-500 mt-1 line-clamp-1">{sequence.description}</p>
                {/if}

                <!-- Meta row -->
                <div class="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span>{formatDate(sequence.createdAt)}</span>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 flex-shrink-0">
                <!-- Activate / Pause button -->
                {#if sequence.status === 'DRAFT' || sequence.status === 'PAUSED'}
                  <button
                    on:click={() => activateSequence(sequence.id)}
                    class="text-xs px-3 py-1.5 border border-green-300 text-green-600 rounded-lg hover:bg-green-50 transition-colors duration-150 cursor-pointer"
                    title={$_('sequences.activate')}
                  >
                    {$_('sequences.activate')}
                  </button>
                {:else if sequence.status === 'ACTIVE'}
                  <button
                    on:click={() => pauseSequence(sequence.id)}
                    class="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-600 rounded-lg hover:bg-yellow-50 transition-colors duration-150 cursor-pointer"
                    title={$_('sequences.pause')}
                  >
                    {$_('sequences.pause')}
                  </button>
                {/if}

                <!-- Add step -->
                <button
                  on:click={() => openAddStep(sequence.id)}
                  class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                  title={$_('sequences.addStep')}
                >
                  {$_('sequences.addStep')}
                </button>

                <!-- Expand / Collapse -->
                <button
                  on:click={() => toggleExpand(sequence.id)}
                  class="text-xs px-2 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                  title={expandedIds.has(sequence.id) ? $_('sequences.collapse') : $_('sequences.expand')}
                >
                  <svg class="w-4 h-4 text-gray-500 transition-transform duration-200 {expandedIds.has(sequence.id) ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <!-- Delete -->
                <button
                  on:click={() => deletingId = sequence.id}
                  class="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                  title={$_('sequences.deleteSequence')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Expanded steps timeline -->
          {#if expandedIds.has(sequence.id)}
            <div transition:slide={{ duration: 200 }} class="border-t border-gray-100 px-5 pb-5 pt-4">
              {#if steps.length === 0}
                <div class="text-center py-6">
                  <p class="text-sm text-gray-400 mb-3">{$_('sequences.noSteps')}</p>
                  <button
                    on:click={() => openAddStep(sequence.id)}
                    class="text-sm text-primary-600 font-medium hover:text-primary-700 transition-colors cursor-pointer"
                  >
                    + {$_('sequences.addStep')}
                  </button>
                </div>
              {:else}
                <div class="space-y-0">
                  {#each steps as step, i (step.id)}
                    <div class="flex gap-3">
                      <!-- Timeline connector -->
                      <div class="flex flex-col items-center flex-shrink-0">
                        <div class="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                          {step.order || i + 1}
                        </div>
                        {#if i < steps.length - 1}
                          <div class="w-0.5 flex-1 bg-gray-200 my-1 min-h-[24px]"></div>
                        {/if}
                      </div>

                      <!-- Step content -->
                      <div class="flex-1 min-w-0 pb-4">
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0 flex-1">
                            <h4 class="text-sm font-medium text-gray-900 truncate">{step.subject}</h4>
                            {#if step.previewText}
                              <p class="text-xs text-gray-400 mt-0.5 truncate">{step.previewText}</p>
                            {/if}
                            <!-- Delay badge -->
                            <div class="flex items-center gap-1.5 mt-1.5">
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              <span class="text-xs text-gray-500">
                                {$_('sequences.delayLabel')}: {formatDelay(step.delayDays, step.delayHours)}
                              </span>
                            </div>
                          </div>

                          <!-- Step actions: reorder + delete -->
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <button
                              on:click={() => moveStep(sequence.id, step.id, 'up')}
                              disabled={i === 0}
                              class="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              title={$_('sequences.moveUp')}
                            >
                              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                              </svg>
                            </button>
                            <button
                              on:click={() => moveStep(sequence.id, step.id, 'down')}
                              disabled={i === steps.length - 1}
                              class="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              title={$_('sequences.moveDown')}
                            >
                              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                            <button
                              on:click={() => deleteStep(sequence.id, step.id)}
                              class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                              title={$_('sequences.deleteStep')}
                            >
                              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create sequence modal -->
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
        <h2 class="text-lg font-semibold text-gray-900">{$_('sequences.create')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="seq-name" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('sequences.name')} *</label>
          <input
            id="seq-name"
            type="text"
            bind:value={createForm.name}
            placeholder={$_('sequences.namePlaceholder')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label for="seq-desc" class="block text-sm font-medium text-gray-700 mb-1.5">
            {$_('common.description')}
            <span class="text-gray-400 font-normal">({$_('common.optional')})</span>
          </label>
          <textarea
            id="seq-desc"
            bind:value={createForm.description}
            rows="2"
            placeholder={$_('sequences.descriptionPlaceholder')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          ></textarea>
        </div>
        <div>
          <label for="seq-trigger" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('sequences.triggerType')}</label>
          <select
            id="seq-trigger"
            bind:value={createForm.triggerType}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {#each TRIGGER_TYPES as t}
              <option value={t}>{$_(`sequences.trigger_${t.toLowerCase()}`)}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={createSequence}
          disabled={creating || !createForm.name.trim()}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if creating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('sequences.creating')}
          {:else}
            {$_('sequences.create')}
          {/if}
        </button>
        <button
          on:click={() => showCreateModal = false}
          class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add step modal -->
{#if addStepSequenceId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => addStepSequenceId = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{$_('sequences.addStep')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="step-subject" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('sequences.stepSubject')} *</label>
          <input
            id="step-subject"
            type="text"
            bind:value={stepForm.subject}
            placeholder={$_('sequences.stepSubjectPlaceholder')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label for="step-preview" class="block text-sm font-medium text-gray-700 mb-1.5">
            {$_('sequences.stepPreviewText')}
            <span class="text-gray-400 font-normal">({$_('common.optional')})</span>
          </label>
          <input
            id="step-preview"
            type="text"
            bind:value={stepForm.previewText}
            placeholder={$_('sequences.stepPreviewPlaceholder')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div>
          <label for="step-html" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('sequences.stepContent')} *</label>
          <textarea
            id="step-html"
            bind:value={stepForm.html}
            rows="6"
            placeholder={$_('sequences.stepContentPlaceholder')}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
          ></textarea>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="step-delay-days" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('sequences.delayDays')}</label>
            <input
              id="step-delay-days"
              type="number"
              min="0"
              bind:value={stepForm.delayDays}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label for="step-delay-hours" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('sequences.delayHours')}</label>
            <input
              id="step-delay-hours"
              type="number"
              min="0"
              max="23"
              bind:value={stepForm.delayHours}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={addStep}
          disabled={addingStep || !stepForm.subject.trim() || !stepForm.html.trim()}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if addingStep}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('sequences.addingStep')}
          {:else}
            {$_('sequences.addStep')}
          {/if}
        </button>
        <button
          on:click={() => addStepSequenceId = null}
          class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer"
        >
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
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('sequences.deleteSequence')}</h2>
        <p class="text-sm text-gray-500 mb-6">{$_('sequences.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteSequence(deletingId)}
            class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors duration-150 text-sm cursor-pointer"
          >
            {$_('common.delete')}
          </button>
          <button
            on:click={() => deletingId = null}
            class="flex-1 px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer"
          >
            {$_('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
