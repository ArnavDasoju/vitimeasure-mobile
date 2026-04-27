/**
 * VitiligoResults
 *
 * Displays the full analysis result from the vitiligo analyzer.
 * All metric numbers animate from 0 → final value on mount (900 ms).
 * Progress bar uses a gradient fill for a premium feel.
 */

import React, { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, gradients, layout, radii, spacing, typography } from '../theme'
import { formatDate } from '../lib/format'

const { width: SCREEN_W } = Dimensions.get('window')
const IMG_W = SCREEN_W - layout.screenPadding * 2

type Props = {
  percentage: number
  healthyPct: number
  patchCount: number
  skinTone: string
  ratio: string
  annotatedImage?: string
  scanDate: string
}

// ─── Animated number — counts up from 0 to value on mount ────────────────────

function AnimatedNumber({
  value,
  decimals = 1,
  suffix = '',
  style,
}: {
  value: number
  decimals?: number
  suffix?: string
  style?: object
}) {
  const anim = useRef(new Animated.Value(0)).current
  const [display, setDisplay] = React.useState('0')

  useEffect(() => {
    const listener = anim.addListener(({ value: v }) => {
      setDisplay(v.toFixed(decimals) + suffix)
    })
    Animated.timing(anim, {
      toValue: value,
      duration: 900,
      useNativeDriver: false,
    }).start()
    return () => anim.removeListener(listener)
  }, [value])

  return <Text style={style}>{display}</Text>
}

// ─── Progress bar — gradient fill that animates over 1.2 s ──────────────────

function ProgressBar({ vitPct }: { vitPct: number }) {
  const vitWidth = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(vitWidth, {
      toValue: vitPct,
      duration: 1200,
      useNativeDriver: false,
    }).start()
  }, [vitPct])

  const barW = IMG_W - spacing.xl * 2

  return (
    <View>
      <View style={styles.barTrack}>
        {/* Vitiligo (gradient teal) segment */}
        <Animated.View
          style={[
            styles.barFillVit,
            {
              width: vitWidth.interpolate({
                inputRange: [0, 100],
                outputRange: [0, barW],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={[...gradients.tealBar]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {/* Healthy (success gradient) fills remainder */}
        <View style={styles.barFillHealthy}>
          <LinearGradient
            colors={[...gradients.successBar]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
          />
        </View>
      </View>
      <Text style={styles.barLabel}>{vitPct.toFixed(1)}% vitiligo detected</Text>
      <View style={styles.barLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.teal }]} />
          <Text style={styles.legendText}>Vitiligo {vitPct.toFixed(1)}%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>Healthy {(100 - vitPct).toFixed(1)}%</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Metric tile — renders an animated number or static string ────────────────

function MetricTile({
  label,
  value,
  numericValue,
  decimals = 1,
  suffix = '',
  color,
}: {
  label: string
  value?: string
  numericValue?: number
  decimals?: number
  suffix?: string
  color?: string
}) {
  const valueStyle = [styles.tileValue, color ? { color } : {}]
  return (
    <View style={styles.tile}>
      {numericValue !== undefined ? (
        <AnimatedNumber
          value={numericValue}
          decimals={decimals}
          suffix={suffix}
          style={valueStyle}
        />
      ) : (
        <Text style={valueStyle}>{value}</Text>
      )}
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VitiligoResults({
  percentage,
  healthyPct,
  patchCount,
  skinTone,
  ratio,
  annotatedImage,
  scanDate,
}: Props) {
  const containerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(containerAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [])

  // Severity derived from percentage
  const severity =
    percentage === 0 ? 'None detected'
    : percentage < 5  ? 'Mild'
    : percentage < 15 ? 'Moderate'
    : percentage < 30 ? 'Significant'
    : 'Extensive'

  // Vitiligo type classification derived from patch count
  const vitiligoType =
    patchCount === 0 ? 'None'
    : patchCount === 1 ? 'Focal'
    : patchCount <= 3 ? 'Multifocal'
    : 'Generalized'

  const imageUri = annotatedImage
    ? `data:image/jpeg;base64,${annotatedImage}`
    : null

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerAnim,
          transform: [
            {
              translateY: containerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* ── Annotated image ─────────────────────────────────────────── */}
      {imageUri && (
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
          />
          {patchCount > 0 && (
            <View style={styles.patchBadge}>
              <LinearGradient
                colors={[...gradients.tealBar]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFill, { borderRadius: radii.full }]}
              />
              <Text style={styles.patchBadgeText}>
                {patchCount} patch{patchCount !== 1 ? 'es' : ''} detected
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Stats panel ─────────────────────────────────────────────── */}
      <View style={styles.statsPanel}>

        {/* Progress bar */}
        <ProgressBar vitPct={percentage} />

        <View style={styles.divider} />

        {/* 2×2 metric grid — numbers animate on mount */}
        <View style={styles.grid}>
          <MetricTile
            label="Vitiligo"
            numericValue={percentage}
            decimals={1}
            suffix="%"
            color={colors.teal}
          />
          <View style={styles.gridDividerV} />
          <MetricTile
            label="Healthy"
            numericValue={healthyPct}
            decimals={1}
            suffix="%"
            color={colors.success}
          />
          <View style={styles.gridDividerH} />
          <MetricTile
            label="Ratio"
            value={ratio}
            color={colors.textPrimary}
          />
          <View style={styles.gridDividerV} />
          <MetricTile
            label="Patches"
            numericValue={patchCount}
            decimals={0}
            color={colors.primary}
          />
        </View>

        <View style={styles.divider} />

        {/* Skin tone row */}
        <View style={styles.skinToneRow}>
          <LinearGradient
            colors={[...gradients.primaryHero]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.skinToneDot}
          />
          <Text style={styles.skinToneText}>Fitzpatrick {skinTone}</Text>
        </View>

        <View style={styles.divider} />

        {/* 3-chip row: type | severity | date */}
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Type</Text>
            <Text style={styles.chipValue} numberOfLines={1}>{vitiligoType}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Severity</Text>
            <Text style={styles.chipValue} numberOfLines={1}>{severity}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Scanned</Text>
            <Text style={styles.chipValue} numberOfLines={1}>{formatDate(scanDate)}</Text>
          </View>
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Estimated measurements for personal tracking only. Not a medical diagnosis.
          Consult a dermatologist for clinical assessment.
        </Text>
      </View>
    </Animated.View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BAR_H = 12

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },

  // ── Image ──────────────────────────────────────────────────────────
  imageWrap: {
    width: IMG_W,
    height: IMG_W * 0.72,
    backgroundColor: colors.bgSubtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  patchBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  patchBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Stats panel ────────────────────────────────────────────────────
  statsPanel: {
    padding: spacing.xl,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },

  // ── Progress bar ───────────────────────────────────────────────────
  barTrack: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: colors.successSubtle,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  barFillVit: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    overflow: 'hidden',
  },
  barFillHealthy: {
    flex: 1,
    height: BAR_H,
    overflow: 'hidden',
  },
  barLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  barLegend: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // ── 2×2 metric grid ────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridDividerV: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    alignSelf: 'stretch',
  },
  gridDividerH: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    minWidth: '40%',
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  tileLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 10,
  },

  // ── Skin tone row ──────────────────────────────────────────────────
  skinToneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skinToneDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  skinToneText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },

  // ── 3-chip row ─────────────────────────────────────────────────────
  chips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  chipValue: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 12,
  },

  // ── Disclaimer ─────────────────────────────────────────────────────
  disclaimer: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 16,
  },
})
