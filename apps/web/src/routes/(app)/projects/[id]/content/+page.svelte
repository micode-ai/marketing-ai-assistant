<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import { organizationIdStore } from '$lib/stores/projects';

  let contents: any[] = [];
  let loading = true;
  let showModal = false;
  let generating = false;
  $: projectId = $page.params['id'];

  let form = { type: 'SOCIAL_POST', platform: '', topic: '', tone: 'professional', length: 'medium' };

  // Edit modal state
  let editingContent: any = null;
  let editForm = { title: '', body: '' };
  let editSaving = false;

  // Delete confirm state
  let deletingId: string | null = null;

  // LangSmith trace link shown after generation
  let lastTraceUrl: string | null = null;

  // Repurpose modal state
  let repurposingContent: any = null;
  let repurposeTarget = 'SOCIAL_POST';
  let repurposeLoading = false;

  // Performance scores
  let performanceScores: any[] = [];
  let showPerformance = false;

  // Publish modal state
  let publishingContent: any = null;
  let socialAccounts: any[] = [];
  let selectedAccountIds: string[] = [];
  let publishLoading = false;
  let publishResults: any[] = [];
  let publishDone = false;

  const STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'];

  onMount(async () => {
    contents = await api.get<any[]>('/content', { projectId });
    loading = false;
    try {
      performanceScores = await api.get<any[]>('/content/performance/scores', { projectId });
    } catch { performanceScores = []; }
  });

  async function generateContent() {
    generating = true;
    lastTraceUrl = null;
    try {
      const run = await api.post<{ id: string; status: string }>('/agent/run', { projectId, agentType: 'CONTENT', input: { ...form, language: $locale } });

      // Poll until the agent run completes (max 60s)
      let finalRun: { status: string; langsmithTraceUrl?: string | null } = run;
      const startTime = Date.now();
      while (finalRun.status === 'PENDING' || finalRun.status === 'RUNNING') {
        if (Date.now() - startTime > 60000) break;
        await new Promise(r => setTimeout(r, 1500));
        finalRun = await api.get<{ status: string; langsmithTraceUrl?: string | null }>(`/agent/runs/${run.id}`);
      }

      lastTraceUrl = finalRun.langsmithTraceUrl ?? null;
      contents = await api.get<any[]>('/content', { projectId });
      showModal = false;
    } catch(e: any) {
      alert(e.message);
    } finally {
      generating = false;
    }
  }

  function openEdit(content: any) {
    editingContent = content;
    editForm = { title: content.title, body: content.body };
  }

  async function saveEdit() {
    if (!editingContent) return;
    editSaving = true;
    try {
      const updated = await api.put<any>(`/content/${editingContent.id}`, editForm);
      contents = contents.map(c => c.id === updated.id ? { ...c, ...updated } : c);
      editingContent = null;
    } catch(e: any) {
      alert(e.message);
    } finally {
      editSaving = false;
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const updated = await api.put<any>(`/content/${id}/status`, { status });
      contents = contents.map(c => c.id === id ? { ...c, ...updated } : c);
    } catch(e: any) {
      alert(e.message);
    }
  }

  async function deleteContent(id: string) {
    try {
      await api.delete(`/content/${id}`);
      contents = contents.filter(c => c.id !== id);
    } catch(e: any) {
      alert(e.message);
    } finally {
      deletingId = null;
    }
  }

  async function openPublish(content: any) {
    publishingContent = content;
    publishResults = [];
    publishDone = false;
    selectedAccountIds = [];
    try {
      socialAccounts = await api.get<any[]>('/social/project-accounts', { projectId });
    } catch (e) {
      socialAccounts = [];
    }
  }

  function toggleAccount(id: string) {
    if (selectedAccountIds.includes(id)) {
      selectedAccountIds = selectedAccountIds.filter(a => a !== id);
    } else {
      selectedAccountIds = [...selectedAccountIds, id];
    }
  }

  async function publishContent() {
    if (!publishingContent || selectedAccountIds.length === 0) return;
    publishLoading = true;
    try {
      const results = await api.post<any[]>('/social/publish', {
        contentId: publishingContent.id,
        socialAccountIds: selectedAccountIds,
        organizationId: $organizationIdStore,
      });
      publishResults = results;
      publishDone = true;
      // Update content status in list if published
      if (results.some((r: any) => r.status === 'PUBLISHED')) {
        contents = contents.map(c => c.id === publishingContent.id ? { ...c, status: 'PUBLISHED', publishedAt: new Date().toISOString() } : c);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      publishLoading = false;
    }
  }

  async function repurposeContent() {
    if (!repurposingContent) return;
    repurposeLoading = true;
    try {
      const newContent = await api.post<any>(`/content/${repurposingContent.id}/repurpose`, { targetType: repurposeTarget });
      contents = [newContent, ...contents];
      repurposingContent = null;
    } catch (e: any) {
      alert(e.message);
    } finally {
      repurposeLoading = false;
    }
  }

  function getScore(contentId: string): number | null {
    const entry = performanceScores.find((p: any) => p.id === contentId);
    return entry ? entry.score : null;
  }

  function scoreColor(score: number): string {
    if (score >= 70) return 'text-green-600 bg-green-50';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-500 bg-red-50';
  }

  const statusBadge: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    REVIEW: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    PUBLISHED: 'bg-blue-100 text-blue-700',
    REJECTED: 'bg-red-100 text-red-600',
  };

  const statusBorderAccent: Record<string, string> = {
    DRAFT: 'border-l-gray-300',
    REVIEW: 'border-l-yellow-400',
    APPROVED: 'border-l-green-500',
    PUBLISHED: 'border-l-blue-500',
    REJECTED: 'border-l-red-400',
  };

  const statusLabel: Record<string, string> = {
    DRAFT: 'content.draft',
    REVIEW: 'content.review',
    APPROVED: 'content.approved',
    PUBLISHED: 'content.published',
    REJECTED: 'content.rejected',
  };
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('content.title')}</h1>
    <button
      on:click={() => showModal = true}
      class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
      {$_('content.generate')}
    </button>
  </div>

  {#if lastTraceUrl}
    <div class="mb-4 flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
      <span class="text-purple-700 flex-1">{$_('content.generated')}</span>
      <a
        href={lastTraceUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="text-purple-600 font-medium hover:text-purple-800 hover:underline flex items-center gap-1"
      >
        LangSmith
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
      <button on:click={() => lastTraceUrl = null} class="text-purple-400 hover:text-purple-600 cursor-pointer ml-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="space-y-3">
      {#each Array(4) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-20"></div>
      {/each}
    </div>
  {:else if contents.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('content.empty')}</h2>
      <p class="text-gray-500 mb-6">{$_('content.emptyDesc')}</p>
      <button
        on:click={() => showModal = true}
        class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors duration-150 flex items-center gap-2 cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        {$_('content.generate')}
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each contents as content}
        <div class="bg-white rounded-xl border border-gray-200 border-l-4 {statusBorderAccent[content.status] || 'border-l-gray-300'} p-5 hover:shadow-sm transition-shadow duration-150">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5 mb-2">
                <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{content.type.replace('_', ' ')}</span>
                {#if content.platform}
                  <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{content.platform}</span>
                {/if}
                <span class="text-xs px-2 py-0.5 rounded {statusBadge[content.status] || 'bg-gray-100 text-gray-600'}">{$_(statusLabel[content.status] || 'content.draft')}</span>
                {#if content.aiGenerated}
                  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    AI
                  </span>
                {/if}
                {#if content.sourceContentId}
                  <span class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">{$_('content.repurposed')}</span>
                {/if}
                {#if getScore(content.id) !== null}
                  <span class="text-xs px-2 py-0.5 rounded font-medium {scoreColor(getScore(content.id))}">{$_('content.score')}: {getScore(content.id)}</span>
                {/if}
              </div>
              <h3 class="font-medium text-gray-900 truncate">{content.title}</h3>
              <p class="text-sm text-gray-500 mt-1 line-clamp-2">{content.body}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <!-- Status dropdown -->
              <select
                value={content.status}
                on:change={e => updateStatus(content.id, (e.target as HTMLSelectElement).value)}
                class="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {#each STATUSES as s}
                  <option value={s}>{$_(statusLabel[s])}</option>
                {/each}
              </select>
              <!-- Publish button -->
              {#if content.status === 'APPROVED' || content.status === 'PUBLISHED'}
                <button
                  on:click={() => openPublish(content)}
                  class="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors duration-150 cursor-pointer flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                  {$_('social.publish')}
                </button>
              {/if}
              <!-- Repurpose button -->
              <button
                on:click={() => repurposingContent = content}
                class="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors duration-150 cursor-pointer flex items-center gap-1"
                title={$_('content.repurpose')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                </svg>
                {$_('content.repurpose')}
              </button>
              <!-- Edit button -->
              <button
                on:click={() => openEdit(content)}
                class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
              >
                {$_('common.edit')}
              </button>
              <!-- Delete button -->
              <button
                on:click={() => deletingId = content.id}
                class="text-xs px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                title={$_('content.deleteContent')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Generate modal -->
{#if showModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{$_('content.generate')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label for="content-type" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.type')}</label>
          <select id="content-type" bind:value={form.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option value="SOCIAL_POST">{$_('content.socialPost')}</option>
            <option value="BLOG_ARTICLE">{$_('content.blogArticle')}</option>
            <option value="EMAIL">{$_('content.emailContent')}</option>
            <option value="NEWSLETTER">{$_('content.newsletter')}</option>
            <option value="AD_COPY">{$_('content.adCopy')}</option>
            <option value="LANDING_PAGE">{$_('content.landingPage')}</option>
            <option value="SEO_ARTICLE">{$_('content.seoArticle')}</option>
            <option value="REFERRAL_COPY">{$_('content.referralCopy')}</option>
            <option value="IN_APP_MESSAGE">{$_('content.inAppMessage')}</option>
          </select>
        </div>
        <div>
          <label for="content-topic" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.topic')}</label>
          <input id="content-topic" type="text" bind:value={form.topic} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder={$_('content.topicPlaceholder')} />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="content-tone" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.tone')}</label>
            <select id="content-tone" bind:value={form.tone} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option value="professional">{$_('content.tones.professional')}</option>
              <option value="casual">{$_('content.tones.casual')}</option>
              <option value="inspiring">{$_('content.tones.inspiring')}</option>
              <option value="informative">{$_('content.tones.informative')}</option>
              <option value="humorous">{$_('content.tones.humorous')}</option>
            </select>
          </div>
          <div>
            <label for="content-length" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.length')}</label>
            <select id="content-length" bind:value={form.length} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option value="short">{$_('content.lengths.short')}</option>
              <option value="medium">{$_('content.lengths.medium')}</option>
              <option value="long">{$_('content.lengths.long')}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={generateContent}
          disabled={generating}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if generating}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {$_('content.generating')}
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {$_('content.generate')}
          {/if}
        </button>
        <button on:click={() => showModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit modal -->
{#if editingContent}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => editingContent = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">{$_('content.editContent')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.topic')}</label>
          <input type="text" bind:value={editForm.title} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.type')}</label>
          <textarea
            bind:value={editForm.body}
            rows="10"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          ></textarea>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={saveEdit}
          disabled={editSaving}
          class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if editSaving}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('common.save')}
        </button>
        <button on:click={() => editingContent = null} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Publish modal -->
{#if publishingContent}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => publishingContent = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('social.publishTo')}</h2>
          <p class="text-xs text-gray-500">{publishingContent.title}</p>
        </div>
      </div>

      {#if publishDone}
        <!-- Results view -->
        <div class="p-6 space-y-3">
          {#each publishResults as result}
            <div class="flex items-center gap-3 p-3 rounded-xl border {result.status === 'PUBLISHED' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}">
              <div class="flex-1">
                <div class="text-sm font-medium {result.status === 'PUBLISHED' ? 'text-green-800' : 'text-red-800'}">{result.accountName} ({result.platform})</div>
                {#if result.status === 'PUBLISHED' && result.platformPostUrl}
                  <a href={result.platformPostUrl} target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 hover:underline">{$_('social.viewPost')} →</a>
                {:else if result.error}
                  <div class="text-xs text-red-600">{result.error}</div>
                {/if}
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full {result.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                {$_('social.status.' + result.status)}
              </span>
            </div>
          {/each}
        </div>
        <div class="p-6 border-t border-gray-100">
          <button on:click={() => publishingContent = null} class="w-full py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
            {$_('common.close')}
          </button>
        </div>
      {:else if socialAccounts.length === 0}
        <!-- No accounts connected -->
        <div class="p-8 text-center">
          <div class="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          </div>
          <p class="text-sm font-medium text-gray-700 mb-1">{$_('social.noProjectAccounts')}</p>
          <p class="text-xs text-gray-500 mb-4">{$_('social.noProjectAccountsDesc')}</p>
          <a href="/projects/{projectId}/settings" class="inline-block text-sm px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-150">
            {$_('social.goToProjectSettings')}
          </a>
        </div>
      {:else}
        <!-- Account selection -->
        <div class="p-6 space-y-2">
          <p class="text-sm text-gray-600 mb-3">{$_('social.publishToDesc')}</p>
          {#each socialAccounts as account}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors duration-150 {selectedAccountIds.includes(account.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}"
              on:click={() => toggleAccount(account.id)}
            >
              <input type="checkbox" checked={selectedAccountIds.includes(account.id)} class="w-4 h-4 text-primary-600 rounded border-gray-300 cursor-pointer" readonly />
              {#if account.profileImageUrl}
                <img src={account.profileImageUrl} alt={account.accountName} class="w-8 h-8 rounded-full flex-shrink-0" />
              {:else}
                <div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500">
                  {account.accountName[0]?.toUpperCase()}
                </div>
              {/if}
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900">{account.accountName}</div>
                <div class="text-xs text-gray-500">{account.platform}</div>
              </div>
            </div>
          {/each}
        </div>
        <div class="p-6 border-t border-gray-100 flex gap-3">
          <button
            on:click={publishContent}
            disabled={publishLoading || selectedAccountIds.length === 0}
            class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {#if publishLoading}
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {$_('social.publishing')}
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              {$_('social.publish')} ({selectedAccountIds.length})
            {/if}
          </button>
          <button on:click={() => publishingContent = null} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
            {$_('common.cancel')}
          </button>
        </div>
      {/if}
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
        <h2 class="text-lg font-semibold text-gray-900 mb-2">{$_('content.deleteContent')}</h2>
        <p class="text-sm text-gray-500 mb-6">{$_('content.confirmDelete')}</p>
        <div class="flex gap-3">
          <button
            on:click={() => deleteContent(deletingId!)}
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

<!-- Repurpose modal -->
{#if repurposingContent}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => repurposingContent = null}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100 flex items-center gap-2.5">
        <div class="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{$_('content.repurpose')}</h2>
          <p class="text-xs text-gray-500 truncate max-w-[300px]">{repurposingContent.title}</p>
        </div>
      </div>
      <div class="p-6 space-y-4">
        <p class="text-sm text-gray-600">{$_('content.repurposeDesc')}</p>
        <div>
          <label for="repurpose-type" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.targetType')}</label>
          <select id="repurpose-type" bind:value={repurposeTarget} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            <option value="SOCIAL_POST">{$_('content.socialPost')}</option>
            <option value="BLOG_ARTICLE">{$_('content.blogArticle')}</option>
            <option value="EMAIL">{$_('content.emailContent')}</option>
            <option value="NEWSLETTER">{$_('content.newsletter')}</option>
            <option value="AD_COPY">{$_('content.adCopy')}</option>
            <option value="LANDING_PAGE">{$_('content.landingPage')}</option>
            <option value="SEO_ARTICLE">{$_('content.seoArticle')}</option>
            <option value="REFERRAL_COPY">{$_('content.referralCopy')}</option>
            <option value="IN_APP_MESSAGE">{$_('content.inAppMessage')}</option>
          </select>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button
          on:click={repurposeContent}
          disabled={repurposeLoading}
          class="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors duration-150 disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {#if repurposeLoading}
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {/if}
          {$_('content.repurpose')}
        </button>
        <button on:click={() => repurposingContent = null} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 text-sm cursor-pointer">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
