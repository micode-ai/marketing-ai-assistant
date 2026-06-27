<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client';
  import { marked } from 'marked';

  export let show = false;
  export let slug = '';

  let loading = false;
  let title = '';
  let htmlContent = '';

  marked.setOptions({ breaks: true, gfm: true });

  $: if (show && slug) {
    loadArticle(slug);
  }

  async function loadArticle(articleSlug: string) {
    loading = true;
    title = '';
    htmlContent = '';
    try {
      const data = await api.get<{ title: string; content: string }>(
        '/help/' + articleSlug,
        { lang: $locale || 'en' }
      );
      title = data.title;
      htmlContent = marked.parse(data.content) as string;
    } catch (err) {
      console.error('Failed to load help article:', err);
      htmlContent = '<p class="text-red-500">Failed to load article.</p>';
    } finally {
      loading = false;
    }
  }

  function close() {
    show = false;
  }

  function openFull() {
    goto('/help?article=' + slug);
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && show) {
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/30 z-40"
    on:click={close}
  ></div>

  <!-- Drawer panel -->
  <div
    class="fixed top-0 right-0 h-full z-50 w-full sm:w-[400px] bg-surface shadow-2xl border-l border-border flex flex-col transform transition-transform duration-300"
    class:translate-x-0={show}
  >
    <!-- Header -->
    <div class="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between flex-shrink-0">
      <h2 class="text-lg font-semibold text-ink truncate">
        {title || $_('help.drawer.title')}
      </h2>
      <button
        on:click={close}
        class="text-ink-subtle hover:text-ink-muted transition-colors duration-150 cursor-pointer p-1 -mr-1"
        aria-label="Close"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-5 py-4">
      {#if loading}
        <div class="flex items-center justify-center py-12">
          <div class="flex flex-col items-center gap-3">
            <svg class="animate-spin h-6 w-6 text-brand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm text-ink-muted">{$_('help.loading')}</span>
          </div>
        </div>
      {:else}
        <div class="prose prose-sm max-w-none">
          {@html htmlContent}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex-shrink-0">
      <button
        on:click={openFull}
        class="text-sm text-brand hover:text-primary-700 font-medium transition-colors duration-150 cursor-pointer"
      >
        {$_('help.openFull')} &rarr;
      </button>
    </div>
  </div>
{/if}
