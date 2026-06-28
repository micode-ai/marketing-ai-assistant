import { describe, it, expect } from 'vitest';
import { pickTotal } from './pick-total';

describe('pickTotal', () => {
  it('prefers a finite period total over the daily sum', () => {
    expect(pickTotal(900, 61)).toBe(900);
    expect(pickTotal(0, 61)).toBe(0); // a real zero total is still preferred
  });
  it('falls back to the daily sum when the period total is missing', () => {
    expect(pickTotal(undefined, 61)).toBe(61);
    expect(pickTotal(null, 61)).toBe(61);
    expect(pickTotal(NaN, 61)).toBe(61);
  });
});
