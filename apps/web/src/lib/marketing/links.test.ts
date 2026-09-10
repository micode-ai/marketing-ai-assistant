import { describe, it, expect } from 'vitest';
import { canonical, landingPath, blogIndexPath, articlePath, PRODUCTS, COMPANY, SOCIALS } from './links';

describe('paths', () => {
  it('puts English at the root and the others under a prefix', () => {
    expect(landingPath('en')).toBe('/');
    expect(landingPath('pl')).toBe('/pl/');
    expect(landingPath('ru')).toBe('/ru/');
  });

  it('builds blog paths with a trailing slash', () => {
    expect(blogIndexPath('en')).toBe('/blog/en/');
    expect(articlePath('ru', 'kontent-plan')).toBe('/blog/ru/kontent-plan/');
  });
});

describe('canonical', () => {
  it('produces absolute URLs that always end with a slash', () => {
    expect(canonical('/')).toBe('https://emarketingai.pl/');
    expect(canonical('/pl/')).toBe('https://emarketingai.pl/pl/');
    expect(canonical('blog/en')).toBe('https://emarketingai.pl/blog/en/');
  });
});

describe('outbound links', () => {
  it('links the company and both sibling products', () => {
    expect(COMPANY.url).toBe('https://mi-code.pl/');
    expect(PRODUCTS.map((p) => p.key)).toEqual(['ai-budget', 'eksiegowy']);
    expect(PRODUCTS.every((p) => p.url.startsWith('https://'))).toBe(true);
  });

  it('has no invented social profiles', () => {
    expect(SOCIALS).toEqual([]);
  });
});
