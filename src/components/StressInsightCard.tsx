/**
 * StressInsightCard
 *
 * Displays the computed Pearson correlation between weekly stress scores and
 * patch activity. Shows a "building" state until 4 weeks of matched data exist.
 *
 * Props:
 *  - checkIns: all WeeklyCheckIn records for this user
 *  - scans: all StoredScan records across all patches
 */

import React, { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  computeStressCorrelation,
  generateCorrelationInsightText,
} from '../utils/correlationEngine'
import { getCheckInsLast8Weeks } from '../utils/weekUtils'
import { Card } from './ui/Card'
import { colors, radii, spacing, typography } from '../theme'
import type { WeeklyCheckIn, StoredScan } from '../lib/storage'

type Props = {
  checkIns: WeeklyCheckIn[]
  scans: StoredScan[]
}

const MIN_PAIRS = 4

export function StressInsightCard({ checkIns, scans }: Props) {
  const result = useMemo(() => {
    try {
      return computeStressCorrelation(checkIns, scans)
    } catch {
      return null
    }
  }, [checkIns, scans])

  const insightText = generateCorrelationInsightText(result)

  // Accent color: amber for positive correlation, teal for negative
  const accentColor =
    result?.isSignificant && result.direction === 'negative'
      ? colors.teal
      : colors.warning

  // ── Not enough data yet ──────────────────────────────────────────────
  if (!result || !result.hasEnoughData) {
    const recent = getCheckInsLast8Weeks(checkIns)
    // Approximate paired weeks: check-ins that have at least one scan nearby
    const pairedSoFar = Math.min(recent.length, MIN_PAIRS - 1)

    return (
      <Card style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Stress insight</Text>
          <View style={styles.buildingBadge}>
            <Text style={styles.buildingBadgeText}>Building</Text>
          </View>
        </View>

        <Text style={styles.bodyText}>{insightText}</Text>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(pairedSoFar / MIN_PAIRS) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {pairedSoFar} of {MIN_PAIRS} weeks needed
          </Text>
        </View>
      </Card>
    )
  }

  // ── No significant pattern ───────────────────────────────────────────
  if (!result.isSignificant) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Stress insight</Text>
        <Text style={[styles.bodyText, styles.bodyTextSpaced]}>{insightText}</Text>
        <Text style={styles.footer}>Based on {result.pairedWeeks} weeks of data</Text>
      </Card>
    )
  }

  // ── Significant correlation ──────────────────────────────────────────
  const rSign = result.r >= 0 ? '+' : ''

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Stress insight</Text>
        <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
      </View>

      <Text style={[styles.insightText, styles.bodyTextSpaced]}>{insightText}</Text>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{result.avgStressLast8Weeks.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Avg stress / 5</Text>
        </View>
        <View style={[styles.statDivider]} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{result.highStressWeeksCount}</Text>
          <Text style={styles.statLabel}>High-stress weeks</Text>
        </View>
        <View style={[styles.statDivider]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: accentColor }]}>
            {rSign}{result.r.toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Correlation</Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footer}>
          Based on {result.pairedWeeks} weeks of matched data
        </Text>
        <Text style={styles.computedLabel}>Computed from your data</Text>
      </View>
    </Card>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  buildingBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  buildingBadgeText: {
    ...typography.micro,
    color: colors.textTertiary,
  },

  bodyText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bodyTextSpaced: {
    marginBottom: spacing.md,
  },
  insightText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // ── Building progress ────────────────────────────────────────────────
  progressRow: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.bgSubtle,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressLabel: {
    ...typography.micro,
    color: colors.textTertiary,
  },

  // ── Stat row ─────────────────────────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    marginBottom: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.divider,
  },

  // ── Footer ───────────────────────────────────────────────────────────
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footer: {
    ...typography.micro,
    color: colors.textTertiary,
  },
  computedLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
})
