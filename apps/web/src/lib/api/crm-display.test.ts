import { describe, it, expect } from 'vitest';
import { contactDisplayName } from './crm-display';

describe('contactDisplayName', () => {
  it('prefers full name', () => {
    expect(contactDisplayName({ firstName: 'Ann', lastName: 'Lee', email: 'a@x.com' }, 'Anon')).toBe('Ann Lee');
  });
  it('falls back to email then to the fallback', () => {
    expect(contactDisplayName({ email: 'a@x.com' }, 'Anon')).toBe('a@x.com');
    expect(contactDisplayName({}, 'Anon')).toBe('Anon');
  });
});
