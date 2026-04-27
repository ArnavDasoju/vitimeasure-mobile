/**
 * Stress Color Map
 *
 * Maps a stress score (1–5) to a consistent color.
 * Used by DailyStressTap, StressCalendar, and the LineChart stress-band overlay.
 * All stress-colored UI must import from here — no hardcoded colors elsewhere.
 */

export function getStressColor(score: number): string {
  if (score <= 1.5) return '#22c55e'  // green-500    — very low
  if (score <= 2.5) return '#86efac'  // green-300    — low
  if (score <= 3.5) return '#94a3b8'  // slate-400    — moderate
  if (score <= 4.5) return '#fb923c'  // orange-400   — high
  return '#ef4444'                    // red-500      — very high
}
