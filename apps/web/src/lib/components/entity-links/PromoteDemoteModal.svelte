<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import { createEventDispatcher } from 'svelte';
  import { organizationIdStore } from '$lib/stores/projects';

  export let show = false;
  export let mode: 'promote' | 'demote' = 'promote';
  export let entityType: string;
  export let entityId: string;
  export let projects: Array<{ id: string; name: string }> = [];

  let linkType: 'COPY' | 'LINK' = 'COPY';
  let selectedProjectId = '';
  let loading = false;

  const dispatch = createEventDispatcher();

  async function submit() {
    loading = true;
    try {
      if (mode === 'promote') {
        await api.post('/entity-links/promote', { entityType, entityId, organizationId: $organizationIdStore, linkType });
      } else {
        await api.post('/entity-links/demote', { entityType, entityId, organizationId: $organizationIdStore, projectId: selectedProjectId, linkType });
      }
      dispatch('done');
      show = false;
    } catch (e) {
      console.error('Failed:', e);
    } finally {
      loading = false;
    }
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" on:click|self={() => show = false}>
    <div class="bg-surface rounded-xl shadow-xl p-6 w-full max-w-md">
      <h2 class="text-lg font-semibold text-ink mb-4">
        {mode === 'promote' ? $_('entityLinks.promoteTitle') : $_('entityLinks.demoteTitle')}
      </h2>

      <!-- Link Type Selection -->
      <div class="space-y-3 mb-4">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer
          {linkType === 'COPY' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-border'}">
          <input type="radio" bind:group={linkType} value="COPY" class="mt-0.5" />
          <div>
            <p class="font-medium text-ink">{$_('entityLinks.copy')}</p>
            <p class="text-sm text-ink-muted">{$_('entityLinks.copyDescription')}</p>
          </div>
        </label>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer
          {linkType === 'LINK' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-border'}">
          <input type="radio" bind:group={linkType} value="LINK" class="mt-0.5" />
          <div>
            <p class="font-medium text-ink">{$_('entityLinks.link')}</p>
            <p class="text-sm text-ink-muted">{$_('entityLinks.linkDescription')}</p>
          </div>
        </label>
      </div>

      <!-- Project Selector (demote only) -->
      {#if mode === 'demote'}
        <div class="mb-4">
          <label class="block text-sm font-medium text-ink mb-1">{$_('entityLinks.selectProject')}</label>
          <select bind:value={selectedProjectId} class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">{$_('entityLinks.choosePlaceholder')}</option>
            {#each projects as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <button on:click={() => show = false} class="px-4 py-2 text-sm text-ink hover:bg-surface-2 rounded-lg">
          {$_('common.cancel')}
        </button>
        <button on:click={submit} disabled={loading || (mode === 'demote' && !selectedProjectId)}
          class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
          {loading ? $_('common.saving') : (mode === 'promote' ? $_('entityLinks.promote') : $_('entityLinks.demote'))}
        </button>
      </div>
    </div>
  </div>
{/if}
