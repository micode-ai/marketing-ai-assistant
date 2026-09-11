import { describe, it, expect } from 'vitest';
import { COPY } from './index';
import { LANGS } from '../content/articles';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      keyPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe('landing copy', () => {
  it('covers every language', () => {
    expect(Object.keys(COPY).sort()).toEqual([...LANGS].sort());
  });

  it('has an identical key structure in all three languages', () => {
    const reference = keyPaths(COPY.en).sort();
    for (const lang of LANGS) {
      expect(keyPaths(COPY[lang]).sort(), `${lang} differs from en`).toEqual(reference);
    }
  });

  it('has no empty strings', () => {
    for (const lang of LANGS) {
      const empties = keyPaths(COPY[lang]).filter((path) => {
        const value = path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], COPY[lang]);
        return typeof value !== 'string' || value.trim().length === 0;
      });
      expect(empties, `${lang} has empty copy`).toEqual([]);
    }
  });

  it('keeps meta descriptions within the snippet limit', () => {
    for (const lang of LANGS) {
      expect(COPY[lang].meta.description.length, `${lang} description too long`).toBeLessThanOrEqual(155);
    }
  });

  it('keeps six FAQ entries per language for the FAQPage markup', () => {
    for (const lang of LANGS) {
      expect(COPY[lang].faq.items.length, lang).toBe(6);
    }
  });
});
