/**
 * Explanation Utilities
 *
 * Pure data functions called exclusively from XAIExplanationSheet.
 * Every function returns computed data only — no JSX.
 * Every returned string is fully resolved with real values — zero placeholders.
 */

import { getVASISeverity, getVASIWeight } from './vasiScore'
import type { StoredScan } from '../lib/storage'
import type { RepigmentationVelocityResult } from './repigmentationVelocity'
import type { StressCorrelationResult } from './correlationEngine'

// ─── Section 1 — Detection confidence ────────────────────────────────────────

export function getConfidenceBar(confidence: number): {
  fillColor: string
  label: string
  oneLiner: string
  showRetake: boolean
} {
  let fillColor: string
  let oneLiner: string

  if (confidence >= 0.90) {
    fillColor = '#22c55e'
    oneLiner = 'Clear patch boundary detected. This measurement is reliable.'
  } else if (confidence >= 0.75) {
    fillColor = '#86efac'
    oneLiner = 'Good patch boundary detected. Measurement should be accurate.'
  } else if (confidence >= 0.55) {
    fillColor = '#fbbf24'
    oneLiner =
      'Patch boundary was somewhat unclear. Better lighting will improve accuracy.'
  } else {
    fillColor = '#ef4444'
    oneLiner =
      'The patch boundary was difficult to detect clearly. Try retaking in brighter, even lighting with the patch centered in frame.'
  }

  return {
    fillColor,
    label: `${(confidence * 100).toFixed(0)}%`,
    oneLiner,
    showRetake: confidence < 0.75,
  }
}

// ─── Section 2 — VASI math breakdown ─────────────────────────────────────────

export function getVASIMathBreakdown(
  bodyArea: string,
  affectedPercent: number,
  vasiScore: number,
): {
  weightPercent: string
  affectedStr: string
  vasiStr: string
  severityOneLiner: string
  bodyAreaOneLiner: string
} {
  const weight = getVASIWeight(bodyArea)
  const weightPercent = `${(weight * 100).toFixed(0)}%`
  const affectedStr = `${(affectedPercent ?? 0).toFixed(1)}%`
  const vasiStr = (vasiScore == null || isNaN(vasiScore)) ? '0.00' : vasiScore.toFixed(2)

  const { label: severityLabel } = getVASISeverity(vasiScore)
  let severityOneLiner: string
  switch (severityLabel) {
    case 'Clear':
      severityOneLiner = 'No active vitiligo detected. Excellent result.'
      break
    case 'Minimal':
      severityOneLiner = 'Very limited vitiligo activity. Nearly fully repigmented.'
      break
    case 'Mild':
      severityOneLiner = 'Mild activity. Considered well-controlled by clinical standards.'
      break
    case 'Moderate':
      severityOneLiner = 'Moderate activity. Consistent treatment is recommended.'
      break
    case 'Severe':
      severityOneLiner =
        'Significant activity. Worth discussing with your dermatologist.'
      break
    default:
      severityOneLiner = 'Keep scanning to track changes over time.'
  }

  const lower = bodyArea.toLowerCase()
  let bodyAreaOneLiner: string
  if (
    lower.includes('face') ||
    lower.includes('head') ||
    lower.includes('neck') ||
    lower.includes('scalp')
  ) {
    bodyAreaOneLiner = 'Facial vitiligo often responds well to topical treatments.'
  } else if (lower.includes('hand') || lower.includes('foot') || lower.includes('feet')) {
    bodyAreaOneLiner =
      'Acral (hands and feet) vitiligo tends to be the most treatment-resistant area.'
  } else if (
    lower.includes('trunk') ||
    lower.includes('back') ||
    lower.includes('chest') ||
    lower.includes('abdomen') ||
    lower.includes('torso')
  ) {
    bodyAreaOneLiner = 'Trunk vitiligo responds moderately to most treatments.'
  } else if (
    lower.includes('arm') ||
    lower.includes('leg') ||
    lower.includes('forearm') ||
    lower.includes('thigh') ||
    lower.includes('calf') ||
    lower.includes('knee')
  ) {
    bodyAreaOneLiner =
      'Limb vitiligo shows variable response. Regular tracking helps identify what works.'
  } else {
    bodyAreaOneLiner = 'Keep scanning regularly to track how this area responds.'
  }

  return { weightPercent, affectedStr, vasiStr, severityOneLiner, bodyAreaOneLiner }
}

// ─── Section 3 — Trend one-liner ─────────────────────────────────────────────

export function getTrendOneLiner(
  scans: StoredScan[],
  velocityResult: RepigmentationVelocityResult | null,
): string | null {
  if (scans.length < 3) return null

  const sorted = [...scans].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const n = sorted.length
  const startPercent = first.affectedPercent.toFixed(1)
  const currentPercent = last.affectedPercent.toFixed(1)
  const days = Math.max(
    1,
    Math.round(
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  )
  const delta = Math.abs(last.affectedPercent - first.affectedPercent).toFixed(1)

  const isImproving = last.affectedPercent < first.affectedPercent - 0.05
  const isWorsening = last.affectedPercent > first.affectedPercent + 0.05

  let text: string
  if (isImproving) {
    text = `Across your last ${n} scans, your affected area has decreased from ${startPercent}% to ${currentPercent}%. That is an improvement of ${delta}% over ${days} days.`
  } else if (isWorsening) {
    text = `Across your last ${n} scans, your affected area has increased from ${startPercent}% to ${currentPercent}%. This warrants attention.`
  } else {
    text = `Your patch size has not changed significantly across your last ${n} scans.`
  }

  if (velocityResult) {
    if (velocityResult.isImproving) {
      const milestone =
        velocityResult.daysTo10Percent !== null
          ? { pct: 10, days: velocityResult.daysTo10Percent }
          : velocityResult.daysTo25Percent !== null
            ? { pct: 25, days: velocityResult.daysTo25Percent }
            : velocityResult.daysTo50Percent !== null
              ? { pct: 50, days: velocityResult.daysTo50Percent }
              : null
      if (milestone) {
        text += ` At your current rate, this patch is projected to reach ${milestone.pct}% affected in approximately ${milestone.days} days.`
      }
    } else if (velocityResult.isWorsening) {
      text += ` The current trend is worsening at ${velocityResult.velocityPerWeek.toFixed(1)}% per week.`
    }
  }

  return text
}

// ─── Section 4 — Stress one-liner ────────────────────────────────────────────

export function getStressOneLiner(
  result: StressCorrelationResult | null,
): string | null {
  if (!result || !result.hasEnoughData) return null

  if (result.isSignificant && result.direction === 'positive') {
    return `On your high-stress weeks, this patch has been ${result.percentFasterInHighStress}% more active than on calmer weeks. Based on ${result.pairedWeeks} weeks of paired data.`
  }

  return `No clear stress pattern detected yet for this patch. ${result.pairedWeeks} weeks of data so far.`
}

// ─── Section 5 — Scan quality tips ───────────────────────────────────────────

export function getScanQualityTips(confidence: number): string[] {
  if (confidence >= 0.75) return []
  return [
    'Make sure the patch fills at least a quarter of the frame',
    'Scan in natural daylight near a window',
    'Avoid shadows crossing the patch',
    'Hold the camera steady and tap to focus before capturing',
    'Make sure healthy skin is visible around the patch edges',
  ]
}
