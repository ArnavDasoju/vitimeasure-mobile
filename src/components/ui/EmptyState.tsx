/**
 * EmptyState — designed empty screens
 *
 * Rule: every empty state must have a CTA. Never show text alone.
 * The illustration (emoji here) gives personality without assets.
 */

import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, spacing, typography } from '../../theme'
import { Button } from './Button'

type Props = {
  title: string
  subtitle?: string
  cta?: {
    label: string
    onPress: () => void
    variant?: 'filled' | 'outlined'
  }
  style?: ViewStyle
}

export function EmptyState({
  title,
  subtitle,
  cta,
  style,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {cta && (
        <Button
          label={cta.label}
          onPress={cta.onPress}
          variant={cta.variant ?? 'filled'}
          size="md"
          fullWidth={false}
          style={styles.btn}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing['3xl'],
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
    maxWidth: 280,
  },
  btn: {
    paddingHorizontal: 32,
  },
})
