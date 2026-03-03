<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';

  let keywords: any[] = [];
  let loading = true;
  let showModal = false;
  let adding = false;
  let auditing = false;
  let deletingId: string | null = null;
  $: projectId = $page.params['id'];

  let form = { keyword: '', targetRank: 10, intent: 'INFORMATIONAL' };

  // Rank history cache: keywordId -> number[]
  let historyMap: Record<string, number[]> = {};

  onMount(async () => {
    await fetchKeywords();
  });

  async function fetchKeywords() {
    loading = true;
    try {
      keywords = await api.get<any[]>('/seo/keywords', { projectId });
      // Fetch history for each keyword in parallel
      const historyPromises = keywords.map(async (kw) => {
        try {
          const history = await api.get<any[]>(`/seo/keywords/${kw.id}/history`);
          historyMap[kw.id] = history.map((h: any) => h.rank).reverse();
        } catch {
          historyMap[kw.id] = [];
        }
      });
      await Promise.all(historyPromises);
      historyMap = historyMap;
    } catch (e: any) {
      console.error('Failed to load keywords:', e);
    } finally {
      loading = false;
    }
  }

  async function addKeyword() {
    if (!form.keyword.trim()) return;
    adding = true;
    try {
      const created = await api.post<any>('/seo/keywords', {
        projectId,
        keyword: form.keyword.trim(),
        targetRank: form.targetRank || undefined,
        intent: form.intent,
      });
      keywords = [...keywords, created];
      historyMap[created.id] = [];
      historyMap = historyMap;
      form = { keyword: '', targetRank: 10, intent: 'INFORMATIONAL' };
      showModal = false;
    } catch (e: any) {
      alert(e.message);
    } finally {
      adding = false;
    }
  }

  async function deleteKeyword(id: string) {
    try {
      await api.delete(`/seo/keywords/${id}`);
      keywords = keywords.filter(k => k.id !== id);
      delete historyMap[id];
      historyMap = historyMap;
    } catch (e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  async function runSeoAudit() {
    auditing = true;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', {
        projectId,
        agentType: 'SEO',
        input: { task: 'keyword_research', keywords: keywords.map(k => k.keyword) },
      });

      // Poll until the agent run completes (max 90s)
      const startTime = Date.now();
      let finalRun: { status: string } = run;
      while (finalRun.status === 'PENDING' || finalRun.status === 'RUNNING') {
        if (Date.now() - startTime > 90000) break;
        await new Promise(r => setTimeout(r, 2000));
        finalRun = await api.get<{ status: string }>(`/agent/runs/${run.id}`);
      }

      // Refresh keywords after audit completes
      await fetchKeywords();
    } catch (e: any) {
      alert(e.message);
    } finally {
      auditing = false;
    }
  }

  const intentBadge: Record<string, string> = {
    INFORMATIONAL: 'bg-blue-100 text-blue-700',
    NAVIGATIONAL: 'bg-gray-100 text-gray-700',
    COMMERCIAL: 'bg-amber-100 text-amber-700',
    TRANSACTIONAL: 'bg-green-100 text-green-700',
  };

  const intentLabel: Record<string, string> = {
    INFORMATIONAL: 'seo.intentInformational',
    NAVIGATIONAL: 'seo.intentNavigational',
    COMMERCIAL: 'seo.intentCommercial',
    TRANSACTIONAL: 'seo.intentTransactional',
  };

  function difficultyColor(val: number): string {
    if (val < 30) return 'bg-green-500';
    if (val <= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function difficultyLabel(val: number): string {
    if (val < 30) return 'seo.difficultyEasy';
    if (val <= 60) return 'seo.difficultyMedium';
    return 'seo.difficultyHard';
  }

  function trendIndicator(history: number[]): { icon: 'up' | 'down' | 'stable'; color: string } {
    if (!history || history.length < 2) return { icon: 'stable', color: 'text-gray-400' };
    const recent = history[history.length - 1];
    const prev = history[history.length - 2];
    // Lower rank = better position
    if (recent < prev) return { icon: 'up', color: 'text-green-600' };
    if (recent > prev) return { icon: 'down', color: 'text-red-500' };
    return { icon: 'stable', color: 'text-gray-400' };
  }

  function sparklinePath(history: number[]): string {
    if (!history || history.length < 2) return '';
    const maxRank = Math.max(...history, 1);
    const width = 80;
    const height = 24;
    const stepX = width / (history.length - 1);
    // Invert: lower rank = higher on chart
    return history.map((val, i) => {
      const x = i * stepX;
      const y = height - ((maxRank - val) / maxRank) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function sparklineColor(history: number[]): string {
    const trend = trendIndicator(history);
    if (trend.icon === 'up') return '#16a34a';
    if (trend.icon === 'down') return '#ef4444';
    return '#9ca3af';
  }
</script>

<div class="p-6">
  <SectionHint sectionKey="seo" titleKey="hints.seo.title" descKey="hints.seo.desc" />
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('seo.title')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('seo.subtitle')}</p>
    </div>
    <div class="flex items-center gap-3">
      <button
        on:click={runSeoAudit}
        disabled={auditing}
        class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {#if auditing}
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {$_('seo.auditRunning')}
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          {$_('seo.runAudit')}
        {/if}
      </button>
      <button
        on:click={() => showModal = true}
        class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('seo.addKeyword')}
      </button>
    </div>
  </div>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="bg-white rounded-xl border border-gray-200 animate-pulse">
      <div class="p-4 border-b border-gray-100">
        <div class="h-4 bg-gray-200 rounded w-1/3"></div>
      </div>
      {#each Array(5) as _}
        <div class="p-4 border-b border-gray-50">
          <div class="h-4 bg-gray-100 rounded w-full"></div>
        </div>
      {/each}
    </div>
  {:else if keywords.length === 0}
    <!-- Empty state -->
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('seo.empty')}</h2>
      <p class="text-gray-500 mb-6 max-w-sm">{$_('seo.emptyDesc')}</p>
      <button
        on:click={() => showModal = true}
        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {$_('seo.addKeyword')}
      </button>
    </div>
  {:else}
    <!-- Keywords table -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/50">
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.keyword')}</th>
              <th class="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.searchVolume')}</th>
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.difficulty')}</th>
              <th class="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.currentRank')}</th>
              <th class="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.targetRank')}</th>
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.intent')}</th>
              <th class="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.trend')}</th>
              <th class="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.tracking')}</th>
              <th class="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            {#each keywords as kw}
              {@const history = historyMap[kw.id] || []}
              {@const trend = trendIndicator(history)}
              <tr class="hover:bg-gray-50/50 transition-colors duration-100">
                <!-- Keyword -->
                <td class="px-5 py-3.5">
                  <span class="text-sm font-medium text-gray-900">{kw.keyword}</span>
                </td>

                <!-- Search Volume -->
                <td class="px-5 py-3.5 text-right">
                  <span class="text-sm text-gray-600">{kw.searchVolume != null ? kw.searchVolume.toLocaleString() : '—'}</span>
                </td>

                <!-- Difficulty -->
                <td class="px-5 py-3.5">
                  {#if kw.difficulty != null}
                    <div class="flex items-center gap-2">
                      <div class="w-16 bg-gray-100 rounded-full h-1.5">
                        <div class="{difficultyColor(kw.difficulty)} h-1.5 rounded-full" style="width: {kw.difficulty}%"></div>
                      </div>
                      <span class="text-xs text-gray-500 w-7 text-right">{kw.difficulty}</span>
                    </div>
                  {:else}
                    <span class="text-sm text-gray-400">—</span>
                  {/if}
                </td>

                <!-- Current Rank -->
                <td class="px-5 py-3.5 text-right">
                  <span class="text-sm font-medium {kw.currentRank != null && kw.currentRank <= 10 ? 'text-green-600' : kw.currentRank != null && kw.currentRank <= 30 ? 'text-amber-600' : 'text-gray-600'}">
                    {kw.currentRank != null ? '#' + kw.currentRank : '—'}
                  </span>
                </td>

                <!-- Target Rank -->
                <td class="px-5 py-3.5 text-right">
                  <span class="text-sm text-gray-500">{kw.targetRank != null ? '#' + kw.targetRank : '—'}</span>
                </td>

                <!-- Intent -->
                <td class="px-5 py-3.5">
                  {#if kw.intent}
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium {intentBadge[kw.intent] || 'bg-gray-100 text-gray-600'}">
                      {$_(intentLabel[kw.intent] || 'seo.intentInformational')}
                    </span>
                  {:else}
                    <span class="text-sm text-gray-400">—</span>
                  {/if}
                </td>

                <!-- Trend / Sparkline -->
                <td class="px-5 py-3.5">
                  <div class="flex items-center justify-center gap-1.5">
                    {#if history.length >= 2}
                      <svg width="80" height="24" class="flex-shrink-0">
                        <path d={sparklinePath(history)} fill="none" stroke={sparklineColor(history)} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      <span class="{trend.color}">
                        {#if trend.icon === 'up'}
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                          </svg>
                        {:else if trend.icon === 'down'}
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
                          </svg>
                        {:else}
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
                          </svg>
                        {/if}
                      </span>
                    {:else}
                      <span class="text-xs text-gray-400">{$_('seo.noHistory')}</span>
                    {/if}
                  </div>
                </td>

                <!-- Tracking Status -->
                <td class="px-5 py-3.5 text-center">
                  {#if kw.tracking !== false}
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      <span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      {$_('seo.active')}
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      <span class="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                      {$_('seo.paused')}
                    </span>
                  {/if}
                </td>

                <!-- Actions -->
                <td class="px-5 py-3.5 text-right">
                  <button
                    on:click={() => deletingId = kw.id}
                    class="text-gray-400 hover:text-red-500 transition-colors duration-150 cursor-pointer p-1"
                    title={$_('seo.deleteKeyword')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Summary footer -->
      <div class="px-5 py-3 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between">
        <span class="text-xs text-gray-500">
          {$_('seo.totalKeywords', { values: { count: keywords.length } })}
        </span>
        <span class="text-xs text-gray-400">
          {$_('seo.avgDifficulty', { values: { avg: keywords.filter(k => k.difficulty != null).length > 0 ? Math.round(keywords.filter(k => k.difficulty != null).reduce((sum, k) => sum + k.difficulty, 0) / keywords.filter(k => k.difficulty != null).length) : 0 } })}
        </span>
      </div>
    </div>
  {/if}
</div>

<!-- Add Keyword Modal -->
{#if showModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{$_('seo.addKeyword')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="seo-keyword" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.keyword')}</label>
          <input
            id="seo-keyword"
            type="text"
            bind:value={form.keyword}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder={$_('seo.keywordPlaceholder')}
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="seo-target" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.targetRank')}</label>
            <input
              id="seo-target"
              type="number"
              min="1"
              max="100"
              bind:value={form.targetRank}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label for="seo-intent" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.intent')}</label>
            <select
              id="seo-intent"
              bind:value={form.intent}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="INFORMATIONAL">{$_('seo.intentInformational')}</option>
              <option value="NAVIGATIONAL">{$_('seo.intentNavigational')}</option>
              <option value="COMMERCIAL">{$_('seo.intentCommercial')}</option>
              <option value="TRANSACTIONAL">{$_('seo.intentTransactional')}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={addKeyword}
          disabled={adding || !form.keyword.trim()}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if adding}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('common.loading')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {$_('seo.addKeyword')}
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
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('seo.deleteKeyword')}</h2>
        <p class="text-sm text-gray-500 mb-6">{$_('seo.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteKeyword(deletingId)}
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
