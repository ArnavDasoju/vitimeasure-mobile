/**
 * Skeleton — animated loading placeholder
 *
 * Shimmer effect from left to right using Reanimated interpolation.
 * Match skeleton dimensions to actual content for zero layout shift.
 *
 * Usage: replace content with skeletons while fetching, then cross-fade in.
 */

import React, { useEffect } from 'react'
import { StyleSheet, ViewStyle } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { colors, radii, spacing } from '../../theme'

type Props = {
  width: number | `${number}%`
  height: number
  radius?: number
  style?: ViewStyle
}

export function Skeleton({ width, height, radius = radii.sm, style }: Props) {
  const shimmer = useSharedValue(0)

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    )
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      shimmer.value,
      [0, 1],
      [colors.bgSubtle, colors.bgElevated], // light blue-gray shimmer
    ),
  }))

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius },
        animStyle,
        style,
      ]}
    />
  )
}

// Convenience: a full card skeleton matching PatchCard dimensions
export function PatchCardSkeleton() {
  return (
    <Animated.View style={skeletonStyles.card}>
      <Skeleton width="60%" height={18} radius={radii.xs} style={{ marginBottom: 8 }} />
      <Skeleton width="40%" height={13} radius={radii.xs} style={{ marginBottom: 20 }} />
      <Skeleton width="35%" height={36} radius={radii.sm} style={{ marginBottom: 4 }} />
      <Skeleton width="25%" height={12} radius={radii.xs} />
    </Animated.View>
  )
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
})
