/**
 * SectionLabel — uppercase tracking label used above content sections
 *
 * The indigo + uppercase + tracked treatment is what Linear, Raycast,
 * and premium health apps use. It anchors sections without competing with content.
 */

import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, spacing, typography } from '../../theme'

type Props = {
  label: string
  style?: ViewStyle
  action?: React.ReactNode // optional right-aligned action (e.g., "See all" link)
}

export function SectionLabel({ label, style, action }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>{label}</Text>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm + 2, // 10px — just enough breathing room
  },
  text: {
    ...typography.label,
    color: colors.primary,
  },
})
