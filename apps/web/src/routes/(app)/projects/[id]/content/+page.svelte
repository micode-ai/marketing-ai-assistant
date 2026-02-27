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
</script>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">{$_('content.title')}</h1>
    <button on:click={() => showModal = true} class="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition flex items-center gap-2">
      🤖 {$_('content.generate')}
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
      <div class="text-5xl mb-4">✍️</div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{$_('content.empty')}</h2>
      <p class="text-gray-500 mb-6">{$_('content.emptyDesc')}</p>
      <button on:click={() => showModal = true} class="bg-primary-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-primary-700 transition">
        🤖 {$_('content.generate')}
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each contents as content}
        <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5 mb-2">
                <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{content.type.replace('_', ' ')}</span>
                {#if content.platform}
                  <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{content.platform}</span>
                {/if}
                <span class="text-xs px-2 py-0.5 rounded {statusBadge[content.status] || 'bg-gray-100 text-gray-600'}">{content.status}</span>
                {#if content.aiGenerated}
                  <span class="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded">🤖 AI</span>
                {/if}
              </div>
              <h3 class="font-medium text-gray-900 truncate">{content.title}</h3>
              <p class="text-sm text-gray-500 mt-1 line-clamp-2">{content.body}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button class="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition">{$_('common.edit')}</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click|self={() => showModal = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div class="p-6 border-b border-gray-100">
        <h2 class="text-lg font-semibold">🤖 {$_('content.generate')}</h2>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('content.type')}</label>
          <select bind:value={form.type} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="SOCIAL_POST">{$_('content.socialPost')}</option>
            <option value="BLOG_ARTICLE">{$_('content.blogArticle')}</option>
            <option value="EMAIL">{$_('content.emailContent')}</option>
            <option value="NEWSLETTER">{$_('content.newsletter')}</option>
            <option value="AD_COPY">{$_('content.adCopy')}</option>
            <option value="LANDING_PAGE">{$_('content.landingPage')}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">{$_('content.topic')}</label>
          <input type="text" bind:value={form.topic} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Product launch, features, benefits..." />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{$_('content.tone')}</label>
            <select bind:value={form.tone} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="inspiring">Inspiring</option>
              <option value="informative">Informative</option>
              <option value="humorous">Humorous</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{$_('content.length')}</label>
            <select bind:value={form.length} class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>
        </div>
      </div>
      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button on:click={generateContent} disabled={generating} class="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 text-sm">
          {generating ? '⏳ ' + $_('content.generating') : '🤖 ' + $_('content.generate')}
        </button>
        <button on:click={() => showModal = false} class="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm">
          {$_('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
