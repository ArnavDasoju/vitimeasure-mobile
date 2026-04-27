/**
 * StressCalendar
 *
 * Renders a monthly grid of day squares colored by daily stress score.
 * Completely self-contained — receives all data as props, calls no storage
 * functions, shares no state with other components.
 *
 * Props:
 *   stressEntries — daily entries from getDailyStressEntries()
 *   month         — which month to display (only month/year used)
 *   onDayTap      — called with the date string when a colored square is tapped
 */

import React, { useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { getStressColor } from '../utils/stressColors'
import { colors, radii, spacing, typography } from '../theme'
import type { DailyStressEntry } from '../lib/storage'

type Props = {
  stressEntries: DailyStressEntry[]
  month: Date
  onDayTap?: (date: string) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function StressCalendar({ stressEntries, month, onDayTap }: Props) {
  const [activeTip, setActiveTip] = useState<{ date: string; score: number } | null>(null)

  const { year, monthIdx, days } = useMemo(() => {
    const y = month.getFullYear()
    const m = month.getMonth()

    // First day of month
    const firstDay = new Date(y, m, 1)
    // Monday-based offset (0=Mon, 6=Sun)
    const rawOffset = firstDay.getDay() // 0=Sun,1=Mon...
    const offset = rawOffset === 0 ? 6 : rawOffset - 1

    const daysInMonth = new Date(y, m + 1, 0).getDate()

    // Build entry lookup by date string
    const lookup: Record<string, number> = {}
    for (const entry of stressEntries) {
      if (
        entry.date.startsWith(
          `${y}-${String(m + 1).padStart(2, '0')}`,
        )
      ) {
        lookup[entry.date] = entry.stressScore
      }
    }

    // Build the grid cells
    const cells: Array<{ day: number | null; date: string | null; score: number | null }> = []

    // Leading empty cells to align with Monday
    for (let i = 0; i < offset; i++) {
      cells.push({ day: null, date: null, score: null })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, date: dateStr, score: lookup[dateStr] ?? null })
    }

    return { year: y, monthIdx: m, days: cells }
  }, [stressEntries, month])

  const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const handleDayPress = (cell: { date: string | null; score: number | null }) => {
    if (!cell.date || cell.score === null) return
    setActiveTip({ date: cell.date, score: cell.score })
    onDayTap?.(cell.date)
    setTimeout(() => setActiveTip(null), 3000)
  }

  // Split cells into rows of 7
  const rows: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) {
    rows.push(days.slice(i, i + 7))
  }

  return (
    <View style={styles.container}>
      {/* Month header */}
      <Text style={styles.monthLabel}>{monthLabel}</Text>

      {/* Day-of-week headers */}
      <View style={styles.dayHeaders}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={styles.dayHeader}>{d}</Text>
        ))}
      </View>

      {/* Tooltip */}
      {activeTip && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>
            {activeTip.date} · stress {activeTip.score}/5
          </Text>
        </View>
      )}

      {/* Calendar grid */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((cell, colIdx) => {
            if (!cell.day) {
              return <View key={colIdx} style={styles.cell} />
            }
            const hasData = cell.score !== null
            return (
              <TouchableOpacity
                key={colIdx}
                style={[
                  styles.cell,
                  styles.dayCell,
                  hasData && {
                    backgroundColor: getStressColor(cell.score!) + '33',
                    borderColor: getStressColor(cell.score!),
                  },
                ]}
                onPress={() => handleDayPress(cell)}
                activeOpacity={hasData ? 0.7 : 1}
                disabled={!hasData}
              >
                <Text
                  style={[
                    styles.dayNum,
                    hasData && { color: getStressColor(cell.score!), fontWeight: '700' },
                  ]}
                >
                  {cell.day}
                </Text>
              </TouchableOpacity>
            )
          })}
          {/* Pad the last row to 7 cells */}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`pad-${i}`} style={styles.cell} />
            ))}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legend}>
        {[1, 2, 3, 4, 5].map((score) => (
          <View key={score} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: getStressColor(score) },
              ]}
            />
            <Text style={styles.legendLabel}>{score}</Text>
          </View>
        ))}
        <Text style={styles.legendCaption}>= stress level</Text>
      </View>
    </View>
  )
}

const CELL_SIZE = 36

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  monthLabel: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
    justifyContent: 'center',
  },
  dayHeader: {
    width: CELL_SIZE,
    textAlign: 'center',
    ...typography.label,
    fontSize: 10,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
    justifyContent: 'center',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    margin: 1,
  },
  dayCell: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
  },
  dayNum: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  tooltip: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  tooltipText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  legendCaption: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
  },
})
