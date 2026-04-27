/**
 * Repigmentation Velocity Utility
 *
 * Computes how fast a vitiligo patch is shrinking using linear regression
 * on scan history. Projects when the patch will reach target repigmentation
 * levels (50%, 25%, 10% affected).
 */

import type { StoredScan } from '../lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepigmentationVelocityResult {
  slope: number                    // affectedPercent change per day (negative = improving)
  intercept: number                // regression y-intercept (predicted % at day 0)
  velocityPerWeek: number          // affectedPercent change per week
  rSquared: number                 // regression fit quality 0-1
  currentAffectedPercent: number
  daysTo50Percent: number | null   // days from today to reach 50% affected
  daysTo25Percent: number | null
  daysTo10Percent: number | null
  isImproving: boolean             // slope < 0
  isWorsening: boolean             // slope > 0
  isStable: boolean                // |slope| < 0.01 per day
  isAccelerating: boolean          // improving faster recently
  isDecelerating: boolean          // improving slower recently
  scanCount: number
  daysSinceFirstScan: number
  projectionConfidence: 'high' | 'medium' | 'low'
}

// ─── Linear Regression ───────────────────────────────────────────────────────

export function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; rSquared: number } {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0, rSquared: 0 }
  }

  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0)

  const denom = n * sumXX - sumX * sumX
  if (denom === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0 }
  }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const meanY = sumY / n
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0)
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0)
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot

  return {
    slope: parseFloat(slope.toFixed(6)),
    intercept: parseFloat(intercept.toFixed(4)),
    rSquared: parseFloat(rSquared.toFixed(4)),
  }
}

// ─── Main Velocity Computation ────────────────────────────────────────────────

export function computeRepigmentationVelocity(
  scans: StoredScan[],
): RepigmentationVelocityResult | null {
  if (scans.length < 4) return null

  // Sort ascending by date
  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date))

  const firstDate = new Date(sorted[0].date).getTime()

  const points = sorted.map((s) => ({
    x: Math.round((new Date(s.date).getTime() - firstDate) / (1000 * 60 * 60 * 24)),
    y: s.affectedPercent,
  }))

  const { slope, intercept, rSquared } = linearRegression(points)

  const currentAffectedPercent = sorted[sorted.length - 1].affectedPercent
  const daysSinceFirstScan = points[points.length - 1].x
  const velocityPerWeek = slope * 7

  const isImproving = slope < -0.001
  const isWorsening = slope > 0.001
  const isStable = !isImproving && !isWorsening

  // Project days to target levels (only if improving)
  function daysToTarget(target: number): number | null {
    if (!isImproving) return null
    if (currentAffectedPercent <= target) return null
    const days = Math.round((target - intercept) / slope)
    // days must be in the future relative to today (i.e., > daysSinceFirstScan)
    if (days <= daysSinceFirstScan) return null
    const daysFromToday = days - daysSinceFirstScan
    if (daysFromToday <= 0) return null
    return daysFromToday
  }

  const daysTo50Percent = currentAffectedPercent > 50 ? daysToTarget(50) : null
  const daysTo25Percent = currentAffectedPercent > 25 ? daysToTarget(25) : null
  const daysTo10Percent = currentAffectedPercent > 10 ? daysToTarget(10) : null

  // Acceleration: compare first half vs second half slopes
  const mid = Math.floor(points.length / 2)
  const firstHalf = points.slice(0, mid)
  const secondHalf = points.slice(mid)

  const firstHalfReg = linearRegression(firstHalf)
  const secondHalfReg = linearRegression(secondHalf)
  const accelerationSlope = secondHalfReg.slope - firstHalfReg.slope

  const isAccelerating = accelerationSlope < -0.001
  const isDecelerating = accelerationSlope > 0.001

  const projectionConfidence: 'high' | 'medium' | 'low' =
    rSquared > 0.7 ? 'high' : rSquared > 0.4 ? 'medium' : 'low'

  return {
    slope,
    intercept,
    velocityPerWeek: parseFloat(velocityPerWeek.toFixed(4)),
    rSquared,
    currentAffectedPercent,
    daysTo50Percent,
    daysTo25Percent,
    daysTo10Percent,
    isImproving,
    isWorsening,
    isStable,
    isAccelerating,
    isDecelerating,
    scanCount: scans.length,
    daysSinceFirstScan,
    projectionConfidence,
  }
}

// ─── Insight Text ─────────────────────────────────────────────────────────────

export function generateVelocityInsightText(
  result: RepigmentationVelocityResult | null,
): string {
  if (!result) {
    return 'Scan at least 4 times to unlock repigmentation velocity for this patch.'
  }

  const absPerWeek = Math.abs(result.velocityPerWeek).toFixed(1)
  let text = ''

  if (result.isStable) {
    text = 'This patch has been stable — no significant change in size over the tracked period.'
  } else if (result.isWorsening) {
    text = `This patch has been growing at ${absPerWeek}% per week. Consider discussing treatment options with your dermatologist.`
  } else if (result.isImproving) {
    if (result.daysTo50Percent !== null && result.currentAffectedPercent > 50) {
      text = `At your current rate of improvement (${absPerWeek}% per week), this patch is projected to reach 50% of its original size in approximately ${result.daysTo50Percent} days.`
    } else if (result.daysTo25Percent !== null && result.currentAffectedPercent <= 50) {
      text = `Excellent progress — this patch is already below 50% and is projected to reach 25% in approximately ${result.daysTo25Percent} days.`
    } else {
      text = `This patch is improving at ${absPerWeek}% per week. Keep up with your current treatment.`
    }
  }

  if (result.isAccelerating) {
    text += ' Your rate of improvement is accelerating.'
  } else if (result.isDecelerating) {
    text += ' Your rate of improvement has slowed recently.'
  }

  return text
}

// ─── Projection Points for Chart ─────────────────────────────────────────────

export function getProjectionPoints(
  result: RepigmentationVelocityResult,
  currentDayX: number,
  futureDays: number,
): Array<{ x: number; y: number }> {
  const weekCount = Math.min(12, Math.ceil(futureDays / 7))
  const pts: Array<{ x: number; y: number }> = []

  for (let w = 0; w <= weekCount; w++) {
    const x = currentDayX + w * 7
    const y = Math.max(0, result.slope * x + result.intercept)
    pts.push({ x, y })
  }

  return pts
}
