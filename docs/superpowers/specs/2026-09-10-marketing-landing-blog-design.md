# Marketing Landing Page and Blog — Design

**Date:** 2026-09-10
**Issue:** [#206](https://github.com/micode-ai/marketing-ai-assistant/issues/206)
**Status:** proposed

## Goal

Turn `https://emarketingai.pl/` into an indexable marketing landing page for the product, with a
multilingual article section at `/blog/`, dofollow links to the other MICODE properties
(backlinks), and a footer that credits `mi-code.pl`.

The reference implementation is the sibling repository `ai-budget-assistant`, where the apex serves
a static multilingual landing plus `/blog`, and the app lives on `app.ai-budget.pl`. We copy the
*shape* of that site — static HTML, hreflang, JSON-LD, sitemap, `llms.txt` — but not its toolchain,
and the app does **not** move.

The landing must satisfy SEO (classic search indexing), GEO (generative engine optimization — being
usable and citable by AI crawlers) and AEO (answer engine optimization — being the source an AI
answer quotes).

## Facts about the current site that shape the design

Verified 2026-09-10 in this repository.

| Fact | Consequence |
|---|---|
| `apps/web/src/routes/+layout.ts` sets `ssr = false; prerender = false` — the whole web app is CSR-only. | A crawler currently receives an empty shell. The marketing routes must override these options; nothing else can make the landing indexable. |
| `apps/web/src/routes/+layout.svelte` renders nothing until `onMount` finishes `setupI18n()` + `waitLocale()`. | Even with SSR on, the root layout would emit a spinner. The i18n gate has to move out of the root layout. |
| `apps/web/src/routes/+page.svelte` redirects `/` to `/login` or `/dashboard`. | `/` is free to become the landing; the redirect is deliberately removed. |
| `app.html` runs an inline script that adds `.dark` to `<html>` unless `localStorage.theme === 'light'`. | The landing is dark by default in the Iris palette and follows an explicit light choice. It must therefore be built from the semantic tokens, not hardcoded colors. |
| `app.html` hardcodes `<html lang="en">`. | `/pl/` and `/ru/` would declare the wrong language. Fixed with a `%lang%` placeholder substituted in `hooks.server.ts` via `transformPageChunk` (hooks also run during prerendering). |
| `apps/web/static/sitemap.xml` exists as a static file with two URLs. | A static file wins over a route of the same path, so it is deleted and the sitemap becomes a generated endpoint. |
| `apps/web/static/robots.txt` already disallows the authenticated app areas. | Kept and extended; the blog stays crawlable. |
| `.dockerignore` excludes `*.md` — a root-level pattern only, so nested markdown is copied into the build context. | Article markdown can live in the repository and be read at build time. |
| `docker/Dockerfile.web` runs `pnpm --filter=@marketing-ai/web build` and serves `apps/web/build` with `adapter-node`. | Prerendered pages are emitted into `build/prerendered` and served by the existing container. No infrastructure change at all. |

## Approach

**Chosen: a prerendered `(marketing)` route group inside `apps/web`.**

The group overrides the root options with `ssr = true`, `prerender = true`, `csr = false` and
`trailingSlash = 'always'`. `csr = false` is the important one: the pages ship as plain HTML with no
client-side JavaScript bundle, which is exactly what the reference static site produces, and it
removes any dependency on client-side i18n for the visible copy. Language switching is ordinary
links; the mobile menu is CSS and `<details>`.

Rejected alternatives:

- **Port the Python generators from `ai-budget-assistant` and split traffic in nginx.** Proven code
  and a fully independent landing, but it adds a second toolchain (Python + Pillow) to a Node
  monorepo, a new deploy step, a duplicated design system, and production nginx edits.
- **A separate `apps/landing` on `adapter-static`.** One language, but still another package,
  another image, and the same nginx split — for a result the chosen approach reaches without
  touching infrastructure.

Neither the DNS, the TLS certificate, `nginx.conf`, nor any OAuth redirect URI changes.

## Routes and files

```
apps/web/src/routes/
  +layout.svelte              thin: imports app.css, renders <slot/>
  +layout.ts                  unchanged (ssr=false, prerender=false — the app default)
  (marketing)/
    +layout.ts                ssr=true, prerender=true, csr=false, trailingSlash='always'
    +layout.svelte            marketing header (logo, language links, Log in, Start free) + footer
    +page.svelte              /            EN landing
    [lang=mlang]/+page.svelte /pl/, /ru/
    blog/
      +page.svelte            /blog/       language chooser, noindex, not in the sitemap
      [lang=blang]/
        +page.svelte          /blog/<lang>/           article index
        [slug]/+page.svelte   /blog/<lang>/<slug>/    article
    sitemap.xml/+server.ts    generated from the content set
    llms.txt/+server.ts
    llms-full.txt/+server.ts
  src/params/mlang.ts         matcher: pl|ru
  src/params/blang.ts         matcher: en|pl|ru
```

Route groups do not appear in URLs, so `(marketing)/+page.svelte` is `/`.

The param matchers keep the dynamic `[lang]` segment from competing with application paths such as
`/login`. Static routes already win over dynamic ones in SvelteKit; the matchers remove the whole
class of mistake.

Supporting code lives in `apps/web/src/lib/marketing/`:

| File | Responsibility |
|---|---|
| `seo/Seo.svelte` | The single source of truth for `<head>`: title, description, canonical, hreflang set, Open Graph, Twitter, JSON-LD. |
| `seo/jsonld.ts` | Pure builders: `organizationNode`, `websiteNode`, `softwareApplicationNode`, `articleNode`, `faqNode`, `breadcrumbNode`. |
| `content/frontmatter.ts` | A small frontmatter parser (no new dependency). |
| `content/articles.ts` | Loads and validates the article set, resolves translation pairs. |
| `copy/{en,pl,ru}.ts` | Landing copy per language as plain objects — deliberately not `svelte-i18n`, so the text is present in the prerendered HTML. |
| `links.ts` | Every outbound URL in one place: `mi-code.pl`, `ai-budget.pl`, its Google Play listing, `eksiegowyai.pl`, product social profiles. |

## Article content model

Files: `apps/web/src/content/blog/<lang>/<NN>-<slug>.md`. They live inside `apps/web` so
`import.meta.glob` sees them without escaping the Vite root.

```markdown
---
slug: ai-content-calendar
lang: en
pair: ai-content-calendar     # links translations of the same article -> hreflang
title: How to build an AI content calendar
description: at most 155 characters; becomes the meta description
date: 2026-09-10
updated: 2026-09-10
tags: [content, planning]
faq:
  - q: What is an AI content calendar?
    a: A short, direct answer. Feeds both the on-page FAQ and FAQPage JSON-LD.
---

The first paragraph answers the question in the title outright — definition first, no run-up.
That paragraph is what an AI answer quotes.

## h2 / h3 sections, lists, tables
```

Loading: `import.meta.glob('/src/content/blog/**/*.md', { query: '?raw', eager: true })` at build
time, parsed by `frontmatter.ts` and rendered with `marked`, which `apps/web` already depends on.
No `DOMPurify` pass: the markdown is our own reviewed repository content, not user input, and
`DOMPurify` needs a DOM it does not have during prerendering. This matches the existing help page,
which also renders trusted markdown with `marked` alone.

Publishing an article is a pull request plus a deploy, which gives the text a review for free.

Validated by tests, not by eye:

- `slug` is unique within a language;
- every `pair` value resolves to at most one file per language, and always to the article itself;
- `description` is present and at most 155 characters;
- `date` and `updated` parse, and `updated` is not earlier than `date`;
- the language of every article is one of `en`, `pl`, `ru`.

## SEO, GEO and AEO

### Head, on every marketing page

- `title`, `meta description`, absolute `<link rel="canonical">` with a trailing slash.
- `robots: index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1`.
- A complete `hreflang` set (`en`, `pl`, `ru`) plus `x-default` pointing at English — on landings
  and on articles, where the pairs come from the frontmatter `pair` key.
- Open Graph (`og:type`, `og:locale`, `og:locale:alternate`, `og:image`) and a Twitter card. The
  interim `og:image` is the existing 512x512 `static/icon-512.png` with `twitter:card=summary`; a
  designed 1200x630 card and `summary_large_image` are a follow-up.
- `<html lang>` matching the page language.

### JSON-LD

Landing pages emit an `@graph` with `WebSite`, `Organization`, `SoftwareApplication`, `FAQPage` and
`BreadcrumbList`. `Organization` is MICODE sp. z o.o. with `url: https://mi-code.pl/` and a
`sameAs` list of the product social profiles. The sibling products are *not* in `sameAs` — that
property means identity pages for the same entity, and `ai-budget.pl` is a different product; they
are dofollow links in the page body, which is what the backlinks actually need.

Article pages emit `Article` (`headline`, `description`, `datePublished`, `dateModified`,
`inLanguage`, `author`, `publisher`, `mainEntityOfPage`, `image`), `BreadcrumbList`, and `FAQPage`
when the frontmatter defines `faq`.

**Not emitted:** `aggregateRating`, `Review`, and `offers`. The product has no published ratings,
and pricing is deliberately out of scope for this iteration (see below). Inventing structured data
is both a Google penalty and a lie in the markup.

### GEO and AEO

These are mostly properties of the content, not of the meta tags:

- `/llms.txt` following the llmstxt.org shape: what the product is, who it is for, links to the
  sections. `/llms-full.txt` is the full text of the landing pages and every article in markdown.
- Definition-first writing: the first paragraph of every article and every landing section answers
  its heading directly.
- An explicit FAQ block on the landing and in articles, mirrored into `FAQPage`.
- Facts in tables and lists (publishing channels, supported languages, what each agent does), each
  page carrying a visible "last updated" date and an explicit attribution to MICODE sp. z o.o.
- Stable URLs with trailing slashes, and a sitemap that lists every language variant.

### Sitemap and robots

`static/sitemap.xml` is deleted and replaced by a prerendered `/sitemap.xml` endpoint listing the
three landings, the three blog indexes and every article, with `lastmod` from the frontmatter.
`/blog/` (the language chooser) is `noindex` and stays out of the sitemap.

`static/robots.txt` keeps its existing `Disallow` list for the authenticated app and keeps pointing
at the sitemap.

## Landing page content

The same section order in all three languages, with copy written per language rather than
translated mechanically:

1. **Hero** — an `h1` carrying the target query ("AI marketing assistant" / "asystent marketingowy
   AI" / "ИИ-ассистент для маркетинга"), a one-sentence subheading, and two calls to action:
   "Start free" to `/register`, and "See how it works" to an anchor.
2. **Features** — only what exists: multilingual AI content generation, publishing to Facebook,
   Instagram, Threads, TikTok, LinkedIn and Telegram, analytics with AI recommendations, SEO and
   rank tracking through Search Console, CRM, email campaigns, Google Play analytics for mobile app
   projects.
3. **How it works** — three steps: create a project, agents generate, publish and measure.
4. **FAQ** — six to eight questions, mirrored into `FAQPage`.
5. **Other MICODE products** — cards with dofollow links to `ai-budget.pl` (plus its Google Play
   listing) and `eksiegowyai.pl`.
6. **Footer** — the MICODE sp. z o.o. logo linking to `mi-code.pl`, product social links, the
   existing `privacy.html` and `terms.html`, the language switcher and a link to the blog.

**No pricing section in this iteration** (explicit decision, 2026-09-10). Consequently there is no
`offers` node in the JSON-LD and no pricing question in the FAQ.

## Root layout refactor

`src/routes/+layout.svelte` stops being the i18n gate and becomes `import '../app.css'` plus
`<slot/>`. The gate — `setupI18n()`, `waitLocale()` and the branded spinner — moves into
`(app)/+layout.svelte` and `(auth)/+layout.svelte`, both of which already exist.

`auth/callback` is the only route outside those groups; it uses no translations, so it needs no
gate. This is the ordering constraint for implementation: the refactor lands and is verified first,
before any landing work, because a botched move renders the application as raw translation keys.

## Risks

| Risk | Mitigation |
|---|---|
| The i18n gate move breaks the application UI. | Done as the first step, on its own, verified by running the app and the existing web test suite before any marketing code is written. |
| `/` no longer redirects signed-in users to `/dashboard`. | Accepted and intended — a redirect leaves nothing to index. The header always shows "Log in"; a prerendered page cannot personalize, which also keeps it cacheable. |
| Prerendering reaches for the API and fails the build. | Marketing `load` functions read only repository markdown. `hooks.server.ts` runs during prerendering with no cookie and yields `locals.user = null`. |
| Marketing markup breaks the shared web build. | Caught by `pnpm --filter @marketing-ai/web build` and lint in CI, same as any other change to the app. |
| hreflang links point one way only. | A unit test asserts reciprocity across the whole article set. |

## Testing and proof

Unit tests (Vitest, already configured in `apps/web`):

- the frontmatter parser;
- the article-set invariants listed above;
- sitemap construction — the exact URL list and `lastmod` values;
- hreflang reciprocity across every article and landing;
- JSON-LD builders — valid JSON with the required fields per type.

Build-artifact checks after `pnpm --filter @marketing-ai/web build`, which is what actually proves
indexability:

- `build/prerendered/index.html`, `pl/index.html`, `ru/index.html` and `blog/en/<slug>/index.html`
  exist;
- each contains an `<h1>`, the body copy, a canonical link, the full hreflang set and JSON-LD;
- `<html lang>` matches the page language;
- no `_app` bundle is referenced, proving `csr = false` took effect.

Plus `pnpm --filter @marketing-ai/web lint` and the existing web tests, to confirm the layout
refactor broke nothing.

## Out of scope, and follow-ups

- **Pricing section** — deliberately deferred.
- **Product screenshots.** The landing ships with CSS mockups; real screenshots can be captured
  from the demo account afterwards and dropped into `static/`.
- **Self-hosted fonts.** `app.css` pulls Space Grotesk and Inter through a Google Fonts `@import`,
  which is render-blocking on the landing. `preconnect` is already in `app.html`; self-hosting is a
  separate, later change.
- **Directory badges** (Startup Fame, PeerPush and similar) — the reference site carries them; we
  add them once the corresponding submissions exist.
- **Reciprocal backlinks** from `ai-budget.pl` and `eksiegowyai.pl` back to `emarketingai.pl` — a
  change in those repositories, tracked separately.
- **Serving articles from the database** (publishing generated `Content` records straight to the
  blog) — considered and rejected for now in favour of reviewed markdown.

## Open inputs

- Product social profile URLs (Facebook, LinkedIn, X, other). Until they are supplied, the footer
  slots and the `sameAs` array stay empty rather than guessed.
- ~~Which articles ship first, and in which languages.~~ Decided 2026-09-10: three topics, each in
  all three languages (nine files) — AI content generation for social media, building a monthly
  content plan, and social analytics without manual reports.
