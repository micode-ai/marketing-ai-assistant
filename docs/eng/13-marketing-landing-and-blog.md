# Marketing Landing Page and Blog

## Overview

`apps/web` serves two very different things from one SvelteKit app: an authenticated, client-rendered SPA (everything under `(app)` and `(auth)`), and a public, search-engine-facing marketing site — a landing page in three languages plus a multilingual blog. The marketing site is prerendered to plain HTML with **no JavaScript bundle at all**, because the entire point is that Google, Bing and LLM crawlers see real text without executing anything.

Shipped as issue [#206](https://github.com/micode-ai/marketing-ai-assistant/issues/206), across ten implementation tasks. `docs/ru/13-marketing-landing-and-blog.md` is the Russian version of this document.

**Public URLs:**

| URL | Content |
|---|---|
| `/` | English landing page |
| `/pl/` | Polish landing page |
| `/ru/` | Russian landing page |
| `/blog/` | Language chooser (noindex) |
| `/blog/<lang>/` | Blog index for that language |
| `/blog/<lang>/<slug>/` | One article |
| `/sitemap.xml` | All indexable marketing URLs |
| `/llms.txt` | Short, structured summary for AI crawlers |
| `/llms-full.txt` | The full corpus (landing copy + every article body) for AI crawlers |

`/` used to redirect into the authenticated app; it does not any more. It is a real, indexable page.

`apps/web/src/app.html` has no hardcoded `<meta name="description">` of its own — it used to, and because it sits before `%sveltekit.head%`, it silently shadowed the per-language description every marketing page renders (search engines take the first occurrence). The authenticated app doesn't need a fallback description: those routes are `noindex`-equivalent by being disallowed in `robots.txt`.

**Key files:**

| Path | Purpose |
|---|---|
| `apps/web/src/routes/(marketing)/+layout.ts` | Overrides `ssr`/`prerender`/`csr`/`trailingSlash` for the whole group |
| `apps/web/src/routes/(marketing)/+layout.svelte` | Shared header + footer (nav, language switcher, sibling-product links) |
| `apps/web/src/routes/(marketing)/+page.svelte`, `[lang=mlang]/` | Landing pages (English at `/`, `pl`/`ru` under a prefix) |
| `apps/web/src/routes/(marketing)/blog/` | Blog chooser, per-language index, article route |
| `apps/web/src/routes/(marketing)/sitemap.xml/`, `llms.txt/`, `llms-full.txt/` | Prerendered `+server.ts` endpoints |
| `apps/web/src/lib/marketing/Landing.svelte` | The landing page body, shared by all three languages |
| `apps/web/src/lib/marketing/Seo.svelte` | Owns `<svelte:head>` — title, description, canonical, hreflang, Open Graph, Twitter card, JSON-LD |
| `apps/web/src/lib/marketing/copy/{en,pl,ru}.ts` | Landing page copy dictionaries |
| `apps/web/src/lib/marketing/content/` | Frontmatter parser, article model, build-time validation, the loaded article set |
| `apps/web/src/lib/marketing/seo/` | `jsonld.ts`, `alternates.ts`, `sitemap.ts` |
| `apps/web/src/lib/marketing/links.ts` | Every internal/outbound URL used by the marketing site |
| `apps/web/src/lib/marketing/lang-from-path.ts` | Derives the page language from the URL (no JS at runtime to ask) |
| `apps/web/src/content/blog/<lang>/*.md` | The article source files |
| `apps/web/src/params/mlang.ts`, `blang.ts` | Param matchers restricting the `[lang=...]` route segments |
| `apps/web/src/lib/i18n/I18nGate.svelte` | The app's i18n loading gate (moved out of the root layout — see below) |
| `apps/web/src/hooks.server.ts` | Fills the `%lang%` placeholder in `app.html` |
| `apps/web/static/robots.txt` | Crawl rules |

---

## The `(marketing)` route group

The root `apps/web/src/routes/+layout.ts` sets the defaults for the whole app:

```ts
export const ssr = false;
export const prerender = false;
```

`csr` is not set there, so it stays at SvelteKit's default of `true`. That combination — no SSR, yes CSR, no prerender — is exactly what a JWT-gated single-page app wants: nothing about an authenticated page can usefully be rendered on the server anyway, since a bare fetch has no cookie-backed session to hydrate against.

`apps/web/src/routes/(marketing)/+layout.ts` overrides all three, plus `trailingSlash`, for every route inside the group:

```ts
export const ssr = true;
export const prerender = true;
export const csr = false;
export const trailingSlash = 'always';
```

`csr = false` is the option that actually removes the JavaScript bundle — `ssr`/`prerender` control *when* the HTML is generated (build time vs. request time), but without `csr = false` SvelteKit still ships hydration code and a router for the page. A marketing page has no interactivity that needs a router: every link is a real `<a href>`, forms don't exist, and the only reason to ship JS would be to make the exact same HTML that prerendering already produced. `csr = false` is what makes the artifact evidence below (zero `_app/immutable/*.js`) possible.

`trailingSlash = 'always'` keeps every marketing URL — landing pages, blog indexes, articles — canonical with a trailing slash, matching what `links.ts` (`landingPath`, `blogIndexPath`, `articlePath`) and the sitemap/hreflang builders already assume.

Neither `(app)` nor `(auth)` has its own `+layout.ts`, so both inherit the root's `ssr=false, prerender=false, csr=true` unchanged.

### The article route's `prerender = 'auto'`

Every route in the group is `prerender = true` by inheritance from the group layout, **except** `blog/[lang=blang]/[slug]/+page.ts`, which sets `prerender = 'auto'` explicitly:

```ts
// 'auto' (not the group's usual forced `true`): with no markdown files yet, entries()
// below returns nothing and the route is never crawled, which SvelteKit's default
// handleUnseenRoutes treats as a build error for a route forced to `true`. 'auto' still
// prerenders every entry this generates once articles exist — it only drops the "this
// route produced zero pages" failure for the interim state where none do.
export const prerender = 'auto';
```

This only matters for a hypothetical state where `ARTICLES` is empty — with the nine shipped articles, `entries()` always returns nine `{lang, slug}` pairs and every one of them is prerendered as a static file, exactly as if the route were forced to `true`. Don't read `'auto'` as "sometimes prerendered, sometimes not" — it prerenders everything `entries()` names; it only relaxes the check for the zero-entries edge case.

### A static file beats a route of the same path

`apps/web/static/` is served as-is, and SvelteKit resolves a static asset before it resolves a route of the same path. Early in this work, `apps/web/static/sitemap.xml` existed (a placeholder) at the same time as the `sitemap.xml/+server.ts` route — the static file always won, and the endpoint's build-time-computed sitemap was silently never reachable. The static file was deleted; the route is now the only source of `/sitemap.xml`. If a route you added under `(marketing)` behaves like it's not running at all, check `apps/web/static/` for a file at the same path first.

---

## Landing copy: plain objects, not `svelte-i18n`

The rest of the app uses `svelte-i18n`: locale files are loaded lazily in the browser, the store initializes after `onMount`, and pages show a loading state until it resolves (see [Internationalization](09-internationalization.md) and the `I18nGate` section below). That is fine for a CSR app — there is always JavaScript running to load the locale.

The marketing pages have `csr = false`. If they went through `svelte-i18n`, the prerendered HTML would contain no translated text at all — the locale would only ever resolve in a browser, and a crawler (or a real visitor with slow JS) would see either nothing or a loading skeleton. So marketing copy is plain, statically-imported TypeScript objects instead:

```
apps/web/src/lib/marketing/copy/
  types.ts   — LandingCopy interface (the shape every language must match)
  en.ts      — English dictionary
  pl.ts      — Polish dictionary
  ru.ts      — Russian dictionary
  index.ts   — COPY: Record<Lang, LandingCopy>, copyFor(lang)
  copy.test.ts
```

Because `copyFor(lang)` is called during server-side rendering (prerendering *is* server-side rendering, just done once at build time and cached to a file), the returned strings are already baked into the HTML — no client-side lookup, no flash of untranslated content, no loading state.

`copy.test.ts` enforces that this stays true across all three languages:

- **Same key structure.** `keyPaths(COPY.en)` is compared against `keyPaths(COPY.pl)` and `keyPaths(COPY.ru)` — if a key exists in one language and not another (including inside an array, e.g. a missing FAQ item), the test fails and names which language differs.
- **No empty strings.** Every leaf value must be a non-empty, non-whitespace string.
- **Meta description length.** `meta.description` must be ≤ 155 characters in every language (search engines truncate snippets past that).
- **Exactly six FAQ entries** per language, because the FAQ block feeds `FAQPage` JSON-LD and an inconsistent count would be a content bug, not a technical one.

If you add a new key to `LandingCopy` in `types.ts`, you must add it to `en.ts`, `pl.ts` and `ru.ts` in the same PR — the test fails otherwise, by design.

---

## Articles

### Where they live, and the model

```
apps/web/src/content/blog/en/*.md
apps/web/src/content/blog/pl/*.md
apps/web/src/content/blog/ru/*.md
```

Each file is frontmatter + Markdown body. `apps/web/src/lib/marketing/content/index.ts` loads all of them at build/dev time with `import.meta.glob('/src/content/blog/**/*.md', { query: '?raw', import: 'default', eager: true })`, and immediately runs them through `buildArticles()` from `content/articles.ts`. `buildArticles` throws on any invariant violation, and because `ARTICLES` is computed at module scope, **that throw happens while Vite is building/loading the module** — a broken article fails the whole build (or crashes dev-server startup), it does not silently produce a broken page.

`content/frontmatter.ts` is a deliberately minimal frontmatter reader — not a YAML library — because the articles only ever use three shapes:

```yaml
---
slug: ai-social-media-content
lang: en
pair: ai-social-content
title: How to generate social media content with AI without sounding like a robot
description: A one-sentence summary, ≤155 characters.
date: 2026-09-10
updated: 2026-09-10
tags: [content, social media, ai]
faq:
  - q: Can AI write social media posts that sound human?
    a: AI writes social posts that sound human when it is given the brand voice, the audience and real product details.
  - q: How much editing does an AI draft need?
    a: An AI draft usually needs its opening line and call to action rewritten by hand.
---

Markdown body starts here. `## Headings`, tables, lists — anything `marked` supports.
```

- Scalar `key: value` pairs, values optionally quoted (`'single'` or `"double"` — only stripped when the same quote opens and closes the value, so `Marketers'` is not partially stripped).
- Inline arrays: `tags: [content, planning]`.
- One `faq:` list of `- q: ...` / `a: ...` pairs (used for the FAQ section on the article page and the `FAQPage` JSON-LD node).

The parsed result becomes an `Article`:

```ts
interface Article {
  slug: string;
  lang: Lang;           // 'en' | 'pl' | 'ru'
  pair: string;          // links this article to its translations
  title: string;
  description: string;
  date: string;           // ISO, first published
  updated: string;         // ISO, last modified — defaults to `date` if absent
  tags: string[];
  faq: FaqEntry[];
  html: string;            // rendered from the Markdown body via `marked`
  readingMinutes: number;  // Math.max(1, round(wordCount / 200))
}
```

`content/index.ts` also exports `RAW_BODIES` — the same glob, keyed by `${lang}/${slug}`, holding the *unparsed* Markdown body. `/llms-full.txt` uses this instead of `Article.html` so AI crawlers get the original Markdown rather than stripped/rendered HTML.

### The invariants that fail the build

`toArticle()` and the two cross-file checks in `buildArticles()` throw `Error`s that name the offending file (and, for the two duplicate checks, both colliding files). These are the ones you will actually hit:

| Rule | Error contains |
|---|---|
| `slug`, `lang`, `pair`, `title`, `description`, `date` missing or empty | `frontmatter key "<key>" is missing or empty` |
| `lang` is not `en`/`pl`/`ru` | `unknown language "<lang>"` |
| `slug` has anything other than lowercase letters, digits, hyphens | `slug "<slug>" must be lowercase letters, digits and hyphens only` |
| `description` longer than 155 characters | `description is <n> characters, the limit is 155` |
| `date` or `updated` is not `YYYY-MM-DD` / not a real date | `<key> "<value>" is not an ISO date` |
| `updated` earlier than `date` | `updated (<u>) is earlier than date (<d>)` |
| Two files in the same language reuse a `slug` | `duplicate slug "<slug>" in language "<lang>": <path1> and <path2>` |
| Two files in the same language share one `pair` | `pair "<pair>" has more than one "<lang>" article: <path1> and <path2>` |

The slug character restriction exists because slugs end up both in URLs and, unescaped, inside the generated sitemap XML — an `&` or `<` in a slug would produce invalid XML.

None of this is caught by TypeScript; it is all runtime validation against the actual Markdown files, which is why `articles.test.ts` exercises every one of these paths directly against `buildArticles()`, and `real-content.test.ts` asserts facts about the *actual* shipped content (nine articles, three per language, every `pair` translated into all three languages, reciprocal hreflang, every article has at least three FAQ entries).

### How to add an article

1. **Pick a `pair` slug.** If this is a new topic, invent one (short, kebab-case, stable — it is never shown to a user, only used to link translations). If you're adding a missing translation of an existing article, reuse that article's `pair` exactly.
2. **Write the English file first** (or whichever language you have): `apps/web/src/content/blog/en/NN-your-slug.md` — the `NN-` prefix is just for readable file listing, it is not read by the parser. Fill in `slug`, `lang`, `pair`, `title`, `description` (≤155 chars), `date`, `updated`, `tags`, and at least three FAQ pairs — `real-content.test.ts` requires ≥3 per article (the six-per-language rule from `copy.test.ts` is a landing-page-only constraint and does not apply to articles). The shipped articles all have exactly three.
3. **Translate into the other two languages**, one file each in `content/blog/pl/` and `content/blog/ru/`, with the **same `pair`** and a language-appropriate `slug`. `pairSlugs()` / `articleAlternates()` build hreflang from whichever slugs share a `pair` — if you forget a translation, that language is simply missing from the alternates (no error), but `real-content.test.ts`'s "translates every article into all three languages" check will fail once your new pair is in the corpus, because it asserts every `pair` has all three languages.
4. **Run the tests:**
   ```bash
   cd apps/web && corepack pnpm exec vitest run
   ```
   `articles.test.ts` validates the parser/builder logic in isolation; `real-content.test.ts` and `copy.test.ts` validate the actual files you just added. A typo in a frontmatter key, a description over 155 characters, a `date`/`updated` mismatch, a duplicate slug, or a missing translation all fail here before you get anywhere near a build.
5. **Build and check the artifact:**
   ```bash
   corepack pnpm --filter @marketing-ai/web build
   ```
   Confirm your article appears under `apps/web/.svelte-kit/output/prerendered/pages/blog/<lang>/<slug>/index.html`, and that `/sitemap.xml` and `/llms.txt` in the same output picked it up (see "How to verify the prerendered output" below).

You do not need to touch any route file, the sitemap builder, or the `llms.txt`/`llms-full.txt` endpoints — all of them derive their article list from `ARTICLES` / `articlesFor()` and pick up new files automatically as long as the invariants above are satisfied.

---

## SEO

`apps/web/src/lib/marketing/Seo.svelte` is the single place that writes into `<svelte:head>` for every marketing page: `<title>`, meta description, canonical link, `robots` (index or `noindex,follow` for the blog chooser), `hreflang` alternates, Open Graph tags (including `og:locale:alternate` for the other languages), Twitter card tags, and the JSON-LD `<script>` block if one is passed in.

**hreflang** (`seo/alternates.ts`) — `landingAlternates()`, `blogIndexAlternates()` and `articleAlternates(slugs)` each return every language this specific page actually has, plus an `x-default` entry pointing at the English URL (skipped only by `articleAlternates` when there is no English translation of that pair). This is deliberately data-driven from `pairSlugs()` rather than assuming all three languages always exist, because `articleAlternates` is used per-article and a translation could in principle be missing.

**JSON-LD** (`seo/jsonld.ts`) — every page builds a single `@graph` via `jsonLdScript([...nodes])`, escaping every `<` to `\u003c` so a literal `</script>` inside any field (an FAQ answer, say) cannot break out of the script tag. Nodes used:

- `organizationNode()` — on every page; carries `@id` so other nodes can reference it by `author`/`publisher` without repeating it. `sameAs` is only added if `SOCIALS` (in `links.ts`) is non-empty — see "What's deliberately absent" below.
- `websiteNode()`, `softwareApplicationNode()`, `faqNode()` — landing pages only.
- `breadcrumbNode()` — blog index and article pages.
- `articleNode()` — article pages only; carries both `datePublished`/`dateModified` and `author`/`publisher` pointers back to the organization node.

The organization node must travel with every graph that references it by `@id` — a graph with `articleNode()` but not `organizationNode()` would have `author: {"@id": "…/#organization"}` pointing at nothing. Every page that builds a graph includes `organizationNode()` first for this reason (see the `$: jsonLd = jsonLdScript([organizationNode(), ...])` pattern in `Landing.svelte` and both blog page components).

**What's deliberately absent:** no `offers` and no `aggregateRating` on the `SoftwareApplication` node (there is no price to advertise and no review data to back a rating — inventing either would be structured-data spam), and no invented social profiles in `sameAs` (`SOCIALS` in `links.ts` is an empty array with a comment explaining why: "an invented profile in `sameAs` is worse than no `sameAs` at all"). `jsonld.test.ts` pins both of these ("never advertises a price or a rating").

**`/blog/` is `noindex` and self-canonical.** `canonicalUrl` on the chooser is `canonical('/blog/')`, i.e. its own URL, not `blogIndexPath('en')`. A `noindex` page whose canonical points somewhere else asks Google to fold the two together — which here would mean folding a `noindex` page onto `/blog/en/`, a real, indexable page that's in the sitemap. Self-canonical plus `noindex,follow` avoids that; `follow` is what actually gets the three blog indexes crawled from here. The chooser also links each language by its own name written in that language — "English", "Polski", "Русский" — via a small local `LANG_NAMES` map in `blog/+page.svelte` rather than a new copy key, since this page has no single "current" language for the three-language copy system to key off.

### The language switcher follows the content

`(marketing)/+layout.svelte`'s per-language links (`en` / `pl` / `ru` in the header) used to always point at `landingPath(code)` — so switching language from a blog index or an article sent the reader to that language's home page, even when hreflang on the same page said the translated content existed. They now read `$page.data.langHrefs`, falling back to `landingPath(code)` when a page doesn't provide one:

- The blog index's `load` returns `blogIndexPath(lang)` for all three languages (an index always exists per language, even an empty one).
- The article's `load` returns `articlePath(lang, slug)` for every language present in `pairSlugs(article.pair)`, and `blogIndexPath(lang)` for a language the article was never translated into — so the switcher never links to a 404.
- Landing pages don't set `langHrefs`; the layout's fallback (`landingPath(code)`) is exactly right for them.

`App.PageData` (`apps/web/src/app.d.ts`) declares `langHrefs?: Partial<Record<Lang, string>>` and `lastUpdated?: string` so these per-page fields type-check across the group.

### Visible "last updated" dates and `CONTENT_REVIEWED`

The GEO/AEO goal from the design doc is that every page carries a visible last-updated date, not just a `<meta>` one. Articles already showed this inline (`copy.blog.updatedOn` + `data.article.updated`, at the top of the article body); the three landings and three blog indexes did not, and the landings' sitemap `lastmod` was the build date — which re-dates all three on every deploy even when the copy hasn't changed, a signal Google learns to distrust.

Both are fixed from one constant, `CONTENT_REVIEWED` in `links.ts` (bump it by hand when the landing copy actually changes):

- `sitemapEntries()` uses `CONTENT_REVIEWED` as the landings' `lastmod` (blog indexes keep deriving theirs from the newest article via `newestUpdated()`, unchanged).
- Each landing's `load` (`(marketing)/+page.ts`, `[lang=mlang]/+page.ts`) and the blog index's `load` return `lastUpdated` — `CONTENT_REVIEWED` for landings, `newestUpdated(articlesForLang) ?? CONTENT_REVIEWED` for a blog index (matching its own sitemap `lastmod`).
- `(marketing)/+layout.svelte`'s footer renders a `{copy.blog.updatedOn} {lastUpdated}` line whenever `$page.data.lastUpdated` is set. It's absent on article pages (already shown inline) and the `/blog/` chooser (no single date applies).

`newestUpdated()` (`content/articles.ts`) is the one place that computes "the latest `updated` among a set of articles" — shared by the sitemap and the blog index loader so the two never disagree.

---

## Sitemap, `llms.txt`, `llms-full.txt` and `robots.txt`

All three text endpoints live under `(marketing)` as `+server.ts` files with `export const prerender = true`, and all use SvelteKit's `text()` helper rather than `new Response(...)` — the repo's ESLint config has no `Response` global configured, so a raw `new Response()` would be a lint error there.

**`/sitemap.xml`** (`seo/sitemap.ts`) lists every indexable URL: the three landing pages, the three blog indexes, and every article, each with a `<lastmod>`. A *landing* page uses `CONTENT_REVIEWED` (see "Visible 'last updated' dates" above) — not the build date. The blog *index* uses the newest `updated` date among that language's articles (falling back to "today" if there are none yet); an article uses its own `updated`. `/blog/` — the noindex language chooser — is deliberately absent from the sitemap: listing a page you tell robots not to index would be contradictory.

**`/llms.txt`** is a short, structured Markdown summary aimed at AI crawlers: the site description, links to all three landing pages, and a link + one-line description for every article in every language. It is meant to be read in full by something building a picture of the site, not humans browsing it.

**`/llms-full.txt`** is the same idea taken further: for each language, the entire landing page copy (hero, features, how-it-works, FAQ) followed by every article's *original Markdown body* (from `RAW_BODIES`, not the rendered HTML), concatenated. This is the "give a language model the whole corpus" endpoint. Articles sit under one `## Articles` heading, each titled `### <title>` with its canonical URL on the line right after — one level below the landing sections' `##`, so an article's own `##` subheadings don't read as siblings of "Articles", and a model quoting a passage has a URL to cite.

**`robots.txt`** (a static file at `apps/web/static/robots.txt`, not a route) disallows every authenticated app path (`/dashboard`, `/projects`, `/settings`, …) and auth internals (`/auth/`, `/forgot-password`), explicitly allows `/blog/`, and points at `/sitemap.xml`. It does not need an explicit `Allow: /` for the landing pages — disallow rules are the only thing that removes default-allowed access, and none of them touch `/`, `/pl/` or `/ru/`. JS/CSS under `/_app/` is intentionally *not* blocked, because Googlebot needs to fetch it to render the authenticated app's pages that *are* allowed — but note the marketing pages have no `/_app/*.js` to fetch in the first place (see below).

---

## The i18n gate move

Before this work, `apps/web/src/routes/+layout.svelte` (the root layout, applied to *every* route including the marketing group) called `setupI18n()` and `waitLocale()` from `svelte-i18n` and blocked rendering behind a spinner until the locale resolved. That is exactly the client-side-only behavior the marketing pages needed to avoid.

The gate itself, `$lib/i18n/I18nGate.svelte`, is unchanged — it still does `onMount(async () => { await setupI18n(); await waitLocale(); ready = true })` and renders a spinner until `ready`. What changed is *where it's applied*: it moved out of the root layout and into `(app)/+layout.svelte` and `(auth)/+layout.svelte` individually. The root layout (`+layout.svelte`) no longer references it at all — it is `(marketing)` that now inherits nothing from a gate that would never resolve without JavaScript. `(app)` and `(auth)` still block on it exactly as before; nothing about the authenticated app's i18n behavior changed, verified by opening `/login` with JavaScript enabled and confirming every label is translated (not raw keys like `auth.login.title`) rather than showing the gate's spinner indefinitely.

---

## `<html lang>`

`apps/web/src/app.html` has `<html lang="%lang%">` — `%lang%` is not one of SvelteKit's own `%sveltekit.*%` placeholders, so it is filled in manually in `apps/web/src/hooks.server.ts`:

```ts
return resolve(event, {
  transformPageChunk: ({ html }) => html.replace('%lang%', langFromPath(event.url.pathname)),
});
```

`langFromPath()` (`lib/marketing/lang-from-path.ts`) reads the language straight from the URL — the first path segment, or the second if the first is `blog` — defaulting to `en` for anything it doesn't recognize (including every authenticated-app route, which is intentional: the app itself is English-shell with `svelte-i18n` handling in-page text, so its `<html lang>` stays `en`). This runs during prerendering too, which is why every prerendered page has the correct `lang` attribute baked in rather than defaulting to whatever `app.html` would produce unmodified.

---

## Analytics and cookie consent

Traffic is measured with Google Analytics 4: property `emarketingai.pl` (measurement ID
`G-TRW80SRBNV`, web stream `emarketingai.pl web`, stream ID `15757937313`, account
`perevetkinma`). Everything about measurement lives in one inline script in
`apps/web/src/app.html`, and that is deliberate: the marketing pages are prerendered with no
client bundle, `/login` and `/register` are client-rendered application pages, and `app.html` is
the only file both share. Keeping it in one place also means the whole tracking surface can be
audited by reading a single script.

Three rules the script enforces:

- **Consent first.** Consent Mode v2 defaults are `denied` for `analytics_storage`, `ad_storage`,
  `ad_user_data` and `ad_personalization`, set before `gtag.js` is requested, so no analytics
  cookie exists until the visitor accepts. The decision is stored in `localStorage` under
  `consent-analytics` (`granted` / `denied`) and replayed with `gtag('consent', 'update', ...)` on
  later visits.
- **Public pages only.** The script returns immediately unless the path is `/`, `/pl/`, `/ru/`,
  anything under `/blog`, `/login` or `/register`. Authenticated application screens are never
  measured — their URLs carry project identifiers that have no business in a Google property.
- **Production only.** It also returns unless `location.hostname === 'emarketingai.pl'`, so local
  development and preview builds cannot pollute the property.

The banner is built by the script rather than rendered by Svelte. That keeps it out of the
prerendered HTML (so crawlers never index it), avoids adding copy keys to the three dictionaries —
and therefore leaves the key-structure test alone — and works identically on prerendered and
client-rendered pages. Its text follows `<html lang>` on the marketing pages; on `/login` and
`/register`, which are always rendered as English, it follows the visitor's stored `locale`
instead. Colours come from the Iris CSS variables, so it is correct in both themes. With
JavaScript disabled there is no banner and no measurement, which is the right outcome rather than
a gap.

Known limits: a client-side navigation inside the application shell (`/login` to `/register`)
fires no second `page_view`, because GA only sees the initial load; every arrival from the
marketing pages is a full page load, so the landing-to-register funnel stays intact. A handful of
`localhost` events from the installation check sit in the property's history.

`apps/web/static/privacy.html` documents the analytics cookie and names Google Analytics as a
sub-processor. Keep the two in step if the measurement setup changes.

---

## How to verify the prerendered output

After `corepack pnpm --filter @marketing-ai/web build`, the marketing pages land under `apps/web/.svelte-kit/output/prerendered/pages/`: `index.html`, `pl/index.html`, `ru/index.html`, `blog/index.html`, `blog/<lang>/index.html` for each language, `blog/<lang>/<slug>/index.html` for each article, plus `sitemap.xml`, `llms.txt` and `llms-full.txt` as plain files (19 files total for the shipped 3 landings + 1 chooser + 3 blog indexes + 9 articles + 3 text endpoints).

The property that matters is **zero** `_app/immutable/*.js` and **zero** `modulepreload` anywhere in that directory — that's what proves `csr = false` actually removed the bundle rather than just hiding it. One `_app/immutable/*.css` link per page is expected and correct (the pages are still styled with Tailwind — only the JS is gone):

```bash
cd apps/web/.svelte-kit/output/prerendered/pages
grep -rhoE '_app/immutable/[^"'"'"']*\.js' . | wc -l   # expect 0
grep -rho 'modulepreload' . | wc -l                     # expect 0
grep -rhoE '_app/immutable/[^"'"'"']*\.css' . | sort -u # expect exactly one shared file
```

Also worth spot-checking after any change to this area: `<html lang="...">` matches the page's language, the `hreflang` alternates on `/` point at all three languages plus `x-default`, and `/sitemap.xml` / `/llms.txt` contain the article you just added or changed.

For a full manual pass, run `corepack pnpm --filter @marketing-ai/web dev` and open `/`, `/pl/`, `/ru/`, `/blog/en/`, one article, `/blog/`, and `/login` — the marketing pages should render completely, and `/login` should show translated labels (confirming the i18n gate move didn't break the authenticated app's i18n).
