/**
 * VITImeasure Shadow System
 *
 * Modern, diffused shadows for a floating, layered feel.
 * Softer and more spread than typical — inspired by Apple Health cards.
 */

import { Platform, ViewStyle } from 'react-native'

function shadow(
  color: string,
  yOffset: number,
  opacity: number,
  radius: number,
  elevation: number,
): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: yOffset },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: yOffset },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
  })!
}

export const shadows = {
  // No shadow
  none: {} as ViewStyle,

  // Barely-there — badges, pills
  xs: shadow('#000000', 1, 0.03, 4, 1),

  // Standard card — soft and diffused
  card: shadow('#000000', 2, 0.04, 20, 3),

  // Feature card — slightly more presence
  md: shadow('#000000', 4, 0.06, 28, 6),

  // Elevated — modals, floating buttons
  lg: shadow('#000000', 12, 0.10, 40, 12),

  // Indigo-tinted shadow for primary action buttons
  primaryBtn: shadow('#4F46E5', 4, 0.30, 16, 6),

  // Teal-tinted shadow for secondary metric cards
  tealBtn: shadow('#0891B2', 3, 0.20, 12, 4),

  // Success glow
  successGlow: shadow('#059669', 3, 0.16, 12, 3),
} as const
