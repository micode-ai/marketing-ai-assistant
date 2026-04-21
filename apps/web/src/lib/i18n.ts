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

export async function setLocale(newLocale: string) {
  locale.set(newLocale);
  if (browser) {
    localStorage.setItem('locale', newLocale);
    // Persist to backend (best-effort). Lazy-import to avoid circular init with $lib/api/client.
    try {
      const { api } = await import('$lib/api/client');
      await api.put('/users/me', { language: newLocale });
    } catch {
      // locale still works locally if the request fails or user is unauthenticated
    }
  }
}
