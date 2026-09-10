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

  it('rejects a duplicate slug within one language, naming both files', () => {
    let error: Error | undefined;
    try {
      buildArticles({
        '/src/content/blog/en/01-a.md': file(),
        '/src/content/blog/en/02-b.md': file(),
      });
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/duplicate slug/i);
    expect(error?.message).toContain('/src/content/blog/en/01-a.md');
    expect(error?.message).toContain('/src/content/blog/en/02-b.md');
  });

  it('rejects a description longer than 155 characters', () => {
    expect(() => buildArticles({ '/src/content/blog/en/01-a.md': file({ description: 'x'.repeat(156) }) })).toThrow(
      /description/i,
    );
  });

  it('rejects an unknown language', () => {
    expect(() => buildArticles({ '/src/content/blog/de/01-a.md': file({ lang: 'de' }) })).toThrow(/language/i);
  });

  it('rejects two articles of the same language sharing one pair, naming both files', () => {
    let error: Error | undefined;
    try {
      buildArticles({
        '/src/content/blog/en/01-a.md': file({ slug: 'a' }),
        '/src/content/blog/en/02-b.md': file({ slug: 'b' }),
      });
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/pair/i);
    expect(error?.message).toContain('/src/content/blog/en/01-a.md');
    expect(error?.message).toContain('/src/content/blog/en/02-b.md');
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
