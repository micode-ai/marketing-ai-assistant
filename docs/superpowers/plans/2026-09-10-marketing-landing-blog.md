# Marketing Landing Page and Blog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://emarketingai.pl/` an indexable marketing landing page in English, Polish and Russian, with a multilingual article section at `/blog/<lang>/<slug>/`, dofollow links to the other MICODE properties, and the SEO/GEO/AEO plumbing (canonical, hreflang, JSON-LD, sitemap, `llms.txt`).

**Architecture:** A new `(marketing)` route group inside the existing SvelteKit app (`apps/web`) overrides the app-wide client-only rendering with `ssr = true`, `prerender = true`, `csr = false`, so the marketing pages are emitted at build time as plain HTML with no JavaScript bundle. Landing copy lives in per-language TypeScript objects (not `svelte-i18n`, which is client-side and would leave the HTML empty); articles live as markdown files in the repository and are parsed at build time. Nothing about the deployment changes — same container, same nginx, same domain.

**Tech Stack:** SvelteKit 2 (`adapter-node`), Svelte 5, TypeScript, TailwindCSS with the Iris token set, `marked`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-marketing-landing-blog-design.md` (issue [#206](https://github.com/micode-ai/marketing-ai-assistant/issues/206))

## Global Constraints

- Branch: `feat/marketing-landing-blog`, already created from `origin/development` and holding the spec commit. All work goes here; the PR targets `development`.
- Every commit message is English, conventional-commit style, and ends with these two trailer lines:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013Q83d64eJTu96nrziNBRUX
  ```
- Site origin is `https://emarketingai.pl` (no trailing slash in the constant). Every marketing URL ends with a trailing slash: `/`, `/pl/`, `/blog/en/`, `/blog/en/<slug>/`.
- Languages are exactly `en`, `pl`, `ru`. English is the default and lives at `/` (no `/en/` landing). `x-default` points at the English URL.
- **No prices anywhere** — no pricing section, no `offers` node in JSON-LD, no pricing FAQ entry. Explicit product decision, 2026-09-10.
- **No invented structured data** — no `aggregateRating`, no `Review`, no testimonials. The product has none published.
- Run tests with `cd apps/web && corepack pnpm exec vitest run` — plain `pnpm --filter @marketing-ai/web test` starts Vitest in watch mode and never exits.
- Lint with `corepack pnpm --filter @marketing-ai/web lint` before pushing. `no-explicit-any` is a pre-existing warning across the app; only errors block.
- Build with `corepack pnpm --filter @marketing-ai/web build`. It must stay green after every task.
- Marketing code must never call the API. Prerendering runs at build time with no backend available.
- Colors come from the Iris semantic tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-brand`, `text-brand-fg`, `prose dark:prose-invert`). No hardcoded hex values — the landing renders in both themes because `app.html` sets `.dark` unless the visitor chose light.
- Social profile URLs are unknown. `SOCIALS` stays an empty array; the footer renders nothing for it. Do not invent URLs.

---

### Task 1: Move the i18n gate out of the root layout

The root layout currently renders nothing until `onMount` finishes loading translations. Any server-rendered marketing page under it would still emit only a spinner, so this has to move first. Nothing else in the plan works until this is done and the application still looks right.

**Files:**
- Create: `apps/web/src/lib/i18n/I18nGate.svelte`
- Modify: `apps/web/src/routes/+layout.svelte` (whole file)
- Modify: `apps/web/src/routes/(app)/+layout.svelte` (wrap the rendered markup)
- Modify: `apps/web/src/routes/(auth)/+layout.svelte` (wrap the rendered markup)

**Interfaces:**
- Consumes: `setupI18n` from `$lib/i18n` (existing).
- Produces: `I18nGate.svelte` — a component that renders its slot only after `setupI18n()` and `waitLocale()` resolve. Used by the `(app)` and `(auth)` layouts; the `(marketing)` group deliberately does not use it.

- [ ] **Step 1: Create the gate component with the markup lifted verbatim from the root layout**

`apps/web/src/lib/i18n/I18nGate.svelte`:

```svelte
<script lang="ts">
  import { setupI18n } from '$lib/i18n';
  import { waitLocale } from 'svelte-i18n';
  import { onMount } from 'svelte';

  let ready = false;

  onMount(async () => {
    await setupI18n();
    await waitLocale();
    ready = true;
  });
</script>

{#if ready}
  <slot />
{:else}
  <div class="flex items-center justify-center min-h-screen bg-gray-50">
    <div class="flex flex-col items-center gap-4">
      <div class="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-200">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
      </div>
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Reduce the root layout to a pass-through**

Replace the entire contents of `apps/web/src/routes/+layout.svelte` with:

```svelte
<script lang="ts">
  import '../app.css';
</script>

<slot />
```

- [ ] **Step 3: Put the gate back around the application groups**

In `apps/web/src/routes/(app)/+layout.svelte`, add the import at the end of the existing `<script>` block:

```ts
  import I18nGate from '$lib/i18n/I18nGate.svelte';
```

then wrap everything the layout renders (all markup after the `<script>` block, excluding any `<style>` block) in:

```svelte
<I18nGate>
  ... existing markup unchanged ...
</I18nGate>
```

Do exactly the same in `apps/web/src/routes/(auth)/+layout.svelte`: add the same import and wrap its existing `<div class="min-h-screen ...">` element in `<I18nGate>…</I18nGate>`, leaving the `<style>` block where it is.

- [ ] **Step 4: Verify the existing test suite still passes**

Run: `cd apps/web && corepack pnpm exec vitest run`
Expected: PASS, same number of tests as before the change.

- [ ] **Step 5: Verify the build**

Run: `corepack pnpm --filter @marketing-ai/web build`
Expected: build completes with no errors.

- [ ] **Step 6: Verify the running application by eye**

Run `corepack pnpm --filter @marketing-ai/web dev` and open `http://localhost:5173/login`.
Expected: the login form shows translated labels — **not** raw keys such as `auth.login.title`. Switch the language in the app and confirm it still switches. This is the failure mode this task risks, so do not skip it.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/i18n/I18nGate.svelte apps/web/src/routes/+layout.svelte "apps/web/src/routes/(app)/+layout.svelte" "apps/web/src/routes/(auth)/+layout.svelte"
git commit -m "refactor(web): move the i18n gate from the root layout into the app groups (#206)"
```

---

### Task 2: Frontmatter parser

**Files:**
- Create: `apps/web/src/lib/marketing/content/frontmatter.ts`
- Test: `apps/web/src/lib/marketing/content/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `interface FaqEntry { q: string; a: string }`
  - `interface ParsedMarkdown { meta: Record<string, string | string[] | FaqEntry[]>; body: string }`
  - `function parseFrontmatter(raw: string): ParsedMarkdown`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/marketing/content/frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, type FaqEntry } from './frontmatter';

const DOC = `---
slug: ai-content-calendar
lang: en
title: "How to build an AI content calendar"
description: A short summary
date: 2026-09-10
tags: [content, planning]
faq:
  - q: What is an AI content calendar?
    a: A schedule of posts planned with an AI assistant.
  - q: Does it replace a strategy?
    a: No.
---

First paragraph.

## A heading
`;

describe('parseFrontmatter', () => {
  it('reads scalar keys and strips surrounding quotes', () => {
    const { meta } = parseFrontmatter(DOC);
    expect(meta.slug).toBe('ai-content-calendar');
    expect(meta.title).toBe('How to build an AI content calendar');
    expect(meta.date).toBe('2026-09-10');
  });

  it('reads inline arrays', () => {
    expect(parseFrontmatter(DOC).meta.tags).toEqual(['content', 'planning']);
  });

  it('reads the faq list of question/answer pairs', () => {
    const faq = parseFrontmatter(DOC).meta.faq as FaqEntry[];
    expect(faq).toHaveLength(2);
    expect(faq[0]).toEqual({
      q: 'What is an AI content calendar?',
      a: 'A schedule of posts planned with an AI assistant.',
    });
    expect(faq[1].a).toBe('No.');
  });

  it('returns the body without the frontmatter block', () => {
    const { body } = parseFrontmatter(DOC);
    expect(body.startsWith('First paragraph.')).toBe(true);
    expect(body).not.toContain('slug:');
  });

  it('treats a document without frontmatter as pure body', () => {
    expect(parseFrontmatter('# Just markdown')).toEqual({ meta: {}, body: '# Just markdown' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/content/frontmatter.test.ts`
Expected: FAIL — cannot resolve `./frontmatter`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/marketing/content/frontmatter.ts`:

```ts
export interface FaqEntry {
  q: string;
  a: string;
}

export interface ParsedMarkdown {
  meta: Record<string, string | string[] | FaqEntry[]>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Minimal frontmatter reader for our own blog files. It supports exactly the three
 * shapes the articles use — `key: value`, `key: [a, b]`, and a `faq:` list of
 * `- q:` / `a:` pairs — which is why we do not pull in a YAML dependency.
 */
export function parseFrontmatter(raw: string): ParsedMarkdown {
  const match = FENCE.exec(raw);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: ParsedMarkdown['meta'] = {};
  const faq: FaqEntry[] = [];
  let inFaq = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (/^faq:\s*$/.test(line)) {
      inFaq = true;
      continue;
    }

    if (inFaq) {
      const question = /^\s*-\s*q:\s*(.+)$/.exec(line);
      if (question) {
        faq.push({ q: unquote(question[1]), a: '' });
        continue;
      }
      const answer = /^\s+a:\s*(.+)$/.exec(line);
      if (answer && faq.length > 0) {
        faq[faq.length - 1].a = unquote(answer[1]);
        continue;
      }
      if (!/^\S/.test(line)) continue;
      inFaq = false;
    }

    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;

    const key = pair[1];
    const value = pair[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => unquote(item))
        .filter((item) => item.length > 0);
    } else {
      meta[key] = unquote(value);
    }
  }

  if (faq.length > 0) meta.faq = faq;

  return { meta, body: raw.slice(match[0].length).trim() };
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/content/frontmatter.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marketing/content/frontmatter.ts apps/web/src/lib/marketing/content/frontmatter.test.ts
git commit -m "feat(marketing): add a frontmatter parser for blog articles (#206)"
```

---

### Task 3: Article index with build-time invariants

Validation throws, so a malformed article fails the build instead of shipping a broken page.

**Files:**
- Create: `apps/web/src/lib/marketing/content/articles.ts` (pure functions)
- Create: `apps/web/src/lib/marketing/content/index.ts` (binds the pure functions to the real markdown files)
- Test: `apps/web/src/lib/marketing/content/articles.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`, `FaqEntry` from `./frontmatter`; `marked` from the `marked` package.
- Produces, from `./articles`:
  - `const LANGS: readonly ['en', 'pl', 'ru']`, `type Lang = 'en' | 'pl' | 'ru'`
  - `interface Article { slug; lang: Lang; pair; title; description; date; updated; tags: string[]; faq: FaqEntry[]; html: string; readingMinutes: number }`
  - `function buildArticles(files: Record<string, string>): Article[]` — sorted newest first, throws on any invariant violation
  - `function articlesFor(articles: Article[], lang: Lang): Article[]`
  - `function articleBy(articles: Article[], lang: Lang, slug: string): Article | undefined`
  - `function pairSlugs(articles: Article[], pair: string): Partial<Record<Lang, string>>`
- Produces, from `./index`: `const ARTICLES: Article[]` (the real set) and re-exports of `LANGS`, `Lang`, `Article`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/marketing/content/articles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildArticles, articlesFor, articleBy, pairSlugs } from './articles';

function file(over: Partial<Record<string, string>> = {}, body = 'Body text here.') {
  const meta = {
    slug: 'ai-content',
    lang: 'en',
    pair: 'ai-content',
    title: 'AI content',
    description: 'A description',
    date: '2026-09-01',
    updated: '2026-09-02',
    ...over,
  };
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${lines}\n---\n\n${body}`;
}

describe('buildArticles', () => {
  it('parses an article and renders its markdown to html', () => {
    const [article] = buildArticles({ '/src/content/blog/en/01-ai-content.md': file({}, '## Heading') });
    expect(article.slug).toBe('ai-content');
    expect(article.lang).toBe('en');
    expect(article.html).toContain('<h2');
    expect(article.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it('sorts newest first', () => {
    const articles = buildArticles({
      '/src/content/blog/en/01-old.md': file({ slug: 'old', pair: 'old', date: '2026-01-01', updated: '2026-01-01' }),
      '/src/content/blog/en/02-new.md': file({ slug: 'new', pair: 'new', date: '2026-05-01', updated: '2026-05-01' }),
    });
    expect(articles.map((a) => a.slug)).toEqual(['new', 'old']);
  });

  it('rejects a duplicate slug within one language', () => {
    expect(() =>
      buildArticles({
        '/src/content/blog/en/01-a.md': file(),
        '/src/content/blog/en/02-b.md': file(),
      }),
    ).toThrow(/duplicate slug/i);
  });

  it('rejects a description longer than 155 characters', () => {
    expect(() => buildArticles({ '/src/content/blog/en/01-a.md': file({ description: 'x'.repeat(156) }) })).toThrow(
      /description/i,
    );
  });

  it('rejects an unknown language', () => {
    expect(() => buildArticles({ '/src/content/blog/de/01-a.md': file({ lang: 'de' }) })).toThrow(/language/i);
  });

  it('rejects two articles of the same language sharing one pair', () => {
    expect(() =>
      buildArticles({
        '/src/content/blog/en/01-a.md': file({ slug: 'a' }),
        '/src/content/blog/en/02-b.md': file({ slug: 'b' }),
      }),
    ).toThrow(/pair/i);
  });

  it('rejects updated earlier than date', () => {
    expect(() => buildArticles({ '/src/content/blog/en/01-a.md': file({ updated: '2026-08-01' }) })).toThrow(/updated/i);
  });
});

describe('lookups', () => {
  const articles = buildArticles({
    '/src/content/blog/en/01-a.md': file({ slug: 'ai-content', lang: 'en', pair: 'ai-content' }),
    '/src/content/blog/pl/01-a.md': file({ slug: 'tresci-ai', lang: 'pl', pair: 'ai-content' }),
  });

  it('filters by language', () => {
    expect(articlesFor(articles, 'pl').map((a) => a.slug)).toEqual(['tresci-ai']);
    expect(articlesFor(articles, 'ru')).toEqual([]);
  });

  it('finds one article by language and slug', () => {
    expect(articleBy(articles, 'en', 'ai-content')?.title).toBe('AI content');
    expect(articleBy(articles, 'en', 'missing')).toBeUndefined();
  });

  it('maps a pair to one slug per language', () => {
    expect(pairSlugs(articles, 'ai-content')).toEqual({ en: 'ai-content', pl: 'tresci-ai' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/content/articles.test.ts`
Expected: FAIL — cannot resolve `./articles`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/marketing/content/articles.ts`:

```ts
import { marked } from 'marked';
import { parseFrontmatter, type FaqEntry } from './frontmatter';

export const LANGS = ['en', 'pl', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

export interface Article {
  slug: string;
  lang: Lang;
  pair: string;
  title: string;
  description: string;
  date: string;
  updated: string;
  tags: string[];
  faq: FaqEntry[];
  html: string;
  readingMinutes: number;
}

const MAX_DESCRIPTION = 155;
const WORDS_PER_MINUTE = 200;

/**
 * Turns raw markdown files (path -> contents) into the validated article set.
 * Every rule below throws, so a malformed article fails the build rather than
 * shipping a page with a missing title or a one-way hreflang link.
 */
export function buildArticles(files: Record<string, string>): Article[] {
  const articles = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => toArticle(path, raw));

  assertUniqueSlugs(articles);
  assertOnePairPerLanguage(articles);

  return articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function articlesFor(articles: Article[], lang: Lang): Article[] {
  return articles.filter((article) => article.lang === lang);
}

export function articleBy(articles: Article[], lang: Lang, slug: string): Article | undefined {
  return articles.find((article) => article.lang === lang && article.slug === slug);
}

export function pairSlugs(articles: Article[], pair: string): Partial<Record<Lang, string>> {
  const result: Partial<Record<Lang, string>> = {};
  for (const article of articles) {
    if (article.pair === pair) result[article.lang] = article.slug;
  }
  return result;
}

function toArticle(path: string, raw: string): Article {
  const { meta, body } = parseFrontmatter(raw);
  const text = (key: string): string => {
    const value = meta[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${path}: frontmatter key "${key}" is missing or empty`);
    }
    return value;
  };

  const lang = text('lang');
  if (!(LANGS as readonly string[]).includes(lang)) {
    throw new Error(`${path}: unknown language "${lang}" — expected one of ${LANGS.join(', ')}`);
  }

  const description = text('description');
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(`${path}: description is ${description.length} characters, the limit is ${MAX_DESCRIPTION}`);
  }

  const date = isoDate(path, 'date', text('date'));
  const updated = isoDate(path, 'updated', typeof meta.updated === 'string' ? meta.updated : date);
  if (updated < date) throw new Error(`${path}: updated (${updated}) is earlier than date (${date})`);

  const words = body.split(/\s+/).filter(Boolean).length;

  return {
    slug: text('slug'),
    lang: lang as Lang,
    pair: text('pair'),
    title: text('title'),
    description,
    date,
    updated,
    tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
    faq: Array.isArray(meta.faq) ? (meta.faq as FaqEntry[]) : [],
    html: marked.parse(body, { async: false }) as string,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

function isoDate(path: string, key: string, value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${path}: ${key} "${value}" is not an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

function assertUniqueSlugs(articles: Article[]): void {
  const seen = new Set<string>();
  for (const article of articles) {
    const key = `${article.lang}/${article.slug}`;
    if (seen.has(key)) throw new Error(`duplicate slug "${article.slug}" in language "${article.lang}"`);
    seen.add(key);
  }
}

function assertOnePairPerLanguage(articles: Article[]): void {
  const seen = new Set<string>();
  for (const article of articles) {
    const key = `${article.pair}/${article.lang}`;
    if (seen.has(key)) {
      throw new Error(`pair "${article.pair}" has more than one "${article.lang}" article`);
    }
    seen.add(key);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/content/articles.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Bind the pure functions to the real files**

`apps/web/src/lib/marketing/content/index.ts`:

```ts
import { buildArticles } from './articles';

const files = import.meta.glob('/src/content/blog/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The validated article set. Building it throws if any article breaks an invariant. */
export const ARTICLES = buildArticles(files);

export { LANGS, articlesFor, articleBy, pairSlugs } from './articles';
export type { Lang, Article } from './articles';
```

Note: the glob matches nothing until Task 9 adds the markdown, and an empty set is valid.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/marketing/content/
git commit -m "feat(marketing): load and validate blog articles at build time (#206)"
```

---

### Task 4: Outbound links and URL helpers

**Files:**
- Create: `apps/web/src/lib/marketing/links.ts`
- Test: `apps/web/src/lib/marketing/links.test.ts`

**Interfaces:**
- Produces:
  - `const SITE = 'https://emarketingai.pl'`
  - `const COMPANY = { name: 'MICODE sp. z o.o.', url: 'https://mi-code.pl/' }`
  - `const PRODUCTS: readonly { key: 'ai-budget' | 'eksiegowy'; name: string; url: string; store?: string }[]`
  - `const SOCIALS: readonly { name: string; url: string }[]` (empty until URLs are supplied)
  - `function canonical(path: string): string`
  - `function landingPath(lang: Lang): string`, `function blogIndexPath(lang: Lang): string`, `function articlePath(lang: Lang, slug: string): string`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/marketing/links.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canonical, landingPath, blogIndexPath, articlePath, PRODUCTS, COMPANY, SOCIALS } from './links';

describe('paths', () => {
  it('puts English at the root and the others under a prefix', () => {
    expect(landingPath('en')).toBe('/');
    expect(landingPath('pl')).toBe('/pl/');
    expect(landingPath('ru')).toBe('/ru/');
  });

  it('builds blog paths with a trailing slash', () => {
    expect(blogIndexPath('en')).toBe('/blog/en/');
    expect(articlePath('ru', 'kontent-plan')).toBe('/blog/ru/kontent-plan/');
  });
});

describe('canonical', () => {
  it('produces absolute URLs that always end with a slash', () => {
    expect(canonical('/')).toBe('https://emarketingai.pl/');
    expect(canonical('/pl/')).toBe('https://emarketingai.pl/pl/');
    expect(canonical('blog/en')).toBe('https://emarketingai.pl/blog/en/');
  });
});

describe('outbound links', () => {
  it('links the company and both sibling products', () => {
    expect(COMPANY.url).toBe('https://mi-code.pl/');
    expect(PRODUCTS.map((p) => p.key)).toEqual(['ai-budget', 'eksiegowy']);
    expect(PRODUCTS.every((p) => p.url.startsWith('https://'))).toBe(true);
  });

  it('has no invented social profiles', () => {
    expect(SOCIALS).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/links.test.ts`
Expected: FAIL — cannot resolve `./links`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/marketing/links.ts`:

```ts
import type { Lang } from './content/articles';

export const SITE = 'https://emarketingai.pl';

export const COMPANY = {
  name: 'MICODE sp. z o.o.',
  url: 'https://mi-code.pl/',
} as const;

/** Sibling MICODE products, linked from the landing page body (dofollow, on purpose). */
export const PRODUCTS = [
  {
    key: 'ai-budget',
    name: 'AI Budget Assistant',
    url: 'https://ai-budget.pl/',
    store: 'https://play.google.com/store/apps/details?id=com.budget.assistant',
  },
  {
    key: 'eksiegowy',
    name: 'eKsięgowy AI',
    url: 'https://eksiegowyai.pl/',
  },
] as const;

/**
 * Product social profiles. Empty until the real URLs are supplied — an invented
 * profile in `sameAs` is worse than no `sameAs` at all.
 */
export const SOCIALS: readonly { name: string; url: string }[] = [];

export function canonical(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  return `${SITE}${withTrailing}`;
}

export function landingPath(lang: Lang): string {
  return lang === 'en' ? '/' : `/${lang}/`;
}

export function blogIndexPath(lang: Lang): string {
  return `/blog/${lang}/`;
}

export function articlePath(lang: Lang, slug: string): string {
  return `/blog/${lang}/${slug}/`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/links.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marketing/links.ts apps/web/src/lib/marketing/links.test.ts
git commit -m "feat(marketing): centralise site and outbound URLs (#206)"
```

---

### Task 5: hreflang alternates and JSON-LD builders

**Files:**
- Create: `apps/web/src/lib/marketing/seo/alternates.ts`
- Create: `apps/web/src/lib/marketing/seo/jsonld.ts`
- Test: `apps/web/src/lib/marketing/seo/alternates.test.ts`
- Test: `apps/web/src/lib/marketing/seo/jsonld.test.ts`

**Interfaces:**
- Consumes: `canonical`, `landingPath`, `blogIndexPath`, `articlePath`, `COMPANY`, `SOCIALS`, `SITE` from `../links`; `Article`, `Lang`, `LANGS` from `../content/articles`; `FaqEntry` from `../content/frontmatter`.
- Produces, from `./alternates`:
  - `interface Alternate { hreflang: string; href: string }`
  - `function landingAlternates(): Alternate[]`
  - `function blogIndexAlternates(): Alternate[]`
  - `function articleAlternates(slugs: Partial<Record<Lang, string>>): Alternate[]`
- Produces, from `./jsonld`:
  - `function organizationNode(): Record<string, unknown>`
  - `function websiteNode(lang: Lang, name: string): Record<string, unknown>`
  - `function softwareApplicationNode(name: string, description: string, lang: Lang): Record<string, unknown>`
  - `function faqNode(items: FaqEntry[]): Record<string, unknown>`
  - `function breadcrumbNode(items: { name: string; path: string }[]): Record<string, unknown>`
  - `function articleNode(article: Article): Record<string, unknown>`
  - `function jsonLdScript(nodes: Record<string, unknown>[]): string`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/marketing/seo/alternates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { landingAlternates, blogIndexAlternates, articleAlternates } from './alternates';

describe('landingAlternates', () => {
  it('lists all three languages plus x-default on English', () => {
    expect(landingAlternates()).toEqual([
      { hreflang: 'en', href: 'https://emarketingai.pl/' },
      { hreflang: 'pl', href: 'https://emarketingai.pl/pl/' },
      { hreflang: 'ru', href: 'https://emarketingai.pl/ru/' },
      { hreflang: 'x-default', href: 'https://emarketingai.pl/' },
    ]);
  });
});

describe('blogIndexAlternates', () => {
  it('points each language at its own index', () => {
    expect(blogIndexAlternates()).toEqual([
      { hreflang: 'en', href: 'https://emarketingai.pl/blog/en/' },
      { hreflang: 'pl', href: 'https://emarketingai.pl/blog/pl/' },
      { hreflang: 'ru', href: 'https://emarketingai.pl/blog/ru/' },
      { hreflang: 'x-default', href: 'https://emarketingai.pl/blog/en/' },
    ]);
  });
});

describe('articleAlternates', () => {
  it('only lists the languages the article was actually translated into', () => {
    expect(articleAlternates({ en: 'ai-content', pl: 'tresci-ai' })).toEqual([
      { hreflang: 'en', href: 'https://emarketingai.pl/blog/en/ai-content/' },
      { hreflang: 'pl', href: 'https://emarketingai.pl/blog/pl/tresci-ai/' },
      { hreflang: 'x-default', href: 'https://emarketingai.pl/blog/en/ai-content/' },
    ]);
  });

  it('omits x-default when there is no English version', () => {
    expect(articleAlternates({ pl: 'tresci-ai' })).toEqual([
      { hreflang: 'pl', href: 'https://emarketingai.pl/blog/pl/tresci-ai/' },
    ]);
  });
});
```

`apps/web/src/lib/marketing/seo/jsonld.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { organizationNode, websiteNode, softwareApplicationNode, faqNode, breadcrumbNode, articleNode, jsonLdScript } from './jsonld';
import type { Article } from '../content/articles';

const article: Article = {
  slug: 'ai-content',
  lang: 'en',
  pair: 'ai-content',
  title: 'AI content',
  description: 'A description',
  date: '2026-09-01',
  updated: '2026-09-05',
  tags: ['content'],
  faq: [{ q: 'Q?', a: 'A.' }],
  html: '<p>Body</p>',
  readingMinutes: 4,
};

describe('nodes', () => {
  it('describes the company and links mi-code.pl', () => {
    const node = organizationNode();
    expect(node['@type']).toBe('Organization');
    expect(node.name).toBe('MICODE sp. z o.o.');
    expect(node.url).toBe('https://mi-code.pl/');
  });

  it('never advertises a price or a rating', () => {
    const node = softwareApplicationNode('Marketing AI Assistant', 'A description', 'en');
    expect(node.offers).toBeUndefined();
    expect(node.aggregateRating).toBeUndefined();
    expect(node.applicationCategory).toBe('BusinessApplication');
  });

  it('builds a FAQPage from question/answer pairs', () => {
    const node = faqNode([{ q: 'Q?', a: 'A.' }]);
    expect(node['@type']).toBe('FAQPage');
    expect((node.mainEntity as Record<string, unknown>[])[0].name).toBe('Q?');
  });

  it('numbers breadcrumb positions from one and makes URLs absolute', () => {
    const node = breadcrumbNode([{ name: 'Blog', path: '/blog/en/' }]);
    const items = node.itemListElement as Record<string, unknown>[];
    expect(items[0].position).toBe(1);
    expect(items[0].item).toBe('https://emarketingai.pl/blog/en/');
  });

  it('carries both dates and the language on an Article', () => {
    const node = articleNode(article);
    expect(node.datePublished).toBe('2026-09-01');
    expect(node.dateModified).toBe('2026-09-05');
    expect(node.inLanguage).toBe('en');
    expect(node.mainEntityOfPage).toBe('https://emarketingai.pl/blog/en/ai-content/');
  });

  it('names the site per language', () => {
    expect(websiteNode('pl', 'Marketing AI Assistant').inLanguage).toBe('pl');
  });
});

describe('jsonLdScript', () => {
  it('wraps the nodes in an @graph and escapes anything that could close the script tag', () => {
    const script = jsonLdScript([faqNode([{ q: '</script> attempt', a: 'A.' }])]);
    expect(script).not.toContain('</script> attempt');
    expect(script).toContain('\\u003c/script');
    expect(JSON.parse(script)['@graph']).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/seo/`
Expected: FAIL — cannot resolve `./alternates` and `./jsonld`.

- [ ] **Step 3: Write `alternates.ts`**

```ts
import { LANGS, type Lang } from '../content/articles';
import { canonical, landingPath, blogIndexPath, articlePath } from '../links';

export interface Alternate {
  hreflang: string;
  href: string;
}

/** x-default always points at the English URL — it is our default market. */
function withDefault(list: Alternate[], englishHref: string | undefined): Alternate[] {
  return englishHref ? [...list, { hreflang: 'x-default', href: englishHref }] : list;
}

export function landingAlternates(): Alternate[] {
  const list = LANGS.map((lang) => ({ hreflang: lang, href: canonical(landingPath(lang)) }));
  return withDefault(list, canonical(landingPath('en')));
}

export function blogIndexAlternates(): Alternate[] {
  const list = LANGS.map((lang) => ({ hreflang: lang, href: canonical(blogIndexPath(lang)) }));
  return withDefault(list, canonical(blogIndexPath('en')));
}

export function articleAlternates(slugs: Partial<Record<Lang, string>>): Alternate[] {
  const list: Alternate[] = [];
  for (const lang of LANGS) {
    const slug = slugs[lang];
    if (slug) list.push({ hreflang: lang, href: canonical(articlePath(lang, slug)) });
  }
  return withDefault(list, slugs.en ? canonical(articlePath('en', slugs.en)) : undefined);
}
```

- [ ] **Step 4: Write `jsonld.ts`**

```ts
import type { Article, Lang } from '../content/articles';
import type { FaqEntry } from '../content/frontmatter';
import { COMPANY, SITE, SOCIALS, canonical, articlePath } from '../links';

const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;

export function organizationNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: COMPANY.name,
    url: COMPANY.url,
    logo: `${SITE}/icon-512.png`,
  };
  // sameAs means "another identity page for this same entity". Sibling products are
  // not that, so they stay out of it and are linked from the page body instead.
  if (SOCIALS.length > 0) node.sameAs = SOCIALS.map((social) => social.url);
  return node;
}

export function websiteNode(lang: Lang, name: string): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: `${SITE}/`,
    name,
    inLanguage: lang,
    publisher: { '@id': ORG_ID },
  };
}

export function softwareApplicationNode(name: string, description: string, lang: Lang): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    name,
    description,
    url: `${SITE}/`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: lang,
    publisher: { '@id': ORG_ID },
  };
}

export function faqNode(items: FaqEntry[]): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function breadcrumbNode(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonical(item.path),
    })),
  };
}

export function articleNode(article: Article): Record<string, unknown> {
  const url = canonical(articlePath(article.lang, article.slug));
  return {
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.updated,
    inLanguage: article.lang,
    mainEntityOfPage: url,
    url,
    image: `${SITE}/icon-512.png`,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

/** Serialises nodes into one @graph, escaped so it cannot break out of the script tag. */
export function jsonLdScript(nodes: Record<string, unknown>[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/seo/`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/marketing/seo/
git commit -m "feat(marketing): add hreflang and JSON-LD builders (#206)"
```

---

### Task 6: Landing copy in three languages

The copy is plain TypeScript, not `svelte-i18n`: it must be present in the prerendered HTML, and `csr = false` means no client-side store ever runs.

**Files:**
- Create: `apps/web/src/lib/marketing/copy/types.ts`
- Create: `apps/web/src/lib/marketing/copy/en.ts`
- Create: `apps/web/src/lib/marketing/copy/pl.ts`
- Create: `apps/web/src/lib/marketing/copy/ru.ts`
- Create: `apps/web/src/lib/marketing/copy/index.ts`
- Test: `apps/web/src/lib/marketing/copy/copy.test.ts`

**Interfaces:**
- Produces: `interface LandingCopy` (shape below), `const COPY: Record<Lang, LandingCopy>`, `function copyFor(lang: Lang): LandingCopy`.

- [ ] **Step 1: Define the shape**

`apps/web/src/lib/marketing/copy/types.ts`:

```ts
import type { FaqEntry } from '../content/frontmatter';

export interface LandingCopy {
  meta: { title: string; description: string };
  nav: { blog: string; login: string; start: string; skipToContent: string };
  hero: { h1: string; sub: string; primaryCta: string; secondaryCta: string };
  features: { heading: string; lead: string; items: { title: string; body: string }[] };
  how: { heading: string; steps: { title: string; body: string }[] };
  faq: { heading: string; items: FaqEntry[] };
  products: {
    heading: string;
    lead: string;
    items: { key: 'ai-budget' | 'eksiegowy'; blurb: string }[];
    storeCta: string;
    visitCta: string;
  };
  footer: { about: string; legal: string; privacy: string; terms: string; blog: string; rights: string };
  blog: {
    indexTitle: string;
    indexDescription: string;
    empty: string;
    minutes: string;
    updatedOn: string;
    readMore: string;
    backToIndex: string;
    faqHeading: string;
    chooserTitle: string;
    chooserLead: string;
  };
}
```

- [ ] **Step 2: Write the English copy in full**

`apps/web/src/lib/marketing/copy/en.ts`:

```ts
import type { LandingCopy } from './types';

export const en: LandingCopy = {
  meta: {
    title: 'Marketing AI Assistant — AI marketing assistant for small teams',
    description:
      'Plan, generate and publish marketing content in English, Polish and Russian, then measure what it did — with AI agents doing the routine work.',
  },
  nav: { blog: 'Blog', login: 'Log in', start: 'Start free', skipToContent: 'Skip to content' },
  hero: {
    h1: 'An AI marketing assistant for small teams',
    sub: 'Marketing AI Assistant writes your content, publishes it to your channels and tells you what worked — in English, Polish and Russian, from one workspace.',
    primaryCta: 'Start free',
    secondaryCta: 'See how it works',
  },
  features: {
    heading: 'What it does',
    lead: 'Every part of the routine, handled by an agent that knows your project.',
    items: [
      {
        title: 'Multilingual content generation',
        body: 'Describe the post once and get it in English, Polish and Russian at the same time, each version written for its own audience rather than translated word for word.',
      },
      {
        title: 'Publishing to your channels',
        body: 'Facebook, Instagram, Threads, TikTok, LinkedIn and Telegram, on a schedule or straight away, with the media handled for you.',
      },
      {
        title: 'Analytics with recommendations',
        body: 'Reach, engagement and follower growth per channel, plus a written read of what changed and what to do next — not another chart to interpret.',
      },
      {
        title: 'SEO and rank tracking',
        body: 'Track keyword positions through Google Search Console, watch competitors and see which pages are actually earning impressions.',
      },
      {
        title: 'CRM built for marketing',
        body: 'Contacts, companies, a deal pipeline and tasks, so a campaign that produces a lead has somewhere to put it.',
      },
      {
        title: 'Email campaigns and sequences',
        body: 'Subscriber lists, campaigns and automated sequences, written by the same agents that write your posts.',
      },
      {
        title: 'Google Play analytics',
        body: 'For mobile app projects: installs, ratings, crash and ANR rates, and AI replies to store reviews.',
      },
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      {
        title: 'Create a project',
        body: 'Tell the assistant what you sell, to whom, and in which languages. Everything it writes afterwards is grounded in that context.',
      },
      {
        title: 'Let the agents work',
        body: 'Content, checklists, strategy documents and email sequences are generated on request or on a schedule, ready for you to review.',
      },
      {
        title: 'Publish and measure',
        body: 'Approve, publish to every connected channel, and read the analytics with the recommendations attached.',
      },
    ],
  },
  faq: {
    heading: 'Questions people ask',
    items: [
      {
        q: 'What is Marketing AI Assistant?',
        a: 'It is a web application that plans, writes and publishes marketing content for a small team, and then reports on how that content performed. AI agents do the drafting; you approve and publish.',
      },
      {
        q: 'Which languages does it write in?',
        a: 'English, Polish and Russian. A single request can produce all three versions at once, each written for its own audience.',
      },
      {
        q: 'Which channels can it publish to?',
        a: 'Facebook, Instagram, Threads, TikTok, LinkedIn and Telegram. Instagram and Threads also report analytics back into the app.',
      },
      {
        q: 'Do I need to connect my accounts to try it?',
        a: 'No. You can create a project and generate content without connecting anything; connections are needed only for publishing and analytics.',
      },
      {
        q: 'Does it work for mobile apps?',
        a: 'Yes. A project can be marked as a mobile app, which adds Google Play analytics — installs, ratings, crash and ANR rates, and AI-assisted replies to store reviews.',
      },
      {
        q: 'Who builds it?',
        a: 'MICODE sp. z o.o., a software company in Poland. The same team builds AI Budget Assistant and eKsięgowy AI.',
      },
    ],
  },
  products: {
    heading: 'Other things we build',
    lead: 'Marketing AI Assistant is made by MICODE sp. z o.o. Our other products:',
    items: [
      {
        key: 'ai-budget',
        blurb: 'Personal and family finances with an AI assistant — track spending, import bank statements and plan a budget without spreadsheets.',
      },
      {
        key: 'eksiegowy',
        blurb: 'An AI accounting assistant for small Polish businesses — documents, bookkeeping questions and paperwork without the guesswork.',
      },
    ],
    storeCta: 'Get it on Google Play',
    visitCta: 'Visit the site',
  },
  footer: {
    about: 'Marketing AI Assistant is built and operated by MICODE sp. z o.o., a software company based in Poland.',
    legal: 'Legal',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    blog: 'Blog',
    rights: 'All rights reserved.',
  },
  blog: {
    indexTitle: 'Marketing blog — practical guides on AI, content and analytics',
    indexDescription:
      'How to plan, write and measure marketing content with AI: guides from the team building Marketing AI Assistant.',
    empty: 'No articles here yet.',
    minutes: 'min read',
    updatedOn: 'Updated',
    readMore: 'Read the article',
    backToIndex: 'All articles',
    faqHeading: 'Frequently asked questions',
    chooserTitle: 'Choose a language',
    chooserLead: 'The blog is available in English, Polish and Russian.',
  },
};
```

- [ ] **Step 3: Translate into Polish and Russian**

Create `pl.ts` and `ru.ts` exporting `pl: LandingCopy` and `ru: LandingCopy` with **exactly the same keys and the same array lengths**, translated for their own market rather than word for word. Requirements:

- `hero.h1` must carry the market's own search phrase: Polish `asystent marketingowy AI`, Russian `ИИ-ассистент для маркетинга`.
- `meta.description` stays at most 155 characters in every language.
- `products.items` keeps the same two entries in the same order (`ai-budget`, `eksiegowy`).
- `faq.items` keeps the same six questions in the same order — the answers must remain short and direct, because they are what an AI answer engine quotes.
- Product names stay untranslated: Marketing AI Assistant, AI Budget Assistant, eKsięgowy AI, Google Play, MICODE sp. z o.o.

- [ ] **Step 4: Wire the dictionaries together**

`apps/web/src/lib/marketing/copy/index.ts`:

```ts
import type { Lang } from '../content/articles';
import type { LandingCopy } from './types';
import { en } from './en';
import { pl } from './pl';
import { ru } from './ru';

export const COPY: Record<Lang, LandingCopy> = { en, pl, ru };

export function copyFor(lang: Lang): LandingCopy {
  return COPY[lang];
}

export type { LandingCopy };
```

- [ ] **Step 5: Write the test that keeps the three dictionaries in step**

`apps/web/src/lib/marketing/copy/copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COPY } from './index';
import { LANGS } from '../content/articles';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      keyPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe('landing copy', () => {
  it('covers every language', () => {
    expect(Object.keys(COPY).sort()).toEqual([...LANGS].sort());
  });

  it('has an identical key structure in all three languages', () => {
    const reference = keyPaths(COPY.en).sort();
    for (const lang of LANGS) {
      expect(keyPaths(COPY[lang]).sort(), `${lang} differs from en`).toEqual(reference);
    }
  });

  it('has no empty strings', () => {
    for (const lang of LANGS) {
      const empties = keyPaths(COPY[lang]).filter((path) => {
        const value = path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], COPY[lang]);
        return typeof value !== 'string' || value.trim().length === 0;
      });
      expect(empties, `${lang} has empty copy`).toEqual([]);
    }
  });

  it('keeps meta descriptions within the snippet limit', () => {
    for (const lang of LANGS) {
      expect(COPY[lang].meta.description.length, `${lang} description too long`).toBeLessThanOrEqual(155);
    }
  });

  it('keeps six FAQ entries per language for the FAQPage markup', () => {
    for (const lang of LANGS) {
      expect(COPY[lang].faq.items.length, lang).toBe(6);
    }
  });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/copy/copy.test.ts`
Expected: PASS, 5 tests. If the key-structure test fails, the Polish or Russian dictionary is missing a key — fix the dictionary, not the test.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/marketing/copy/
git commit -m "feat(marketing): add landing copy in en, pl and ru (#206)"
```

---

### Task 7: The marketing route group and the landing page

**Files:**
- Create: `apps/web/src/params/mlang.ts`
- Create: `apps/web/src/params/blang.ts`
- Create: `apps/web/src/lib/marketing/lang-from-path.ts`
- Test: `apps/web/src/lib/marketing/lang-from-path.test.ts`
- Create: `apps/web/src/lib/marketing/Seo.svelte`
- Create: `apps/web/src/lib/marketing/Landing.svelte`
- Create: `apps/web/src/routes/(marketing)/+layout.ts`
- Create: `apps/web/src/routes/(marketing)/+layout.svelte`
- Create: `apps/web/src/routes/(marketing)/+page.svelte`
- Create: `apps/web/src/routes/(marketing)/[lang=mlang]/+page.ts`
- Create: `apps/web/src/routes/(marketing)/[lang=mlang]/+page.svelte`
- Delete: `apps/web/src/routes/+page.svelte` (the old redirect)
- Modify: `apps/web/src/app.html` (one attribute)
- Modify: `apps/web/src/hooks.server.ts` (add `transformPageChunk`)

**Interfaces:**
- Consumes: `copyFor` from `$lib/marketing/copy`, `canonical`/`landingPath`/`PRODUCTS`/`COMPANY`/`SOCIALS` from `$lib/marketing/links`, `landingAlternates` from `$lib/marketing/seo/alternates`, the JSON-LD builders from `$lib/marketing/seo/jsonld`.
- Produces:
  - `function langFromPath(pathname: string): Lang`
  - `Seo.svelte` with props `{ title: string; description: string; canonicalUrl: string; alternates: Alternate[]; jsonLd?: string; noindex?: boolean; ogType?: string; lang: Lang }`
  - `Landing.svelte` with prop `{ lang: Lang }`

- [ ] **Step 1: Write the failing test for language detection**

`apps/web/src/lib/marketing/lang-from-path.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { langFromPath } from './lang-from-path';

describe('langFromPath', () => {
  it('defaults to English at the root', () => {
    expect(langFromPath('/')).toBe('en');
    expect(langFromPath('/login')).toBe('en');
  });

  it('reads the landing prefix', () => {
    expect(langFromPath('/pl/')).toBe('pl');
    expect(langFromPath('/ru/')).toBe('ru');
  });

  it('reads the blog segment', () => {
    expect(langFromPath('/blog/ru/kontent-plan/')).toBe('ru');
    expect(langFromPath('/blog/en/')).toBe('en');
    expect(langFromPath('/blog/')).toBe('en');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/lang-from-path.test.ts`
Expected: FAIL — cannot resolve `./lang-from-path`.

- [ ] **Step 3: Implement language detection**

`apps/web/src/lib/marketing/lang-from-path.ts`:

```ts
import { LANGS, type Lang } from './content/articles';

/** Derives the page language from the URL, which is the only signal a JS-free page has. */
export function langFromPath(pathname: string): Lang {
  const segments = pathname.split('/').filter(Boolean);
  const candidate = segments[0] === 'blog' ? segments[1] : segments[0];
  return (LANGS as readonly string[]).includes(candidate ?? '') ? (candidate as Lang) : 'en';
}
```

Run the test again — expected PASS, 3 tests.

- [ ] **Step 4: Add the param matchers**

`apps/web/src/params/mlang.ts`:

```ts
import type { ParamMatcher } from '@sveltejs/kit';

/** Landing prefixes only — English lives at the root, so it is not matched here. */
export const match: ParamMatcher = (param) => param === 'pl' || param === 'ru';
```

`apps/web/src/params/blang.ts`:

```ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => param === 'en' || param === 'pl' || param === 'ru';
```

- [ ] **Step 5: Declare the `<html lang>` placeholder and fill it per request**

In `apps/web/src/app.html`, change the opening tag to:

```html
<html lang="%lang%">
```

In `apps/web/src/hooks.server.ts`, import the helper at the top:

```ts
import { langFromPath } from '$lib/marketing/lang-from-path';
```

and change the final line from `return resolve(event);` to:

```ts
  // %lang% is a placeholder in app.html; SvelteKit only substitutes %sveltekit.*%,
  // so the page language is filled in here. This also runs during prerendering.
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', langFromPath(event.url.pathname)),
  });
```

- [ ] **Step 6: Write the `Seo.svelte` head component**

`apps/web/src/lib/marketing/Seo.svelte`:

```svelte
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
```

- [ ] **Step 7: Add the route group options and shell**

`apps/web/src/routes/(marketing)/+layout.ts`:

```ts
// Overrides the app-wide client-only rendering: these pages are emitted as plain
// HTML at build time, with no JS bundle, so crawlers and AI readers see real text.
export const ssr = true;
export const prerender = true;
export const csr = false;
export const trailingSlash = 'always';
```

`apps/web/src/routes/(marketing)/+layout.svelte` renders the header and footer around `<slot />`:

```svelte
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
      <div class="ml-auto flex items-center gap-4 text-sm">
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

  <main id="main"><slot /></main>

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
    <p class="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-subtle">
      © {year} {COMPANY.name}. {copy.footer.rights}
    </p>
  </footer>
</div>
```

- [ ] **Step 8: Build the landing component**

`apps/web/src/lib/marketing/Landing.svelte` takes `export let lang: Lang` and renders, in this order, using `copyFor(lang)`:

1. `<Seo>` with `title = copy.meta.title`, `description = copy.meta.description`, `canonicalUrl = canonical(landingPath(lang))`, `alternates = landingAlternates()`, and `jsonLd = jsonLdScript([organizationNode(), websiteNode(lang, 'Marketing AI Assistant'), softwareApplicationNode('Marketing AI Assistant', copy.meta.description, lang), faqNode(copy.faq.items)])`.
2. A hero `<section>` with the single `<h1>{copy.hero.h1}</h1>` on the page, `copy.hero.sub` as a `<p>`, and two links: `/register` (`copy.hero.primaryCta`) and `#how` (`copy.hero.secondaryCta`).
3. `<section id="features">` with `<h2>{copy.features.heading}</h2>`, the lead paragraph, and a responsive grid (`grid gap-6 md:grid-cols-2 lg:grid-cols-3`) of cards, each `<article class="rounded-xl border border-border bg-surface p-5">` with an `<h3>` and a `<p>`.
4. `<section id="how">` with `<h2>{copy.how.heading}</h2>` and an `<ol>` of the three steps, each with an `<h3>` and a `<p>`.
5. `<section id="faq">` with `<h2>{copy.faq.heading}</h2>` and, for each item, an `<h3>` holding the question and a `<p>` holding the answer. Plain headings and paragraphs, not `<details>` — the text must be visible without interaction so it can be extracted.
6. `<section id="products">` with `<h2>{copy.products.heading}</h2>`, the lead, and one card per entry of `copy.products.items`, matched to `PRODUCTS` by `key`. Each card links to `product.url` with `rel="noopener"` and the label `copy.products.visitCta`, and, when `product.store` exists, a second link to it labelled `copy.products.storeCta`. **These links must not carry `rel="nofollow"`** — passing link equity to the sibling products is the point.

Every colour comes from the tokens listed in the global constraints. The section order and heading levels are fixed: one `h1`, then `h2` per section, `h3` inside.

- [ ] **Step 9: Add the three landing routes**

`apps/web/src/routes/(marketing)/+page.svelte`:

```svelte
<script lang="ts">
  import Landing from '$lib/marketing/Landing.svelte';
</script>

<Landing lang="en" />
```

`apps/web/src/routes/(marketing)/[lang=mlang]/+page.ts`:

```ts
import type { EntryGenerator, PageLoad } from './$types';
import type { Lang } from '$lib/marketing/content/articles';

export const entries: EntryGenerator = () => [{ lang: 'pl' }, { lang: 'ru' }];

export const load: PageLoad = ({ params }) => ({ lang: params.lang as Lang });
```

`apps/web/src/routes/(marketing)/[lang=mlang]/+page.svelte`:

```svelte
<script lang="ts">
  import Landing from '$lib/marketing/Landing.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<Landing lang={data.lang} />
```

- [ ] **Step 10: Delete the old redirect page**

```bash
git rm apps/web/src/routes/+page.svelte
```

`/` is now the English landing. Signed-in visitors landing there use the header's "Log in" link; a prerendered page cannot redirect them, and that is intended.

- [ ] **Step 11: Verify the prerendered output**

Run: `corepack pnpm --filter @marketing-ai/web build`
Then check the artifacts:

```bash
ls apps/web/build/prerendered/index.html apps/web/build/prerendered/pl/index.html apps/web/build/prerendered/ru/index.html
grep -c "<h1" apps/web/build/prerendered/index.html
grep -o 'hreflang="[a-z-]*"' apps/web/build/prerendered/pl/index.html | sort -u
grep -o '<html lang="[a-z]*"' apps/web/build/prerendered/ru/index.html
grep -c "application/ld+json" apps/web/build/prerendered/index.html
grep -c "_app/immutable" apps/web/build/prerendered/index.html
```

Expected: all three files exist; one `<h1>`; four hreflang values (`en`, `pl`, `ru`, `x-default`); `<html lang="ru"`; one JSON-LD block; and **0** references to `_app/immutable`, which is the proof that `csr = false` took effect. If the prerendered files sit at a different path in this adapter version, locate them with `find apps/web/build -name index.html | head` and use that path consistently from here on.

- [ ] **Step 12: Run the whole test suite and lint**

Run: `cd apps/web && corepack pnpm exec vitest run` then `corepack pnpm --filter @marketing-ai/web lint`
Expected: PASS, and no new lint errors.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/params apps/web/src/lib/marketing apps/web/src/routes "apps/web/src/routes/(marketing)" apps/web/src/app.html apps/web/src/hooks.server.ts
git commit -m "feat(marketing): add the prerendered landing page in en, pl and ru (#206)"
```

---

### Task 8: Blog routes

**Files:**
- Create: `apps/web/src/routes/(marketing)/blog/+page.svelte`
- Create: `apps/web/src/routes/(marketing)/blog/[lang=blang]/+page.ts`
- Create: `apps/web/src/routes/(marketing)/blog/[lang=blang]/+page.svelte`
- Create: `apps/web/src/routes/(marketing)/blog/[lang=blang]/[slug]/+page.ts`
- Create: `apps/web/src/routes/(marketing)/blog/[lang=blang]/[slug]/+page.svelte`

**Interfaces:**
- Consumes: `ARTICLES`, `articlesFor`, `articleBy`, `pairSlugs` from `$lib/marketing/content`; `blogIndexPath`, `articlePath`, `canonical` from `$lib/marketing/links`; `blogIndexAlternates`, `articleAlternates` from `$lib/marketing/seo/alternates`; `articleNode`, `faqNode`, `breadcrumbNode`, `organizationNode`, `jsonLdScript` from `$lib/marketing/seo/jsonld`; `copyFor`; `Seo.svelte`.

- [ ] **Step 1: The language chooser at `/blog/`**

`apps/web/src/routes/(marketing)/blog/+page.svelte`:

```svelte
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
```

It is `noindex` and canonical to the English index, so it never competes with the real indexes, and it stays out of the sitemap (Task 9).

- [ ] **Step 2: The per-language index**

`apps/web/src/routes/(marketing)/blog/[lang=blang]/+page.ts`:

```ts
import type { EntryGenerator, PageLoad } from './$types';
import { ARTICLES, articlesFor, type Lang } from '$lib/marketing/content';

export const entries: EntryGenerator = () => [{ lang: 'en' }, { lang: 'pl' }, { lang: 'ru' }];

export const load: PageLoad = ({ params }) => {
  const lang = params.lang as Lang;
  return {
    lang,
    articles: articlesFor(ARTICLES, lang).map(({ slug, title, description, date, updated, readingMinutes }) => ({
      slug,
      title,
      description,
      date,
      updated,
      readingMinutes,
    })),
  };
};
```

`+page.svelte` renders `<Seo>` (title `copy.blog.indexTitle`, description `copy.blog.indexDescription`, `canonicalUrl = canonical(blogIndexPath(data.lang))`, `alternates = blogIndexAlternates()`, `jsonLd = jsonLdScript([organizationNode(), breadcrumbNode([{ name: 'Blog', path: blogIndexPath(data.lang) }])])`), then an `<h1>`, then either `copy.blog.empty` when the list is empty or a list of `<article>` cards, each with an `<h2><a href={articlePath(data.lang, article.slug)}>{article.title}</a></h2>`, the description, and a `<time datetime={article.updated}>` line reading `{copy.blog.updatedOn} {article.updated} · {article.readingMinutes} {copy.blog.minutes}`.

- [ ] **Step 3: The article page**

`apps/web/src/routes/(marketing)/blog/[lang=blang]/[slug]/+page.ts`:

```ts
import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { ARTICLES, articleBy, pairSlugs, type Lang } from '$lib/marketing/content';

export const entries: EntryGenerator = () => ARTICLES.map((article) => ({ lang: article.lang, slug: article.slug }));

export const load: PageLoad = ({ params }) => {
  const article = articleBy(ARTICLES, params.lang as Lang, params.slug);
  if (!article) throw error(404, 'Article not found');
  return { article, alternateSlugs: pairSlugs(ARTICLES, article.pair) };
};
```

`+page.svelte` renders `<Seo>` with `ogType="article"`, `alternates = articleAlternates(data.alternateSlugs)`, `canonicalUrl = canonical(articlePath(article.lang, article.slug))` and
`jsonLd = jsonLdScript([organizationNode(), articleNode(article), breadcrumbNode([{ name: 'Blog', path: blogIndexPath(article.lang) }, { name: article.title, path: articlePath(article.lang, article.slug) }]), ...(article.faq.length ? [faqNode(article.faq)] : [])])`.

The body:

```svelte
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
```

`{@html}` on `data.article.html` is safe here and deliberate: the markdown is our own reviewed repository content, and `DOMPurify` needs a DOM that does not exist during prerendering.

- [ ] **Step 4: Verify the build with no articles yet**

Run: `corepack pnpm --filter @marketing-ai/web build`
Expected: the build succeeds. `/blog/en/` renders the empty-state text; no article pages exist yet because `entries()` returns an empty list.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/routes/(marketing)/blog"
git commit -m "feat(marketing): add the blog index and article routes (#206)"
```

---

### Task 9: sitemap, llms.txt and robots

**Files:**
- Create: `apps/web/src/lib/marketing/seo/sitemap.ts`
- Test: `apps/web/src/lib/marketing/seo/sitemap.test.ts`
- Create: `apps/web/src/routes/(marketing)/sitemap.xml/+server.ts`
- Create: `apps/web/src/routes/(marketing)/llms.txt/+server.ts`
- Create: `apps/web/src/routes/(marketing)/llms-full.txt/+server.ts`
- Delete: `apps/web/static/sitemap.xml`
- Modify: `apps/web/static/robots.txt`

**Interfaces:**
- Produces: `interface SitemapEntry { loc: string; lastmod: string }`, `function sitemapEntries(articles: Article[], today: string): SitemapEntry[]`, `function renderSitemap(entries: SitemapEntry[]): string`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/marketing/seo/sitemap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sitemapEntries, renderSitemap } from './sitemap';
import { buildArticles } from '../content/articles';

const articles = buildArticles({
  '/src/content/blog/en/01-a.md':
    '---\nslug: ai-content\nlang: en\npair: ai-content\ntitle: T\ndescription: D\ndate: 2026-09-01\nupdated: 2026-09-05\n---\n\nBody.',
});

describe('sitemapEntries', () => {
  const entries = sitemapEntries(articles, '2026-09-10');

  it('lists the three landings and the three blog indexes', () => {
    const locs = entries.map((entry) => entry.loc);
    expect(locs).toContain('https://emarketingai.pl/');
    expect(locs).toContain('https://emarketingai.pl/pl/');
    expect(locs).toContain('https://emarketingai.pl/ru/');
    expect(locs).toContain('https://emarketingai.pl/blog/en/');
    expect(locs).toContain('https://emarketingai.pl/blog/ru/');
  });

  it('lists every article with its own updated date', () => {
    expect(entries).toContainEqual({ loc: 'https://emarketingai.pl/blog/en/ai-content/', lastmod: '2026-09-05' });
  });

  it('never lists the noindex language chooser', () => {
    expect(entries.map((entry) => entry.loc)).not.toContain('https://emarketingai.pl/blog/');
  });
});

describe('renderSitemap', () => {
  it('renders valid urlset xml', () => {
    const xml = renderSitemap([{ loc: 'https://emarketingai.pl/', lastmod: '2026-09-10' }]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<loc>https://emarketingai.pl/</loc>');
    expect(xml).toContain('<lastmod>2026-09-10</lastmod>');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/seo/sitemap.test.ts`
Expected: FAIL — cannot resolve `./sitemap`.

- [ ] **Step 3: Implement the sitemap builder**

`apps/web/src/lib/marketing/seo/sitemap.ts`:

```ts
import { LANGS, type Article } from '../content/articles';
import { canonical, landingPath, blogIndexPath, articlePath } from '../links';

export interface SitemapEntry {
  loc: string;
  lastmod: string;
}

/**
 * Every indexable marketing URL. `/blog/` is deliberately absent: it is a noindex
 * language chooser, and listing it would ask Google to index a page we tell it to skip.
 */
export function sitemapEntries(articles: Article[], today: string): SitemapEntry[] {
  const newestFor = (lang: string): string =>
    articles.filter((article) => article.lang === lang).map((article) => article.updated).sort().pop() ?? today;

  return [
    ...LANGS.map((lang) => ({ loc: canonical(landingPath(lang)), lastmod: today })),
    ...LANGS.map((lang) => ({ loc: canonical(blogIndexPath(lang)), lastmod: newestFor(lang) })),
    ...articles.map((article) => ({
      loc: canonical(articlePath(article.lang, article.slug)),
      lastmod: article.updated,
    })),
  ];
}

export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
```

Run the test again — expected PASS, 4 tests.

- [ ] **Step 4: Serve the sitemap**

`apps/web/src/routes/(marketing)/sitemap.xml/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { ARTICLES } from '$lib/marketing/content';
import { sitemapEntries, renderSitemap } from '$lib/marketing/seo/sitemap';

export const prerender = true;

export const GET: RequestHandler = () => {
  const today = new Date().toISOString().slice(0, 10);
  return new Response(renderSitemap(sitemapEntries(ARTICLES, today)), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
```

Then delete the file it replaces — a static file of the same name would win over this route:

```bash
git rm apps/web/static/sitemap.xml
```

- [ ] **Step 5: Serve `llms.txt` and `llms-full.txt`**

`apps/web/src/routes/(marketing)/llms.txt/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { ARTICLES, articlesFor, LANGS } from '$lib/marketing/content';
import { COPY } from '$lib/marketing/copy';
import { canonical, landingPath, blogIndexPath, articlePath, COMPANY } from '$lib/marketing/links';

export const prerender = true;

export const GET: RequestHandler = () => {
  const lines = [
    '# Marketing AI Assistant',
    '',
    `> ${COPY.en.meta.description}`,
    '',
    `Built and operated by ${COMPANY.name} (${COMPANY.url}).`,
    '',
    '## Landing pages',
    ...LANGS.map((lang) => `- [${lang.toUpperCase()}](${canonical(landingPath(lang))}): ${COPY[lang].meta.title}`),
    '',
    '## Blog',
    ...LANGS.flatMap((lang) => [
      `- [${lang.toUpperCase()} index](${canonical(blogIndexPath(lang))})`,
      ...articlesFor(ARTICLES, lang).map(
        (article) => `  - [${article.title}](${canonical(articlePath(lang, article.slug))}): ${article.description}`,
      ),
    ]),
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
```

`apps/web/src/routes/(marketing)/llms-full.txt/+server.ts` follows the same shape but writes the whole corpus: for each language, the landing copy (h1, sub, every feature title and body, every step, every FAQ pair) as markdown, then each article as `## <title>` followed by its markdown body. Import the raw markdown the same way the content index does — add `export const RAW_BODIES: Record<string, string>` to `apps/web/src/lib/marketing/content/index.ts`, keyed by `${lang}/${slug}`, built from the same glob, so this endpoint emits the original markdown rather than stripped HTML.

- [ ] **Step 6: Update robots.txt**

In `apps/web/static/robots.txt`, keep every existing `Disallow` line and the `Sitemap:` line, and add above the `Sitemap:` line:

```
# Marketing pages and the blog are meant to be crawled.
Allow: /blog/
```

- [ ] **Step 7: Verify the generated files**

Run: `corepack pnpm --filter @marketing-ai/web build`, then:

```bash
cat apps/web/build/prerendered/sitemap.xml
head -20 apps/web/build/prerendered/llms.txt
```

Expected: the sitemap lists six URLs (three landings, three blog indexes) and no `/blog/` entry; `llms.txt` names the product, the company and the language variants.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/marketing/seo/sitemap.ts apps/web/src/lib/marketing/seo/sitemap.test.ts "apps/web/src/routes/(marketing)/sitemap.xml" "apps/web/src/routes/(marketing)/llms.txt" "apps/web/src/routes/(marketing)/llms-full.txt" apps/web/src/lib/marketing/content/index.ts apps/web/static/robots.txt
git commit -m "feat(marketing): generate sitemap.xml, llms.txt and llms-full.txt (#206)"
```

---

### Task 10: The first nine articles

Three topics, each in English, Polish and Russian. Slugs differ per language (they are search terms in that language); `pair` ties the three together and is what produces reciprocal hreflang.

**Files:**
- Create: `apps/web/src/content/blog/en/01-ai-social-media-content.md` (`pair: ai-social-content`, slug `ai-social-media-content`)
- Create: `apps/web/src/content/blog/pl/01-tresci-ai-do-social-media.md` (`pair: ai-social-content`, slug `tresci-ai-do-social-media`)
- Create: `apps/web/src/content/blog/ru/01-ii-kontent-dlya-socsetey.md` (`pair: ai-social-content`, slug `ii-kontent-dlya-socsetey`)
- Create: `apps/web/src/content/blog/en/02-monthly-content-plan.md` (`pair: content-plan`, slug `monthly-content-plan`)
- Create: `apps/web/src/content/blog/pl/02-plan-tresci-na-miesiac.md` (`pair: content-plan`, slug `plan-tresci-na-miesiac`)
- Create: `apps/web/src/content/blog/ru/02-kontent-plan-na-mesyac.md` (`pair: content-plan`, slug `kontent-plan-na-mesyac`)
- Create: `apps/web/src/content/blog/en/03-social-media-analytics-without-reports.md` (`pair: social-analytics`, slug `social-media-analytics-without-reports`)
- Create: `apps/web/src/content/blog/pl/03-analityka-social-media-bez-raportow.md` (`pair: social-analytics`, slug `analityka-social-media-bez-raportow`)
- Create: `apps/web/src/content/blog/ru/03-analitika-socsetey-bez-otchetov.md` (`pair: social-analytics`, slug `analitika-socsetey-bez-otchetov`)
- Test: `apps/web/src/lib/marketing/content/real-content.test.ts`

**Interfaces:**
- Consumes: the frontmatter contract from Task 3 and `articleAlternates` from Task 5.

- [ ] **Step 1: Write the English article for topic 1**

Use exactly this frontmatter shape, with `date` and `updated` set to the day you write it:

```markdown
---
slug: ai-social-media-content
lang: en
pair: ai-social-content
title: How to generate social media content with AI without sounding like a robot
description: A practical workflow for writing social posts with an AI assistant — what to feed it, what to keep human, and how to keep a brand voice.
date: 2026-09-10
updated: 2026-09-10
tags: [content, social media, ai]
faq:
  - q: Can AI write social media posts that sound human?
    a: Yes, when it is given the brand voice, the audience and real product details. Generic prompts produce generic posts.
  - q: How much editing does an AI draft need?
    a: Expect to rewrite the opening line and the call to action; the middle of a well-briefed draft usually survives intact.
  - q: Does AI content hurt reach on social platforms?
    a: Platforms rank engagement, not authorship. A post that reads well and gets replies performs the same regardless of who drafted it.
---
```

Body requirements — these are what make the article worth publishing and citable:

- 1,000–1,500 words.
- The first paragraph answers the title question directly, in two or three sentences, before any context. This is the paragraph an AI answer engine quotes.
- `## ` headings only (the `<h1>` comes from the page), each introducing a section that starts with its own direct answer.
- At least one table or numbered list of concrete steps.
- One short section relating the workflow to what Marketing AI Assistant does, linking to `/` — honest and specific, not a sales pitch.
- No invented statistics, no fabricated case studies, no claimed customer counts.

- [ ] **Step 2: Write the English articles for topics 2 and 3**

Same rules. Topic 2 (`monthly-content-plan`) is a practical guide to building a month of content: audit, themes, cadence, a table mapping channels to formats, and how to fill gaps. Topic 3 (`social-media-analytics-without-reports`) explains which numbers actually matter per channel, why lifetime counters differ from period growth, and how to read a change without building a spreadsheet.

- [ ] **Step 3: Write the Polish and Russian versions**

Six files, one per topic per language, each with its own `slug` in that language, the same `pair`, and the same `date`/`updated`. These are versions written for the market, not machine translations: keep the structure and the claims identical, but write the language naturally and use that market's search phrasing in the title and the opening paragraph.

- [ ] **Step 4: Write the test that guards the real content set**

`apps/web/src/lib/marketing/content/real-content.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ARTICLES, pairSlugs, LANGS } from './index';
import { articleAlternates } from '../seo/alternates';

describe('the published article set', () => {
  it('has nine articles, three per language', () => {
    expect(ARTICLES).toHaveLength(9);
    for (const lang of LANGS) {
      expect(ARTICLES.filter((article) => article.lang === lang), lang).toHaveLength(3);
    }
  });

  it('translates every article into all three languages', () => {
    for (const article of ARTICLES) {
      expect(Object.keys(pairSlugs(ARTICLES, article.pair)).sort(), article.pair).toEqual([...LANGS].sort());
    }
  });

  it('produces reciprocal hreflang sets', () => {
    for (const article of ARTICLES) {
      const mine = articleAlternates(pairSlugs(ARTICLES, article.pair));
      const self = mine.find((alternate) => alternate.hreflang === article.lang);
      expect(self?.href, article.slug).toContain(`/blog/${article.lang}/${article.slug}/`);
      expect(mine.filter((alternate) => alternate.hreflang !== 'x-default')).toHaveLength(3);
    }
  });

  it('gives every article an answer-engine-friendly FAQ', () => {
    for (const article of ARTICLES) {
      expect(article.faq.length, article.slug).toBeGreaterThanOrEqual(3);
      expect(article.faq.every((item) => item.q.length > 0 && item.a.length > 0), article.slug).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && corepack pnpm exec vitest run src/lib/marketing/`
Expected: PASS. A failure here names the article and the broken invariant — fix the markdown, not the test.

- [ ] **Step 6: Verify the article pages are prerendered**

Run: `corepack pnpm --filter @marketing-ai/web build`, then:

```bash
find apps/web/build/prerendered -path "*blog*" -name index.html | sort
grep -o 'hreflang="[a-z-]*"' apps/web/build/prerendered/blog/pl/tresci-ai-do-social-media/index.html | sort -u
grep -c "_app/immutable" apps/web/build/prerendered/blog/en/ai-social-media-content/index.html
grep -o '"@type":"Article"' apps/web/build/prerendered/blog/en/ai-social-media-content/index.html
cat apps/web/build/prerendered/sitemap.xml | grep -c "<loc>"
```

Expected: 12 blog pages (3 indexes + 9 articles); four hreflang values on the Polish article; **0** `_app/immutable` references; one `Article` node; 15 `<loc>` entries in the sitemap (3 landings + 3 indexes + 9 articles).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/content/blog apps/web/src/lib/marketing/content/real-content.test.ts
git commit -m "feat(marketing): publish the first three articles in en, pl and ru (#206)"
```

---

### Task 11: Documentation, final verification and the pull request

**Files:**
- Create: `docs/eng/13-marketing-landing-and-blog.md`
- Create: `docs/ru/13-marketing-landing-and-blog.md`
- Modify: `CLAUDE.md` (add a section after "Help System")

- [ ] **Step 1: Write the engineering documentation**

`docs/eng/13-marketing-landing-and-blog.md` covers: the `(marketing)` route group and why it overrides `ssr`/`prerender`/`csr`; where the landing copy lives and why it is not `svelte-i18n`; how to add an article (create the markdown in `apps/web/src/content/blog/<lang>/`, keep `pair` identical across languages, run the tests); the invariants that fail the build; how the sitemap, `llms.txt` and `robots.txt` fit together; and how to verify the prerendered output. `docs/ru/13-marketing-landing-and-blog.md` is the Russian version of the same document.

- [ ] **Step 2: Add the CLAUDE.md section**

Append after the "Help System" section:

```markdown
### Marketing Landing & Blog
- Public, prerendered pages live in `apps/web/src/routes/(marketing)/` — `+layout.ts` sets `ssr=true, prerender=true, csr=false, trailingSlash='always'`, overriding the app-wide CSR default in the root `+layout.ts`.
- `/` is the English landing; `/pl/` and `/ru/` are the translations. Articles are `/blog/<lang>/<slug>/`.
- Landing copy: `apps/web/src/lib/marketing/copy/{en,pl,ru}.ts` — plain objects, **not** `svelte-i18n` (client-side i18n would leave the prerendered HTML empty). A test asserts the three dictionaries share one key structure.
- Articles: markdown in `apps/web/src/content/blog/<lang>/*.md`, loaded via `import.meta.glob` and validated at build time (`content/articles.ts`); a broken article fails the build. `pair` links translations and drives hreflang.
- SEO: `Seo.svelte` owns the head; `seo/jsonld.ts` builds the `@graph`; `seo/alternates.ts` builds hreflang; `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` are prerendered endpoints. No `offers` and no ratings in the markup — deliberate.
- `<html lang>` is filled by `transformPageChunk` in `hooks.server.ts` (the `%lang%` placeholder in `app.html`).
- The i18n gate lives in `$lib/i18n/I18nGate.svelte` and is applied by the `(app)` and `(auth)` layouts — never by the root layout.
```

- [ ] **Step 3: Run the full verification**

```bash
cd apps/web && corepack pnpm exec vitest run
cd ../.. && corepack pnpm --filter @marketing-ai/web lint
corepack pnpm --filter @marketing-ai/web build
```

Expected: all tests pass, no new lint errors, build succeeds.

- [ ] **Step 4: Check the application still works**

Run `corepack pnpm --filter @marketing-ai/web dev` and open, in order: `/` (landing in English), `/pl/`, `/blog/en/`, one article, `/login` (translated form), and `/dashboard` after signing in.
Expected: the marketing pages render fully with JavaScript disabled; the application still translates.

- [ ] **Step 5: Commit and push**

```bash
git add docs/eng/13-marketing-landing-and-blog.md docs/ru/13-marketing-landing-and-blog.md CLAUDE.md
git commit -m "docs(marketing): document the landing page and blog (#206)"
git push -u origin feat/marketing-landing-blog
```

- [ ] **Step 6: Open the pull request**

```bash
gh pr create --base development --title "feat(marketing): indexable landing page and multilingual blog (#206)" --body "..."
```

The body must state: what changed, that `/` is no longer a redirect, the prerender/`csr=false` decision and the artifact evidence that it worked (file list plus the zero `_app/immutable` count), the i18n gate move and how it was verified, what is deliberately absent (prices, ratings, social links), and the follow-ups from the spec. End it with the two attribution lines required for PR descriptions.

---

## Self-Review

**Spec coverage.** Landing at `/`, `/pl/`, `/ru/` — Task 7. Blog routes — Task 8. Article model and invariants — Tasks 2, 3, 10. `Seo.svelte`, JSON-LD, hreflang — Tasks 5, 7. Sitemap, `llms.txt`, `llms-full.txt`, robots — Task 9. Backlinks to `mi-code.pl`, `ai-budget.pl` (+ Google Play) and `eksiegowyai.pl` — Tasks 4, 6, 7 (footer and products section). Root layout refactor — Task 1. `<html lang>` — Task 7. Nine articles — Task 10. Build-artifact proof — Tasks 7, 9, 10, 11. Documentation — Task 11. No spec requirement is unimplemented; the "open inputs" (social URLs) are handled by an empty `SOCIALS` array that the footer and `sameAs` skip.

**Placeholders.** None: every code step carries real code, and the two prose-only steps (translating the copy dictionaries, writing the articles) are content work with explicit constraints and a test that enforces them.

**Type consistency.** `Lang`, `Article` and `FaqEntry` are defined once in Task 2/3 and imported everywhere after. `buildArticles`, `articlesFor`, `articleBy`, `pairSlugs` keep the same signatures in Tasks 3, 8, 9 and 10. `canonical`, `landingPath`, `blogIndexPath`, `articlePath` are defined in Task 4 and used unchanged in Tasks 5, 7, 8 and 9. `Alternate` comes from Task 5 and is the prop type in Task 7. `jsonLdScript` takes `Record<string, unknown>[]` in every call site.
