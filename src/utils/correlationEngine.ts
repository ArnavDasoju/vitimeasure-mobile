/**
 * Stress-Skin Correlation Engine
 *
 * Computes the Pearson correlation between weekly stress scores and patch
 * activity (affectedPercent), then generates a plain-English insight.
 *
 * Requires at least 4 matched week-scan pairs to produce a result.
 */

import type { WeeklyCheckIn, StoredScan } from '../lib/storage'
import { getWeeklyAverageStress, getWeeklyCheckIns } from '../lib/storage'
import { getCheckInsLast8Weeks } from './weekUtils'

// ─── Result type ──────────────────────────────────────────────────────────────

export interface StressCorrelationResult {
  r: number                       // Pearson correlation coefficient
  strength: string                // "negligible" | "weak" | "moderate" | "strong" | "very strong"
  direction: string               // "positive" | "negative"
  isSignificant: boolean          // true when |r| >= 0.4
  pairedWeeks: number             // how many week-scan pairs were found
  avgStressLast8Weeks: number     // mean stress score across last 8 check-ins
  highStressWeeksCount: number    // weeks with stressScore >= 4
  percentFasterInHighStress: number // % difference in patch size between high/low stress weeks
  hasEnoughData: boolean          // true when pairedWeeks >= 4
}

// ─── Pearson correlation ──────────────────────────────────────────────────────

/**
 * Computes the Pearson r between two numeric arrays.
 * Returns 0 if arrays are too short, differ in length, or have zero variance.
 * Result is clamped to [-1, 1] and rounded to 4 decimal places.
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0

  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let sumSqX = 0
  let sumSqY = 0

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    numerator += dx * dy
    sumSqX += dx * dx
    sumSqY += dy * dy
  }

  const denominator = Math.sqrt(sumSqX) * Math.sqrt(sumSqY)
  if (denominator === 0) return 0

  const r = numerator / denominator
  return Math.round(Math.min(1, Math.max(-1, r)) * 10000) / 10000
}

// ─── Correlation strength ─────────────────────────────────────────────────────

export function getCorrelationStrength(r: number): {
  strength: string
  direction: string
  isSignificant: boolean
} {
  const abs = Math.abs(r)
  const direction = r >= 0 ? 'positive' : 'negative'

  if (abs < 0.2) return { strength: 'negligible', direction, isSignificant: false }
  if (abs < 0.4) return { strength: 'weak',       direction, isSignificant: false }
  if (abs < 0.6) return { strength: 'moderate',   direction, isSignificant: true }
  if (abs < 0.8) return { strength: 'strong',     direction, isSignificant: true }
  return               { strength: 'very strong', direction, isSignificant: true }
}

// ─── Main computation ─────────────────────────────────────────────────────────

/**
 * Pairs weekly check-ins with scans from the same week and computes the
 * Pearson correlation between stress scores and average patch size.
 * Returns null when there are fewer than 4 matched pairs.
 */
export function computeStressCorrelation(
  checkIns: WeeklyCheckIn[],
  scans: StoredScan[],
): StressCorrelationResult | null {
  try {
    const recent = getCheckInsLast8Weeks(checkIns)
    if (recent.length === 0) return null

    const stressScores: number[] = []
    const patchSizeValues: number[] = []
    const highStressPatchSizes: number[] = []
    const lowStressPatchSizes: number[] = []

    for (const checkIn of recent) {
      const weekStart = new Date(checkIn.weekStartDate + 'T00:00:00').getTime()
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000

      const weekScans = scans.filter((s) => {
        const t = new Date(s.date).getTime()
        return t >= weekStart && t < weekEnd
      })

      if (weekScans.length === 0) continue

      const avgAffected =
        weekScans.reduce((sum, s) => sum + s.affectedPercent, 0) / weekScans.length

      stressScores.push(checkIn.stressScore)
      patchSizeValues.push(avgAffected)

      if (checkIn.stressScore >= 4) {
        highStressPatchSizes.push(avgAffected)
      } else {
        lowStressPatchSizes.push(avgAffected)
      }
    }

    if (stressScores.length < 4) return null

    const r = pearsonCorrelation(stressScores, patchSizeValues)
    const { strength, direction, isSignificant } = getCorrelationStrength(r)

    const avgStressLast8Weeks =
      Math.round(
        (recent.reduce((sum, c) => sum + c.stressScore, 0) / recent.length) * 10,
      ) / 10

    const highStressWeeksCount = recent.filter((c) => c.stressScore >= 4).length

    let percentFasterInHighStress = 0
    if (highStressPatchSizes.length > 0 && lowStressPatchSizes.length > 0) {
      const avgHigh =
        highStressPatchSizes.reduce((a, b) => a + b, 0) / highStressPatchSizes.length
      const avgLow =
        lowStressPatchSizes.reduce((a, b) => a + b, 0) / lowStressPatchSizes.length
      if (avgLow > 0) {
        percentFasterInHighStress =
          Math.round(((avgHigh - avgLow) / avgLow) * 100 * 10) / 10
      }
    }

    return {
      r,
      strength,
      direction,
      isSignificant,
      pairedWeeks: stressScores.length,
      avgStressLast8Weeks,
      highStressWeeksCount,
      percentFasterInHighStress,
      hasEnoughData: stressScores.length >= 4,
    }
  } catch {
    return null
  }
}

// ─── Daily-data correlation ───────────────────────────────────────────────────

/**
 * Identical pairing and Pearson logic as computeStressCorrelation, but reads
 * stress from weeklyAverages (derived from daily entries) instead of
 * WeeklyCheckIn objects.
 */
export function computeStressCorrelationFromDailyData(
  weeklyAverages: Array<{ weekKey: string; weekStartDate: string; avgStress: number }>,
  scans: StoredScan[],
): StressCorrelationResult | null {
  try {
    if (weeklyAverages.length === 0) return null

    const stressScores: number[] = []
    const patchSizeValues: number[] = []
    const highStressPatchSizes: number[] = []
    const lowStressPatchSizes: number[] = []

    for (const week of weeklyAverages) {
      const weekStart = new Date(week.weekStartDate + 'T00:00:00').getTime()
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000

      const weekScans = scans.filter((s) => {
        const t = new Date(s.date).getTime()
        return t >= weekStart && t < weekEnd
      })

      if (weekScans.length === 0) continue

      const avgAffected =
        weekScans.reduce((sum, s) => sum + s.affectedPercent, 0) / weekScans.length

      stressScores.push(week.avgStress)
      patchSizeValues.push(avgAffected)

      if (week.avgStress >= 4) {
        highStressPatchSizes.push(avgAffected)
      } else {
        lowStressPatchSizes.push(avgAffected)
      }
    }

    if (stressScores.length < 4) return null

    const r = pearsonCorrelation(stressScores, patchSizeValues)
    const { strength, direction, isSignificant } = getCorrelationStrength(r)

    const avgStressLast8Weeks =
      Math.round(
        (weeklyAverages.reduce((sum, w) => sum + w.avgStress, 0) / weeklyAverages.length) * 10,
      ) / 10

    const highStressWeeksCount = weeklyAverages.filter((w) => w.avgStress >= 4).length

    let percentFasterInHighStress = 0
    if (highStressPatchSizes.length > 0 && lowStressPatchSizes.length > 0) {
      const avgHigh =
        highStressPatchSizes.reduce((a, b) => a + b, 0) / highStressPatchSizes.length
      const avgLow =
        lowStressPatchSizes.reduce((a, b) => a + b, 0) / lowStressPatchSizes.length
      if (avgLow > 0) {
        percentFasterInHighStress =
          Math.round(((avgHigh - avgLow) / avgLow) * 100 * 10) / 10
      }
    }

    return {
      r,
      strength,
      direction,
      isSignificant,
      pairedWeeks: stressScores.length,
      avgStressLast8Weeks,
      highStressWeeksCount,
      percentFasterInHighStress,
      hasEnoughData: stressScores.length >= 4,
    }
  } catch {
    return null
  }
}

/**
 * Returns the best available stress correlation result:
 * - Tries daily-data first (via getWeeklyAverageStress).
 * - Falls back to weekly check-ins (via getWeeklyCheckIns + computeStressCorrelation).
 * - Returns whichever result has more paired weeks, or null if neither has enough data.
 */
export async function getBestStressCorrelation(
  userEmail: string,
  scans: StoredScan[],
): Promise<StressCorrelationResult | null> {
  let dailyResult: StressCorrelationResult | null = null
  let checkInResult: StressCorrelationResult | null = null

  try {
    const weeklyAverages = await getWeeklyAverageStress(userEmail)
    dailyResult = computeStressCorrelationFromDailyData(weeklyAverages, scans)
  } catch {
    // fall through to check-in fallback
  }

  try {
    const checkIns = await getWeeklyCheckIns(userEmail)
    checkInResult = computeStressCorrelation(checkIns, scans)
  } catch {
    // ignore
  }

  if (!dailyResult && !checkInResult) return null
  if (!dailyResult) return checkInResult
  if (!checkInResult) return dailyResult
  return dailyResult.pairedWeeks >= checkInResult.pairedWeeks ? dailyResult : checkInResult
}

// ─── Insight text generator ───────────────────────────────────────────────────

export function generateCorrelationInsightText(
  result: StressCorrelationResult | null,
): string {
  if (!result || !result.hasEnoughData) {
    return 'Keep checking in each week — you will unlock a personalized stress insight after a few more weeks of data.'
  }

  if (!result.isSignificant) {
    return "Your stress levels and patch activity don't show a clear pattern yet. Keep tracking to see if a connection emerges."
  }

  if (result.direction === 'positive' && result.percentFasterInHighStress > 0) {
    const weekWord = result.highStressWeeksCount === 1 ? 'week' : 'weeks'
    return `Your patches tend to be ${result.percentFasterInHighStress}% more active during high-stress weeks. You've had ${result.highStressWeeksCount} high-stress ${weekWord} recently.`
  }

  if (result.direction === 'negative') {
    return 'Interestingly, your patch activity seems lower during high-stress periods. This is unusual — keep tracking to confirm this pattern.'
  }

  return 'A pattern between your stress levels and patch activity is starting to emerge. Keep checking in each week.'
}
