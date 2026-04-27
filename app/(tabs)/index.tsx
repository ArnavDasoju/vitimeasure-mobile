/**
 * Dashboard — Home Tab
 *
 * Layout:
 *   ┌─ Safe area top
 *   ├─ Greeting header (app name + date + refresh button)
 *   ├─ Weekly check-in prompt card (only when not completed this week)
 *   ├─ StressInsightCard (only when user has ≥1 check-in AND ≥1 scan)
 *   ├─ SummaryStrip (3 quick stats — only when patches exist)
 *   ├─ Section label "YOUR PATCHES"  +  "+ Add" link
 *   ├─ PatchCard × n  (swipe left to delete)  or  EmptyState
 *   └─ "Track new area" dashed card
 *
 * Data is loaded from expo-file-system via storage.ts, scoped to the
 * signed-in user's email. Refreshes automatically on tab focus.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import AnimatedRN, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Line, Path, Svg } from 'react-native-svg'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useAppStore } from '../../src/store/appStore'
import {
  getPatches,
  addPatch,
  deletePatch,
  patchToTracked,
  getWeeklyCheckIns,
  saveWeeklyCheckIn,
  getTodaysStressEntry,
  getDailyStressEntries,
  type StoredPatch,
  type StoredScan,
  type WeeklyCheckIn,
  type DailyStressEntry,
} from '../../src/lib/storage'
import { DailyStressTap } from '../../src/components/DailyStressTap'
import { apiRequest } from '../../src/services/apiClient'
import { syncToCloud } from '../../src/services/cloudSync'
import { getCurrentWeekKey, getWeekStartDate, hasCompletedCheckInThisWeek } from '../../src/utils/weekUtils'
import { PatchCard } from '../../src/components/dashboard/PatchCard'
import { SummaryStrip } from '../../src/components/dashboard/SummaryStrip'
import { StressInsightCard } from '../../src/components/StressInsightCard'
import { SectionLabel } from '../../src/components/ui/SectionLabel'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { PatchCardSkeleton } from '../../src/components/ui/Skeleton'
import { colors, gradients, layout, radii, spacing, typography } from '../../src/theme'
import type { TrackedPatch } from '../../src/types/app'

const BODY_LOCATIONS = [
  'Left Forearm', 'Right Forearm', 'Left Hand', 'Right Hand',
  'Left Leg', 'Right Leg', 'Face', 'Neck', 'Back', 'Chest',
  'Left Foot', 'Right Foot', 'Scalp',
]

// ─── Slider-style step selector (1–5) ────────────────────────────────────────

type StepSelectorProps = {
  value: number
  onChange: (v: number) => void
  labels: string[]
}

function StepSelector({ value, onChange, labels }: StepSelectorProps) {
  return (
    <View>
      <View style={sliderStyles.track}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            style={[sliderStyles.segment, value === n && sliderStyles.segmentActive]}
            onPress={() => onChange(n)}
            activeOpacity={0.7}
          >
            <Text style={[sliderStyles.segmentText, value === n && sliderStyles.segmentTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={sliderStyles.labelRow}>
        {labels.map((label, i) => (
          <Text key={i} style={[sliderStyles.labelText, value === i + 1 && sliderStyles.labelTextActive]}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  )
}

const sliderStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  segment: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  segmentTextActive: {
    color: colors.textOnPrimary,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelText: {
    fontSize: 9,
    color: colors.textTertiary,
    textAlign: 'center',
    flex: 1,
  },
  labelTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
})

// ─── Weekly check-in modal ────────────────────────────────────────────────────

const STEP_LABELS = [
  ['Very low', 'Low', 'Moderate', 'High', 'Very high'],
  ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent'],
  ['Very low', 'Low', 'Neutral', 'Good', 'Excellent'],
]

const STEP_QUESTIONS = [
  'How stressed have you felt this week?',
  'How well have you slept this week?',
  'How has your mood been this week?',
]

type CheckInModalProps = {
  visible: boolean
  userId: string
  userEmail: string
  onSaved: (checkIn: WeeklyCheckIn) => void
  onClose: () => void
}

function CheckInModal({ visible, userId, userEmail, onSaved, onClose }: CheckInModalProps) {
  const [step, setStep] = useState(1)
  const [stress, setStress] = useState(3)
  const [sleep, setSleep] = useState(3)
  const [mood, setMood] = useState(3)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (visible) {
      setStep(1)
      setStress(3)
      setSleep(3)
      setMood(3)
      setSaving(false)
      savingRef.current = false
    }
  }, [visible])

  const values = [stress, sleep, mood]
  const setters = [setStress, setSleep, setMood]

  async function handleSave() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)

    const weekKey = getCurrentWeekKey()
    const weekStartDate = getWeekStartDate(weekKey)
    const checkIn: WeeklyCheckIn = {
      id: `checkin_${userId}_${weekKey}`,
      userId,
      weekKey,
      weekStartDate,
      stressScore: stress,
      sleepScore: sleep,
      moodScore: mood,
      completedAt: new Date().toISOString(),
      syncedAt: null,
    }

    await saveWeeklyCheckIn(userEmail, checkIn)

    // Background sync — do not await before closing
    apiRequest('/sync/checkins', {
      method: 'POST',
      body: JSON.stringify({ checkIns: [checkIn] }),
    }).catch(() => {})

    setSaving(false)
    savingRef.current = false
    onSaved(checkIn)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={modalStyles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modalStyles.title}>Weekly Check-in</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step progress dots */}
        <View style={modalStyles.dotsRow}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[modalStyles.dot, step === n && modalStyles.dotActive]} />
          ))}
        </View>
        <Text style={modalStyles.stepLabel}>Step {step} of 3</Text>

        <ScrollView style={modalStyles.scroll} contentContainerStyle={modalStyles.content}>
          <Text style={modalStyles.question}>{STEP_QUESTIONS[step - 1]}</Text>

          <StepSelector
            value={values[step - 1]}
            onChange={setters[step - 1]}
            labels={STEP_LABELS[step - 1]}
          />

          <View style={modalStyles.buttonRow}>
            {step > 1 && (
              <Button
                label="Back"
                variant="outlined"
                onPress={() => setStep((s) => s - 1)}
                style={modalStyles.backBtn}
              />
            )}
            {step < 3 ? (
              <Button
                label="Next"
                onPress={() => setStep((s) => s + 1)}
                style={step > 1 ? modalStyles.nextBtnHalf : modalStyles.nextBtnFull}
                fullWidth={step === 1}
              />
            ) : (
              <Button
                label={saving ? 'Saving…' : 'Save check-in'}
                onPress={handleSave}
                style={modalStyles.nextBtnHalf}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const modalStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  cancel: { ...typography.bodyMedium, color: colors.textSecondary, width: 60 },
  title: { ...typography.h3, color: colors.textPrimary },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  stepLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  scroll: { flex: 1 },
  content: {
    padding: layout.screenPadding,
    paddingTop: spacing['2xl'],
  },
  question: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing['3xl'],
  },
  backBtn: { flex: 1 },
  nextBtnFull: { flex: 1 },
  nextBtnHalf: { flex: 1 },
})

// ─── Check-in prompt card ─────────────────────────────────────────────────────

type CheckInPromptProps = { onStart: () => void }

function CheckInPromptCard({ onStart }: CheckInPromptProps) {
  return (
    <Card style={promptStyles.card}>
      <View style={promptStyles.content}>
        <View style={promptStyles.text}>
          <Text style={promptStyles.title}>Weekly check-in</Text>
          <Text style={promptStyles.subtitle}>
            How has this week been? Takes 20 seconds.
          </Text>
        </View>
        <Button
          label="Start"
          onPress={onStart}
          size="sm"
          fullWidth={false}
          style={promptStyles.btn}
        />
      </View>
    </Card>
  )
}

const promptStyles = StyleSheet.create({
  card: { marginBottom: spacing.md + 2 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  text: { flex: 1 },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  btn: { minWidth: 72 },
})

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View style={[toastStyles.toast, { opacity }]}>
      <Text style={toastStyles.text}>Check-in saved! Keep it up.</Text>
    </Animated.View>
  )
}

const toastStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radii.full,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.sm + 4,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  text: {
    ...typography.bodySm,
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
})

// ─── Location picker modal ────────────────────────────────────────────────────

type ModalProps = {
  visible: boolean
  onClose: () => void
  onSelect: (loc: string) => void
  existing: string[]
}

function AddPatchModal({ visible, onClose, onSelect, existing }: ModalProps) {
  const [custom, setCustom] = useState('')
  const available = BODY_LOCATIONS.filter((l) => !existing.includes(l))

  useEffect(() => {
    if (!visible) setCustom('')
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Select Body Area</Text>

        <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
          {available.map((loc) => (
            <TouchableOpacity
              key={loc}
              style={styles.locationRow}
              onPress={() => { onSelect(loc); onClose() }}
            >
              <Text style={styles.locationText}>{loc}</Text>
              <Text style={styles.locationChevron}>›</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              placeholder="Or type a custom location…"
              placeholderTextColor={colors.textTertiary}
              value={custom}
              onChangeText={setCustom}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (custom.trim()) { onSelect(custom.trim()); onClose() }
              }}
            />
            {custom.trim().length > 0 && (
              <Button
                label="Add"
                onPress={() => { onSelect(custom.trim()); onClose() }}
                size="sm"
                fullWidth={false}
                style={styles.customBtn}
              />
            )}
          </View>
        </ScrollView>

        <Button label="Cancel" onPress={onClose} variant="ghost" style={styles.cancelBtn} />
      </View>
    </Modal>
  )
}

// ─── Delete action ────────────────────────────────────────────────────────────

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.deleteAction} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  )
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const insets = useSafeAreaInsets()
  const { userEmail, userId, userName, setIsSyncing } = useAppStore()

  const [patches, setPatches] = useState<StoredPatch[]>([])
  const [checkIns, setCheckIns] = useState<WeeklyCheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Daily stress state — separate from check-in state, does not touch existing state
  const [todaysStressEntry, setTodaysStressEntry] = useState<DailyStressEntry | null>(null)
  const [stressEntries, setStressEntries] = useState<DailyStressEntry[]>([])

  const loadData = useCallback(async () => {
    if (!userEmail) return
    const [stored, storedCheckIns] = await Promise.all([
      getPatches(userEmail),
      getWeeklyCheckIns(userEmail),
    ])
    setPatches(stored)
    setCheckIns(storedCheckIns)
    setLoading(false)
  }, [userEmail])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData]),
  )

  // Load daily stress data — separate effect, does not modify existing state
  useFocusEffect(
    useCallback(() => {
      if (!userEmail) return
      getTodaysStressEntry(userEmail).then(setTodaysStressEntry)
      getDailyStressEntries(userEmail).then(setStressEntries)
    }, [userEmail]),
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const handleAddPatch = async (location: string) => {
    if (!userEmail) return
    if (patches.some((p) => p.bodyLocation === location)) {
      Alert.alert('Already tracking', `${location} is already being tracked.`)
      return
    }
    await addPatch(userEmail, location)
    await loadData()

    setIsSyncing(true)
    syncToCloud(userEmail, userId!).finally(() => setIsSyncing(false))
  }

  const handleDeletePatch = (bodyLocation: string) => {
    Alert.alert(
      'Delete Patch',
      `Delete "${bodyLocation}" and all its scan history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userEmail) return
            const patch = patches.find((p) => p.bodyLocation === bodyLocation)
            await deletePatch(userEmail, bodyLocation)
            await loadData()

            if (patch) {
              apiRequest(`/sync/patches/${patch.id}`, { method: 'DELETE' }).catch(
                (err) => console.warn('[dashboard] cloud patch delete failed:', err),
              )
            }
          },
        },
      ],
    )
  }

  const handleStressLogged = (score: number) => {
    if (!userId) return
    const today = new Date().toISOString().split('T')[0]
    setTodaysStressEntry({
      id: `stress_${userId}_${today}`,
      userId,
      date: today,
      stressScore: score,
      source: 'in-app',
      loggedAt: new Date().toISOString(),
    })
  }

  const handleCheckInSaved = (checkIn: WeeklyCheckIn) => {
    setCheckIns((prev) => {
      const filtered = prev.filter((c) => c.weekKey !== checkIn.weekKey)
      return [...filtered, checkIn].sort((a, b) =>
        a.weekStartDate.localeCompare(b.weekStartDate),
      )
    })
    // Show toast
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastVisible(true)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2200)
  }

  const tracked: TrackedPatch[] = patches.map(patchToTracked)
  const totalScans = patches.reduce((sum, p) => sum + p.scans.length, 0)
  const allScans: StoredScan[] = patches.flatMap((p) => p.scans)
  const checkInDone = hasCompletedCheckInThisWeek(checkIns)
  const hasAnyCheckIn = checkIns.length > 0
  const hasAnyScan = allScans.length > 0

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: layout.bottomTabOffset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Hero Header ─────────────────────────────────────── */}
        <AnimatedRN.View entering={FadeIn.duration(500)} style={styles.heroHeader}>
          <LinearGradient
            colors={[...gradients.primaryHero]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroContent}>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroGreeting}>
                  {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
                </Text>
                <Text style={styles.heroAppName}>{userName || 'VITImeasure'}</Text>
                <Text style={styles.heroDate}>
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleRefresh}
                hitSlop={12}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M1 4v6h6" stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </AnimatedRN.View>

        {/* ── Weekly check-in prompt (hidden when done this week) ── */}
        {!loading && !checkInDone && (
          <AnimatedRN.View entering={FadeInDown.delay(40).duration(340).springify()}>
            <CheckInPromptCard onStart={() => setShowCheckIn(true)} />
          </AnimatedRN.View>
        )}

        {/* ── Daily stress tap (hidden once logged today) ──────── */}
        {!loading && todaysStressEntry === null && userEmail && userId && (
          <AnimatedRN.View entering={FadeInDown.delay(60).duration(340).springify()}>
            <DailyStressTap
              userEmail={userEmail}
              userId={userId}
              onLogged={handleStressLogged}
            />
          </AnimatedRN.View>
        )}

        {/* ── Stress insight card ──────────────────────────────── */}
        {!loading && hasAnyCheckIn && hasAnyScan && (
          <AnimatedRN.View entering={FadeInDown.delay(80).duration(340).springify()}>
            <StressInsightCard checkIns={checkIns} scans={allScans} />
          </AnimatedRN.View>
        )}

        {/* ── Summary Strip ─────────────────────────────────── */}
        {tracked.length > 0 && (
          <AnimatedRN.View entering={FadeInDown.delay(120).duration(340).springify()}>
            <SummaryStrip patches={tracked} totalScans={totalScans} />
          </AnimatedRN.View>
        )}

        {/* ── Patch List ───────────────────────────────────── */}
        <SectionLabel
          label="Your Patches"
          style={styles.sectionLabel}
          action={
            <TouchableOpacity onPress={() => setShowModal(true)} hitSlop={8}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          }
        />

        {loading ? (
          <>
            <PatchCardSkeleton />
            <PatchCardSkeleton />
          </>
        ) : tracked.length === 0 ? (
          <AnimatedRN.View entering={FadeInDown.delay(160).duration(340)}>
            <EmptyState
              title="No patches tracked yet"
              subtitle="Add a body area to start measuring your vitiligo progress."
              cta={{ label: 'Track First Patch', onPress: () => setShowModal(true) }}
            />
          </AnimatedRN.View>
        ) : (
          tracked.map((patch, i) => (
            <ReanimatedSwipeable
              key={patch.bodyLocation}
              renderRightActions={() => (
                <DeleteAction onPress={() => handleDeletePatch(patch.bodyLocation)} />
              )}
              overshootRight={false}
            >
              <PatchCard {...patch} index={i} />
            </ReanimatedSwipeable>
          ))
        )}

        {/* ── "Track New" dashed card ──────────────────────── */}
        {tracked.length > 0 && !loading && (
          <AnimatedRN.View
            entering={FadeInDown.delay(tracked.length * 80 + 140).duration(340)}
          >
            <TouchableOpacity
              style={styles.addCard}
              onPress={() => setShowModal(true)}
              activeOpacity={0.7}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Line x1={12} y1={5} x2={12} y2={19} stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
                <Line x1={5} y1={12} x2={19} y2={12} stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <Text style={styles.addCardText}>Track a new body area</Text>
            </TouchableOpacity>
          </AnimatedRN.View>
        )}
      </ScrollView>

      {/* ── Toast ────────────────────────────────────────────── */}
      <Toast visible={toastVisible} />

      {/* ── Add Location Modal ───────────────────────────────── */}
      <AddPatchModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSelect={handleAddPatch}
        existing={patches.map((p) => p.bodyLocation)}
      />

      {/* ── Weekly Check-in Modal ────────────────────────────── */}
      <CheckInModal
        visible={showCheckIn}
        userId={userId ?? ''}
        userEmail={userEmail ?? ''}
        onSaved={handleCheckInSaved}
        onClose={() => setShowCheckIn(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
  },

  // ── Hero Header ─────────────────────────────────────────────────
  heroHeader: {
    marginHorizontal: -layout.screenPadding,
    marginTop: -spacing['2xl'],
    marginBottom: spacing['2xl'],
  },
  heroGradient: {
    borderBottomLeftRadius: radii['2xl'],
    borderBottomRightRadius: radii['2xl'],
    paddingHorizontal: layout.screenPadding + 4,
    paddingTop: spacing['3xl'] + 8,
    paddingBottom: spacing['3xl'],
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroTextBlock: {
    flex: 1,
  },
  heroGreeting: {
    ...typography.bodySm,
    color: 'rgba(255, 255, 255, 0.65)',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  heroAppName: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textOnPrimary,
    letterSpacing: -1.2,
    lineHeight: 36,
    marginBottom: spacing.xs,
  },
  heroDate: {
    ...typography.bodySm,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  // ── Section Label ────────────────────────────────────────────────
  sectionLabel: { marginBottom: spacing.md },
  addLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },

  // ── Swipe delete action ──────────────────────────────────────────
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
    gap: 4,
  },
  deleteActionText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '700',
  },

  // ── Add dashed card ──────────────────────────────────────────────
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    backgroundColor: 'rgba(79, 70, 229, 0.03)',
  },
  addCardText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },

  // ── Modal ────────────────────────────────────────────────────────
  modalScrim: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
  },
  modalSheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
    maxHeight: '72%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalList: { maxHeight: 380 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  locationText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  locationChevron: {
    fontSize: 18,
    color: colors.textTertiary,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.textPrimary,
  },
  customBtn: { paddingHorizontal: 16 },
  cancelBtn: { marginTop: spacing.md },
})
