<script lang="ts">
  import type { Lang } from '$lib/marketing/content/articles';
  import { copyFor, type LandingCopy } from '$lib/marketing/copy';
  import { canonical, landingPath, PRODUCTS } from '$lib/marketing/links';
  import { landingAlternates } from '$lib/marketing/seo/alternates';
  import {
    organizationNode,
    websiteNode,
    softwareApplicationNode,
    faqNode,
    jsonLdScript,
  } from '$lib/marketing/seo/jsonld';
  import Seo from '$lib/marketing/Seo.svelte';

  export let lang: Lang;

  const NAME = 'Marketing AI Assistant';

  /** Widened from the `as const` tuple so `store` can be read on either entry. */
  interface ProductLink {
    key: string;
    name: string;
    url: string;
    store?: string;
  }
  type ProductItem = LandingCopy['products']['items'][number];
  interface ProductCard {
    item: ProductItem;
    product: ProductLink;
  }
  const productLinks: readonly ProductLink[] = PRODUCTS;

  $: copy = copyFor(lang);
  $: productCards = copy.products.items
    .map((item) => ({ item, product: productLinks.find((entry) => entry.key === item.key) }))
    .filter((card): card is ProductCard => card.product !== undefined);
  // The organization node must travel with every graph that references it by @id,
  // otherwise the author/publisher pointers resolve to nothing.
  $: jsonLd = jsonLdScript([
    organizationNode(),
    websiteNode(lang, NAME),
    softwareApplicationNode(NAME, copy.meta.description, lang),
    faqNode(copy.faq.items),
  ]);
</script>

<Seo
  {lang}
  title={copy.meta.title}
  description={copy.meta.description}
  canonicalUrl={canonical(landingPath(lang))}
  alternates={landingAlternates()}
  {jsonLd}
/>

<section class="relative overflow-hidden border-b border-border">
  <div
    class="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-brand/20 blur-3xl"
    aria-hidden="true"
  ></div>
  <div class="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
    <div class="max-w-3xl">
      <h1 class="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-ink md:text-6xl">
        {copy.hero.h1}
      </h1>
      <p class="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted md:text-xl">{copy.hero.sub}</p>
      <div class="mt-10 flex flex-wrap items-center gap-3">
        <a
          href="/register"
          class="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg hover:brightness-110"
          >{copy.hero.primaryCta}</a
        >
        <a
          href="#how"
          class="rounded-lg border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-brand"
          >{copy.hero.secondaryCta}</a
        >
      </div>
    </div>
  </div>
</section>

<section id="features" class="border-b border-border">
  <div class="mx-auto max-w-6xl px-4 py-16 md:py-20">
    <h2 class="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
      {copy.features.heading}
    </h2>
    <p class="mt-3 max-w-2xl text-ink-muted">{copy.features.lead}</p>
    <div class="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each copy.features.items as item (item.title)}
        <article class="rounded-xl border border-border bg-surface p-5">
          <h3 class="font-display text-lg font-semibold text-ink">{item.title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>

<section id="how" class="border-b border-border">
  <div class="mx-auto max-w-6xl px-4 py-16 md:py-20">
    <h2 class="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">{copy.how.heading}</h2>
    <ol class="mt-10 grid gap-6 md:grid-cols-3">
      {#each copy.how.steps as step, index (step.title)}
        <li class="rounded-xl border border-border bg-surface p-6">
          <span
            class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 font-display text-sm font-semibold text-ink"
            aria-hidden="true">{index + 1}</span
          >
          <h3 class="mt-4 font-display text-lg font-semibold text-ink">{step.title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
        </li>
      {/each}
    </ol>
  </div>
</section>

<section id="faq" class="border-b border-border">
  <div class="mx-auto max-w-6xl px-4 py-16 md:py-20">
    <h2 class="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">{copy.faq.heading}</h2>
    <div class="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
      {#each copy.faq.items as item (item.q)}
        <div class="border-l-2 border-brand/40 pl-4">
          <h3 class="font-display text-base font-semibold text-ink">{item.q}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<section id="products">
  <div class="mx-auto max-w-6xl px-4 py-16 md:py-20">
    <h2 class="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
      {copy.products.heading}
    </h2>
    <p class="mt-3 max-w-2xl text-ink-muted">{copy.products.lead}</p>
    <div class="mt-10 grid gap-6 md:grid-cols-2">
      {#each productCards as card (card.item.key)}
        <article class="flex flex-col rounded-xl border border-border bg-surface p-6">
          <h3 class="font-display text-xl font-semibold text-ink">{card.product.name}</h3>
          <p class="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{card.item.blurb}</p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a
              href={card.product.url}
              rel="noopener"
              class="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
              >{copy.products.visitCta}</a
            >
            {#if card.product.store}
              <a
                href={card.product.store}
                rel="noopener"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
                >{copy.products.storeCta}</a
              >
            {/if}
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>
