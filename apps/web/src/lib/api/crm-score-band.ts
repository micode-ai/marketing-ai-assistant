export type ScoreBand = 'hot' | 'warm' | 'cold';

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

/** Returns Tailwind color classes for a score band (shared by board badges and deal-detail panel). */
export function bandClass(band: ScoreBand | null): string {
  if (band === 'hot') return 'text-red-600 bg-red-500/10';
  if (band === 'warm') return 'text-amber-600 bg-amber-500/10';
  return 'text-ink-muted bg-surface-2';
}
