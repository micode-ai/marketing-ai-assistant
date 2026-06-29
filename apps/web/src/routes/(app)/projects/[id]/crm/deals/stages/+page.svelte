<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { dealsApi, type DealStage } from '$lib/api/crm-deals';

  $: projectId = $page.params['id'];

  let stages: DealStage[] = [];
  let loading = false;
  let mounted = false;
  let prevProjectId = '';

  // Per-row edit state keyed by stage id
  let rowEdits: Record<string, { name: string; probability: number; saving: boolean }> = {};

  // Toast
  let toast: { message: string; type: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  async function loadStages() {
    if (!projectId) return;
    loading = true;
    try {
      stages = await dealsApi.listStages(projectId);
      // Re-initialise per-row edits from loaded stages (discards any unsaved changes)
      const next: Record<string, { name: string; probability: number; saving: boolean }> = {};
      for (const s of stages) {
        next[s.id] = { name: s.name, probability: s.probability, saving: false };
      }
      rowEdits = next;
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      loading = false;
    }
  }

  async function saveRow(stageId: string) {
    const edit = rowEdits[stageId];
    if (!edit || !edit.name.trim()) return;
    edit.saving = true;
    rowEdits = rowEdits;
    try {
      await dealsApi.updateStage(projectId, stageId, {
        name: edit.name.trim(),
        probability: edit.probability,
      });
      showToast($_('crm.pipeline.saveSuccess'), 'success');
      await loadStages();
    } catch (e: unknown) {
      // Reset saving state since loadStages was not called
      if (rowEdits[stageId]) { rowEdits[stageId].saving = false; rowEdits = rowEdits; }
      showToast((e as Error).message || $_('common.error'), 'error');
    }
  }

  async function moveUp(index: number) {
    if (index === 0) return;
    const a = stages[index];
    const b = stages[index - 1];
    const aOldOrder = a.order;
    const bOldOrder = b.order;
    try {
      // Three-step atomic swap: park A at a temp negative order so B can take A's slot without collision
      await dealsApi.updateStage(projectId, a.id, { order: -1 });
      await dealsApi.updateStage(projectId, b.id, { order: aOldOrder });
      await dealsApi.updateStage(projectId, a.id, { order: bOldOrder });
      await loadStages();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
      await loadStages();
    }
  }

  async function moveDown(index: number) {
    if (index === stages.length - 1) return;
    const a = stages[index];
    const b = stages[index + 1];
    const aOldOrder = a.order;
    const bOldOrder = b.order;
    try {
      // Three-step atomic swap: park A at a temp negative order so B can take A's slot without collision
      await dealsApi.updateStage(projectId, a.id, { order: -1 });
      await dealsApi.updateStage(projectId, b.id, { order: aOldOrder });
      await dealsApi.updateStage(projectId, a.id, { order: bOldOrder });
      await loadStages();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
      await loadStages();
    }
  }

  // Delete confirm modal
  let showDeleteModal = false;
  let deleteStageId: string | null = null;
  let deleteStageName = '';
  let deleting = false;

  function openDeleteModal(stage: DealStage) {
    deleteStageId = stage.id;
    deleteStageName = stage.name;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    if (!deleteStageId) return;
    deleting = true;
    try {
      await dealsApi.deleteStage(projectId, deleteStageId);
      showDeleteModal = false;
      deleteStageId = null;
      showToast($_('crm.pipeline.deleteSuccess'), 'success');
      await loadStages();
    } catch (e: unknown) {
      showDeleteModal = false;
      const rawMsg = (e as Error).message || '';
      // api() client throws "API <status>" — check for 400 (last-stage constraint) vs other errors
      const is400 = /\b400\b/.test(rawMsg);
      showToast(is400 ? $_('crm.pipeline.lastStageError') : $_('common.error'), 'error');
    } finally {
      deleting = false;
    }
  }

  function handleDeleteModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showDeleteModal = false;
  }

  // Add stage
  let addName = '';
  let addProbability = '';
  let adding = false;

  async function addStage() {
    if (!addName.trim()) return;
    adding = true;
    try {
      const prob = addProbability !== '' ? Number(addProbability) : undefined;
      await dealsApi.createStage(projectId, { name: addName.trim(), probability: prob });
      addName = '';
      addProbability = '';
      showToast($_('crm.pipeline.addSuccess'), 'success');
      await loadStages();
    } catch (e: unknown) {
      showToast((e as Error).message || $_('common.error'), 'error');
    } finally {
      adding = false;
    }
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addStage();
  }

  onMount(() => {
    mounted = true;
    prevProjectId = projectId;
    loadStages();
  });

  // Project-switch safe refetch (route is reused across [id] changes)
  $: if (mounted && projectId && projectId !== prevProjectId) {
    prevProjectId = projectId;
    loadStages();
  }
</script>

<div class="p-4 sm:p-6 max-w-3xl">
  <!-- Back link + page title -->
  <div class="flex items-center gap-2 mb-6">
    <a
      href="/projects/{projectId}/crm/deals"
      class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      {$_('crm.pipeline.back')}
    </a>
    <span class="text-ink-subtle text-sm" aria-hidden="true">/</span>
    <h1 class="text-xl font-bold text-ink">{$_('crm.pipeline.stages')}</h1>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="space-y-2 mb-6">
      {#each Array(3) as _}
        <div class="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 animate-pulse">
          <div class="hidden sm:block h-6 w-6 bg-surface-2 rounded-full flex-shrink-0"></div>
          <div class="h-8 bg-surface-2 rounded-lg flex-1"></div>
          <div class="h-8 bg-surface-2 rounded-lg w-20"></div>
          <div class="h-8 bg-surface-2 rounded-lg w-32"></div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Stage list -->
    {#if stages.length > 0}
      <div class="bg-surface rounded-xl border border-border mb-6 overflow-hidden">
        <!-- Column headers -->
        <div class="flex items-center gap-3 px-4 py-2 bg-surface-2/60 border-b border-border">
          <span class="hidden sm:block w-6 flex-shrink-0"></span>
          <span class="flex-1 text-xs font-medium text-ink-muted uppercase tracking-wider">
            {$_('crm.pipeline.stageName')}
          </span>
          <span class="w-28 text-xs font-medium text-ink-muted uppercase tracking-wider">
            {$_('crm.pipeline.probability')}
          </span>
          <span class="sr-only">{$_('common.actions')}</span>
        </div>

        <!-- Stage rows -->
        <div class="divide-y divide-border">
          {#each stages as stage, i (stage.id)}
            {@const edit = rowEdits[stage.id]}
            {#if edit}
              <div class="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
                <!-- Order badge -->
                <span class="hidden sm:flex w-6 h-6 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-muted flex-shrink-0">
                  {i + 1}
                </span>

                <!-- Name input -->
                <input
                  type="text"
                  bind:value={edit.name}
                  class="flex-1 min-w-[120px] px-3 py-1.5 border border-border rounded-lg text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />

                <!-- Probability input -->
                <div class="flex items-center gap-1.5 w-28 flex-shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    bind:value={edit.probability}
                    class="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <span class="text-xs text-ink-muted flex-shrink-0">%</span>
                </div>

                <!-- Action buttons -->
                <div class="flex items-center gap-1 flex-shrink-0 ml-auto sm:ml-0">
                  <!-- Move up -->
                  <button
                    on:click={() => moveUp(i)}
                    disabled={i === 0}
                    title={$_('crm.pipeline.moveUp')}
                    aria-label={$_('crm.pipeline.moveUp')}
                    class="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>

                  <!-- Move down -->
                  <button
                    on:click={() => moveDown(i)}
                    disabled={i === stages.length - 1}
                    title={$_('crm.pipeline.moveDown')}
                    aria-label={$_('crm.pipeline.moveDown')}
                    class="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  <!-- Save -->
                  <button
                    on:click={() => saveRow(stage.id)}
                    disabled={edit.saving || !edit.name.trim()}
                    class="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:brightness-110 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {edit.saving ? $_('common.loading') : $_('common.save')}
                  </button>

                  <!-- Delete -->
                  <button
                    on:click={() => openDeleteModal(stage)}
                    title={$_('common.delete')}
                    aria-label={$_('common.delete')}
                    class="p-1.5 rounded-md text-ink-muted hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Add stage -->
    <div class="bg-surface rounded-xl border border-border p-4">
      <h2 class="text-sm font-semibold text-ink mb-3">{$_('crm.pipeline.addStage')}</h2>
      <div class="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          bind:value={addName}
          on:keydown={handleAddKeydown}
          class="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="e.g. Qualified Lead"
        />
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="number"
            min="0"
            max="100"
            bind:value={addProbability}
            on:keydown={handleAddKeydown}
            class="w-20 px-3 py-2 border border-border rounded-lg text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="50"
          />
          <span class="text-xs text-ink-muted">%</span>
        </div>
        <button
          on:click={addStage}
          disabled={adding || !addName.trim()}
          class="flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:brightness-110 transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
        >
          {#if adding}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          {/if}
          {$_('crm.pipeline.addStage')}
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- Toast notification -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div class="flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm
      {toast.type === 'success' ? 'bg-green-500/12 border-green-500/30 text-green-800' : 'bg-red-500/12 border-red-500/30 text-red-800'}">
      {#if toast.type === 'success'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      {/if}
      <span>{toast.message}</span>
      <button
        on:click={() => (toast = null)}
        aria-label={$_('common.close')}
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Delete confirm modal -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={() => (showDeleteModal = false)}
    on:keydown={handleDeleteModalKeydown}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6 border-b border-border flex items-center gap-3">
        <div class="w-9 h-9 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-ink">{$_('crm.pipeline.deleteTitle')}</h2>
      </div>
      <div class="p-6">
        <p class="text-sm text-ink-muted">{$_('crm.pipeline.deleteWarning')}</p>
        <p class="mt-3 text-sm font-semibold text-ink">"{deleteStageName}"</p>
      </div>
      <div class="p-6 border-t border-border flex gap-3">
        <button
          on:click={confirmDelete}
          disabled={deleting}
          class="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:brightness-110 transition-colors duration-150 text-sm disabled:opacity-50 cursor-pointer"
        >
          {deleting ? $_('common.loading') : $_('common.delete')}
        </button>
        <button
          on:click={() => (showDeleteModal = false)}
          class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 transition-colors duration-150 text-sm cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
