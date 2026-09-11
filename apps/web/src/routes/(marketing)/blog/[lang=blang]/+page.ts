import type { EntryGenerator, PageLoad } from './$types';
import { ARTICLES, LANGS, articlesFor, newestUpdated, type Lang } from '$lib/marketing/content';
import { blogIndexPath, CONTENT_REVIEWED } from '$lib/marketing/links';

export const entries: EntryGenerator = () => [{ lang: 'en' }, { lang: 'pl' }, { lang: 'ru' }];

export const load: PageLoad = ({ params }) => {
  const lang = params.lang as Lang;
  const articlesForLang = articlesFor(ARTICLES, lang);
  return {
    lang,
    // The blog index for every language exists regardless of content, so the switcher
    // always has somewhere real to send the reader.
    langHrefs: Object.fromEntries(LANGS.map((code) => [code, blogIndexPath(code)])) as Partial<Record<Lang, string>>,
    // Matches the sitemap's own `lastmod` for this URL — one source of truth for "when
    // was this page last meaningfully updated".
    lastUpdated: newestUpdated(articlesForLang) ?? CONTENT_REVIEWED,
    articles: articlesForLang.map(({ slug, title, description, date, updated, readingMinutes }) => ({
      slug,
      title,
      description,
      date,
      updated,
      readingMinutes,
    })),
  };
};
