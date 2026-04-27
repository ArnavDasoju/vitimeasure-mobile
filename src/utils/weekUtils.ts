/**
 * Week Utilities
 *
 * ISO week format: "YYYY-Www" (e.g. "2026-W14")
 * Weeks start on Monday. Week 1 is the week containing the first Thursday of the year.
 */

import type { WeeklyCheckIn } from '../lib/storage'

// ─── Internal ISO week computation ───────────────────────────────────────────

function isoWeekData(date: Date): { year: number; week: number; monday: Date } {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  const day = d.getDay() || 7  // 1=Mon … 7=Sun
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day - 1))

  // Thursday of this week is the ISO reference point
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)

  const year = thursday.getFullYear()

  // First Thursday of the year
  const firstThursday = new Date(year, 0, 1)
  const ftDay = firstThursday.getDay() || 7
  firstThursday.setDate(firstThursday.getDate() + (4 - ftDay))

  const weekNum =
    Math.floor((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000)) + 1

  return { year, week: weekNum, monday }
}

// ─── Public exports ───────────────────────────────────────────────────────────

/**
 * Returns the ISO week key for the current week.
 * Format: "YYYY-Www" with zero-padded week number.
 * Example: "2026-W14" for the week of March 30 2026.
 */
export function getCurrentWeekKey(): string {
  const { year, week } = isoWeekData(new Date())
  return `${year}-W${week.toString().padStart(2, '0')}`
}

/**
 * Returns the ISO date string (YYYY-MM-DD) of the Monday for a given weekKey.
 */
export function getWeekStartDate(weekKey: string): string {
  const [yearStr, weekPart] = weekKey.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekPart, 10)

  // First Thursday of the year
  const firstThursday = new Date(year, 0, 1)
  const ftDay = firstThursday.getDay() || 7
  firstThursday.setDate(firstThursday.getDate() + (4 - ftDay))

  // Monday of week 1 = Thursday − 3 days
  const week1Monday = new Date(firstThursday)
  week1Monday.setDate(firstThursday.getDate() - 3)

  // Monday of target week
  const targetMonday = new Date(week1Monday)
  targetMonday.setDate(week1Monday.getDate() + (week - 1) * 7)

  return targetMonday.toISOString().split('T')[0]
}

/**
 * Returns true if any check-in's weekKey matches the current week.
 */
export function hasCompletedCheckInThisWeek(checkIns: WeeklyCheckIn[]): boolean {
  const currentWeek = getCurrentWeekKey()
  return checkIns.some((c) => c.weekKey === currentWeek)
}

/**
 * Returns only check-ins from the last 8 weeks, sorted ascending by weekStartDate.
 */
export function getCheckInsLast8Weeks(checkIns: WeeklyCheckIn[]): WeeklyCheckIn[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 56)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  return checkIns
    .filter((c) => c.weekStartDate >= cutoffStr)
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))
}

/**
 * Converts "2026-W14" → "Week of Mar 30"
 */
export function formatWeekLabel(weekKey: string): string {
  const startDate = getWeekStartDate(weekKey)
  const d = new Date(startDate + 'T00:00:00')
  return (
    'Week of ' +
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  )
}
