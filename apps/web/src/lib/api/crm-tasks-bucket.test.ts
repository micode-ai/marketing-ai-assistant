import { describe, it, expect } from 'vitest';
import { taskBucket } from './crm-tasks-bucket';

describe('taskBucket', () => {
  const now = new Date('2026-06-29T12:00:00Z');
  it('overdue / today / upcoming / no-due', () => {
    expect(taskBucket('2026-06-28T10:00:00Z', now)).toBe('overdue');
    expect(taskBucket('2026-06-29T23:00:00Z', now)).toBe('today');
    expect(taskBucket('2026-07-01T00:00:00Z', now)).toBe('upcoming');
    expect(taskBucket(null, now)).toBe('upcoming');
  });
});
