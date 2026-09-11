<script lang="ts">
  import Seo from '$lib/marketing/Seo.svelte';
  import { copyFor } from '$lib/marketing/copy';
  import { blogIndexPath, articlePath, canonical } from '$lib/marketing/links';
  import { articleAlternates } from '$lib/marketing/seo/alternates';
  import { organizationNode, articleNode, breadcrumbNode, faqNode, jsonLdScript } from '$lib/marketing/seo/jsonld';
  import type { PageData } from './$types';

  export let data: PageData;

  $: copy = copyFor(data.article.lang);
  // The organization node must travel with every graph that references it by @id,
  // otherwise the author/publisher pointers on the article node resolve to nothing.
  $: jsonLd = jsonLdScript([
    organizationNode(),
    articleNode(data.article),
    breadcrumbNode([
      { name: 'Blog', path: blogIndexPath(data.article.lang) },
      { name: data.article.title, path: articlePath(data.article.lang, data.article.slug) },
    ]),
    ...(data.article.faq.length > 0 ? [faqNode(data.article.faq)] : []),
  ]);
</script>

<Seo
  lang={data.article.lang}
  title={data.article.title}
  description={data.article.description}
  canonicalUrl={canonical(articlePath(data.article.lang, data.article.slug))}
  alternates={articleAlternates(data.alternateSlugs)}
  ogType="article"
  {jsonLd}
/>

<article class="mx-auto max-w-3xl px-4 py-12">
  <h1 class="font-display text-3xl font-semibold text-ink">{data.article.title}</h1>
  <p class="mt-2 text-sm text-ink-subtle">
    <time datetime={data.article.updated}>{copy.blog.updatedOn} {data.article.updated}</time>
    · {data.article.readingMinutes} {copy.blog.minutes}
  </p>
  <div class="prose dark:prose-invert mt-8 max-w-none">{@html data.article.html}</div>

  {#if data.article.faq.length > 0}
    <section class="mt-12">
      <h2 class="font-display text-2xl font-semibold text-ink">{copy.blog.faqHeading}</h2>
      {#each data.article.faq as item (item.q)}
        <h3 class="mt-6 font-medium text-ink">{item.q}</h3>
        <p class="mt-1 text-ink-muted">{item.a}</p>
      {/each}
    </section>
  {/if}

  <p class="mt-12"><a class="text-brand underline" href={blogIndexPath(data.article.lang)}>{copy.blog.backToIndex}</a></p>
</article>
