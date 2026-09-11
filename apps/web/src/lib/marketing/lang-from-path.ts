import { LANGS, type Lang } from './content/articles';

/** Derives the page language from the URL, which is the only signal a JS-free page has. */
export function langFromPath(pathname: string): Lang {
  const segments = pathname.split('/').filter(Boolean);
  const candidate = segments[0] === 'blog' ? segments[1] : segments[0];
  return (LANGS as readonly string[]).includes(candidate ?? '') ? (candidate as Lang) : 'en';
}
