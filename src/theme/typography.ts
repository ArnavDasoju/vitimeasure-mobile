/**
 * VITImeasure Typography System
 *
 * Uses system fonts (SF Pro on iOS, Roboto on Android) for native feel.
 * 3-tier hierarchy: display → heading → body → caption → label
 *
 * Rule: maximum 3 font sizes visible on any single screen.
 * Rule: minimum 6px size delta between adjacent hierarchy levels.
 */

import { Platform, TextStyle } from 'react-native'

// System font family — no loading required
const fontFamily = Platform.select({
  ios: {
    regular:   'System',
    medium:    'System',
    semibold:  'System',
    bold:      'System',
    extrabold: 'System',
  },
  android: {
    regular:   'sans-serif',
    medium:    'sans-serif-medium',
    semibold:  'sans-serif-medium',
    bold:      'sans-serif',
    extrabold: 'sans-serif',
  },
  default: {
    regular:   'System',
    medium:    'System',
    semibold:  'System',
    bold:      'System',
    extrabold: 'System',
  },
})!

export const typography = {
  // ─── Display ─────────────────────────────────────────────────────
  // Hero numbers: "12.4%" on result screen
  display: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 52,
    fontFamily: fontFamily.extrabold,
  } as TextStyle,

  // Slightly smaller hero — dashboard metric cards
  displaySm: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.5,
    lineHeight: 40,
    fontFamily: fontFamily.extrabold,
  } as TextStyle,

  // ─── Headings ────────────────────────────────────────────────────
  h1: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 34,
    fontFamily: fontFamily.bold,
  } as TextStyle,

  h2: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 28,
    fontFamily: fontFamily.bold,
  } as TextStyle,

  h3: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 24,
    fontFamily: fontFamily.semibold,
  } as TextStyle,

  // Screen title in headers (nav bar)
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 22,
    fontFamily: fontFamily.semibold,
  } as TextStyle,

  // ─── Body ─────────────────────────────────────────────────────────
  bodyLg: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    fontFamily: fontFamily.regular,
  } as TextStyle,

  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    fontFamily: fontFamily.regular,
  } as TextStyle,

  bodySm: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    fontFamily: fontFamily.regular,
  } as TextStyle,

  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    fontFamily: fontFamily.medium,
  } as TextStyle,

  // ─── Caption & Labels ─────────────────────────────────────────────
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    fontFamily: fontFamily.regular,
  } as TextStyle,

  // Section header labels — always UPPERCASE with tracking
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    lineHeight: 16,
    textTransform: 'uppercase',
    fontFamily: fontFamily.bold,
  } as TextStyle,

  // Small metadata — timestamps, footnotes
  micro: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    lineHeight: 14,
    fontFamily: fontFamily.medium,
  } as TextStyle,

  // Tab bar labels
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    lineHeight: 14,
    fontFamily: fontFamily.semibold,
  } as TextStyle,
} as const
