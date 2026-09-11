<script lang="ts">
  import type { Lang } from '$lib/marketing/content/articles';
  import type { Alternate } from '$lib/marketing/seo/alternates';
  import { SITE } from '$lib/marketing/links';

  export let title: string;
  export let description: string;
  export let canonicalUrl: string;
  export let alternates: Alternate[] = [];
  export let jsonLd: string | null = null;
  export let noindex = false;
  export let ogType = 'website';
  export let lang: Lang;

  const ogLocale: Record<Lang, string> = { en: 'en_US', pl: 'pl_PL', ru: 'ru_RU' };
  $: image = `${SITE}/icon-512.png`;
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonicalUrl} />
  {#if noindex}
    <meta name="robots" content="noindex,follow" />
  {:else}
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
  {/if}
  {#each alternates as alternate (alternate.hreflang)}
    <link rel="alternate" hreflang={alternate.hreflang} href={alternate.href} />
  {/each}
  <meta property="og:type" content={ogType} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={image} />
  <meta property="og:site_name" content="Marketing AI Assistant" />
  <meta property="og:locale" content={ogLocale[lang]} />
  {#each alternates.filter((a) => a.hreflang !== 'x-default' && a.hreflang !== lang) as other (other.hreflang)}
    <meta property="og:locale:alternate" content={ogLocale[other.hreflang as Lang]} />
  {/each}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
  {#if jsonLd}
    {@html `<script type="application/ld+json">${jsonLd}<\/script>`}
  {/if}
</svelte:head>
