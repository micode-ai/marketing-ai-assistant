<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  let competitors: any[] = [];
  let loading = true;
  let showModal = false;
  let creating = false;
  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  let form = { name: '', websiteUrl: '', description: '' };

  // Delete confirm state
  let deletingId: string | null = null;

  // Analyze state
  let analyzingId: string | null = null;

  // Snapshot expand state
  let expandedSnapshotId: string | null = null;

  // Snapshot data cache
  let snapshotCache: Record<string, any[]> = {};

  onMount(async () => {
    try {
      competitors = await api.get<any[]>('/seo/competitors', { projectId });
    } catch (e: any) {
      console.error('Failed to load competitors:', e);
    } finally {
      loading = false;
    }
  });

  async function addCompetitor() {
    if (!form.name.trim() || !form.websiteUrl.trim()) return;
    creating = true;
    try {
      const competitor = await api.post<any>('/seo/competitors', {
        projectId,
        name: form.name,
        websiteUrl: form.websiteUrl,
        description: form.description || undefined,
      });
      competitors = [...competitors, competitor];
      form = { name: '', websiteUrl: '', description: '' };
      showModal = false;
    } catch (e: any) {
      alert(e.message);
    } finally {
      creating = false;
    }
  }

  async function deleteCompetitor(id: string) {
    try {
      await api.delete(`/seo/competitors/${id}`);
      competitors = competitors.filter(c => c.id !== id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  async function toggleActive(competitor: any) {
    try {
      const updated = await api.patch<any>(`/seo/competitors/${competitor.id}`, {
        isActive: !competitor.isActive,
      });
      competitors = competitors.map(c => c.id === competitor.id ? { ...c, ...updated } : c);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function analyzeCompetitor(competitor: any) {
    analyzingId = competitor.id;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', {
        projectId,
        agentType: 'SEO',
        input: {
          task: 'competitor_analysis',
          competitorId: competitor.id,
          competitorName: competitor.name,
          competitorUrl: competitor.websiteUrl,
        },
      });

      // Poll until agent run completes (max 90s)
      let attempts = 0;
      while (attempts < 45) {
        await new Promise(r => setTimeout(r, 2000));
        const updated = await api.get<{ status: string; error?: string }>(`/agent/runs/${run.id}`);
        if (updated.status === 'COMPLETED') break;
        if (updated.status === 'FAILED') throw new Error(updated.error || 'Agent run failed');
        attempts++;
      }
      if (attempts >= 45) throw new Error('Timeout waiting for analysis');

      // Reload competitors to get updated lastCheckedAt
      competitors = await api.get<any[]>('/seo/competitors', { projectId });

      // Clear cached snapshots for this competitor so they reload
      delete snapshotCache[competitor.id];
      if (expandedSnapshotId === competitor.id) {
        await loadSnapshots(competitor.id);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      analyzingId = null;
    }
  }

  async function toggleSnapshot(competitorId: string) {
    if (expandedSnapshotId === competitorId) {
      expandedSnapshotId = null;
      return;
    }
    expandedSnapshotId = competitorId;
    if (!snapshotCache[competitorId]) {
      await loadSnapshots(competitorId);
    }
  }

  async function loadSnapshots(competitorId: string) {
    try {
      const snapshots = await api.get<any[]>(`/seo/competitors/${competitorId}/snapshots`);
      snapshotCache[competitorId] = snapshots;
      snapshotCache = snapshotCache;
    } catch (e: any) {
      snapshotCache[competitorId] = [];
      snapshotCache = snapshotCache;
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return $_('competitors.never');
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function flattenJson(obj: any, prefix: string = ''): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = [];
    if (!obj || typeof obj !== 'object') return entries;
    for (const [key, val] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        entries.push(...flattenJson(val, fullKey));
      } else if (Array.isArray(val)) {
        entries.push({ key: fullKey, value: val.join(', ') });
      } else {
        entries.push({ key: fullKey, value: String(val ?? '') });
      }
    }
    return entries;
  }
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="competitors" titleKey="hints.competitors.title" descKey="hints.competitors.desc" />
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('competitors.title')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('competitors.subtitle')}</p>
    </div>
    <button
      on:click={() => showModal = true}
      class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {$_('competitors.addCompetitor')}
    </button>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each Array(4) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-5 h-44 animate-pulse">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div class="flex-1">
              <div class="h-4 bg-gray-200 rounded w-32 mb-2"></div>
              <div class="h-3 bg-gray-200 rounded w-48"></div>
            </div>
          </div>
          <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
          <div class="h-3 bg-gray-200 rounded w-3/4"></div>
        </div>
      {/each}
    </div>
  {:else if competitors.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('competitors.empty')}</h2>
      <p class="text-gray-500 mb-6 max-w-md">{$_('competitors.emptyDesc')}</p>
      <button
        on:click={() => showModal = true}
        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('competitors.addCompetitor')}
      </button>
    </div>
  {:else}
    <!-- Competitor cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each competitors as competitor}
        <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow duration-150">
          <!-- Card header -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <!-- Active status dot -->
              <div class="flex-shrink-0">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  on:click={() => toggleActive(competitor)}
                  class="w-3 h-3 rounded-full cursor-pointer transition-colors duration-150 {competitor.isActive ? 'bg-green-500' : 'bg-gray-300'}"
                  title={$_('competitors.toggleActive')}
                ></div>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-gray-900 truncate">{competitor.name}</h3>
                <a
                  href={competitor.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-primary-600 hover:text-primary-700 hover:underline truncate block"
                >
                  {competitor.websiteUrl}
                </a>
              </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0 ml-3">
              <!-- Analyze button -->
              <button
                on:click={() => analyzeCompetitor(competitor)}
                disabled={analyzingId === competitor.id}
                class="text-xs px-3 py-1.5 border border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors duration-150 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {#if analyzingId === competitor.id}
                  <svg class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {$_('competitors.analyzing')}
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  {$_('competitors.analyze')}
                {/if}
              </button>
              <!-- Delete button -->
              <button
                on:click={() => deletingId = competitor.id}
                class="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                title={$_('common.delete')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Description -->
          {#if competitor.description}
            <p class="text-sm text-gray-500 mb-3 line-clamp-2">{competitor.description}</p>
          {/if}

          <!-- Meta info -->
          <div class="flex items-center gap-4 text-xs text-gray-400 mb-3">
            <span class="inline-flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full {competitor.isActive ? 'bg-green-500' : 'bg-gray-300'}"></span>
              {competitor.isActive ? $_('competitors.active') : $_('competitors.inactive')}
            </span>
            <span class="inline-flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {$_('competitors.lastChecked')}: {formatDate(competitor.lastCheckedAt)}
            </span>
          </div>

          <!-- Snapshot toggle -->
          <button
            on:click={() => toggleSnapshot(competitor.id)}
            class="w-full text-left text-xs font-medium text-gray-600 hover:text-primary-600 flex items-center gap-1.5 py-2 border-t border-gray-100 transition-colors duration-150 cursor-pointer"
          >
            <svg
              class="w-3.5 h-3.5 transition-transform duration-200 {expandedSnapshotId === competitor.id ? 'rotate-180' : ''}"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            {$_('competitors.snapshotData')}
          </button>

          <!-- Snapshot data (expanded) -->
          {#if expandedSnapshotId === competitor.id}
            <div class="mt-2">
              {#if !snapshotCache[competitor.id]}
                <div class="py-4 text-center">
                  <svg class="animate-spin w-5 h-5 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              {:else if snapshotCache[competitor.id].length === 0}
                <p class="text-xs text-gray-400 py-2">{$_('competitors.noSnapshot')}</p>
              {:else}
                {@const latestSnapshot = snapshotCache[competitor.id][0]}
                {@const kvPairs = flattenJson(latestSnapshot.data)}
                {#if kvPairs.length === 0}
                  <p class="text-xs text-gray-400 py-2">{$_('competitors.noSnapshot')}</p>
                {:else}
                  <div class="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <table class="w-full text-xs">
                      <tbody>
                        {#each kvPairs as { key, value }, i}
                          <tr class="{i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                            <td class="py-1.5 px-2 font-medium text-gray-700 whitespace-nowrap align-top">{key}</td>
                            <td class="py-1.5 px-2 text-gray-600 break-all">{value}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                    <div class="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-400">
                      {formatDate(latestSnapshot.createdAt)}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Add Competitor modal -->
{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{$_('competitors.addCompetitor')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="competitor-name" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('competitors.name')}</label>
          <input
            id="competitor-name"
            type="text"
            bind:value={form.name}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder={$_('competitors.namePlaceholder')}
          />
        </div>
        <div>
          <label for="competitor-url" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('competitors.websiteUrl')}</label>
          <input
            id="competitor-url"
            type="url"
            bind:value={form.websiteUrl}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder={$_('competitors.websiteUrlPlaceholder')}
          />
        </div>
        <div>
          <label for="competitor-desc" class="block text-sm font-medium text-gray-700 mb-1.5">
            {$_('competitors.description')}
            <span class="text-gray-400 font-normal ml-1">({$_('common.optional')})</span>
          </label>
          <textarea
            id="competitor-desc"
            bind:value={form.description}
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            placeholder={$_('competitors.descriptionPlaceholder')}
          ></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={addCompetitor}
          disabled={creating || !form.name.trim() || !form.websiteUrl.trim()}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if creating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('competitors.creating')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {$_('competitors.addCompetitor')}
          {/if}
        </button>
        <button on:click={() => showModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete confirm modal -->
{#if deletingId}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => deletingId = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
      <div class="p-6">
        <div class="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('competitors.delete')}</h2>
        <p class="text-sm text-gray-500 mb-6">{$_('competitors.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteCompetitor(deletingId)}
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
