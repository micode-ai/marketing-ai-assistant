<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client';
  import { marked } from 'marked';
  import { onMount } from 'svelte';

  marked.setOptions({ breaks: true, gfm: true });

  interface ArticleSummary {
    slug: string;
    title: string;
  }

  interface Article {
    slug: string;
    title: string;
    content: string;
    lang: string;
  }

  let articles: ArticleSummary[] = [];
  let activeSlug = '';
  let article: Article | null = null;
  let loadingList = true;
  let loadingArticle = false;
  let renderedContent = '';

  function currentLang(): string {
    return $locale || 'en';
  }

  async function loadArticles() {
    loadingList = true;
    try {
      articles = await api.get<ArticleSummary[]>('/help', { lang: currentLang() });
    } catch (e) {
      console.error('Failed to load help articles:', e);
      articles = [];
    } finally {
      loadingList = false;
    }
  }

  async function loadArticle(slug: string) {
    if (!slug) return;
    loadingArticle = true;
    article = null;
    renderedContent = '';
    try {
      article = await api.get<Article>('/help/' + slug, { lang: currentLang() });
      renderedContent = marked.parse(article.content, { async: false }) as string;
    } catch (e) {
      console.error('Failed to load article:', e);
      article = null;
      renderedContent = '';
    } finally {
      loadingArticle = false;
    }
  }

  function selectArticle(slug: string) {
    activeSlug = slug;
    goto(`/help?article=${slug}`, { replaceState: true, noScroll: true });
    loadArticle(slug);
  }

  onMount(async () => {
    await loadArticles();

    const querySlug = $page.url.searchParams.get('article');
    if (querySlug && articles.some(a => a.slug === querySlug)) {
      activeSlug = querySlug;
    } else if (articles.length > 0) {
      activeSlug = articles[0].slug;
    }

    if (activeSlug) {
      loadArticle(activeSlug);
    }
    mounted = true;
  });

  // Re-load when locale changes (skip initial mount)
  let mounted = false;
  $: if ($locale && mounted) {
    loadArticles().then(() => {
      if (activeSlug) loadArticle(activeSlug);
    });
  }
</script>

<div class="p-4 sm:p-6">
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-ink">{$_('help.title')}</h1>
    <p class="text-ink-muted mt-1 text-sm">{$_('help.subtitle')}</p>
  </div>

  {#if loadingList}
    <!-- Loading skeleton -->
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
    </div>
  {:else if articles.length === 0}
    <div class="text-center py-12 text-ink-muted">
      <p>{$_('help.noResults')}</p>
    </div>
  {:else}
    <!-- Mobile: select dropdown -->
    <div class="md:hidden mb-4">
      <select
        class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        value={activeSlug}
        on:change={(e) => selectArticle(e.currentTarget.value)}
      >
        {#each articles as a}
          <option value={a.slug}>{a.title}</option>
        {/each}
      </select>
    </div>

    <div class="flex gap-0 md:gap-0">
      <!-- Sidebar (desktop only) -->
      <aside class="hidden md:block w-64 flex-shrink-0 border-r border-border pr-4">
        <nav class="space-y-1">
          {#each articles as a}
            <button
              on:click={() => selectArticle(a.slug)}
              class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer
                {activeSlug === a.slug
                  ? 'bg-brand-subtle/10 text-brand font-medium'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}"
            >
              {a.title}
            </button>
          {/each}
        </nav>
      </aside>

      <!-- Content -->
      <main class="flex-1 md:pl-6 min-w-0">
        {#if loadingArticle}
          <div class="bg-surface rounded-xl border border-border p-6">
            <div class="animate-pulse space-y-4">
              <div class="h-6 bg-surface-2 rounded w-1/3"></div>
              <div class="h-4 bg-surface-2 rounded w-full"></div>
              <div class="h-4 bg-surface-2 rounded w-5/6"></div>
              <div class="h-4 bg-surface-2 rounded w-4/6"></div>
              <div class="h-4 bg-surface-2 rounded w-full"></div>
              <div class="h-4 bg-surface-2 rounded w-3/4"></div>
            </div>
          </div>
        {:else if article}
          <div class="bg-surface rounded-xl border border-border p-6">
            <h2 class="text-xl font-semibold text-ink mb-4">{article.title}</h2>
            <div class="prose prose-sm max-w-none text-ink">
              {@html renderedContent}
            </div>
          </div>
        {:else}
          <div class="text-center py-12 text-ink-muted">
            <p>{$_('help.noResults')}</p>
          </div>
        {/if}
      </main>
    </div>
  {/if}
</div>
