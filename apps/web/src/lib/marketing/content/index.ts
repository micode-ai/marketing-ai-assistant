import { buildArticles } from './articles';
import { parseFrontmatter } from './frontmatter';

const files = import.meta.glob('/src/content/blog/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The validated article set. Building it throws if any article breaks an invariant. */
export const ARTICLES = buildArticles(files);

/**
 * Raw markdown body per article, keyed by `${lang}/${slug}` — built from the same glob
 * as ARTICLES, so llms-full.txt can emit the original markdown instead of stripped HTML.
 */
export const RAW_BODIES: Record<string, string> = Object.fromEntries(
  Object.values(files).map((raw) => {
    const { meta, body } = parseFrontmatter(raw);
    return [`${meta.lang as string}/${meta.slug as string}`, body];
  }),
);

export { LANGS, articlesFor, articleBy, pairSlugs } from './articles';
export type { Lang, Article } from './articles';
