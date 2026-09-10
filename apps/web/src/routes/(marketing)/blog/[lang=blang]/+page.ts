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
