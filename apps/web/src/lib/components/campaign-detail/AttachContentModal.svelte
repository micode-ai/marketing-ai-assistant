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

  async function load(query = '') {
    loading = true;
    try {
      candidates = await api.get<any[]>(
        `/campaigns/${campaignId}/available-content`,
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
      const updated = await api.patch<any>(`/campaigns/${campaignId}/attach-content`, {
        contentIds: Array.from(selected),
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
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
    <div class="p-5 border-b border-gray-100">
      <h2 class="text-lg font-semibold text-gray-900 mb-3">{$_('campaigns.detail.attachContent')}</h2>
      <input
        type="text"
        bind:value={search}
        on:input={onSearch}
        placeholder={$_('campaigns.detail.searchPlaceholder')}
        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
    <div class="flex-1 overflow-y-auto p-5">
      {#if loading}
        <div class="text-center py-6 text-sm text-gray-500">…</div>
      {:else if candidates.length === 0}
        <p class="text-sm text-gray-500 text-center py-6">{$_('campaigns.detail.noCandidates')}</p>
      {:else}
        <ul class="space-y-1">
          {#each candidates as item}
            <li>
              <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  on:change={() => toggle(item.id)}
                  class="w-4 h-4 text-primary-600 rounded border-gray-300"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-gray-900 truncate">{item.title}</div>
                  <div class="text-xs text-gray-500">
                    {item.type || ''}{item.language ? ' · ' + item.language.toUpperCase() : ''} · {item.status}
                  </div>
                </div>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="p-5 border-t border-gray-100 flex gap-3">
      <button
        on:click={attach}
        disabled={attaching || selected.size === 0}
        class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 text-sm cursor-pointer"
      >
        {$_('campaigns.detail.attachCount', { values: { count: selected.size } })}
      </button>
      <button
        on:click={() => dispatch('close')}
        class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm cursor-pointer"
      >
        {$_('common.cancel')}
      </button>
    </div>
  </div>
</div>
