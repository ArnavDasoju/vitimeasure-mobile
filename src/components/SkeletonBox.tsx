/**
 * SkeletonBox — animated loading placeholder
 *
 * A simple pulsing gray rectangle used as a content placeholder
 * while data is loading. Uses Reanimated opacity animation.
 *
 * Usage:
 *   <SkeletonBox width={200} height={20} />
 *   <SkeletonBox width="80%" height={14} radius={4} />
 */

import React, { useEffect } from 'react'
import { ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { colors } from '../theme'

type Props = {
  width: number | `${number}%`
  height: number
  radius?: number
  style?: ViewStyle
}

export function SkeletonBox({ width, height, radius = 6, style }: Props) {
  const opacity = useSharedValue(1)

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      false,
    )
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: colors.bgSubtle,
        },
        animStyle,
        style,
      ]}
    />
  )
}
