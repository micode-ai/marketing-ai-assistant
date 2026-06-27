<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from '$lib/api/client';

  export let campaignId: string;

  const dispatch = createEventDispatcher<{ close: void; done: any }>();

  let candidates: any[] = [];
  let loading = false;
  let attaching = false;
  let search = '';
  let selected = new Set<string>();
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function formatFileSize(bytes?: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function load(query = '') {
    loading = true;
    try {
      candidates = await api.get<any[]>(
        `/campaigns/${campaignId}/available-documents`,
        query ? { search: query } : undefined,
      );
    } catch (e: any) {
      console.error(e);
      candidates = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => load());

  function onSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(search.trim()), 250);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  async function attach() {
    if (selected.size === 0) return;
    attaching = true;
    try {
      const updated = await api.patch<any>(`/campaigns/${campaignId}/attach-documents`, {
        documentIds: Array.from(selected),
      });
      dispatch('done', updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      attaching = false;
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => dispatch('close')}>
  <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
    <div class="p-5 border-b border-border">
      <h2 class="text-lg font-semibold text-ink mb-3">{$_('campaigns.detail.attachDocuments')}</h2>
      <input
        type="text"
        bind:value={search}
        on:input={onSearch}
        placeholder={$_('campaigns.detail.searchPlaceholder')}
        class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
    <div class="flex-1 overflow-y-auto p-5">
      {#if loading}
        <div class="text-center py-6 text-sm text-ink-muted">…</div>
      {:else if candidates.length === 0}
        <p class="text-sm text-ink-muted text-center py-6">{$_('campaigns.detail.noDocumentCandidates')}</p>
      {:else}
        <ul class="space-y-1">
          {#each candidates as item}
            <li>
              <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  on:change={() => toggle(item.id)}
                  class="w-4 h-4 text-brand rounded border-border"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-ink truncate">{item.title}</div>
                  <div class="text-xs text-ink-muted flex items-center gap-1.5 flex-wrap">
                    <span>{item.type || ''}</span>
                    {#if item.fileUrl}
                      <span class="text-ink-subtle">·</span>
                      <span>{item.fileName || ''}</span>
                      {#if item.fileSize}
                        <span class="text-ink-subtle">·</span>
                        <span>{formatFileSize(item.fileSize)}</span>
                      {/if}
                    {:else if item.generatedByAi}
                      <span class="text-ink-subtle">·</span>
                      <span class="text-purple-600">AI</span>
                    {/if}
                  </div>
                </div>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="p-5 border-t border-border flex gap-3">
      <button
        on:click={attach}
        disabled={attaching || selected.size === 0}
        class="flex-1 bg-brand text-white py-2.5 rounded-lg font-medium hover:brightness-110 disabled:opacity-50 text-sm cursor-pointer"
      >
        {$_('campaigns.detail.attachDocumentsCount', { values: { count: selected.size } })}
      </button>
      <button
        on:click={() => dispatch('close')}
        class="px-5 py-2.5 border border-border rounded-lg hover:bg-surface-2 text-sm cursor-pointer"
      >
        {$_('common.cancel')}
      </button>
    </div>
  </div>
</div>
