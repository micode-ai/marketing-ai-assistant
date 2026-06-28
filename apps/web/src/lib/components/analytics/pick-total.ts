/** Prefer a period total_value when present and finite; else the summed daily rows. */
export function pickTotal(periodTotal: number | null | undefined, dailySum: number): number {
  return typeof periodTotal === 'number' && Number.isFinite(periodTotal) ? periodTotal : dailySum;
}
