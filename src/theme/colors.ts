/**
 * VITImeasure Color System
 *
 * Design direction: refined modern healthcare — clean, calm, and premium
 * Inspired by: Apple Health, Oura Ring, One Medical, Calm
 *
 * Backgrounds are layered with subtle warmth.
 * Primary brand is a refined indigo with depth.
 * Text follows a strict 3-tier hierarchy.
 */

export const colors = {
  // ─── Backgrounds ───────────────────────────────────────────────────
  bgPage:      '#F8F9FC',   // cool off-white — cleaner page floor
  bgCard:      '#FFFFFF',   // pure white card surface
  bgSubtle:    '#F0F1F8',   // muted lavender fill (selected states, inner sections)
  bgOverlay:   'rgba(10, 15, 30, 0.50)', // deeper modal scrim
  bgElevated:  '#FAFAFD',   // slightly lifted surface for nested elements

  // ─── Brand / Primary (Indigo) ───────────────────────────────────────
  primary:        '#4F46E5', // indigo-600
  primaryLight:   '#818CF8', // indigo-400
  primaryDark:    '#3730A3', // indigo-800
  primarySubtle:  'rgba(79, 70, 229, 0.06)',  // lighter fill
  primaryBorder:  'rgba(79, 70, 229, 0.14)',  // softer border
  primaryMuted:   'rgba(79, 70, 229, 0.10)',

  // ─── Teal (secondary metric accent) ────────────────────────────────
  teal:        '#0891B2',
  tealLight:   '#38BDF8',
  tealSubtle:  'rgba(8, 145, 178, 0.08)',

  // ─── Semantic ──────────────────────────────────────────────────────
  success:       '#059669',
  successLight:  '#34D399',
  successSubtle: 'rgba(5, 150, 105, 0.07)',
  successBorder: 'rgba(5, 150, 105, 0.16)',

  danger:        '#DC2626',
  dangerLight:   '#F87171',
  dangerSubtle:  'rgba(220, 38, 38, 0.07)',
  dangerBorder:  'rgba(220, 38, 38, 0.16)',

  warning:       '#D97706',
  warningSubtle: 'rgba(217, 119, 6, 0.07)',
  warningBorder: 'rgba(217, 119, 6, 0.16)',

  // ─── Text ──────────────────────────────────────────────────────────
  textPrimary:   '#111827', // gray-900 — slightly warmer than pure slate
  textSecondary: '#4B5563', // gray-600
  textTertiary:  '#9CA3AF', // gray-400
  textDisabled:  '#D1D5DB', // gray-300
  textOnPrimary: '#FFFFFF',

  // ─── Borders & Dividers ────────────────────────────────────────────
  border:        'rgba(0, 0, 0, 0.05)',    // barely there card border
  borderStrong:  'rgba(0, 0, 0, 0.10)',
  borderFocus:   '#4F46E5',
  divider:       'rgba(0, 0, 0, 0.04)',
} as const

// ─── Gradient Stops — for LinearGradient components ──────────────────
export const gradients = {
  // Primary hero: deeper, richer sweep
  primaryHero:   ['#4F46E5', '#6D28D9'] as const,
  // Softer brand tint for backgrounds
  primarySoft:   ['rgba(79, 70, 229, 0.04)', 'rgba(109, 40, 217, 0.02)'] as const,
  // Card shimmer: barely-visible diagonal tint
  cardShimmer:   ['#FFFFFF', '#FCFCFF', '#F8F7FF'] as const,
  // Success bar
  successBar:    ['#059669', '#34D399'] as const,
  // Teal accent bar
  tealBar:       ['#0891B2', '#38BDF8'] as const,
  // Warm amber for stress/warning indicators
  warmAccent:    ['#F59E0B', '#EF4444'] as const,
  // Page background — subtle depth
  pageBg:        ['#F8F9FC', '#F0F1F8'] as const,
} as const

export type ColorKey = keyof typeof colors
