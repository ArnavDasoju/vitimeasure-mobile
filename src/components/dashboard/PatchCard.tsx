/**
 * PatchCard — main dashboard list item
 *
 * Visual hierarchy:
 *   Location name: primary text, largest readable weight
 *   Metric: display size, gradient-accented — most visually dominant
 *   Sparkline: subtle background chart
 *   Caption: tertiary, smallest
 *   Trend badge: color-coded improvement indicator
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Card } from '../ui/Card'
import { TrendBadge } from '../ui/Badge'
import { Sparkline } from '../charts/LineChart'
import { colors, layout, radii, spacing, typography } from '../../theme'
import { timeAgo } from '../../lib/format'
import type { TrackedPatch } from '../../types/app'

type Props = TrackedPatch & {
  index: number  // used for stagger delay
}

export function PatchCard({
  bodyLocation,
  latestAffectedPercent,
  latestScanDate,
  totalScans,
  changeFromLast,
  sparklineData,
  index,
}: Props) {
  const router = useRouter()

  // Sparkline color: green if improving, indigo if spreading/neutral
  const isImproving = (changeFromLast ?? 0) < 0
  const sparkColor = isImproving ? colors.success : colors.primary

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(340).springify().damping(22)}>
      <Card
        onPress={() => router.push(`/patch/${encodeURIComponent(bodyLocation)}`)}
        style={styles.card}
      >
        {/* ── Row 1: Name + Trend badge ── */}
        <View style={styles.topRow}>
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, isImproving && styles.locationDotSuccess]} />
            <Text style={styles.location} numberOfLines={1}>{bodyLocation}</Text>
          </View>
          <TrendBadge value={changeFromLast} label="vs last" size="sm" />
        </View>

        {/* ── Row 2: Meta ── */}
        <Text style={styles.meta}>
          {totalScans} scan{totalScans !== 1 ? 's' : ''} · {timeAgo(latestScanDate)}
        </Text>

        {/* ── Row 3: Metric + Sparkline ── */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.metric}>{latestAffectedPercent.toFixed(1)}<Text style={styles.metricUnit}>%</Text></Text>
            <Text style={styles.metricLabel}>AFFECTED</Text>
          </View>

          {sparklineData.length >= 2 && (
            <View style={styles.sparklineWrap}>
              <Sparkline
                data={sparklineData}
                width={96}
                height={40}
                color={sparkColor}
              />
            </View>
          )}
        </View>

        {/* ── Chevron ── */}
        <View style={styles.chevronWrap}>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Card>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md + 2,
    paddingBottom: spacing.lg + 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
    paddingRight: spacing.xl + 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
    gap: spacing.sm + 2,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  locationDotSuccess: {
    backgroundColor: colors.success,
  },
  location: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    ...typography.micro,
    color: colors.textTertiary,
    marginBottom: spacing.lg + 2,
    marginLeft: spacing.lg + spacing.sm + 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingRight: spacing.xl + 4,
  },
  metric: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.8,
    color: colors.primary,
    lineHeight: 40,
  },
  metricUnit: {
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 0,
  },
  metricLabel: {
    ...typography.label,
    color: colors.textTertiary,
    fontSize: 9,
    marginTop: 4,
    letterSpacing: 1.4,
  },
  sparklineWrap: {
    opacity: 0.5,
  },
  chevronWrap: {
    position: 'absolute',
    right: spacing.xl,
    top: '50%',
    marginTop: -11,
  },
  chevron: {
    fontSize: 22,
    color: colors.textDisabled,
    fontWeight: '300',
  },
})
