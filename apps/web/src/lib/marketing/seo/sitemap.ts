import { LANGS, newestUpdated, type Article } from '../content/articles';
import { canonical, landingPath, blogIndexPath, articlePath, CONTENT_REVIEWED } from '../links';

export interface SitemapEntry {
  loc: string;
  lastmod: string;
}

/**
 * Every indexable marketing URL. `/blog/` is deliberately absent: it is a noindex
 * language chooser, and listing it would ask Google to index a page we tell it to skip.
 *
 * Landing pages use `CONTENT_REVIEWED` (bumped by hand when the copy changes), not
 * `today` — a build-date `lastmod` re-dates every deploy even when nothing changed,
 * which is a signal Google learns to distrust. `today` remains the fallback for a blog
 * index whose language has no articles yet.
 */
export function sitemapEntries(articles: Article[], today: string): SitemapEntry[] {
  const newestFor = (lang: string): string =>
    newestUpdated(articles.filter((article) => article.lang === lang)) ?? today;

  return [
    ...LANGS.map((lang) => ({ loc: canonical(landingPath(lang)), lastmod: CONTENT_REVIEWED })),
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
