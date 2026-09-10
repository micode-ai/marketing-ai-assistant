import { describe, it, expect } from 'vitest';
import { sitemapEntries, renderSitemap } from './sitemap';
import { buildArticles } from '../content/articles';
import { CONTENT_REVIEWED } from '../links';

const articles = buildArticles({
  '/src/content/blog/en/01-a.md':
    '---\nslug: ai-content\nlang: en\npair: ai-content\ntitle: T\ndescription: D\ndate: 2026-09-01\nupdated: 2026-09-05\n---\n\nBody.',
});

describe('sitemapEntries', () => {
  // `today` deliberately differs from CONTENT_REVIEWED so a landing lastmod that leaked
  // the build date instead of the constant would fail the test below.
  const entries = sitemapEntries(articles, '2026-12-25');

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

  it('dates the landings from CONTENT_REVIEWED, not the build date', () => {
    expect(entries).toContainEqual({ loc: 'https://emarketingai.pl/', lastmod: CONTENT_REVIEWED });
    expect(entries).toContainEqual({ loc: 'https://emarketingai.pl/pl/', lastmod: CONTENT_REVIEWED });
    expect(entries).toContainEqual({ loc: 'https://emarketingai.pl/ru/', lastmod: CONTENT_REVIEWED });
  });

  it('dates a blog index from its newest article, not CONTENT_REVIEWED', () => {
    expect(entries).toContainEqual({ loc: 'https://emarketingai.pl/blog/en/', lastmod: '2026-09-05' });
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
