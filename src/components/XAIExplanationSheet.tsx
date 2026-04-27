/**
 * XAIExplanationSheet
 *
 * A bottom sheet opened by the "i" button on the results screen.
 * Contains all explanations in one scrollable unified view.
 * Nothing here is visible by default — it requires deliberate user action.
 *
 * Sections rendered conditionally:
 *   1. Detection confidence (always)
 *   2. VASI math breakdown (always)
 *   3. Trend explanation (only if 3+ scans)
 *   4. Stress context (only if enough correlation data)
 *   5. Scan quality tips (only if confidence < 0.75)
 *   Footer disclaimer (always)
 */

import React, { useMemo } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  getConfidenceBar,
  getVASIMathBreakdown,
  getTrendOneLiner,
  getStressOneLiner,
  getScanQualityTips,
} from '../utils/aiExplanations'
import type { StoredScan } from '../lib/storage'
import type { RepigmentationVelocityResult } from '../utils/repigmentationVelocity'
import type { StressCorrelationResult } from '../utils/correlationEngine'
import { colors, layout, radii, spacing, typography } from '../theme'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  bodyLocation: string
  affectedPercent: number
  vasiScore: number
  detectionConfidence: number        // 0.0–1.0
  patchScans: StoredScan[]           // all scans for this patch (for trend)
  velocityResult: RepigmentationVelocityResult | null
  correlationResult: StressCorrelationResult | null
  onClose: () => void
  onRetake: () => void               // close sheet + navigate back to camera
}

// ─── Component ────────────────────────────────────────────────────────────────

export function XAIExplanationSheet({
  visible,
  bodyLocation,
  affectedPercent,
  vasiScore,
  detectionConfidence,
  patchScans,
  velocityResult,
  correlationResult,
  onClose,
  onRetake,
}: Props) {
  const insets = useSafeAreaInsets()

  // ── Derive all explanation data ───────────────────────────────────────────

  const confidenceInfo = useMemo(
    () => getConfidenceBar(detectionConfidence),
    [detectionConfidence],
  )

  const vasiBD = useMemo(
    () => getVASIMathBreakdown(bodyLocation, affectedPercent, vasiScore),
    [bodyLocation, affectedPercent, vasiScore],
  )

  const trendText = useMemo(
    () => getTrendOneLiner(patchScans, velocityResult),
    [patchScans, velocityResult],
  )

  const stressText = useMemo(
    () => getStressOneLiner(correlationResult),
    [correlationResult],
  )

  const tips = useMemo(
    () => getScanQualityTips(detectionConfidence),
    [detectionConfidence],
  )

  // Trend direction for section header
  const trendDirection = useMemo((): 'improving' | 'worsening' | 'stable' => {
    if (patchScans.length < 3) return 'stable'
    const sorted = [...patchScans].sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0].affectedPercent
    const last = sorted[sorted.length - 1].affectedPercent
    if (last < first - 0.05) return 'improving'
    if (last > first + 0.05) return 'worsening'
    return 'stable'
  }, [patchScans])

  const showTrend = trendText !== null
  const showStress = stressText !== null
  const showTips = tips.length > 0

  // Confidence bar fill width (clamped 0–120px)
  const barFillWidth = Math.round(120 * Math.min(1, Math.max(0, detectionConfidence)))

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Scrim — tap to dismiss */}
      <Pressable style={styles.scrim} onPress={onClose} />

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing['3xl'] }]}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Sheet title */}
        <Text style={styles.sheetTitle}>Why is this?</Text>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── SECTION 1: Detection confidence ─────────────────────── */}
          <Text style={styles.sectionHeader}>How your patch was detected</Text>

          <View style={styles.confidenceRow}>
            <Text style={styles.confLabel}>Detection confidence</Text>
            <View style={styles.confBarTrack}>
              <View
                style={[
                  styles.confBarFill,
                  { width: barFillWidth, backgroundColor: confidenceInfo.fillColor },
                ]}
              />
            </View>
            <Text style={styles.confPercent}>{confidenceInfo.label}</Text>
          </View>

          <Text style={styles.oneLiner}>{confidenceInfo.oneLiner}</Text>

          {confidenceInfo.showRetake && (
            <TouchableOpacity onPress={onRetake} hitSlop={8}>
              <Text style={styles.retakeLink}>Retake scan</Text>
            </TouchableOpacity>
          )}

          {/* ── SECTION 2: VASI math breakdown ──────────────────────── */}
          <Text style={styles.sectionHeader}>How your VASI score was calculated</Text>

          <View style={styles.mathBox}>
            <View style={styles.mathRow}>
              <Text style={styles.mathLabel}>{bodyLocation} body weight</Text>
              <Text style={styles.mathValue}>{vasiBD.weightPercent}</Text>
            </View>
            <View style={styles.mathRow}>
              <Text style={styles.mathLabel}>× Affected area</Text>
              <Text style={styles.mathValue}>{vasiBD.affectedStr}</Text>
            </View>
            <View style={styles.mathDivider} />
            <View style={styles.mathRow}>
              <Text style={[styles.mathLabel, styles.mathLabelBold]}>= VASI score</Text>
              <Text style={[styles.mathValue, styles.mathValueBold]}>{vasiBD.vasiStr}</Text>
            </View>
          </View>

          <Text style={styles.oneLiner}>{vasiBD.severityOneLiner}</Text>
          <Text style={[styles.oneLiner, { marginTop: spacing.xs }]}>
            {vasiBD.bodyAreaOneLiner}
          </Text>

          {/* ── SECTION 3: Trend (only with 3+ scans) ───────────────── */}
          {showTrend && (
            <>
              <Text style={styles.sectionHeader}>
                {`Why the trend shows ${trendDirection}`}
              </Text>
              <Text style={styles.oneLiner}>{trendText}</Text>
              {velocityResult && (
                <Text style={styles.rSquaredLine}>
                  {`Projection confidence: ${velocityResult.projectionConfidence} (R² = ${velocityResult.rSquared.toFixed(2)})`}
                </Text>
              )}
            </>
          )}

          {/* ── SECTION 4: Stress context ────────────────────────────── */}
          {showStress && (
            <>
              <Text style={styles.sectionHeader}>Your stress pattern and this patch</Text>
              <Text style={styles.oneLiner}>{stressText}</Text>
            </>
          )}

          {/* ── SECTION 5: Scan quality tips (only if confidence < 0.75) */}
          {showTips && (
            <>
              <Text style={styles.sectionHeader}>Tips for a better scan</Text>
              {tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>{'\u2022'}</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── Footer ──────────────────────────────────────────────── */}
          <View style={styles.footerSeparator} />
          <Text style={styles.footerText}>
            VASI scores and measurements are estimates for personal tracking only. Not a medical diagnosis. Consult a dermatologist for clinical assessment.
          </Text>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Modal structure ─────────────────────────────────────────────────────
  scrim: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    maxHeight: '82%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },

  // ── Section headers ─────────────────────────────────────────────────────
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing['2xl'],
    marginBottom: spacing.md,
  },

  // ── One-liner text ──────────────────────────────────────────────────────
  oneLiner: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  // ── Confidence bar ──────────────────────────────────────────────────────
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  confLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  confBarTrack: {
    width: 120,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgSubtle,
    overflow: 'hidden',
  },
  confBarFill: {
    height: 8,
    borderRadius: 4,
  },
  confPercent: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },
  retakeLink: {
    ...typography.caption,
    color: colors.teal,
    marginTop: spacing.sm,
    fontWeight: '500',
  },

  // ── VASI math box ───────────────────────────────────────────────────────
  mathBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  mathLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  mathLabelBold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mathValue: {
    fontSize: 13,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    minWidth: 52,
  },
  mathValueBold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mathDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },

  // ── Trend section ───────────────────────────────────────────────────────
  rSquaredLine: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },

  // ── Scan tips ───────────────────────────────────────────────────────────
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  tipBullet: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  tipText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },

  // ── Footer ──────────────────────────────────────────────────────────────
  footerSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginTop: spacing['2xl'],
    marginBottom: spacing.md,
  },
  footerText: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 16,
    textAlign: 'center',
  },
  closeButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.bgSubtle,
  },
  closeButtonText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
})
