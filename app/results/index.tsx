/**
 * Analysis Results Screen
 *
 * Shown after a successful scan. Receives result data via router params.
 *
 * Layout:
 *   ┌─ AppHeader (back + "Scan Results" + date)
 *   ├─ Annotated image with Skia bounding boxes
 *   ├─ Metrics card: large affected %, clear %, skin tone dot, VASI score row
 *   ├─ Change card (if prior scan exists): trend value + interpretation
 *   ├─ Disclaimer (amber warning)
 *   └─ Actions: Generate Report / View History / Scan Again
 *
 * XAI: A single small "i" button sits inline with the "VASI Score" label.
 * Tapping it opens XAIExplanationSheet — the only place explanations live.
 * The default view is completely unchanged from before, except for that one button.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Canvas, Image as SkiaImage, useImage, Rect } from '@shopify/react-native-skia'
import {
  Animated as RNAnimated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'
import { useAppStore } from '../../src/store/appStore'
import { addScanToPatch, getPatch } from '../../src/lib/storage'
import { syncToCloud } from '../../src/services/cloudSync'
import { computeVASI, getVASISeverity } from '../../src/utils/vasiScore'
import { computeRepigmentationVelocity } from '../../src/utils/repigmentationVelocity'
import { getBestStressCorrelation } from '../../src/utils/correlationEngine'
import { AppHeader } from '../../src/components/ui/AppHeader'
import { Card } from '../../src/components/ui/Card'
import { TrendBadge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { SectionLabel } from '../../src/components/ui/SectionLabel'
import { VitiligoResults } from '../../src/components/VitiligoResults'
import { XAIExplanationSheet } from '../../src/components/XAIExplanationSheet'
import { colors, layout, radii, spacing, typography } from '../../src/theme'
import { formatDate } from '../../src/lib/format'
import type { AnalyzeResult } from '../../src/types/app'
import type { StoredScan } from '../../src/lib/storage'
import type { RepigmentationVelocityResult } from '../../src/utils/repigmentationVelocity'
import type { StressCorrelationResult } from '../../src/utils/correlationEngine'

const { width: SCREEN_W } = Dimensions.get('window')
const IMG_W = SCREEN_W - layout.screenPadding * 2
const IMG_H = IMG_W * 0.75

const XAI_TOOLTIP_KEY = 'has_seen_xai_tooltip'

// ─── Derive detection confidence from available scan signals ──────────────────
// Used when the backend has not returned a detectionConfidence value.

function deriveDetectionConfidence(result: AnalyzeResult): number {
  if (result.detectionConfidence !== undefined) return result.detectionConfidence
  const count = result.patchCount ?? result.boundingBoxes.length
  if (count >= 2) return 0.88
  if (count === 1) return 0.78
  if (result.affectedPercent > 0) return 0.55
  return 0.45
}

// ─── Error state ──────────────────────────────────────────────────────────────

function NoResult({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.noResultWrap}>
      <Text style={styles.noResultTitle}>No result data</Text>
      <Text style={styles.noResultSub}>Something went wrong. Please scan again.</Text>
      <Button label="Go back" onPress={onBack} variant="outlined" style={{ marginTop: spacing.xl }} />
    </View>
  )
}

// ─── Annotated image ──────────────────────────────────────────────────────────

function AnnotatedImage({ imageUrl, boundingBoxes: rawBoxes }: Pick<AnalyzeResult, 'imageUrl' | 'boundingBoxes'>) {
  const boundingBoxes = rawBoxes ?? []
  const skiaImage = useImage(imageUrl)

  return (
    <View style={styles.canvasWrapper}>
      <Canvas style={{ width: IMG_W, height: IMG_H }}>
        {skiaImage && (
          <SkiaImage
            image={skiaImage}
            x={0} y={0}
            width={IMG_W}
            height={IMG_H}
            fit="cover"
          />
        )}
        {boundingBoxes.map((bb, i) => (
          <Rect
            key={i}
            x={bb.left * IMG_W}
            y={bb.top * IMG_H}
            width={bb.width * IMG_W}
            height={bb.height * IMG_H}
            style="stroke"
            color={colors.primary}
            strokeWidth={2.5}
          />
        ))}
      </Canvas>

      {/* Patch count badge */}
      {boundingBoxes.length > 0 && (
        <View style={styles.patchBadge}>
          <Text style={styles.patchBadgeText}>
            {boundingBoxes.length} patch{boundingBoxes.length !== 1 ? 'es' : ''} detected
          </Text>
        </View>
      )}

      {/* Empty image fallback */}
      {!skiaImage && (
        <View style={styles.imageFallback}>
          <Text style={styles.imageFallbackText}>Loading image…</Text>
        </View>
      )}
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const { data: raw, localImagePath: rawLocalPath } = useLocalSearchParams<{ data: string; localImagePath: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userEmail, userId, setIsSyncing } = useAppStore()

  let result: AnalyzeResult | null = null
  try {
    result = raw ? JSON.parse(raw) : null
  } catch {
    // Malformed params — handled by NoResult fallback below
  }
  const localImagePath = rawLocalPath || undefined

  // Compute VASI for this scan
  const vasiScore = result
    ? computeVASI(result.bodyLocation, result.affectedPercent)
    : 0
  const vasiSeverity = getVASISeverity(vasiScore)

  // Derive detection confidence from available signals
  const detectionConfidence = result ? deriveDetectionConfidence(result) : 0.78

  // ── XAI state ─────────────────────────────────────────────────────────────
  const [showXAI, setShowXAI] = useState(false)
  const [patchScans, setPatchScans] = useState<StoredScan[]>([])
  const [velocityResult, setVelocityResult] = useState<RepigmentationVelocityResult | null>(null)
  const [correlationResult, setCorrelationResult] = useState<StressCorrelationResult | null>(null)

  // ── Tooltip state ─────────────────────────────────────────────────────────
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const tooltipAnim = useRef(new RNAnimated.Value(0)).current
  const xaiButtonRef = useRef<View>(null)

  // Persist the scan result exactly once on mount, then load patch data for XAI
  const persistedRef = useRef(false)
  useEffect(() => {
    if (!result || !userEmail || persistedRef.current) return
    persistedRef.current = true

    addScanToPatch(userEmail, result.bodyLocation, {
      id: result.id,
      date: result.scanDate,
      affectedPercent: result.affectedPercent,
      unaffectedPercent: result.unaffectedPercent,
      imageUrl: result.imageUrl,
      localImagePath,
      boundingBoxes: result.boundingBoxes,
      dominantColor: result.dominantColor,
      accentColor: result.accentColor,
      vasiScore,
      patchCount: result.patchCount,
      skinTone: result.skinTone,
      ratio: result.ratio,
      annotatedImage: result.annotatedImage,
      detectionConfidence,
    }).then(async () => {
      // Background sync — do not block the UI
      setIsSyncing(true)
      syncToCloud(userEmail!, userId!).finally(() => setIsSyncing(false))

      // Load patch scan history for XAI trend and stress sections
      try {
        const patch = await getPatch(userEmail!, result.bodyLocation)
        if (patch) {
          const scans = patch.scans
          setPatchScans(scans)
          setVelocityResult(computeRepigmentationVelocity(scans))
          const corr = await getBestStressCorrelation(userEmail!, scans)
          setCorrelationResult(corr)
        }
      } catch {
        // XAI trend/stress sections will simply not render — no crash
      }

      // Show first-scan tooltip once ever
      try {
        const seen = await SecureStore.getItemAsync(XAI_TOOLTIP_KEY)
        if (!seen) {
          await SecureStore.setItemAsync(XAI_TOOLTIP_KEY, '1')
          setTimeout(() => {
            xaiButtonRef.current?.measureInWindow((x, y, w) => {
              setTooltipPos({ x: x + w / 2, y })
              setShowTooltip(true)
            })
          }, 1500)
        }
      } catch {
        // SecureStore unavailable — skip tooltip
      }
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Animate tooltip in/out and auto-dismiss after 4 s
  useEffect(() => {
    if (!showTooltip) return
    RNAnimated.timing(tooltipAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
    const t = setTimeout(dismissTooltip, 4000)
    return () => clearTimeout(t)
  }, [showTooltip])  // eslint-disable-line react-hooks/exhaustive-deps

  function dismissTooltip() {
    RNAnimated.timing(tooltipAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setShowTooltip(false))
  }

  if (!result) {
    return (
      <View style={styles.screen}>
        <AppHeader title="Scan Results" onBack={() => router.back()} />
        <NoResult onBack={() => router.back()} />
      </View>
    )
  }

  const change = result.changeFromPrevious ?? null

  const changeInterpretation =
    change === null ? null
    : change < 0 ? 'Improvement — patch area is shrinking'
    : change > 0 ? 'Slight increase — monitor closely'
    : 'No measurable change since last scan'

  // Tooltip left position: center the 240px bubble on the button
  const tooltipLeft = Math.max(8, Math.min(tooltipPos.x - 120, SCREEN_W - 248))

  return (
    <View style={styles.screen}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <AppHeader
        title="Scan Results"
        subtitle={formatDate(result.scanDate)}
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Analysis Results ──────────────────────────────────── */}
        {result.annotatedImage ? (
          <Animated.View entering={FadeIn.duration(350)}>
            <SectionLabel label={result.bodyLocation} style={styles.sectionLabel} />
            <VitiligoResults
              percentage={result.affectedPercent}
              healthyPct={result.unaffectedPercent}
              patchCount={result.patchCount ?? result.boundingBoxes.length}
              skinTone={result.skinTone ?? result.dominantColor ?? 'Unknown'}
              ratio={result.ratio ?? '—'}
              annotatedImage={result.annotatedImage}
              scanDate={result.scanDate}
            />
          </Animated.View>
        ) : (
          <>
            {/* ── Fallback: Skia annotated image (no Python data) ── */}
            <Animated.View entering={FadeIn.duration(350)}>
              <SectionLabel label={result.bodyLocation} style={styles.sectionLabel} />
              <AnnotatedImage
                imageUrl={result.imageUrl}
                boundingBoxes={result.boundingBoxes}
              />
            </Animated.View>
          </>
        )}

        {/* ── Metrics Card ────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(350).springify()}>
          <SectionLabel label="Measurements" style={styles.sectionLabel} />
          <Card>
            {/* Affected % — hero metric */}
            <View style={styles.heroRow}>
              <View style={styles.heroMain}>
                <Text style={styles.heroValue}>
                  {result.affectedPercent.toFixed(1)}
                  <Text style={styles.heroUnit}>%</Text>
                </Text>
                <Text style={styles.heroLabel}>AFFECTED SKIN</Text>
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroSide}>
                <Text style={styles.heroSideValue}>
                  {result.unaffectedPercent.toFixed(1)}%
                </Text>
                <Text style={styles.heroSideLabel}>CLEAR SKIN</Text>
              </View>
            </View>

            {/* Trend + skin tone */}
            <View style={styles.heroMeta}>
              <TrendBadge value={change} label="vs last scan" />

              {result.dominantColor && result.dominantColor !== 'Unknown' && (
                <View style={styles.skinToneRow}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: `#${result.accentColor}` },
                    ]}
                  />
                  <Text style={styles.skinToneText}>{result.dominantColor} tone</Text>
                </View>
              )}
            </View>

            {/* VASI score row */}
            <View style={styles.vasiRow}>
              <View style={styles.vasiLeft}>
                <Text style={styles.vasiLabel}>VASI Score</Text>

                {/* ── XAI "i" button — the ONLY new permanent element ── */}
                <View ref={xaiButtonRef} collapsable={false}>
                  <TouchableOpacity
                    onPress={() => setShowXAI(true)}
                    style={styles.xaiInfoButton}
                    accessibilityLabel="Why is this score here?"
                    hitSlop={8}
                  >
                    <Text style={styles.xaiInfoText}>i</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.vasiValue}>
                  {isNaN(vasiScore) ? '0.00' : vasiScore.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.vasiBadge, { backgroundColor: vasiSeverity.color + '22' }]}>
                <Text style={[styles.vasiBadgeText, { color: vasiSeverity.color }]}>
                  {vasiSeverity.label}
                </Text>
              </View>
            </View>

            <Text style={styles.vasiContext}>
              Vitiligo Area Scoring Index — used by dermatologists to measure severity
            </Text>
          </Card>
        </Animated.View>

        {/* ── Change from last ─────────────────────────────────── */}
        {change !== null && (
          <Animated.View entering={FadeInDown.delay(160).duration(350).springify()}>
            <SectionLabel label="Compared to last scan" style={styles.sectionLabel} />
            <Card level={change < 0 ? 'subtle' : change > 0 ? 'danger' : 'default'}>
              <View style={styles.changeRow}>
                <Text
                  style={[
                    styles.changeValue,
                    {
                      color: change < 0 ? colors.success
                        : change > 0 ? colors.danger
                        : colors.warning,
                    },
                  ]}
                >
                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                </Text>
                <Text style={styles.changeInterpretation}>
                  {changeInterpretation}
                </Text>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ── Disclaimer ──────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(220).duration(350)}>
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              These measurements are estimates based on image analysis, not a medical diagnosis.
              Results may vary with lighting and angle. Consult a dermatologist for clinical assessment.
            </Text>
          </View>
        </Animated.View>

        {/* ── Actions ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(280).duration(350)} style={styles.actions}>
          <Button
            label="Generate Report"
            onPress={() => router.push(`/report/${encodeURIComponent(result.bodyLocation)}`)}
            fullWidth
          />
          <Button
            label="View History"
            variant="outlined"
            onPress={() => router.push(`/patch/${encodeURIComponent(result.bodyLocation)}`)}
            fullWidth
            style={{ marginTop: spacing.sm }}
          />
          <TouchableOpacity
            style={styles.scanAgainBtn}
            onPress={() => router.replace(`/scan/${encodeURIComponent(result.bodyLocation)}`)}
          >
            <Text style={styles.scanAgainText}>Scan Again</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* ── First-scan tooltip ───────────────────────────────────── */}
      {showTooltip && (
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissTooltip}>
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.tooltipBubble,
              {
                left: tooltipLeft,
                top: tooltipPos.y - 58,
                opacity: tooltipAnim,
                transform: [
                  {
                    scale: tooltipAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.tooltipText}>
              Tap here to understand what these numbers mean
            </Text>
            {/* Arrow pointing down toward the "i" button */}
            <View style={[styles.tooltipArrow, { left: tooltipPos.x - tooltipLeft - 8 }]} />
          </RNAnimated.View>
        </Pressable>
      )}

      {/* ── XAI Explanation Sheet ────────────────────────────────── */}
      <XAIExplanationSheet
        visible={showXAI}
        bodyLocation={result.bodyLocation}
        affectedPercent={result.affectedPercent}
        vasiScore={vasiScore}
        detectionConfidence={detectionConfidence}
        patchScans={patchScans}
        velocityResult={velocityResult}
        correlationResult={correlationResult}
        onClose={() => setShowXAI(false)}
        onRetake={() => {
          setShowXAI(false)
          router.replace(`/scan/${encodeURIComponent(result.bodyLocation)}`)
        }}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },

  // ── Section labels ────────────────────────────────────────────────────
  sectionLabel: { marginBottom: spacing.md, marginTop: spacing.lg },

  // ── Annotated image ───────────────────────────────────────────────────
  canvasWrapper: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  patchBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  patchBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  imageFallback: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  imageFallbackText: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // ── Metrics card ──────────────────────────────────────────────────────
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroMain: {
    flex: 1.4,
    alignItems: 'center',
  },
  heroValue: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -2,
    lineHeight: 50,
  },
  heroUnit: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primaryLight,
    letterSpacing: -0.5,
  },
  heroLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 4,
  },
  heroDivider: {
    width: 1,
    height: 48,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.sm,
  },
  heroSide: {
    flex: 1,
    alignItems: 'center',
  },
  heroSideValue: {
    ...typography.h2,
    color: colors.success,
  },
  heroSideLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    marginBottom: spacing.md,
  },
  skinToneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skinToneText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // ── VASI row ──────────────────────────────────────────────────────────
  vasiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  vasiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vasiLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  vasiValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  vasiBadge: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  vasiBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  vasiContext: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    lineHeight: 16,
  },

  // ── XAI "i" button ────────────────────────────────────────────────────
  xaiInfoButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xaiInfoText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 14,
    includeFontPadding: false,
  },

  // ── First-scan tooltip ────────────────────────────────────────────────
  tooltipBubble: {
    position: 'absolute',
    width: 240,
    backgroundColor: colors.textPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tooltipText: {
    fontSize: 13,
    color: colors.textOnPrimary,
    lineHeight: 18,
    textAlign: 'center',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.textPrimary,
  },

  // ── Change card ───────────────────────────────────────────────────────
  changeRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  changeValue: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  changeInterpretation: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // ── Disclaimer ────────────────────────────────────────────────────────
  disclaimer: {
    marginTop: spacing.lg,
    backgroundColor: colors.warningSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: spacing.md,
  },
  disclaimerText: {
    ...typography.caption,
    color: colors.warning,
    lineHeight: 18,
  },

  // ── Actions ───────────────────────────────────────────────────────────
  actions: {
    marginTop: spacing.xl,
  },
  scanAgainBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  scanAgainText: {
    ...typography.bodySm,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },

  // ── No result state ───────────────────────────────────────────────────
  noResultWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPadding,
  },
  noResultTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  noResultSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
