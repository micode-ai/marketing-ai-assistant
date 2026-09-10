import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { ARTICLES, articleBy, pairSlugs, type Lang } from '$lib/marketing/content';

// 'auto' (not the group's usual forced `true`): with no markdown files yet, entries()
// below returns nothing and the route is never crawled, which SvelteKit's default
// handleUnseenRoutes treats as a build error for a route forced to `true`. 'auto' still
// prerenders every entry this generates once articles exist — it only drops the "this
// route produced zero pages" failure for the interim state where none do.
export const prerender = 'auto';

export const entries: EntryGenerator = () => ARTICLES.map((article) => ({ lang: article.lang, slug: article.slug }));

export const load: PageLoad = ({ params }) => {
  const article = articleBy(ARTICLES, params.lang as Lang, params.slug);
  if (!article) throw error(404, 'Article not found');
  return { article, alternateSlugs: pairSlugs(ARTICLES, article.pair) };
};
