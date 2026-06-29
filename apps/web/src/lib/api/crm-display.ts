export function contactDisplayName(
  c: { firstName?: string | null; lastName?: string | null; email?: string | null },
  fallback: string,
): string {
  const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return n || c.email || fallback;
}
