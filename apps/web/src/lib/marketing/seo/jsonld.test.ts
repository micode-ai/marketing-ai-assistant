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
