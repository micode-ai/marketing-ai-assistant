<script lang="ts">
  import Seo from '$lib/marketing/Seo.svelte';
  import { copyFor } from '$lib/marketing/copy';
  import { blogIndexPath, articlePath, canonical } from '$lib/marketing/links';
  import { blogIndexAlternates } from '$lib/marketing/seo/alternates';
  import { organizationNode, breadcrumbNode, jsonLdScript } from '$lib/marketing/seo/jsonld';
  import type { PageData } from './$types';

  export let data: PageData;

  $: copy = copyFor(data.lang);
  $: jsonLd = jsonLdScript([
    organizationNode(),
    breadcrumbNode([{ name: 'Blog', path: blogIndexPath(data.lang) }]),
  ]);
</script>

<Seo
  lang={data.lang}
  title={copy.blog.indexTitle}
  description={copy.blog.indexDescription}
  canonicalUrl={canonical(blogIndexPath(data.lang))}
  alternates={blogIndexAlternates()}
  {jsonLd}
/>

<section class="mx-auto max-w-3xl px-4 py-16">
  <h1 class="font-display text-3xl font-semibold text-ink">{copy.blog.indexTitle}</h1>

  {#if data.articles.length === 0}
    <p class="mt-6 text-ink-muted">{copy.blog.empty}</p>
  {:else}
    <div class="mt-10 space-y-10">
      {#each data.articles as article (article.slug)}
        <article class="border-b border-border pb-10 last:border-b-0 last:pb-0">
          <h2 class="font-display text-xl font-semibold text-ink">
            <a class="hover:text-brand" href={articlePath(data.lang, article.slug)}>{article.title}</a>
          </h2>
          <p class="mt-2 text-ink-muted">{article.description}</p>
          <p class="mt-3 text-sm text-ink-subtle">
            <time datetime={article.updated}>{copy.blog.updatedOn} {article.updated}</time>
            · {article.readingMinutes} {copy.blog.minutes}
          </p>
          <p class="mt-3">
            <a class="text-sm font-semibold text-brand underline" href={articlePath(data.lang, article.slug)}
              >{copy.blog.readMore}</a
            >
          </p>
        </article>
      {/each}
    </div>
  {/if}
</section>
