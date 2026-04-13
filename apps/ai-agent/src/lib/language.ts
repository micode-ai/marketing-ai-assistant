const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
  ru: 'Russian',
};

/**
 * Returns a prompt instruction for generating content in the specified language.
 * Always returns an explicit language instruction, including for English.
 */
export function getLanguageInstruction(locale: string | undefined): string {
  if (!locale) return '';
  const lang = LANGUAGE_NAMES[locale] || 'English';
  return `\nIMPORTANT: You MUST write ALL content in ${lang}. Every part of your response must be in ${lang}.`;
}
