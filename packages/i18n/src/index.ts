import en from './locales/en.json';
import pl from './locales/pl.json';
import ru from './locales/ru.json';

export const locales = { en, pl, ru } as const;
export type Locale = keyof typeof locales;
export type TranslationKeys = typeof en;

export { en, pl, ru };
