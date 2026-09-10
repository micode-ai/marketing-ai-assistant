import { LANGS, type Lang } from '../content/articles';
import { canonical, landingPath, blogIndexPath, articlePath } from '../links';

export interface Alternate {
  hreflang: string;
  href: string;
}

/** x-default always points at the English URL — it is our default market. */
function withDefault(list: Alternate[], englishHref: string | undefined): Alternate[] {
  return englishHref ? [...list, { hreflang: 'x-default', href: englishHref }] : list;
}

export function landingAlternates(): Alternate[] {
  const list = LANGS.map((lang) => ({ hreflang: lang, href: canonical(landingPath(lang)) }));
  return withDefault(list, canonical(landingPath('en')));
}

export function blogIndexAlternates(): Alternate[] {
  const list = LANGS.map((lang) => ({ hreflang: lang, href: canonical(blogIndexPath(lang)) }));
  return withDefault(list, canonical(blogIndexPath('en')));
}

export function articleAlternates(slugs: Partial<Record<Lang, string>>): Alternate[] {
  const list: Alternate[] = [];
  for (const lang of LANGS) {
    const slug = slugs[lang];
    if (slug) list.push({ hreflang: lang, href: canonical(articlePath(lang, slug)) });
  }
  return withDefault(list, slugs.en ? canonical(articlePath('en', slugs.en)) : undefined);
}
