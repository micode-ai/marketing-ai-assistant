import { describe, it, expect } from 'vitest';
import { landingAlternates, blogIndexAlternates, articleAlternates } from './alternates';

describe('landingAlternates', () => {
  it('lists all three languages plus x-default on English', () => {
    expect(landingAlternates()).toEqual([
      { hreflang: 'en', href: 'https://emarketingai.pl/' },
      { hreflang: 'pl', href: 'https://emarketingai.pl/pl/' },
      { hreflang: 'ru', href: 'https://emarketingai.pl/ru/' },
      { hreflang: 'x-default', href: 'https://emarketingai.pl/' },
    ]);
  });
});

describe('blogIndexAlternates', () => {
  it('points each language at its own index', () => {
    expect(blogIndexAlternates()).toEqual([
      { hreflang: 'en', href: 'https://emarketingai.pl/blog/en/' },
      { hreflang: 'pl', href: 'https://emarketingai.pl/blog/pl/' },
      { hreflang: 'ru', href: 'https://emarketingai.pl/blog/ru/' },
      { hreflang: 'x-default', href: 'https://emarketingai.pl/blog/en/' },
    ]);
  });
});

describe('articleAlternates', () => {
  it('only lists the languages the article was actually translated into', () => {
    expect(articleAlternates({ en: 'ai-content', pl: 'tresci-ai' })).toEqual([
      { hreflang: 'en', href: 'https://emarketingai.pl/blog/en/ai-content/' },
      { hreflang: 'pl', href: 'https://emarketingai.pl/blog/pl/tresci-ai/' },
      { hreflang: 'x-default', href: 'https://emarketingai.pl/blog/en/ai-content/' },
    ]);
  });

  it('omits x-default when there is no English version', () => {
    expect(articleAlternates({ pl: 'tresci-ai' })).toEqual([
      { hreflang: 'pl', href: 'https://emarketingai.pl/blog/pl/tresci-ai/' },
    ]);
  });
});
