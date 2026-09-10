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
