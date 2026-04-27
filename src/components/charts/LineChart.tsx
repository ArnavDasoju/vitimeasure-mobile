/**
 * LineChart — SVG-based smooth line chart
 *
 * Uses react-native-svg (already installed) for crisp rendering.
 * Draws a smooth cubic bezier curve (not sharp angles).
 * Gradient fill below the affected % line gives depth without clutter.
 *
 * Optional props:
 *  - treatments: renders a vertical dashed line at each treatment start date
 *    that falls within the chart range, labelled with the medication name
 *    (truncated to 12 chars).
 *  - velocityResult: when provided and isImproving=true, draws a dashed
 *    projection line extending 84 days beyond the last real data point,
 *    a "Today" vertical marker, and horizontal milestone reference lines.
 *
 * Design details:
 *  - Indigo line for affected %, teal line for VASI score
 *  - Gradient fill: primary at 15% → transparent
 *  - Data points: filled circles with white stroke (punched look)
 *  - Horizontal grid lines only (vertical = noise)
 *  - 3 Y-axis labels, 2 X-axis labels (first + last)
 *  - Legend shows which line is which when VASI data or projection is present
 */

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import { colors, spacing, typography } from '../../theme'
import { formatShortDate } from '../../lib/format'
import {
  getProjectionPoints,
  type RepigmentationVelocityResult,
} from '../../utils/repigmentationVelocity'
import { getStressColor } from '../../utils/stressColors'

// ─── Types ────────────────────────────────────────────────────────────────────

type DataPoint = {
  scanDate: string
  affectedPercent: number
  vasiScore?: number
}

type TreatmentMark = {
  startDate: string      // ISO date string
  medicationName: string
}

type WeeklyStressBand = {
  weekKey: string
  weekStartDate: string  // ISO date "YYYY-MM-DD" — Monday of the week
  avgStress: number      // 1–5
  entryCount: number
}

type Props = {
  data: DataPoint[]
  treatments?: TreatmentMark[]
  velocityResult?: RepigmentationVelocityResult | null
  weeklyStress?: WeeklyStressBand[]
  showStressOverlay?: boolean
  onStressBandTap?: (weekKey: string, avgStress: number) => void
  width?: number
  height?: number
}

const PAD = { top: 16, bottom: 32, left: 40, right: 16 }

// ─── Smooth bezier path ───────────────────────────────────────────────────────

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  const d: string[] = [`M ${points[0].x} ${points[0].y}`]

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cpX = (prev.x + curr.x) / 2
    d.push(`C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`)
  }
  return d.join(' ')
}

// ─── Teal VASI line color ─────────────────────────────────────────────────────
const VASI_COLOR = colors.teal       // '#0891B2'
const TREAT_LINE_COLOR = '#94A3B8'   // slate-400 — muted, doesn't clash
const PROJ_COLOR = colors.primary    // same as affected % line, lower opacity
const TODAY_COLOR = '#94A3B8'
const MILESTONE_COLOR = '#CBD5E1'    // slate-300

// ─── Main chart ───────────────────────────────────────────────────────────────

export function LineChart({
  data,
  treatments = [],
  velocityResult,
  weeklyStress = [],
  showStressOverlay = true,
  onStressBandTap,
  height = 160,
}: Props) {
  const screenW = Dimensions.get('window').width
  const width = screenW - (spacing.lg + spacing.xl) * 2

  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom

  const result = useMemo(() => {
    if (data.length < 2) return null

    const hasProjection = velocityResult?.isImproving === true

    // Time-based x when projection exists (so dashed line aligns correctly)
    // Index-based x when no projection (preserve existing behavior)
    const firstMs = new Date(data[0].scanDate).getTime()
    const lastMs = new Date(data[data.length - 1].scanDate).getTime()
    const lastDayX = Math.round((lastMs - firstMs) / (1000 * 60 * 60 * 24))
    const todayMs = Date.now()
    const todayDayX = Math.round((todayMs - firstMs) / (1000 * 60 * 60 * 24))
    const FUTURE_DAYS = 84

    // Total day range for x-axis
    const maxDayX = hasProjection
      ? Math.max(lastDayX + FUTURE_DAYS, todayDayX + 14)
      : lastDayX

    const toXByDay = (dayX: number) => PAD.left + (dayX / Math.max(maxDayX, 1)) * innerW

    // For index-based positioning (no projection)
    const toXByIndex = (i: number) =>
      PAD.left + (i / (data.length - 1)) * innerW

    // Choose positioning mode
    const toX = hasProjection ? toXByDay : toXByIndex

    const getDataX = (i: number): number => {
      if (hasProjection) {
        const ms = new Date(data[i].scanDate).getTime()
        const dayX = Math.round((ms - firstMs) / (1000 * 60 * 60 * 24))
        return toXByDay(dayX)
      }
      return toXByIndex(i)
    }

    const values = data.map((d) => d.affectedPercent)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const range = Math.max(maxVal - minVal, 5)

    const padded = { min: Math.max(0, minVal - range * 0.2), max: maxVal + range * 0.2 }

    const toY = (v: number) =>
      PAD.top + innerH - ((v - padded.min) / (padded.max - padded.min)) * innerH

    const points = data.map((d, i) => ({ x: getDataX(i), y: toY(d.affectedPercent) }))
    const linePath = smoothPath(points)

    const fillPath =
      linePath +
      ` L ${points[points.length - 1].x} ${PAD.top + innerH}` +
      ` L ${PAD.left} ${PAD.top + innerH} Z`

    const yTicks = [padded.min, (padded.min + padded.max) / 2, padded.max].map((v) =>
      Math.round(v),
    )

    // VASI secondary line — use its own Y scale so it overlays cleanly
    const vasiValues = data
      .map((d) => d.vasiScore)
      .filter((v): v is number => v !== undefined && v !== null)

    let vasiPoints: { x: number; y: number }[] | null = null
    let vasiPath = ''
    if (vasiValues.length >= 2) {
      const vasiMax = Math.max(...vasiValues)
      const vasiMin = Math.min(...vasiValues)
      const vasiRange = Math.max(vasiMax - vasiMin, 0.5)
      const vasiPadded = { min: Math.max(0, vasiMin - vasiRange * 0.2), max: vasiMax + vasiRange * 0.2 }

      const toVY = (v: number) =>
        PAD.top + innerH - ((v - vasiPadded.min) / (vasiPadded.max - vasiPadded.min)) * innerH

      vasiPoints = data
        .map((d, i) => d.vasiScore !== undefined ? { x: getDataX(i), y: toVY(d.vasiScore) } : null)
        .filter((p): p is { x: number; y: number } => p !== null)

      vasiPath = smoothPath(vasiPoints)
    }

    // Treatment vertical lines — only those within date range
    const dateSpanMs = lastMs - firstMs

    const treatmentLines = treatments
      .filter((t) => {
        const ts = new Date(t.startDate).getTime()
        if (hasProjection) {
          return ts >= firstMs && ts <= todayMs
        }
        return ts >= firstMs && ts <= lastMs
      })
      .map((t) => {
        const ts = new Date(t.startDate).getTime()
        let x: number
        if (hasProjection) {
          const dayX = Math.round((ts - firstMs) / (1000 * 60 * 60 * 24))
          x = toXByDay(dayX)
        } else {
          const ratio = dateSpanMs > 0 ? (ts - firstMs) / dateSpanMs : 0
          x = PAD.left + ratio * innerW
        }
        return {
          x,
          label: t.medicationName.length > 12
            ? t.medicationName.slice(0, 12) + '…'
            : t.medicationName,
          startDate: t.startDate,
        }
      })

    // Group labels by x (same date → stack vertically)
    const labelsByX: Record<string, typeof treatmentLines> = {}
    for (const tl of treatmentLines) {
      const key = tl.x.toFixed(1)
      labelsByX[key] = labelsByX[key] ?? []
      labelsByX[key].push(tl)
    }

    // ── Projection data ───────────────────────────────────────────────
    let projectionPath = ''
    let projectionPoints: Array<{ x: number; y: number }> = []
    let todayLineX: number | null = null
    let milestoneLines: Array<{ y: number; label: string }> = []

    if (hasProjection && velocityResult) {
      const rawProjPts = getProjectionPoints(velocityResult, lastDayX, FUTURE_DAYS)

      projectionPoints = rawProjPts.map((p) => ({
        x: toXByDay(p.x),
        y: toY(Math.min(p.y, padded.max)),
      }))

      if (projectionPoints.length >= 2) {
        projectionPath = smoothPath(projectionPoints)
      }

      // Today vertical line (only if today is within visible range)
      if (todayDayX >= 0 && todayDayX <= maxDayX) {
        todayLineX = toXByDay(todayDayX)
      }

      // Milestone horizontal reference lines (only for unachieved targets)
      const milestoneTargets: Array<{ value: number; label: string }> = [
        { value: 50, label: '50%' },
        { value: 25, label: '25%' },
        { value: 10, label: '10%' },
      ]
      for (const m of milestoneTargets) {
        if (velocityResult.currentAffectedPercent > m.value) {
          const yPos = toY(m.value)
          if (yPos >= PAD.top && yPos <= PAD.top + innerH) {
            milestoneLines.push({ y: yPos, label: m.label })
          }
        }
      }
    }

    // X-axis labels
    const xLabels: Array<{ x: number; label: string }> = []
    xLabels.push({ x: PAD.left, label: formatShortDate(data[0].scanDate) })
    if (hasProjection) {
      const projEndDate = new Date(firstMs + maxDayX * 24 * 60 * 60 * 1000)
      xLabels.push({
        x: PAD.left + innerW,
        label: formatShortDate(projEndDate.toISOString()),
      })
    } else if (data.length > 1) {
      xLabels.push({
        x: PAD.left + innerW,
        label: formatShortDate(data[data.length - 1].scanDate),
      })
    }

    // ── Stress band x-positions ───────────────────────────────────────
    const stressBands = (showStressOverlay ? weeklyStress : [])
      .filter((w) => w.entryCount >= 1)
      .map((w) => {
        const startMs = new Date(w.weekStartDate + 'T00:00:00').getTime()
        const endMs = startMs + 7 * 24 * 60 * 60 * 1000

        let xStart: number
        let xEnd: number

        if (hasProjection) {
          const startDayX = Math.round((startMs - firstMs) / (1000 * 60 * 60 * 24))
          const endDayX = Math.round((endMs - firstMs) / (1000 * 60 * 60 * 24))
          xStart = toXByDay(startDayX)
          xEnd = toXByDay(endDayX)
        } else {
          const dateSpanMs = lastMs - firstMs
          const startRatio = dateSpanMs > 0 ? (startMs - firstMs) / dateSpanMs : 0
          const endRatio = dateSpanMs > 0 ? (endMs - firstMs) / dateSpanMs : 0
          xStart = PAD.left + startRatio * innerW
          xEnd = PAD.left + endRatio * innerW
        }

        // Clamp to chart area
        xStart = Math.max(PAD.left, xStart)
        xEnd = Math.min(PAD.left + innerW, xEnd)

        return { ...w, xStart, xEnd }
      })
      .filter((b) => b.xStart < b.xEnd)

    return {
      points,
      linePath,
      fillPath,
      toY,
      yTicks,
      vasiPoints,
      vasiPath,
      treatmentLines,
      labelsByX,
      projectionPath,
      projectionPoints,
      todayLineX,
      milestoneLines,
      xLabels,
      hasProjection,
      stressBands,
    }
  }, [data, treatments, velocityResult, weeklyStress, showStressOverlay, innerW, innerH])

  if (!result || data.length < 2) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Scan again to see your trend</Text>
      </View>
    )
  }

  const {
    points,
    linePath,
    fillPath,
    toY,
    yTicks,
    vasiPoints,
    vasiPath,
    treatmentLines,
    labelsByX,
    projectionPath,
    projectionPoints,
    todayLineX,
    milestoneLines,
    xLabels,
    hasProjection,
    stressBands,
  } = result

  const totalH = height
  const hasVASI = vasiPoints !== null && vasiPoints.length >= 2

  return (
    <View>
      <Svg width={width} height={totalH}>
        <Defs>
          <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.14" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Horizontal grid lines */}
        {yTicks.map((tick) => (
          <React.Fragment key={tick}>
            <Line
              x1={PAD.left}
              y1={toY(tick)}
              x2={PAD.left + innerW}
              y2={toY(tick)}
              stroke={colors.divider}
              strokeWidth={1}
            />
            <SvgText
              x={PAD.left - 6}
              y={toY(tick) + 4}
              fontSize={10}
              fill={colors.textTertiary}
              textAnchor="end"
            >
              {tick}%
            </SvgText>
          </React.Fragment>
        ))}

        {/* Milestone horizontal reference lines */}
        {milestoneLines.map((ml) => (
          <React.Fragment key={`milestone-${ml.label}`}>
            <Line
              x1={PAD.left}
              y1={ml.y}
              x2={PAD.left + innerW}
              y2={ml.y}
              stroke={MILESTONE_COLOR}
              strokeWidth={1}
              strokeDasharray="3,4"
            />
            <SvgText
              x={PAD.left + innerW - 2}
              y={ml.y - 2}
              fontSize={8}
              fill={MILESTONE_COLOR}
              textAnchor="end"
            >
              {ml.label}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Treatment vertical dashed lines */}
        {treatmentLines.map((tl, i) => {
          const xKey = tl.x.toFixed(1)
          const group = labelsByX[xKey]
          const posInGroup = group.findIndex((g) => g.startDate === tl.startDate)
          const labelY = PAD.top + 10 + posInGroup * 14

          return (
            <React.Fragment key={`treat-${i}`}>
              <Line
                x1={tl.x}
                y1={PAD.top}
                x2={tl.x}
                y2={PAD.top + totalH - PAD.bottom}
                stroke={TREAT_LINE_COLOR}
                strokeWidth={1}
                strokeDasharray="4,3"
              />
              <SvgText
                x={tl.x + 3}
                y={labelY}
                fontSize={9}
                fill={TREAT_LINE_COLOR}
                textAnchor="start"
              >
                {tl.label}
              </SvgText>
            </React.Fragment>
          )
        })}

        {/* Today vertical line */}
        {todayLineX !== null && (
          <React.Fragment>
            <Line
              x1={todayLineX}
              y1={PAD.top}
              x2={todayLineX}
              y2={PAD.top + innerH}
              stroke={TODAY_COLOR}
              strokeWidth={1}
              strokeDasharray="2,3"
            />
            <SvgText
              x={todayLineX + 3}
              y={PAD.top + 8}
              fontSize={8}
              fill={TODAY_COLOR}
              textAnchor="start"
            >
              Today
            </SvgText>
          </React.Fragment>
        )}

        {/* Stress week bands — rendered behind all data lines */}
        {stressBands.map((band) => (
          <Rect
            key={band.weekKey}
            x={band.xStart}
            y={PAD.top}
            width={band.xEnd - band.xStart}
            height={innerH}
            fill={getStressColor(band.avgStress)}
            opacity={0.10}
            onPress={onStressBandTap ? () => onStressBandTap(band.weekKey, band.avgStress) : undefined}
          />
        ))}

        {/* Gradient fill (affected %) */}
        <Path d={fillPath} fill="url(#fillGrad)" />

        {/* Affected % main line */}
        <Path
          d={linePath}
          stroke={colors.primary}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dashed projection line */}
        {hasProjection && projectionPath.length > 0 && (
          <Path
            d={projectionPath}
            stroke={PROJ_COLOR}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6,4"
            opacity={0.5}
          />
        )}

        {/* VASI secondary line */}
        {hasVASI && (
          <Path
            d={vasiPath}
            stroke={VASI_COLOR}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5,3"
          />
        )}

        {/* Affected % data points */}
        {points.map((pt, i) => (
          <React.Fragment key={i}>
            <Circle cx={pt.x} cy={pt.y} r={6} fill={colors.bgCard} />
            <Circle
              cx={pt.x}
              cy={pt.y}
              r={4}
              fill={i === points.length - 1 ? colors.primary : colors.primaryLight}
            />
          </React.Fragment>
        ))}

        {/* VASI data points */}
        {hasVASI && vasiPoints!.map((pt, i) => (
          <React.Fragment key={`v${i}`}>
            <Circle cx={pt.x} cy={pt.y} r={4} fill={colors.bgCard} />
            <Circle cx={pt.x} cy={pt.y} r={2.5} fill={VASI_COLOR} />
          </React.Fragment>
        ))}

        {/* X-axis date labels */}
        {xLabels.map((xl, i) => (
          <SvgText
            key={i}
            x={xl.x}
            y={totalH - 4}
            fontSize={10}
            fill={colors.textTertiary}
            textAnchor={i === 0 ? 'start' : 'end'}
          >
            {xl.label}
          </SvgText>
        ))}
      </Svg>

      {/* Legend */}
      {(hasVASI || hasProjection) && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendLabel}>Actual</Text>
          </View>
          {hasProjection && (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatchDash, { borderColor: colors.primary }]} />
              <Text style={styles.legendLabel}>Projected</Text>
            </View>
          )}
          {hasVASI && (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatchDash, { borderColor: VASI_COLOR }]} />
              <Text style={styles.legendLabel}>VASI</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// ─── Mini Sparkline (no labels, no grid — just the shape) ────────────────────

type SparklineProps = {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 80, height = 32, color }: SparklineProps) {
  const lineColor = color ?? colors.primary

  if (data.length < 2) return null

  const maxVal = Math.max(...data)
  const minVal = Math.min(...data)
  const range = Math.max(maxVal - minVal, 1)

  const toX = (i: number) => (i / (data.length - 1)) * width
  const toY = (v: number) => height - ((v - minVal) / range) * (height - 4) - 2

  const points = data.map((v, i) => ({ x: toX(i), y: toY(v) }))
  const path = smoothPath(points)

  return (
    <Svg width={width} height={height}>
      <Path
        d={path}
        stroke={lineColor}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
      />
      <Circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={3}
        fill={lineColor}
        opacity={0.8}
      />
    </Svg>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  legendSwatchDash: {
    width: 16,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
})
