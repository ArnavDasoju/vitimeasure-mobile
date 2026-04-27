/**
 * Badge — semantic status indicators
 *
 * Used for trend values (▼ 2.1% improving) and status labels.
 *
 * Design rule: always show arrow icon AND value — never just a number.
 * The arrow reads instantly. The number provides precision.
 *
 * Color logic for vitiligo tracking:
 *  DECREASING affected% = IMPROVEMENT = green
 *  INCREASING affected% = SPREADING   = red
 *  ZERO change          = STABLE      = neutral (primary)
 */

import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, radii, typography } from '../../theme'

// ─── Trend Badge (for delta values) ──────────────────────────────────────────

type TrendProps = {
  value: number | null   // delta from previous scan; negative = improving
  label?: string         // e.g. "vs last scan"
  size?: 'sm' | 'md'
  style?: ViewStyle
}

export function TrendBadge({ value, label, size = 'md', style }: TrendProps) {
  if (value === null || value === undefined) return null

  const isImproving = value < 0
  const isStable = value === 0
  const isSpreading = value > 0

  const bg = isImproving ? colors.successSubtle
    : isSpreading ? colors.dangerSubtle
    : colors.primarySubtle

  const border = isImproving ? colors.successBorder
    : isSpreading ? colors.dangerBorder
    : colors.primaryBorder

  const textColor = isImproving ? colors.success
    : isSpreading ? colors.danger
    : colors.primary

  const icon = isImproving ? '↓' : isSpreading ? '↑' : '→'
  const fontSize = size === 'sm' ? 11 : 13

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }, style]}>
      <Text style={[styles.text, { color: textColor, fontSize }]}>
        {icon} {Math.abs(value).toFixed(1)}%{label ? ` ${label}` : ''}
      </Text>
    </View>
  )
}

// ─── Status Badge (for labels: "Improving", "Stable") ────────────────────────

type StatusProps = {
  label: string
  color?: 'success' | 'danger' | 'warning' | 'primary' | 'neutral'
  style?: ViewStyle
}

export function StatusBadge({ label, color = 'primary', style }: StatusProps) {
  const config = {
    success: { bg: colors.successSubtle, border: colors.successBorder, text: colors.success },
    danger:  { bg: colors.dangerSubtle,  border: colors.dangerBorder,  text: colors.danger },
    warning: { bg: colors.warningSubtle, border: colors.warningBorder, text: colors.warning },
    primary: { bg: colors.primarySubtle, border: colors.primaryBorder, text: colors.primary },
    neutral: { bg: 'rgba(15,23,42,0.05)', border: 'rgba(15,23,42,0.12)', text: colors.textSecondary },
  }[color]

  return (
    <View style={[styles.pill, { backgroundColor: config.bg, borderColor: config.border }, style]}>
      <Text style={[styles.text, { color: config.text, fontSize: 11 }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.1,
  },
})
