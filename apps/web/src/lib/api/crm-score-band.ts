export type ScoreBand = 'hot' | 'warm' | 'cold';

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}
