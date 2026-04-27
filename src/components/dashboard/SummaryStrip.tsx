/**
 * SummaryStrip — 3-column quick-stats row at top of dashboard
 *
 * Shows aggregate stats across all tracked patches.
 * Each column: oversized value (animated) + label (small caps below)
 * Uses gradient-accented hero card for visual weight.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Card } from '../ui/Card'
import { colors, gradients, radii, shadows, spacing, typography } from '../../theme'
import type { TrackedPatch } from '../../types/app'

type Props = {
  patches: TrackedPatch[]
  totalScans: number
}

type StatItemProps = {
  value: string
  label: string
  color?: string
  accentColors?: readonly [string, string]
}

function StatItem({ value, label, color, accentColors }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {accentColors && (
        <LinearGradient
          colors={[...accentColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />
      )}
    </View>
  )
}

export function SummaryStrip({ patches, totalScans }: Props) {
  // Average affected % across all patches
  const avgAffected = patches.length > 0
    ? patches.reduce((sum, p) => sum + p.latestAffectedPercent, 0) / patches.length
    : 0

  // Count improving patches
  const improving = patches.filter((p) => (p.changeFromLast ?? 0) < 0).length

  return (
    <Card level="hero" style={styles.card}>
      <View style={styles.container}>
        <StatItem
          value={patches.length.toString()}
          label="Areas Tracked"
          color={colors.primary}
          accentColors={gradients.primaryHero}
        />
        <View style={styles.divider} />
        <StatItem
          value={`${avgAffected.toFixed(1)}%`}
          label="Avg Affected"
          color={colors.textPrimary}
        />
        <View style={styles.divider} />
        <StatItem
          value={improving > 0 ? `${improving}` : '—'}
          label="Improving"
          color={improving > 0 ? colors.success : colors.textTertiary}
          accentColors={improving > 0 ? gradients.successBar : undefined}
        />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing['2xl'],
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1.2,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  statLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.2,
  },
  accentBar: {
    width: 24,
    height: 3,
    borderRadius: 1.5,
    marginTop: 8,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
})
