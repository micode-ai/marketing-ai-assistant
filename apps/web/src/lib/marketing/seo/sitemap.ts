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
