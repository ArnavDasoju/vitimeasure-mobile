/**
 * Report Screen
 *
 * Generates a clinical-quality PDF report locally using expo-print and
 * exports it via the native share sheet.
 *
 * Layout:
 *   ┌─ AppHeader (back + "Generate Report" + body location subtitle)
 *   ├─ Date range card: quick-range chips + start/end display
 *   ├─ Preview card: scans in range, start %, end %, change badge
 *   ├─ Error box (if generation fails)
 *   └─ Generate button (loading state while generating)
 */

import React, { useState, useCallback, useRef } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { useAppStore } from '../../src/store/appStore'
import { getPatch, getTreatmentLogsForPatch } from '../../src/lib/storage'
import { computeRepigmentationVelocity } from '../../src/utils/repigmentationVelocity'
import { preparePatchReportHtml } from '../../src/services/pdfExport'
import { AppHeader } from '../../src/components/ui/AppHeader'
import { Card } from '../../src/components/ui/Card'
import { Button } from '../../src/components/ui/Button'
import { TrendBadge } from '../../src/components/ui/Badge'
import { SectionLabel } from '../../src/components/ui/SectionLabel'
import { colors, layout, radii, spacing, typography } from '../../src/theme'
import { formatDate } from '../../src/lib/format'
import type { StoredScan } from '../../src/lib/storage'

// ─── Date Chip ────────────────────────────────────────────────────────────────

function DateChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Preview Stats ────────────────────────────────────────────────────────────

function PreviewStat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.previewStat}>
      <Text style={[styles.previewValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const { bodyLocation: encoded } = useLocalSearchParams<{ bodyLocation: string }>()
  const bodyLocation = decodeURIComponent(encoded ?? '')
  const router = useRouter()
  const { userId, userEmail, userName } = useAppStore()

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generatingRef = useRef(false)

  // Real scans from local storage for this body area
  const [allScans, setAllScans] = useState<StoredScan[]>([])
  const [patchId, setPatchId] = useState<string>('')

  const loadScans = useCallback(async () => {
    if (!userEmail) return
    try {
      const patch = await getPatch(userEmail, bodyLocation)
      setAllScans(patch?.scans ?? [])
      setPatchId(patch?.id ?? '')
    } catch {
      setAllScans([])
    }
  }, [userEmail, bodyLocation])

  useFocusEffect(
    useCallback(() => {
      loadScans()
    }, [loadScans]),
  )

  // Unique scan dates sorted ascending
  const scanDates = Array.from(
    new Set(allScans.map((s) => s.date.split('T')[0]))
  ).sort()

  // Toggle a date chip on/off
  const toggleDate = (d: string) => {
    setError(null)
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  const sortedSelected = Array.from(selectedDates).sort()
  const startDate = sortedSelected[0] ?? ''
  const endDate = sortedSelected[sortedSelected.length - 1] ?? ''

  // Filter scans to only selected dates
  const filteredScans = allScans.filter((s) => selectedDates.has(s.date.split('T')[0]))
  const sorted = [...filteredScans].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const totalChange = first && last && first.id !== last.id
    ? last.affectedPercent - first.affectedPercent
    : null

  // ── Generate PDF report ──────────────────────────────────────────
  const handleGenerate = async () => {
    if (generatingRef.current || filteredScans.length === 0 || !userEmail) return
    generatingRef.current = true
    setGenerating(true)
    setError(null)

    try {
      const patch = await getPatch(userEmail, bodyLocation)
      if (!patch) throw new Error('Patch not found')

      const treatments = await getTreatmentLogsForPatch(userEmail, patch.id)

      // Compute velocity on ALL scans (full history) for accuracy
      const velocityResult = patch.scans.length >= 4
        ? computeRepigmentationVelocity(patch.scans)
        : null

      // Build latestAnalysis from the most recent scan that has Python analyzer data
      const latestWithAnalysis = [...patch.scans]
        .sort((a, b) => b.date.localeCompare(a.date))
        .find((s) => s.patchCount !== undefined)

      const { filePath } = await preparePatchReportHtml({
        patch,
        scans: patch.scans,
        treatments,
        velocityResult,
        dateRange: { start: startDate, end: endDate },
        userName: userName ?? userEmail,
        latestAnalysis: latestWithAnalysis
          ? {
              percentage:     latestWithAnalysis.affectedPercent,
              healthyPct:     latestWithAnalysis.unaffectedPercent,
              ratio:          latestWithAnalysis.ratio ?? '—',
              patchCount:     latestWithAnalysis.patchCount ?? 0,
              skinTone:       latestWithAnalysis.skinTone ?? latestWithAnalysis.dominantColor ?? 'Unknown',
              scanDate:       latestWithAnalysis.date,
              annotatedImage: latestWithAnalysis.annotatedImage,
            }
          : undefined,
      })

      router.push(
        `/report/viewer?filePath=${encodeURIComponent(filePath)}&title=${encodeURIComponent(bodyLocation)}`
      )
    } catch (err: any) {
      setError(`Could not generate report. ${err?.message ?? 'Unknown error'}`)
    } finally {
      setGenerating(false)
      generatingRef.current = false
    }
  }

  // ── Compute preview stat display values ──────────────────────────
  const scanCountDisplay = filteredScans.length.toString()
  const startDisplay = first ? `${first.affectedPercent.toFixed(1)}%` : (allScans.length === 0 ? 'No scans' : '—')
  const endDisplay = last ? `${last.affectedPercent.toFixed(1)}%` : (allScans.length === 0 ? 'No scans' : '—')
  const endColor = last && first
    ? last.affectedPercent < first.affectedPercent ? colors.success : colors.danger
    : undefined

  return (
    <View style={styles.screen}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <AppHeader
        title="Generate Report"
        subtitle={bodyLocation}
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Date range selector ─────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).springify()}>
          <SectionLabel label="Date Range" style={styles.sectionLabel} />
          <Card>
            {scanDates.length === 0 ? (
              <Text style={styles.noScansNote}>No scans yet</Text>
            ) : (
              <>
                {/* Scan date chips */}
                <View style={styles.chipRow}>
                  {scanDates.map((d) => (
                    <DateChip
                      key={d}
                      label={formatDate(d)}
                      active={selectedDates.has(d)}
                      onPress={() => toggleDate(d)}
                    />
                  ))}
                </View>

                {/* Start → End display */}
                {sortedSelected.length > 0 && (
                  <View style={styles.dateRow}>
                    <View style={styles.dateItem}>
                      <Text style={styles.dateKey}>From</Text>
                      <Text style={styles.dateVal}>{formatDate(startDate)}</Text>
                    </View>
                    <Text style={styles.dateSep}>→</Text>
                    <View style={[styles.dateItem, { alignItems: 'flex-end' }]}>
                      <Text style={styles.dateKey}>To</Text>
                      <Text style={styles.dateVal}>{formatDate(endDate)}</Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </Card>
        </Animated.View>

        {/* ── Preview ─────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(300).springify()}>
          <SectionLabel label="Preview" style={styles.sectionLabel} />
          <Card>
            <View style={styles.previewRow}>
              <PreviewStat
                value={scanCountDisplay}
                label="Scans"
                color={colors.primary}
              />
              <View style={styles.previewDivider} />
              <PreviewStat
                value={startDisplay}
                label="Start"
              />
              <View style={styles.previewDivider} />
              <PreviewStat
                value={endDisplay}
                label="End"
                color={endColor}
              />
              <View style={styles.previewDivider} />
              <View style={styles.previewStat}>
                <TrendBadge value={totalChange} size="sm" />
                <Text style={styles.previewLabel}>Change</Text>
              </View>
            </View>

            {filteredScans.length === 0 && (
              <Text style={styles.noScansNote}>
                {selectedDates.size === 0
                  ? 'Select dates above to preview'
                  : 'No scans found for the selected dates'}
              </Text>
            )}
            {filteredScans.length === 1 && (
              <Text style={styles.noScansNote}>
                Select at least 2 dates to see a change value
              </Text>
            )}
          </Card>
        </Animated.View>

        {/* ── Error box ───────────────────────────────────────────── */}
        {error && (
          <Animated.View entering={FadeIn.duration(250)}>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Generate button ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).duration(300)}>
          <Button
            label={generating ? 'Generating report…' : 'Generate Report'}
            onPress={handleGenerate}
            loading={generating}
            disabled={filteredScans.length === 0 || generating}
            fullWidth
            style={styles.generateBtn}
          />
        </Animated.View>

        <View style={{ height: spacing['4xl'] }} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },

  // ── Section labels ────────────────────────────────────────────────────
  sectionLabel: { marginBottom: spacing.md, marginTop: spacing.lg },

  // ── Date chips ────────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryBorder,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
  },

  // ── Date row ──────────────────────────────────────────────────────────
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  dateItem: {
    flex: 1,
  },
  dateKey: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
    marginBottom: 3,
  },
  dateVal: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  dateSep: {
    ...typography.body,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
  },

  // ── Preview ───────────────────────────────────────────────────────────
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  previewDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.divider,
  },
  previewValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  previewLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
  },
  noScansNote: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  // ── Error ─────────────────────────────────────────────────────────────
  errorBox: {
    backgroundColor: colors.dangerSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
  },

  // ── Button ────────────────────────────────────────────────────────────
  generateBtn: {
    marginTop: spacing.xl,
  },
})
