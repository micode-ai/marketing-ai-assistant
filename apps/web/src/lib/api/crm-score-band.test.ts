import { describe, it, expect } from 'vitest';
import { scoreBand } from './crm-score-band';

describe('scoreBand', () => {
  it('hot >= 70, warm 40-69, cold < 40, null passthrough', () => {
    expect(scoreBand(85)).toBe('hot');
    expect(scoreBand(70)).toBe('hot');
    expect(scoreBand(55)).toBe('warm');
    expect(scoreBand(40)).toBe('warm');
    expect(scoreBand(20)).toBe('cold');
    expect(scoreBand(null)).toBe(null);
    expect(scoreBand(undefined)).toBe(null);
  });
});
