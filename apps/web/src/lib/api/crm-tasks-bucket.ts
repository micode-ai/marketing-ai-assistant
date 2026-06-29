export type Bucket = 'overdue' | 'today' | 'upcoming';

export function taskBucket(dueDate: string | null, now: Date): Bucket {
  if (!dueDate) return 'upcoming';
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const d = new Date(dueDate);
  if (d < start) return 'overdue';
  if (d < tomorrow) return 'today';
  return 'upcoming';
}
