import type { Lang } from './content/articles';

export const SITE = 'https://emarketingai.pl';

export const COMPANY = {
  name: 'MICODE sp. z o.o.',
  url: 'https://mi-code.pl/',
} as const;

/** Sibling MICODE products, linked from the landing page body (dofollow, on purpose). */
export const PRODUCTS = [
  {
    key: 'ai-budget',
    name: 'AI Budget Assistant',
    url: 'https://ai-budget.pl/',
    store: 'https://play.google.com/store/apps/details?id=com.budget.assistant',
  },
  {
    key: 'eksiegowy',
    name: 'eKsięgowy AI',
    url: 'https://eksiegowyai.pl/',
  },
] as const;

/**
 * Product social profiles. Empty until the real URLs are supplied — an invented
 * profile in `sameAs` is worse than no `sameAs` at all.
 */
export const SOCIALS: readonly { name: string; url: string }[] = [];

export function canonical(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  return `${SITE}${withTrailing}`;
}

export function landingPath(lang: Lang): string {
  return lang === 'en' ? '/' : `/${lang}/`;
}

export function blogIndexPath(lang: Lang): string {
  return `/blog/${lang}/`;
}

export function articlePath(lang: Lang, slug: string): string {
  return `/blog/${lang}/${slug}/`;
}
