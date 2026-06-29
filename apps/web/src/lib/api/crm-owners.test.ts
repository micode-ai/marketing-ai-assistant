import { describe, it, expect } from 'vitest';
import { ownerName } from './crm-owners';
import type { TeamMember } from './crm-owners';

const members: TeamMember[] = [
  { userId: 'user1', name: 'Alice Smith', email: 'alice@example.com' },
  { userId: 'user2', name: 'Bob Jones', email: 'bob@example.com' },
];

describe('ownerName', () => {
  it('returns the matching member name when ownerId is found', () => {
    expect(ownerName(members, 'user1', '—')).toBe('Alice Smith');
  });

  it('returns the second member name when ownerId is found', () => {
    expect(ownerName(members, 'user2', '—')).toBe('Bob Jones');
  });

  it('returns the fallback when ownerId is null', () => {
    expect(ownerName(members, null, '—')).toBe('—');
  });

  it('returns the fallback when ownerId is undefined', () => {
    expect(ownerName(members, undefined, '—')).toBe('—');
  });

  it('returns the fallback when ownerId is not in members', () => {
    expect(ownerName(members, 'unknown-id', '—')).toBe('—');
  });

  it('returns the fallback when members list is empty', () => {
    expect(ownerName([], 'user1', 'Fallback')).toBe('Fallback');
  });
});
