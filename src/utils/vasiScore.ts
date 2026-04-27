/**
 * VASI Score Utilities
 *
 * VASI (Vitiligo Area Scoring Index) is the clinical standard for measuring
 * vitiligo severity. Each body region has a clinically validated surface area
 * weight. VASI contribution = weight × affectedDecimal × 100.
 */

// ─── Body region weights ──────────────────────────────────────────────────────

export const VASI_WEIGHTS: Record<string, number> = {
  // Head and neck
  'Face':            0.05,
  'Head':            0.05,
  'Neck':            0.05,
  'Scalp':           0.05,
  // Upper limbs
  'Right Hand':      0.025,
  'Left Hand':       0.025,
  'Right Arm':       0.075,
  'Left Arm':        0.075,
  'Right Forearm':   0.04,
  'Left Forearm':    0.04,
  'Right Upper Arm': 0.035,
  'Left Upper Arm':  0.035,
  // Trunk
  'Chest':           0.09,
  'Abdomen':         0.09,
  'Back':            0.09,
  'Upper Back':      0.045,
  'Lower Back':      0.045,
  // Lower limbs
  'Right Leg':       0.175,
  'Left Leg':        0.175,
  'Right Thigh':     0.1,
  'Left Thigh':      0.1,
  'Right Knee':      0.025,
  'Left Knee':       0.025,
  'Right Calf':      0.05,
  'Left Calf':       0.05,
  'Right Foot':      0.035,
  'Left Foot':       0.035,
  // Genitalia
  'Genitalia':       0.01,
}

// ─── Weight lookup ────────────────────────────────────────────────────────────

export function getVASIWeight(bodyArea: string): number {
  // 1. Exact match
  if (VASI_WEIGHTS[bodyArea] !== undefined) return VASI_WEIGHTS[bodyArea]

  // 2. Case-insensitive exact match
  const lower = bodyArea.toLowerCase()
  const keys = Object.keys(VASI_WEIGHTS)
  const ciKey = keys.find((k) => k.toLowerCase() === lower)
  if (ciKey) return VASI_WEIGHTS[ciKey]

  // 3. Partial match — key contained in bodyArea OR bodyArea contained in key
  const partialKey = keys.find(
    (k) => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower),
  )
  if (partialKey) return VASI_WEIGHTS[partialKey]

  console.warn(`VASI: No weight found for body area '${bodyArea}', using default 0.05`)
  return 0.05
}

// ─── VASI for a single patch ──────────────────────────────────────────────────

export function computeVASI(
  bodyArea: string,
  affectedPercent: number | null | undefined,
): number {
  if (affectedPercent === null || affectedPercent === undefined) return 0
  if (affectedPercent === 0) return 0

  // Normalise: values > 1 are already 0-100 scale; divide to get decimal
  const decimal = affectedPercent > 1 ? affectedPercent / 100 : affectedPercent
  const weight = getVASIWeight(bodyArea)
  return Math.round(weight * decimal * 100 * 100) / 100
}

// ─── Total VASI across multiple patches ───────────────────────────────────────

export function computeTotalVASI(
  patches: Array<{ bodyArea: string; affectedPercent: number }>,
): number {
  const total = patches.reduce(
    (sum, p) => sum + computeVASI(p.bodyArea, p.affectedPercent),
    0,
  )
  return Math.round(total * 100) / 100
}

// ─── Severity label ───────────────────────────────────────────────────────────

export function getVASISeverity(vasiScore: number): { label: string; color: string } {
  if (vasiScore === 0)   return { label: 'Clear',    color: '#22c55e' }
  if (vasiScore <= 1)    return { label: 'Minimal',  color: '#86efac' }
  if (vasiScore <= 5)    return { label: 'Mild',     color: '#fbbf24' }
  if (vasiScore <= 15)   return { label: 'Moderate', color: '#f97316' }
  return                        { label: 'Severe',   color: '#ef4444' }
}
