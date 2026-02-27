import { browser } from '$app/environment';
import { init, register, getLocaleFromNavigator, locale } from 'svelte-i18n';

const defaultLocale = 'en';

register('en', () => import('@marketing-ai/i18n/locales/en.json'));
register('pl', () => import('@marketing-ai/i18n/locales/pl.json'));
register('ru', () => import('@marketing-ai/i18n/locales/ru.json'));

export function setupI18n() {
  return init({
    fallbackLocale: defaultLocale,
    initialLocale: browser
      ? (localStorage.getItem('locale') || getLocaleFromNavigator() || defaultLocale)
      : defaultLocale,
  });
}

export function setLocale(newLocale: string) {
  locale.set(newLocale);
  if (browser) {
    localStorage.setItem('locale', newLocale);
  }
}
