<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import SectionHint from '$lib/components/SectionHint.svelte';
  import { currentProjectStore, projectsStore } from '$lib/stores/projects';

  let keywords: any[] = [];
  let loading = true;
  let showModal = false;
  let adding = false;
  let auditing = false;
  let syncing = false;
  let deletingId: string | null = null;
  $: projectId = $page.params['id'];

  // Sync picker with this project
  $: if ($projectsStore.length > 0 && projectId) {
    const project = $projectsStore.find((p: any) => p.id === projectId);
    if (project && $currentProjectStore?.id !== projectId) {
      currentProjectStore.set(project);
    }
  }

  // Derive default locale from svelte-i18n locale
  function deriveSearchLocale(lang: string | null | undefined): string {
    if (!lang) return 'en-US';
    if (lang.startsWith('pl')) return 'pl-PL';
    if (lang.startsWith('ru')) return 'ru-RU';
    return 'en-US';
  }

  $: defaultSearchLocale = deriveSearchLocale($locale);

  let form = {
    keyword: '',
    targetRank: 10,
    intent: 'INFORMATIONAL',
    url: '',
    searchLocale: 'en-US',
  };

  // Keep form.searchLocale in sync with locale when modal opens
  $: if (showModal) {
    form = { ...form, searchLocale: defaultSearchLocale };
  }

  // Rank history cache: keywordId -> number[]
  let historyMap: Record<string, number[]> = {};

  // Record position modal state
  let recordModalKeyword: any = null;
  let recordRank: number | string = '';
  let recordUrl = '';
  let recordNotInTop100 = false;
  let recordSaving = false;

  // Toast notification
  let toast: { message: string; type: 'success' | 'error' | 'warning' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(message: string, type: 'success' | 'error' | 'warning' = 'error') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, type };
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }

  function openRecordModal(kw: any) {
    recordModalKeyword = kw;
    recordRank = '';
    recordUrl = kw.url || '';
    recordNotInTop100 = false;
  }

  function closeRecordModal() {
    recordModalKeyword = null;
    recordSaving = false;
  }

  function handleRecordModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeRecordModal();
  }

  async function saveRecordPosition() {
    if (!recordModalKeyword) return;
    recordSaving = true;
    try {
      const rank = recordNotInTop100 ? null : Number(recordRank);
      await api.post(`/seo/keywords/${recordModalKeyword.id}/rank`, {
        rank,
        url: recordUrl.trim() || undefined,
      });
      showToast($_('seo.recordPosition.recordSuccess'), 'success');
      closeRecordModal();
      await fetchKeywords();
    } catch (e: any) {
      showToast(e.message || $_('seo.recordPosition.recordFailed'), 'error');
    } finally {
      recordSaving = false;
    }
  }

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

  // URL validation: empty allowed, but if filled must start with http(s)://
  function isValidUrl(val: string): boolean {
    if (!val) return true;
    return /^https?:\/\/.+/.test(val);
  }

  $: urlError = form.url && !isValidUrl(form.url) ? true : false;

  async function addKeyword() {
    if (!form.keyword.trim()) return;
    if (urlError) return;
    adding = true;
    try {
      const created = await api.post<any>('/seo/keywords', {
        projectId,
        keyword: form.keyword.trim(),
        targetRank: form.targetRank || undefined,
        intent: form.intent,
        url: form.url.trim() || undefined,
        locale: form.searchLocale,
      });
      keywords = [...keywords, created];
      historyMap[created.id] = [];
      historyMap = historyMap;
      form = { keyword: '', targetRank: 10, intent: 'INFORMATIONAL', url: '', searchLocale: defaultSearchLocale };
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

  async function syncFromGsc() {
    syncing = true;
    try {
      const result = await api.post<{ synced: number; matched: number; skipped: string[] }>(
        '/seo/keywords/sync-from-gsc',
        { projectId },
      );
      showToast(
        $_('seo.syncSuccess', { values: { matched: result.matched, skipped: result.skipped.length } }),
        'success',
      );
      await fetchKeywords();
    } catch (e: any) {
      const code = e?.body?.code || e?.code;
      if (code === 'GSC_NOT_CONFIGURED') {
        showToast($_('seo.errors.gscNotConfigured'), 'warning');
      } else {
        showToast(e.message || $_('seo.syncFailed'), 'error');
      }
    } finally {
      syncing = false;
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

  function getTargetUrlHost(url: string | null | undefined): string {
    if (!url) return '';
    try {
      return new URL(url).host;
    } catch {
      return url;
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

  $: lastSyncedAt = (() => {
    const ts = keywords
      .map((k) => k.lastCheckedAt)
      .filter(Boolean)
      .map((s: string) => new Date(s).getTime())
      .sort((a, b) => b - a)[0];
    if (!ts) return null;
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  })();
</script>

<div class="p-4 sm:p-6">
  <SectionHint sectionKey="seo" titleKey="hints.seo.title" descKey="hints.seo.desc" />

  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{$_('seo.title')}</h1>
      <p class="text-sm text-gray-500 mt-1">{$_('seo.subtitle')}</p>
    </div>
    <div class="flex items-center gap-3">
      <!-- Sync from GSC button -->
      <button
        on:click={syncFromGsc}
        disabled={syncing}
        class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        title={$_('seo.syncFromGsc')}
      >
        {#if syncing}
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {$_('seo.syncing')}
        {:else}
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {$_('seo.syncFromGsc')}
        {/if}
      </button>
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
        on:click={() => { form = { ...form, searchLocale: defaultSearchLocale }; showModal = true; }}
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
        on:click={() => { form = { ...form, searchLocale: defaultSearchLocale }; showModal = true; }}
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
              <th class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">{$_('seo.targetUrl')}</th>
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
              {@const urlHost = getTargetUrlHost(kw.url)}
              <tr class="hover:bg-gray-50/50 transition-colors duration-100">
                <!-- Keyword -->
                <td class="px-5 py-3.5">
                  <span class="text-sm font-medium text-gray-900">{kw.keyword}</span>
                </td>

                <!-- Target URL -->
                <td class="px-5 py-3.5 max-w-[140px]">
                  {#if urlHost}
                    <span class="text-sm text-gray-600 truncate block" title={kw.url}>{urlHost}</span>
                  {:else}
                    <span class="text-sm text-gray-400">—</span>
                  {/if}
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
                  <div class="flex items-center justify-end gap-1">
                    <!-- View history link -->
                    <a
                      href="/projects/{projectId}/seo/keywords/{kw.id}"
                      class="text-gray-400 hover:text-primary-600 transition-colors duration-150 p-1 inline-flex items-center"
                      title={$_('seo.history.viewHistory')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                      </svg>
                    </a>
                    <!-- Record position button -->
                    <button
                      on:click={() => openRecordModal(kw)}
                      class="text-gray-400 hover:text-primary-600 transition-colors duration-150 cursor-pointer p-1"
                      title={$_('seo.recordPosition.title')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <!-- Delete button -->
                    <button
                      on:click={() => deletingId = kw.id}
                      class="text-gray-400 hover:text-red-500 transition-colors duration-150 cursor-pointer p-1"
                      title={$_('seo.deleteKeyword')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
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
        <div class="flex items-center gap-4">
          {#if lastSyncedAt}
            <span class="text-xs text-gray-400 flex items-center gap-1">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {$_('seo.lastSyncedAt', { values: { when: lastSyncedAt } })}
            </span>
          {/if}
          <span class="text-xs text-gray-400">
            {$_('seo.avgDifficulty', { values: { avg: keywords.filter(k => k.difficulty != null).length > 0 ? Math.round(keywords.filter(k => k.difficulty != null).reduce((sum, k) => sum + k.difficulty, 0) / keywords.filter(k => k.difficulty != null).length) : 0 } })}
          </span>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Toast notification -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div class="flex items-start gap-3 rounded-xl shadow-lg border px-4 py-3 text-sm
      {toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
       toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
       'bg-red-50 border-red-200 text-red-800'}">
      {#if toast.type === 'warning'}
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      {:else if toast.type === 'success'}
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
        on:click={() => toast = null}
        aria-label={$_('common.close')}
        class="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
{/if}

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
        <!-- Keyword -->
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

        <!-- Target URL -->
        <div>
          <label for="seo-url" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.targetUrl')}</label>
          <input
            id="seo-url"
            type="text"
            bind:value={form.url}
            class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
              {urlError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'}"
            placeholder="https://your-page.com/path"
          />
          {#if urlError}
            <p class="mt-1 text-xs text-red-500">Must start with https:// or http://</p>
          {:else}
            <p class="mt-1 text-xs text-gray-400">{$_('seo.targetUrlHelper')}</p>
          {/if}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- Target Rank -->
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

          <!-- Intent -->
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
            <p class="mt-1 text-xs text-gray-400">{$_('seo.intentHelper')}</p>
          </div>
        </div>

        <!-- Search Locale -->
        <div>
          <label for="seo-locale" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.locale')}</label>
          <select
            id="seo-locale"
            bind:value={form.searchLocale}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="pl-PL">Polski (pl-PL)</option>
            <option value="en-US">English (en-US)</option>
            <option value="ru-RU">Русский (ru-RU)</option>
          </select>
          <p class="mt-1 text-xs text-gray-400">{$_('seo.localeHelper')}</p>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={addKeyword}
          disabled={adding || !form.keyword.trim() || urlError}
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
            on:click={() => deletingId && deleteKeyword(deletingId)}
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

<!-- Record Position Modal -->
{#if recordModalKeyword}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click|self={closeRecordModal}
    on:keydown={handleRecordModalKeydown}
  >
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-gray-900">{$_('seo.recordPosition.title')}</h2>
          <p class="text-xs text-gray-500 truncate">{recordModalKeyword.keyword}</p>
        </div>
      </div>
      <div class="p-6 space-y-4">
        <p class="text-sm text-gray-500">{$_('seo.recordPosition.description')}</p>

        <!-- Current rank -->
        <div>
          <label for="record-rank" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.recordPosition.rank')}</label>
          <input
            id="record-rank"
            type="number"
            min="1"
            max="100"
            bind:value={recordRank}
            disabled={recordNotInTop100}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            placeholder={$_('seo.recordPosition.rankPlaceholder')}
          />
          <label class="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              bind:checked={recordNotInTop100}
              class="w-4 h-4 text-primary-600 rounded border-gray-300 cursor-pointer"
            />
            <span class="text-sm text-gray-600">{$_('seo.recordPosition.notInTop100')}</span>
          </label>
        </div>

        <!-- Matched URL -->
        <div>
          <label for="record-url" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('seo.recordPosition.url')}</label>
          <input
            id="record-url"
            type="text"
            bind:value={recordUrl}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="https://example.com/page"
          />
          <p class="mt-1 text-xs text-gray-400">{$_('seo.recordPosition.urlHelper')}</p>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={saveRecordPosition}
          disabled={recordSaving || (!recordNotInTop100 && (!recordRank || Number(recordRank) < 1 || Number(recordRank) > 100))}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if recordSaving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('common.loading')}
          {:else}
            {$_('seo.recordPosition.save')}
          {/if}
        </button>
        <button on:click={closeRecordModal} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
