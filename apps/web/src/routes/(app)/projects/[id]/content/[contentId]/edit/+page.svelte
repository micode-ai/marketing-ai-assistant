<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { api } from '$lib/api/client';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import { onMount } from 'svelte';

  $: projectId = $page.params['id'];
  $: contentId = $page.params['contentId'];

  let content: any = null;
  let loading = true;
  let saving = false;
  let imagePrompt = '';
  let generatingImage = false;

  onMount(async () => {
    try {
      content = await api.get<any>(`/content/${contentId}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      loading = false;
    }
  });

  async function save() {
    if (!content) return;
    saving = true;
    try {
      await api.put(`/content/${contentId}`, {
        title: content.title,
        body: content.body,
        mediaUrls: content.mediaUrls,
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      saving = false;
    }
  }

  async function generateImage(prompt: string) {
    generatingImage = true;
    try {
      const data = await api.post<{ url: string; filename: string }>('/uploads/generate-image', { prompt });
      content.mediaUrls = [...(content.mediaUrls || []), data.url];
      content.body += `\n![${prompt}](${data.url})`;
      content = content; // trigger reactivity
      imagePrompt = '';
    } catch (e: any) {
      alert(e.message);
    } finally {
      generatingImage = false;
    }
  }

  function removeImage(index: number) {
    const url = content.mediaUrls[index];
    content.mediaUrls = content.mediaUrls.filter((_: any, i: number) => i !== index);
    content.body = content.body.replace(new RegExp(`!\\[.*?\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'), '');
    content = content;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center h-64">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
  </div>
{:else if content}
  <div class="max-w-6xl mx-auto p-4 sm:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4 gap-4">
      <input
        type="text"
        bind:value={content.title}
        class="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 w-full text-gray-900 placeholder-gray-400"
        placeholder={$_('content.title')}
      />
      <div class="flex gap-2 flex-shrink-0">
        <button
          on:click={() => goto(`/projects/${projectId}/content`)}
          class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
        >
          {$_('common.cancel')}
        </button>
        <button
          on:click={save}
          disabled={saving}
          class="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? $_('common.saving') : $_('common.save')}
        </button>
      </div>
    </div>

    <!-- Language badge -->
    {#if content.language}
      <div class="mb-3">
        <span class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded font-medium uppercase">{content.language}</span>
      </div>
    {/if}

    <!-- Markdown Editor -->
    <MarkdownEditor
      bind:value={content.body}
      on:imageUpload={(e) => { content.mediaUrls = [...(content.mediaUrls || []), e.detail.url]; }}
    />

    <!-- Image generation -->
    <div class="flex gap-2 mt-3">
      <input
        type="text"
        bind:value={imagePrompt}
        placeholder={$_('content.imagePrompt')}
        class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
      />
      <button
        on:click={() => generateImage(imagePrompt)}
        disabled={generatingImage || !imagePrompt}
        class="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
      >
        {generatingImage ? $_('content.generating_image') : $_('content.generateImage')}
      </button>
    </div>

    <!-- Attached images -->
    {#if content.mediaUrls?.length}
      <div class="mt-3">
        <p class="text-sm text-gray-500 mb-1">{$_('content.attachedImages')}</p>
        <div class="flex flex-wrap gap-2">
          {#each content.mediaUrls as url, i}
            <div class="relative group">
              <img src={url} alt="" class="w-20 h-20 object-cover rounded border border-gray-200" />
              <button
                on:click={() => removeImage(i)}
                class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >x</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="flex items-center justify-center h-64">
    <p class="text-gray-500">Content not found</p>
  </div>
{/if}
