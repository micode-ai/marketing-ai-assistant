import { describe, it, expect } from 'vitest';
import { langFromPath } from './lang-from-path';

describe('langFromPath', () => {
  it('defaults to English at the root', () => {
    expect(langFromPath('/')).toBe('en');
    expect(langFromPath('/login')).toBe('en');
  });

  it('reads the landing prefix', () => {
    expect(langFromPath('/pl/')).toBe('pl');
    expect(langFromPath('/ru/')).toBe('ru');
  });

  it('reads the blog segment', () => {
    expect(langFromPath('/blog/ru/kontent-plan/')).toBe('ru');
    expect(langFromPath('/blog/en/')).toBe('en');
    expect(langFromPath('/blog/')).toBe('en');
  });
});
