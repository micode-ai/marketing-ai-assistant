<script lang="ts">
  import Seo from '$lib/marketing/Seo.svelte';
  import { copyFor } from '$lib/marketing/copy';
  import { blogIndexPath, canonical } from '$lib/marketing/links';
  import { LANGS } from '$lib/marketing/content/articles';

  const copy = copyFor('en');
</script>

<Seo
  lang="en"
  title={copy.blog.chooserTitle}
  description={copy.blog.chooserLead}
  canonicalUrl={canonical(blogIndexPath('en'))}
  noindex
/>

<section class="mx-auto max-w-3xl px-4 py-16">
  <h1 class="font-display text-3xl font-semibold text-ink">{copy.blog.chooserTitle}</h1>
  <p class="mt-3 text-ink-muted">{copy.blog.chooserLead}</p>
  <ul class="mt-6 space-y-2">
    {#each LANGS as code (code)}
      <li><a class="text-brand underline" href={blogIndexPath(code)} hreflang={code}>{blogIndexPath(code)}</a></li>
    {/each}
  </ul>
</section>
