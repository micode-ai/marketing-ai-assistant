import type { Lang } from '../content/articles';
import type { LandingCopy } from './types';
import { en } from './en';
import { pl } from './pl';
import { ru } from './ru';

export const COPY: Record<Lang, LandingCopy> = { en, pl, ru };

export function copyFor(lang: Lang): LandingCopy {
  return COPY[lang];
}

export type { LandingCopy };
