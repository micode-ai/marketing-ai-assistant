import { describe, it, expect } from 'vitest';
import { formatMoney, columnTotal } from './crm-forecast';

describe('crm-forecast helpers', () => {
  it('formatMoney formats a number in the given currency', () => {
    expect(formatMoney(1000, 'USD', 'en')).toMatch(/\$1,000|US\$1,000|\$1000/);
  });
  it('formatMoney falls back for an unknown currency code', () => {
    expect(formatMoney(500, 'XYZ', 'en')).toContain('500');
  });
  it('columnTotal sums numeric + string values', () => {
    expect(columnTotal([{ value: 100 }, { value: '250.5' }])).toBe(350.5);
  });
});
