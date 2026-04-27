/**
 * Card — the foundational container component
 *
 * Modern healthcare aesthetic: borderless default cards floating on soft shadows.
 * Hero cards get a refined gradient accent.
 */

import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { colors, gradients, radii, shadows, spacing } from '../../theme'

type Level = 'default' | 'subtle' | 'flat' | 'danger' | 'hero'

type BaseProps = {
  children: React.ReactNode
  level?: Level
  radius?: number
  padding?: number
  style?: ViewStyle
}

type StaticProps = BaseProps & { onPress?: undefined }
type PressableProps = BaseProps & {
  onPress: () => void
  activeScale?: number
}

type Props = StaticProps | PressableProps

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function Card({ children, level = 'default', radius, padding, style, ...rest }: Props) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const r = radius ?? radii.xl
  const p = padding ?? spacing.xl

  const levelStyle: ViewStyle = {
    default: {
      backgroundColor: colors.bgCard,
      borderWidth: 0,
      ...shadows.card,
    },
    subtle: {
      backgroundColor: colors.bgSubtle,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    flat: {
      backgroundColor: colors.bgSubtle,
      borderWidth: 0,
    },
    danger: {
      backgroundColor: colors.dangerSubtle,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    hero: {
      backgroundColor: colors.bgCard,
      borderWidth: 0,
      ...shadows.md,
    },
  }[level]

  const containerStyle: ViewStyle[] = [
    styles.base,
    { borderRadius: r, padding: p },
    levelStyle,
    style ?? {},
  ]

  // Hero cards get a subtle gradient overlay
  const inner = level === 'hero' ? (
    <>
      <LinearGradient
        colors={[...gradients.primarySoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      {children}
    </>
  ) : children

  // Pressable variant
  if ('onPress' in rest && rest.onPress) {
    const { onPress, activeScale = 0.98 } = rest as PressableProps
    const handlePressIn = () => {
      scale.value = withSpring(activeScale, { damping: 18, stiffness: 400 })
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }
    const handlePressOut = () => {
      scale.value = withSpring(1, { damping: 18, stiffness: 400 })
    }

    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[...containerStyle, animatedStyle]}
      >
        {inner}
      </AnimatedPressable>
    )
  }

  return <View style={containerStyle}>{inner}</View>
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
})
