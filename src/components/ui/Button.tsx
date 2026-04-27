/**
 * Button — primary interactive element
 *
 * 4 variants: filled (gradient), outlined (secondary), ghost (tertiary), danger
 * 3 sizes: sm, md, lg
 *
 * Filled variant uses a LinearGradient background for a premium feel.
 * All variants use Reanimated spring press and haptic feedback.
 */

import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { colors, gradients, radii, shadows, typography } from '../../theme'

type Variant = 'filled' | 'outlined' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

type Props = {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  icon?: React.ReactNode     // rendered before label
  iconAfter?: React.ReactNode // rendered after label
  style?: ViewStyle
  textStyle?: TextStyle
  fullWidth?: boolean
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function Button({
  label,
  onPress,
  variant = 'filled',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconAfter,
  style,
  textStyle,
  fullWidth = true,
}: Props) {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 })
    if (variant === 'filled') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }
  }
  const handlePressOut = () => {
    scale.value = withSpring(1.0, { damping: 15, stiffness: 400 })
  }

  // ─── Variant styles ─────────────────────────────────────────────
  const containerVariant: ViewStyle = {
    filled: {
      backgroundColor: disabled ? colors.textDisabled : 'transparent',
      borderWidth: 0,
      ...(!disabled ? shadows.primaryBtn : {}),
    },
    outlined: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: disabled ? colors.textDisabled : colors.primary,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    danger: {
      backgroundColor: disabled ? colors.textDisabled : colors.dangerSubtle,
      borderWidth: 1.5,
      borderColor: colors.dangerBorder,
    },
  }[variant]

  const labelVariant: TextStyle = {
    filled: { color: colors.textOnPrimary },
    outlined: { color: disabled ? colors.textDisabled : colors.primary },
    ghost: { color: disabled ? colors.textDisabled : colors.primary },
    danger: { color: colors.danger },
  }[variant]

  // ─── Size styles ─────────────────────────────────────────────────
  const containerSize: ViewStyle = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radii.sm },
    md: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: radii.md },
    lg: { paddingVertical: 17, paddingHorizontal: 28, borderRadius: radii.lg },
  }[size]

  const labelSize: TextStyle = {
    sm: { ...typography.caption, fontWeight: '600' as const },
    md: { ...typography.bodyMedium, fontWeight: '600' as const },
    lg: { ...typography.bodyLg, fontWeight: '700' as const },
  }[size]

  const content = loading ? (
    <ActivityIndicator
      color={variant === 'filled' ? colors.textOnPrimary : colors.primary}
      size="small"
    />
  ) : (
    <>
      {icon}
      <Text style={[styles.label, labelVariant, labelSize, textStyle]}>
        {label}
      </Text>
      {iconAfter}
    </>
  )

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        styles.base,
        containerVariant,
        containerSize,
        fullWidth && styles.fullWidth,
        animatedStyle,
        style,
      ]}
    >
      {variant === 'filled' && !disabled ? (
        <LinearGradient
          colors={[...gradients.primaryHero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: containerSize.borderRadius ?? radii.md }]}
        />
      ) : null}
      {content}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44, // Apple HIG minimum tap target
    overflow: 'hidden',
  },
  fullWidth: { width: '100%' },
  label: { textAlign: 'center' },
})
