/**
 * Patch Detail Screen
 *
 * Shows the full scan history and progression for a single tracked body area.
 * Swipe a scan row left to delete it (confirmation required).
 * Reloads on focus so changes from the Results screen appear instantly.
 *
 * Layout (top to bottom):
 *   ┌─ AppHeader (back + location title + scan count + "Report" action)
 *   ├─ Hero stats card (affected %, clear %, VASI score, trend badge)
 *   ├─ "PROGRESSION" section + LineChart (affected % + VASI lines + treatment marks)
 *   ├─ "SCAN HISTORY" section + swipeable scan rows
 *   ├─ "INSIGHTS" card (only when scans >= 3)
 *   ├─ "TREATMENTS" section + swipeable treatment rows + Add button
 *   └─ Sticky bottom bar with "Scan Now" CTA
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { File, Directory, Paths } from 'expo-file-system'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore } from '../../src/store/appStore'
import {
  getPatch,
  deleteScan,
  scanToProgressEntry,
  updateScanLocalPath,
  getTreatmentLogsForPatch,
  saveTreatmentLog,
  deleteTreatmentLog,
  getWeeklyAverageStress,
  type StoredPatch,
  type TreatmentLogEntry,
} from '../../src/lib/storage'
import { apiRequest } from '../../src/services/apiClient'
import { computeVASI, getVASISeverity } from '../../src/utils/vasiScore'
import {
  computeRepigmentationVelocity,
  generateVelocityInsightText,
  type RepigmentationVelocityResult,
} from '../../src/utils/repigmentationVelocity'
import { exportPatchReportAsPDF } from '../../src/services/pdfExport'
import { AIChatCard } from '../../src/components/AIChatCard'
import { InsightCard } from '../../src/components/InsightCard'
import { AppHeader } from '../../src/components/ui/AppHeader'
import { Card } from '../../src/components/ui/Card'
import { TrendBadge } from '../../src/components/ui/Badge'
import { SectionLabel } from '../../src/components/ui/SectionLabel'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { Button } from '../../src/components/ui/Button'
import { LineChart } from '../../src/components/charts/LineChart'
import { ErrorBoundary } from '../../src/components/ErrorBoundary'
import { Skeleton } from '../../src/components/ui/Skeleton'
import { colors, layout, radii, spacing, typography } from '../../src/theme'
import { formatDate, toDateInput, timeAgo } from '../../src/lib/format'
import type { ProgressEntry } from '../../src/types/app'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  // Verify the date didn't silently wrap (e.g. Feb 30 → Mar 2)
  const [y, m, day] = s.split('-').map(Number)
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
}

// ─── Scan thumbnail ───────────────────────────────────────────────────────────

function ScanThumb({
  localImagePath,
  imageUrl,
}: {
  localImagePath?: string
  imageUrl: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (localImagePath) {
        try {
          if (!cancelled && new File(localImagePath).exists) {
            setSrc(localImagePath)
            setResolved(true)
            return
          }
        } catch {
          // fall through
        }
      }
      if (!cancelled) {
        setSrc(imageUrl || null)
        setResolved(true)
      }
    }
    resolve()
    return () => { cancelled = true }
  }, [localImagePath, imageUrl])

  if (!resolved || !src) {
    return (
      <View style={[styles.thumb, styles.thumbPlaceholder]}>
      </View>
    )
  }

  return (
    <Image source={{ uri: src }} style={styles.thumb} resizeMode="cover" />
  )
}

// ─── Swipe delete action ──────────────────────────────────────────────────────

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.deleteAction} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  )
}

// ─── Scan History Row ─────────────────────────────────────────────────────────

function ScanHistoryRow({
  scan,
  change,
  isFirst,
}: {
  scan: ProgressEntry
  change: number | null
  isFirst: boolean
}) {
  return (
    <View style={[styles.historyRow, !isFirst && styles.historyRowBorder]}>
      <ScanThumb localImagePath={scan.localImagePath} imageUrl={scan.imageUrl} />
      <View style={styles.historyInfo}>
        <Text style={styles.historyDate}>{formatDate(scan.scanDate)}</Text>
        <Text style={styles.historyMeta}>
          {scan.affectedPercent.toFixed(1)}% affected
          {'  ·  '}
          {scan.unaffectedPercent.toFixed(1)}% clear
        </Text>
      </View>
      <TrendBadge value={change} size="sm" />
    </View>
  )
}

// ─── Treatment Row ────────────────────────────────────────────────────────────

function TreatmentRow({
  entry,
  isFirst,
}: {
  entry: TreatmentLogEntry
  isFirst: boolean
}) {
  return (
    <View style={[styles.treatmentRow, !isFirst && styles.treatmentRowBorder]}>
      <View style={styles.treatmentMain}>
        <View style={styles.treatmentHeader}>
          <Text style={styles.treatmentName}>{entry.medicationName}</Text>
          {entry.dose ? (
            <Text style={styles.treatmentDose}> · {entry.dose}</Text>
          ) : null}
        </View>

        <Text style={styles.treatmentStartDate}>
          Started {formatDisplayDate(entry.startDate)}
        </Text>

        {entry.notes ? (
          <Text style={styles.treatmentNotes} numberOfLines={2}>
            {entry.notes}
          </Text>
        ) : null}
      </View>

      <View style={styles.treatmentStatus}>
        {entry.isActive ? (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        ) : (
          <Text style={styles.endedText}>
            {entry.endDate ? `Ended\n${formatDisplayDate(entry.endDate)}` : 'Ended'}
          </Text>
        )}
      </View>
    </View>
  )
}

// ─── Add Treatment Modal ──────────────────────────────────────────────────────

type AddTreatmentModalProps = {
  visible: boolean
  patchId: string
  userId: string
  userEmail: string
  onSaved: () => void
  onClose: () => void
}

function AddTreatmentModal({
  visible,
  patchId,
  userId,
  userEmail,
  onSaved,
  onClose,
}: AddTreatmentModalProps) {
  const todayStr = toDateInput(new Date())

  const [medicationName, setMedicationName] = useState('')
  const [dose, setDose] = useState('')
  const [startDate, setStartDate] = useState(todayStr)
  const [isActive, setIsActive] = useState(true)
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setMedicationName('')
      setDose('')
      setStartDate(toDateInput(new Date()))
      setIsActive(true)
      setEndDate('')
      setNotes('')
      setErrors({})
      setSaving(false)
    }
  }, [visible])

  function validate(): boolean {
    const errs: Record<string, string> = {}

    if (!medicationName.trim()) {
      errs.medicationName = 'Medication name is required'
    }

    if (!isValidDateStr(startDate)) {
      errs.startDate = 'Enter a valid date (YYYY-MM-DD)'
    } else if (startDate > todayStr) {
      errs.startDate = 'Start date cannot be in the future'
    }

    if (!isActive) {
      if (!isValidDateStr(endDate)) {
        errs.endDate = 'Enter a valid date (YYYY-MM-DD)'
      } else if (endDate > todayStr) {
        errs.endDate = 'End date cannot be in the future'
      } else if (endDate < startDate) {
        errs.endDate = 'End date must be after start date'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)

    const now = new Date().toISOString()
    const entry: TreatmentLogEntry = {
      id: genId(),
      patchId,
      userId,
      medicationName: medicationName.trim(),
      dose: dose.trim(),
      startDate,
      endDate: isActive ? null : endDate,
      notes: notes.trim(),
      createdAt: now,
      updatedAt: now,
      isActive,
    }

    await saveTreatmentLog(userEmail, entry)
    onSaved()

    // Background sync — do not block UI
    apiRequest('/sync/treatments', {
      method: 'POST',
      body: JSON.stringify({ treatments: [entry] }),
    }).catch(() => {})

    setSaving(false)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Modal header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add Treatment</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={8}>
            <Text style={[styles.modalSave, saving && { opacity: 0.5 }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>

          {/* Field 1 — Medication Name */}
          <Text style={styles.fieldLabel}>Medication Name *</Text>
          <TextInput
            style={[styles.textInput, errors.medicationName && styles.inputError]}
            placeholder="e.g. Ruxolitinib cream, NB-UVB therapy"
            placeholderTextColor={colors.textTertiary}
            value={medicationName}
            onChangeText={(t) => {
              setMedicationName(t.slice(0, 100))
              setErrors((e) => ({ ...e, medicationName: '' }))
            }}
            maxLength={100}
            returnKeyType="next"
          />
          {errors.medicationName ? (
            <Text style={styles.fieldError}>{errors.medicationName}</Text>
          ) : null}

          {/* Field 2 — Dose */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Dose</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. 1.5%, twice daily, 3x per week"
            placeholderTextColor={colors.textTertiary}
            value={dose}
            onChangeText={(t) => setDose(t.slice(0, 50))}
            maxLength={50}
            returnKeyType="next"
          />

          {/* Field 3 — Start Date */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Start Date *</Text>
          <TextInput
            style={[styles.textInput, errors.startDate && styles.inputError]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textTertiary}
            value={startDate}
            onChangeText={(t) => {
              setStartDate(t)
              setErrors((e) => ({ ...e, startDate: '' }))
            }}
            keyboardType="default"
            maxLength={10}
            returnKeyType="next"
          />
          {errors.startDate ? (
            <Text style={styles.fieldError}>{errors.startDate}</Text>
          ) : null}

          {/* Field 4 — Still ongoing toggle */}
          <View style={[styles.toggleRow, styles.fieldLabelSpaced]}>
            <Text style={styles.fieldLabel}>Still ongoing</Text>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.bgCard}
            />
          </View>

          {/* Field 5 — End Date (conditional) */}
          {!isActive && (
            <>
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>End Date *</Text>
              <TextInput
                style={[styles.textInput, errors.endDate && styles.inputError]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
                value={endDate}
                onChangeText={(t) => {
                  setEndDate(t)
                  setErrors((e) => ({ ...e, endDate: '' }))
                }}
                keyboardType="default"
                maxLength={10}
                returnKeyType="next"
              />
              {errors.endDate ? (
                <Text style={styles.fieldError}>{errors.endDate}</Text>
              ) : null}
            </>
          )}

          {/* Field 6 — Notes */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Notes</Text>
          <TextInput
            style={[styles.textInput, styles.notesInput]}
            placeholder="Any observations about this treatment..."
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={(t) => setNotes(t.slice(0, 500))}
            maxLength={500}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{notes.length} / 500</Text>

          {/* Save button */}
          <Button
            label={saving ? 'Saving…' : 'Save Treatment'}
            onPress={handleSave}
            fullWidth
            style={styles.saveBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PatchDetailScreen() {
  const { bodyLocation: encoded } = useLocalSearchParams<{ bodyLocation: string }>()
  const bodyLocation = decodeURIComponent(encoded ?? '')
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userEmail, userId, userName } = useAppStore()

  const [patch, setPatch] = useState<StoredPatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [treatments, setTreatments] = useState<TreatmentLogEntry[]>([])
  const [showAddTreatment, setShowAddTreatment] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportingRef = useRef(false)

  const backfillDoneRef = useRef(false)

  // Stress overlay state — new, does not touch existing state
  const [weeklyStress, setWeeklyStress] = useState<
    Array<{ weekKey: string; weekStartDate: string; avgStress: number; entryCount: number }>
  >([])
  const [showStressOverlay, setShowStressOverlay] = useState(true)
  const [activeStressBand, setActiveStressBand] = useState<{
    weekKey: string
    avgStress: number
  } | null>(null)
  const stressBandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadPatch = useCallback(async () => {
    if (!userEmail) return
    const data = await getPatch(userEmail, bodyLocation)
    setPatch(data)
    setLoading(false)
  }, [userEmail, bodyLocation])

  const loadTreatments = useCallback(async () => {
    if (!userEmail || !patch) return
    const list = await getTreatmentLogsForPatch(userEmail, patch.id)
    setTreatments(list)
  }, [userEmail, patch])

  useFocusEffect(
    useCallback(() => {
      loadPatch()
    }, [loadPatch]),
  )

  // Load treatments whenever patch changes
  useEffect(() => {
    if (patch) loadTreatments()
  }, [patch])

  // Load weekly stress data — separate effect, read-only
  useEffect(() => {
    if (!userEmail) return
    getWeeklyAverageStress(userEmail).then(setWeeklyStress)
  }, [userEmail])

  // Clean up tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (stressBandTimer.current) clearTimeout(stressBandTimer.current)
    }
  }, [])

  // Silent backfill: download imageUrl for scans with no localImagePath
  useEffect(() => {
    if (!patch || !userEmail || backfillDoneRef.current) return
    backfillDoneRef.current = true

    const toBackfill = patch.scans.filter((s) => s.imageUrl && !s.localImagePath)
    if (toBackfill.length === 0) return

    ;(async () => {
      const scanDir = new Directory(Paths.document, 'vitiligo_scans')
      if (!scanDir.exists) scanDir.create({ intermediates: true })
      for (const scan of toBackfill) {
        try {
          const destFile = new File(scanDir, scan.id + '.jpg')
          await File.downloadFileAsync(scan.imageUrl!, destFile, { idempotent: true })
          await updateScanLocalPath(userEmail, bodyLocation, scan.id, destFile.uri)
        } catch {
          // URL may have expired — leave unchanged
        }
      }
    })()
  }, [patch])

  const handleDeleteScan = (scanId: string, scanDate: string) => {
    Alert.alert(
      'Delete Scan',
      `Delete the scan from ${formatDate(scanDate)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userEmail) return
            await deleteScan(userEmail, bodyLocation, scanId)
            await loadPatch()
          },
        },
      ],
    )
  }

  const handleDeleteTreatment = (entry: TreatmentLogEntry) => {
    Alert.alert(
      'Delete Treatment',
      `Remove "${entry.medicationName}" from treatments? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userEmail || !patch) return
            await deleteTreatmentLog(userEmail, entry.id, patch.id)
            await loadTreatments()
            // Background sync
            apiRequest(`/sync/treatments/${entry.id}`, { method: 'DELETE' }).catch(() => {})
          },
        },
      ],
    )
  }

  const handleStressBandTap = (weekKey: string, avgStress: number) => {
    setActiveStressBand({ weekKey, avgStress })
    if (stressBandTimer.current) clearTimeout(stressBandTimer.current)
    stressBandTimer.current = setTimeout(() => setActiveStressBand(null), 4000)
  }

  const handleScanNow = () =>
    router.push(`/scan/${encodeURIComponent(bodyLocation)}`)

  const handleReport = () =>
    router.push(`/report/${encodeURIComponent(bodyLocation)}`)

  // Sorted scans (ascending by date)
  const scans: ProgressEntry[] = (patch?.scans ?? []).map((s) =>
    scanToProgressEntry(s, userId ?? '', bodyLocation),
  )
  const sorted = [...scans].sort((a, b) => a.scanDate.localeCompare(b.scanDate))
  const latest = sorted[sorted.length - 1]
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null
  const changeFromLast =
    prev && latest ? latest.affectedPercent - prev.affectedPercent : null

  // VASI for the hero stat — prefer stored value, fall back to on-the-fly
  const latestVASI = useMemo(() => {
    if (!latest) return 0
    if (latest.vasiScore !== undefined && !isNaN(latest.vasiScore)) {
      return latest.vasiScore
    }
    return computeVASI(bodyLocation, latest.affectedPercent)
  }, [latest, bodyLocation])

  const vasiSeverity = getVASISeverity(latestVASI)

  // Treatment marks for chart
  const treatmentMarks = useMemo(
    () => treatments.map((t) => ({ startDate: t.startDate, medicationName: t.medicationName })),
    [treatments],
  )

  // Repigmentation velocity (requires 4+ scans)
  const velocityResult = useMemo((): RepigmentationVelocityResult | null => {
    if (!patch || patch.scans.length < 4) return null
    return computeRepigmentationVelocity(patch.scans)
  }, [patch])

  // Export handler for Patch Detail bottom button
  const handleExportReport = async () => {
    if (exportingRef.current || !patch || !userEmail) return
    exportingRef.current = true
    setIsExporting(true)
    setExportError(null)

    const today = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(today.getDate() - 30)
    const dateRange = {
      start: thirtyDaysAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0],
    }

    const result = await exportPatchReportAsPDF({
      patch,
      scans: patch.scans,
      treatments,
      velocityResult,
      dateRange,
      userName: userName ?? userEmail,
    })

    setIsExporting(false)
    exportingRef.current = false

    if (!result.success) {
      setExportError(result.error ?? 'Report generation failed. Try again.')
      setTimeout(() => setExportError(null), 3000)
    }
  }

  return (
    <View style={styles.screen}>
      {/* ── Navigation Header ──────────────────────────────────────── */}
      <AppHeader
        title={bodyLocation}
        subtitle={
          !loading && sorted.length > 0
            ? `${sorted.length} scan${sorted.length !== 1 ? 's' : ''}`
            : undefined
        }
        onBack={() => router.back()}
        rightAction={
          sorted.length > 0 ? (
            <TouchableOpacity onPress={handleReport} hitSlop={8}>
              <Text style={styles.reportLink}>Report</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: layout.bottomTabOffset + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {loading ? (
          /* ── Loading Skeletons ───────────────────────────────────── */
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: spacing.md }}>
            {/* Hero card skeleton */}
            <Skeleton width="100%" height={96} radius={20} />
            {/* Chart section skeleton */}
            <Skeleton width="45%" height={14} radius={6} style={{ marginTop: spacing.md }} />
            <Skeleton width="100%" height={180} radius={16} />
            {/* Scan history skeleton */}
            <Skeleton width="45%" height={14} radius={6} style={{ marginTop: spacing.md }} />
            <Skeleton width="100%" height={64} radius={16} />
            <Skeleton width="100%" height={64} radius={16} />
          </Animated.View>
        ) : sorted.length === 0 ? (
          /* ── Empty State ─────────────────────────────────────────── */
          <Animated.View entering={FadeIn.duration(400)}>
            <EmptyState
              title="No scans yet"
              subtitle="Take your first scan to start tracking this area."
              cta={{ label: 'Scan Now', onPress: handleScanNow }}
            />
          </Animated.View>
        ) : (
          <>
            {/* ── Hero Stats Card ─────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              <Card level="hero" style={styles.heroCard}>
                <View style={styles.statsRow}>
                  <View style={styles.statMain}>
                    <Text style={styles.statMainValue}>
                      {latest.affectedPercent.toFixed(1)}
                      <Text style={styles.statMainUnit}>%</Text>
                    </Text>
                    <Text style={styles.statMainLabel}>AFFECTED</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <View style={styles.statSide}>
                    <Text style={styles.statSideValue}>
                      {latest.unaffectedPercent.toFixed(1)}%
                    </Text>
                    <Text style={styles.statSideLabel}>CLEAR SKIN</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <View style={styles.statSide}>
                    <Text style={styles.statSideValue}>
                      {isNaN(latestVASI) ? '0.00' : latestVASI.toFixed(2)}
                    </Text>
                    <Text style={styles.statSideLabel}>VASI</Text>
                    <Text style={[styles.vasiSeverityLabel, { color: vasiSeverity.color }]}>
                      {vasiSeverity.label}
                    </Text>
                  </View>

                  <View style={styles.statDivider} />

                  <View style={styles.statSide}>
                    {velocityResult === null ? (
                      <Text style={styles.statSideValue}>—</Text>
                    ) : velocityResult.isStable ? (
                      <Text style={styles.statSideValue}>Stable</Text>
                    ) : velocityResult.isImproving ? (
                      <Text style={[styles.statSideValue, { color: colors.success }]}>
                        −{Math.abs(velocityResult.velocityPerWeek).toFixed(1)}%/wk
                      </Text>
                    ) : (
                      <Text style={[styles.statSideValue, { color: colors.danger }]}>
                        +{Math.abs(velocityResult.velocityPerWeek).toFixed(1)}%/wk
                      </Text>
                    )}
                    <Text style={styles.statSideLabel}>WEEKLY</Text>
                    {velocityResult !== null && (
                      <Text style={[styles.vasiSeverityLabel, { color: colors.textTertiary }]}>
                        {velocityResult.projectionConfidence === 'high'
                          ? 'High conf.'
                          : velocityResult.projectionConfidence === 'medium'
                          ? 'Med. conf.'
                          : 'Low conf.'}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.heroMeta}>
                  <TrendBadge value={changeFromLast} label="vs last scan" />
                  <Text style={styles.heroDate}>
                    Last scanned {timeAgo(latest.scanDate)}
                  </Text>
                </View>
              </Card>
            </Animated.View>

            {/* ── Projected Timeline ──────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(60).duration(350).springify()}>
              <SectionLabel label="Projected timeline" style={styles.sectionLabel} />
              <Card style={styles.timelineCard}>
                {velocityResult === null ? (
                  <Text style={styles.timelineGray}>
                    Scan at least 4 times to see your repigmentation projection.
                  </Text>
                ) : velocityResult.isWorsening ? (
                  <Text style={styles.timelineAmber}>
                    This patch is currently growing. Projections are paused until the trend reverses.
                  </Text>
                ) : velocityResult.isStable ? (
                  <Text style={styles.timelineGray}>
                    This patch is stable. No significant change detected.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.timelineInsight}>
                      {generateVelocityInsightText(velocityResult)}
                    </Text>

                    {(() => {
                      const today = new Date()
                      const milestones: Array<{ target: string; days: number | null }> = [
                        { target: '50% affected', days: velocityResult.daysTo50Percent },
                        { target: '25% affected', days: velocityResult.daysTo25Percent },
                        { target: '10% affected', days: velocityResult.daysTo10Percent },
                      ]
                      const future = milestones.filter((m) => m.days !== null)
                      if (future.length === 0) {
                        return (
                          <Text style={styles.timelineGray}>
                            All tracked milestones reached. Continue monitoring.
                          </Text>
                        )
                      }
                      return (
                        <View style={styles.milestoneRow}>
                          {future.map((m) => {
                            const projDate = new Date(today)
                            projDate.setDate(today.getDate() + m.days!)
                            const label = projDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                            return (
                              <View key={m.target} style={styles.milestoneCard}>
                                <Text style={styles.milestoneTarget}>{m.target}</Text>
                                <Text style={styles.milestoneDate}>~{label}</Text>
                                <Text style={styles.milestoneDays}>{m.days} days</Text>
                              </View>
                            )
                          })}
                        </View>
                      )
                    })()}

                    <Text style={styles.confidenceNote}>
                      Projection based on {velocityResult.scanCount} scans over{' '}
                      {velocityResult.daysSinceFirstScan} days.
                      {velocityResult.projectionConfidence === 'low'
                        ? ' More scans will improve accuracy.'
                        : ''}
                    </Text>
                  </>
                )}
              </Card>
            </Animated.View>

            {/* ── Progression Chart ───────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(80).duration(350).springify()}>
              <SectionLabel label="Progression" style={styles.sectionLabel} />
              <Card style={styles.chartCard} padding={spacing.lg}>
                {/* Stress overlay toggle — only shown when weekly data exists */}
                {weeklyStress.length > 0 && (
                  <TouchableOpacity
                    style={styles.stressOverlayToggle}
                    onPress={() => setShowStressOverlay((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.stressOverlayDot,
                        { backgroundColor: showStressOverlay ? colors.primary : colors.border },
                      ]}
                    />
                    <Text style={styles.stressOverlayLabel}>
                      {showStressOverlay ? 'Stress overlay on' : 'Stress overlay off'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Stress band tooltip */}
                {activeStressBand && (
                  <View style={styles.stressTooltip}>
                    <Text style={styles.stressTooltipText}>
                      Week of {activeStressBand.weekKey} · avg stress {activeStressBand.avgStress}/5
                    </Text>
                  </View>
                )}

                <ErrorBoundary
                  fallback={
                    <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.textTertiary, fontSize: 14 }}>
                        Chart unavailable
                      </Text>
                    </View>
                  }
                >
                  <LineChart
                    data={sorted}
                    treatments={treatmentMarks}
                    velocityResult={velocityResult}
                    weeklyStress={weeklyStress}
                    showStressOverlay={showStressOverlay}
                    onStressBandTap={handleStressBandTap}
                    height={180}
                  />
                </ErrorBoundary>
              </Card>
            </Animated.View>

            {/* ── Chat ──────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(120).duration(350).springify()}>
              <SectionLabel label="Ask a Question" style={styles.sectionLabel} />
              <AIChatCard
                bodyLocation={bodyLocation}
                scans={sorted}
                vasiScore={latestVASI}
                changeFromLast={changeFromLast}
              />
            </Animated.View>

            {/* ── Scan History ────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(160).duration(350).springify()}>
              <SectionLabel
                label="Scan History"
                style={styles.sectionLabel}
                action={
                  <Text style={styles.countLabel}>
                    {sorted.length} scan{sorted.length !== 1 ? 's' : ''}
                  </Text>
                }
              />
              <Card padding={0} style={styles.historyCard}>
                {[...sorted].reverse().map((scan, i) => {
                  const originalIndex = sorted.length - 1 - i
                  const prevScan = originalIndex > 0 ? sorted[originalIndex - 1] : null
                  const delta = prevScan
                    ? scan.affectedPercent - prevScan.affectedPercent
                    : null
                  return (
                    <ReanimatedSwipeable
                      key={scan.id}
                      renderRightActions={() => (
                        <DeleteAction
                          onPress={() => handleDeleteScan(scan.id, scan.scanDate)}
                        />
                      )}
                      overshootRight={false}
                    >
                      <ScanHistoryRow
                        scan={scan}
                        change={delta}
                        isFirst={i === 0}
                      />
                    </ReanimatedSwipeable>
                  )
                })}
              </Card>
            </Animated.View>

            {/* ── Insights ──────────────────────────────────────── */}
            {sorted.length >= 3 && patch && (
              <Animated.View entering={FadeInDown.delay(240).duration(350).springify()}>
                <SectionLabel label="Insights" style={styles.sectionLabel} />
                <InsightCard
                  patchId={patch.id}
                  bodyLocation={bodyLocation}
                  scanHistory={patch.scans}
                />
              </Animated.View>
            )}

            {/* ── Treatments ──────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(300).duration(350).springify()}>
              <View style={styles.treatmentsSectionHeader}>
                <SectionLabel label="Treatments" style={styles.sectionLabelInline} />
                <TouchableOpacity
                  style={styles.addTreatmentBtn}
                  onPress={() => setShowAddTreatment(true)}
                  hitSlop={8}
                >
                  <Text style={styles.addTreatmentBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              <Card padding={0} style={styles.treatmentsCard}>
                {treatments.length === 0 ? (
                  <View style={styles.treatmentsEmpty}>
                    <Text style={styles.treatmentsEmptyText}>
                      No treatments logged yet. Tap + Add to log one.
                    </Text>
                  </View>
                ) : (
                  treatments.map((entry, i) => (
                    <ReanimatedSwipeable
                      key={entry.id}
                      renderRightActions={() => (
                        <DeleteAction onPress={() => handleDeleteTreatment(entry)} />
                      )}
                      overshootRight={false}
                    >
                      <TreatmentRow entry={entry} isFirst={i === 0} />
                    </ReanimatedSwipeable>
                  ))
                )}
              </Card>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* ── Sticky bottom bar ──────────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.bottomBarRow}>
          <Button label="Scan Now" onPress={handleScanNow} style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.exportBtn, isExporting && { opacity: 0.6 }]}
            onPress={handleExportReport}
            disabled={isExporting}
            activeOpacity={0.75}
          >
            <Text style={styles.exportBtnText}>
              {isExporting ? 'Generating…' : '↗ Export report'}
            </Text>
          </TouchableOpacity>
        </View>
        {exportError !== null && (
          <Text style={styles.exportError}>{exportError}</Text>
        )}
      </View>

      {/* ── Add Treatment Modal ────────────────────────────────────── */}
      {patch && (
        <AddTreatmentModal
          visible={showAddTreatment}
          patchId={patch.id}
          userId={userId ?? ''}
          userEmail={userEmail ?? ''}
          onSaved={loadTreatments}
          onClose={() => setShowAddTreatment(false)}
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPage },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
  },

  // ── Header ───────────────────────────────────────────────────────────
  reportLink: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },

  // ── Section labels ───────────────────────────────────────────────────
  sectionLabel: { marginTop: spacing['2xl'], marginBottom: spacing.md },
  sectionLabelInline: { marginTop: 0, marginBottom: 0, flex: 1 },
  countLabel: { ...typography.caption, color: colors.textTertiary },

  // ── Hero stats card ──────────────────────────────────────────────────
  heroCard: { paddingBottom: spacing.xl },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statMain: { flex: 1.2, alignItems: 'center' },
  statMainValue: {
    fontSize: 46,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -2.5,
    lineHeight: 52,
  },
  statMainUnit: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryLight,
    letterSpacing: -0.5,
  },
  statMainLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 4,
    letterSpacing: 1.2,
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.sm,
  },
  statSide: { flex: 1, alignItems: 'center', minWidth: 0 },
  statSideValue: {
    ...typography.h3,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  statSideLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  vasiSeverityLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    lineHeight: 14,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  heroDate: { ...typography.caption, color: colors.textTertiary },

  // ── Chart card ───────────────────────────────────────────────────────
  chartCard: { overflow: 'hidden' },
  stressOverlayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  stressOverlayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stressOverlayLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  stressTooltip: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  stressTooltipText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '600',
  },

  // ── History card ─────────────────────────────────────────────────────
  historyCard: { overflow: 'hidden' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bgCard,
  },
  historyRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.bgSubtle,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 20 },
  historyInfo: { flex: 1 },
  historyDate: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  historyMeta: { ...typography.caption, color: colors.textTertiary },

  // ── Swipe delete ─────────────────────────────────────────────────────
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    gap: 4,
  },
  deleteActionText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '700',
  },

  // ── Treatments section ───────────────────────────────────────────────
  treatmentsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing['2xl'],
    marginBottom: spacing.md,
  },
  addTreatmentBtn: {
    backgroundColor: colors.primarySubtle,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  addTreatmentBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  treatmentsCard: { overflow: 'hidden' },
  treatmentsEmpty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  treatmentsEmptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // ── Treatment row ─────────────────────────────────────────────────────
  treatmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bgCard,
  },
  treatmentRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  treatmentMain: { flex: 1 },
  treatmentHeader: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  treatmentName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  treatmentDose: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  treatmentStartDate: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  treatmentNotes: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  treatmentStatus: { alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 2 },
  activeBadge: {
    backgroundColor: colors.successSubtle,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  endedText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'right',
    lineHeight: 16,
  },

  // ── Projected timeline card ──────────────────────────────────────────
  timelineCard: { paddingBottom: spacing.md },
  timelineGray: { ...typography.body, color: colors.textTertiary },
  timelineAmber: { ...typography.body, color: colors.warning },
  timelineInsight: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  milestoneRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  milestoneCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
  },
  milestoneTarget: {
    ...typography.label,
    fontSize: 8,
    color: colors.textTertiary,
    marginBottom: 2,
    textAlign: 'center',
  },
  milestoneDate: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
  milestoneDays: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  confidenceNote: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },

  // ── Bottom CTA bar ───────────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.bgPage,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  bottomBarRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  exportBtn: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  exportError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // ── Add Treatment Modal ───────────────────────────────────────────────
  modalScreen: { flex: 1, backgroundColor: colors.bgPage },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalCancel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  modalSave: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '700',
  },
  modalScroll: { flex: 1 },
  modalContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: 60,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  fieldLabelSpaced: { marginTop: spacing.lg },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgCard,
  },
  inputError: { borderColor: colors.danger },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesInput: { minHeight: 96 },
  charCount: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: 4,
  },
  saveBtn: { marginTop: spacing['2xl'] },
})
