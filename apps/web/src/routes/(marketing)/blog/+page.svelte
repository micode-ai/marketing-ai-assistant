<script lang="ts">
  import Seo from '$lib/marketing/Seo.svelte';
  import { copyFor } from '$lib/marketing/copy';
  import { blogIndexPath, canonical } from '$lib/marketing/links';
  import { LANGS, type Lang } from '$lib/marketing/content/articles';

  const copy = copyFor('en');

  // Each language name is written in that language itself, not translated — a reader
  // scanning for their own language recognises its native name. This page sits outside
  // the three-language copy system on purpose (it has no single "current" language), so
  // a small local map is the right home for it rather than a new copy key.
  const LANG_NAMES: Record<Lang, string> = { en: 'English', pl: 'Polski', ru: 'Русский' };
</script>

<Seo
  lang="en"
  title={copy.blog.chooserTitle}
  description={copy.blog.chooserLead}
  canonicalUrl={canonical('/blog/')}
  noindex
/>

<section class="mx-auto max-w-3xl px-4 py-16">
  <h1 class="font-display text-3xl font-semibold text-ink">{copy.blog.chooserTitle}</h1>
  <p class="mt-3 text-ink-muted">{copy.blog.chooserLead}</p>
  <ul class="mt-6 space-y-2">
    {#each LANGS as code (code)}
      <li><a class="text-brand underline" href={blogIndexPath(code)} hreflang={code}>{LANG_NAMES[code]}</a></li>
    {/each}
  </ul>
</section>
