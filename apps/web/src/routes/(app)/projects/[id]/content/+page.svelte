<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';

  let contents: any[] = [];
  let loading = true;
  let showModal = false;
  let generating = false;
  $: projectId = $page.params['id'];

  let form = { type: 'SOCIAL_POST', platform: '', topic: '', tone: 'professional', length: 'medium' };

  onMount(async () => {
    contents = await api.get<any[]>('/content', { projectId });
    loading = false;
  });

  async function generateContent() {
    generating = true;
    try {
      await api.post('/agent/run', { projectId, agentType: 'CONTENT', input: { ...form } });
      contents = await api.get<any[]>('/content', { projectId });
      showModal = false;
    } catch(e: any) {
      alert(e.message);
    } finally {
      generating = false;
    }
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
                <span class="text-xs px-2 py-0.5 rounded {statusBadge[content.status] || 'bg-gray-100 text-gray-600'}">{content.status}</span>
                {#if content.aiGenerated}
                  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    AI
                  </span>
                {/if}
              </div>
              <h3 class="font-medium text-gray-900 truncate">{content.title}</h3>
              <p class="text-sm text-gray-500 mt-1 line-clamp-2">{content.body}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-150 cursor-pointer">{$_('common.edit')}</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

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
          </select>
        </div>
        <div>
          <label for="content-topic" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.topic')}</label>
          <input id="content-topic" type="text" bind:value={form.topic} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Product launch, features, benefits..." />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="content-tone" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.tone')}</label>
            <select id="content-tone" bind:value={form.tone} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="inspiring">Inspiring</option>
              <option value="informative">Informative</option>
              <option value="humorous">Humorous</option>
            </select>
          </div>
          <div>
            <label for="content-length" class="block text-sm font-medium text-gray-700 mb-1.5">{$_('content.length')}</label>
            <select id="content-length" bind:value={form.length} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
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
