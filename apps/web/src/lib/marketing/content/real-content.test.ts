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
