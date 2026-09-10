<script lang="ts">
  import { page } from '$app/stores';
  import { langFromPath } from '$lib/marketing/lang-from-path';
  import { copyFor } from '$lib/marketing/copy';
  import { landingPath, blogIndexPath, COMPANY, SOCIALS } from '$lib/marketing/links';
  import { LANGS } from '$lib/marketing/content/articles';

  $: lang = langFromPath($page.url.pathname);
  $: copy = copyFor(lang);
  $: year = new Date().getFullYear();
</script>

<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-ink">{copy.nav.skipToContent}</a>

<div class="min-h-screen bg-canvas text-ink">
  <header class="border-b border-border">
    <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
      <a href={landingPath(lang)} class="font-display text-lg font-semibold text-ink">Marketing AI Assistant</a>
      <div class="ml-auto flex flex-wrap items-center justify-end gap-4 text-sm">
        <a href={blogIndexPath(lang)} class="text-ink-muted hover:text-ink">{copy.nav.blog}</a>
        <div class="flex items-center gap-2">
          {#each LANGS as code (code)}
            <a
              href={landingPath(code)}
              hreflang={code}
              class="uppercase {code === lang ? 'text-ink font-semibold' : 'text-ink-subtle hover:text-ink'}"
              >{code}</a
            >
          {/each}
        </div>
        <a href="/login" class="text-ink-muted hover:text-ink">{copy.nav.login}</a>
        <a href="/register" class="rounded-lg bg-brand px-3 py-2 font-medium text-brand-fg">{copy.nav.start}</a>
      </div>
    </nav>
  </header>

  <main id="main" tabindex="-1"><slot /></main>

  <footer class="border-t border-border bg-surface">
    <div class="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-ink-muted md:grid-cols-3">
      <div>
        <a href={COMPANY.url} rel="noopener" class="font-display text-base font-semibold text-ink">{COMPANY.name}</a>
        <p class="mt-2">{copy.footer.about}</p>
      </div>
      <div>
        <p class="font-medium text-ink">{copy.footer.legal}</p>
        <ul class="mt-2 space-y-1">
          <li><a href="/privacy.html" class="hover:text-ink">{copy.footer.privacy}</a></li>
          <li><a href="/terms.html" class="hover:text-ink">{copy.footer.terms}</a></li>
          <li><a href={blogIndexPath(lang)} class="hover:text-ink">{copy.footer.blog}</a></li>
        </ul>
      </div>
      {#if SOCIALS.length > 0}
        <ul class="space-y-1">
          {#each SOCIALS as social (social.url)}
            <li><a href={social.url} rel="noopener" class="hover:text-ink">{social.name}</a></li>
          {/each}
        </ul>
      {/if}
    </div>
    <!-- COMPANY.name ends in a full stop ("sp. z o.o."), so it supplies its own separator. -->
    <p class="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-subtle">
      © {year} {COMPANY.name} {copy.footer.rights}
    </p>
  </footer>
</div>
