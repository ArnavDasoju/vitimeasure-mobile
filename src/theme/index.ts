/**
 * VITImeasure Theme — central export
 * Import from here, never from individual files directly.
 *
 * Usage:
 *   import { colors, typography, spacing, shadows, layout, radii } from '@/theme'
 */

export { colors, gradients } from './colors'
export { typography } from './typography'
export { spacing, layout } from './spacing'
export { shadows } from './shadows'

/**
 * Border radius scale
 * Rule: radius scales with element size.
 * Small elements → small radius. Large elements → large radius.
 */
export const radii = {
  xs:   6,   // chips, inline tags
  sm:   10,  // small buttons, inner sections
  md:   14,  // inputs, small cards, action chips
  lg:   20,  // standard cards
  xl:   24,  // feature cards (main content)
  '2xl': 28, // bottom sheets, modals
  full: 999, // pill buttons, circular elements
} as const
