/**
 * VITImeasure Spacing System — strict 8pt grid
 *
 * Only use these values. Never use arbitrary numbers like 7, 11, 13, 18.
 * The eye detects off-grid spacing even without conscious awareness.
 *
 * Card padding is always 20px (not 16px — the extra 4px reads as generous/premium).
 * Screen edge padding is always 16px.
 * Between cards is always 12px.
 */

export const spacing = {
  px:  1,   // hairline
  xs:  4,   // tight inline — icon gap, pip offset
  sm:  8,   // between related elements within a component
  md:  12,  // between sibling components
  lg:  16,  // SCREEN EDGE PADDING — always
  xl:  20,  // CARD INTERNAL PADDING — always
  '2xl': 24, // between cards (major sections)
  '3xl': 32, // section breaks
  '4xl': 48, // major visual separators
  '5xl': 64,
} as const

export type SpacingKey = keyof typeof spacing

// Semantic aliases for readability in component code
export const layout = {
  screenPadding:     spacing.lg,   // 16px — horizontal edge padding
  cardPadding:       spacing.xl,   // 20px — internal card padding
  cardGap:           spacing.md,   // 12px — gap between cards
  sectionGap:        spacing['2xl'], // 24px — gap between major sections
  bottomTabOffset:   24,           // breathing room below last card (tab bar is outside scroll area)
  headerHeight:      56,           // nav header height (excl. status bar)
} as const
