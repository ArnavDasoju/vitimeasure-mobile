import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { colors, spacing } from '../../theme'

type Props = {
  style?: ViewStyle
  spacing?: number
}

export function Divider({ style, spacing: s }: Props) {
  return (
    <View
      style={[
        styles.divider,
        s !== undefined && { marginVertical: s },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
})
