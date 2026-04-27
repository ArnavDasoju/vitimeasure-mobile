/**
 * AppHeader — consistent navigation header across all screens
 *
 * Used on every drill-down screen (Patch Detail, Results, Report).
 * Tab screens use a custom in-scroll header instead.
 *
 * Layout: [back button] [title centered] [optional right action]
 * Height: 56px + status bar (handled by SafeAreaView above)
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, layout, spacing, typography } from '../../theme'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type Props = {
  title: string
  subtitle?: string
  onBack?: () => void
  rightAction?: React.ReactNode
}

function BackButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.88, { damping: 15 }) }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }) }}
      style={[styles.backBtn, animStyle]}
      hitSlop={12}
    >
      {/* Chevron using unicode — no icon library required */}
      <Text style={styles.backIcon}>‹</Text>
    </AnimatedPressable>
  )
}

export function AppHeader({ title, subtitle, onBack, rightAction }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* Left: back button or spacer */}
        <View style={styles.side}>
          {onBack && <BackButton onPress={onBack} />}
        </View>

        {/* Center: title */}
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>

        {/* Right: optional action or spacer */}
        <View style={[styles.side, styles.sideRight]}>
          {rightAction}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  side: {
    width: 60,
    alignItems: 'flex-start',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.navTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.micro,
    color: colors.primary,
    marginTop: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: '300',
    lineHeight: 26,
    marginTop: -1,
  },
})
