const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
  ru: 'Russian',
};

/**
 * Returns a prompt instruction for generating content in the specified language.
 * Returns empty string for English or unknown locales (English is the default).
 */
export function getLanguageInstruction(locale: string | undefined): string {
  if (!locale) return '';
  const lang = LANGUAGE_NAMES[locale];
  if (!lang || locale === 'en') return '';
  return `\nIMPORTANT: You MUST write ALL content in ${lang}. Every part of your response must be in ${lang}.`;
}
