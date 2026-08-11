/**
 * Settings Tab
 *
 * Layout:
 *   ┌─ Header (inline)
 *   ├─ Account card  (name, email, user ID)
 *   ├─ Scan reminders card (toggle + day picker + time picker + label)
 *   ├─ About card    (Replay Onboarding)
 *   ├─ Medical disclaimer (amber card)
 *   └─ Danger zone   (Sign Out)
 */

import React, { useEffect, useState } from 'react'
import {
  Alert,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import * as SecureStore from 'expo-secure-store'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore } from '../../src/store/appStore'
import {
  signOut,
  deleteAccount,
  setOnboardingDone as persistOnboardingDone,
} from '../../src/lib/auth'
import {
  requestNotificationPermissions,
  scheduleWeeklyScanReminder,
  cancelScanReminder,
  registerStressNotificationCategory,
  scheduleDailyStressReminder,
  cancelDailyStressReminder,
  sendTestStressNotification,
} from '../../src/services/notifications'
import { Card } from '../../src/components/ui/Card'
import { SectionLabel } from '../../src/components/ui/SectionLabel'
import { colors, layout, radii, spacing, typography } from '../../src/theme'
import { storageKeys } from '../../src/config'

const PRIVACY_POLICY_URL = 'https://vitimeasure.com/privacy'

// ─── SecureStore keys for notification preferences ────────────────────────────

const PREF_ENABLED = storageKeys.scanReminderEnabled
const PREF_DAY    = storageKeys.scanReminderDay
const PREF_HOUR   = storageKeys.scanReminderHour
const PREF_MINUTE = storageKeys.scanReminderMinute

// ─── Settings Row ─────────────────────────────────────────────────────────────

type RowProps = {
  label: string
  value?: string
  onPress?: () => void
  danger?: boolean
  isFirst?: boolean
}

function SettingsRow({ label, value, onPress, danger, isFirst }: RowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, !isFirst && styles.rowBorder]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>
        {label}
      </Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Text style={[styles.rowChevron, danger && styles.rowLabelDanger]}>›</Text> : null}
    </TouchableOpacity>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Hours available for scheduling: 6 AM through 9 PM
const HOUR_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h} ${ampm}`
}

function formatReminderLabel(day: number, hour: number, minute: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const m = minute.toString().padStart(2, '0')
  return `You will be reminded every ${DAY_NAMES_FULL[day]} at ${h}:${m} ${ampm}`
}

// ─── Scan Reminders Section ───────────────────────────────────────────────────

function ScanRemindersSection() {
  const [enabled, setEnabled]       = useState(false)
  const [day, setDay]               = useState(0)     // 0 = Sunday
  const [hour, setHour]             = useState(9)     // 9 AM default
  const [minute]                    = useState(0)     // always :00
  const [showDenied, setShowDenied] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Load saved preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      const [savedEnabled, savedDay, savedHour, savedMinute] = await Promise.all([
        SecureStore.getItemAsync(PREF_ENABLED),
        SecureStore.getItemAsync(PREF_DAY),
        SecureStore.getItemAsync(PREF_HOUR),
        SecureStore.getItemAsync(PREF_MINUTE),
      ])
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true')
      if (savedDay    !== null) setDay(parseInt(savedDay, 10))
      if (savedHour   !== null) setHour(parseInt(savedHour, 10))
      // minute is always 0 — savedMinute retained for completeness
      setPrefsLoaded(true)
    }
    loadPrefs()
  }, [])

  const handleToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermissions()
      if (!granted) {
        setShowDenied(true)
        return
      }
      setShowDenied(false)
      setEnabled(true)
      await SecureStore.setItemAsync(PREF_ENABLED, 'true')
      await scheduleWeeklyScanReminder(day, hour, minute)
    } else {
      setEnabled(false)
      setShowDenied(false)
      await SecureStore.setItemAsync(PREF_ENABLED, 'false')
      await cancelScanReminder()
    }
  }

  const handleDayChange = async (newDay: number) => {
    setDay(newDay)
    await SecureStore.setItemAsync(PREF_DAY, String(newDay))
    if (enabled) {
      await scheduleWeeklyScanReminder(newDay, hour, minute)
    }
  }

  const handleHourChange = async (newHour: number) => {
    setHour(newHour)
    await SecureStore.setItemAsync(PREF_HOUR, String(newHour))
    if (enabled) {
      await scheduleWeeklyScanReminder(day, newHour, minute)
    }
  }

  if (!prefsLoaded) return null

  return (
    <>
      <SectionLabel label="Reminders" style={styles.sectionLabel} />
      <Card padding={0} style={styles.groupCard}>
        {/* Toggle row */}
        <View style={[styles.row, styles.toggleRow]}>
          <Text style={styles.rowLabel}>Scan reminders</Text>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.bgCard}
          />
        </View>

        {/* Permission denied message */}
        {showDenied && (
          <View style={styles.deniedBanner}>
            <Text style={styles.deniedText}>
              Enable notifications in your device Settings to use scan reminders.
            </Text>
          </View>
        )}

        {/* Day + time pickers — only visible when enabled */}
        {enabled && (
          <>
            {/* Day of week picker */}
            <View style={[styles.pickerSection, styles.rowBorder]}>
              <Text style={styles.pickerLabel}>Day of week</Text>
              <View style={styles.dayRow}>
                {DAY_NAMES_SHORT.map((name, index) => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.dayBtn, day === index && styles.dayBtnActive]}
                    onPress={() => handleDayChange(index)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayBtnText, day === index && styles.dayBtnTextActive]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hour picker */}
            <View style={[styles.pickerSection, styles.rowBorder]}>
              <Text style={styles.pickerLabel}>Time</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hourRow}
              >
                {HOUR_OPTIONS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.hourBtn, hour === h && styles.hourBtnActive]}
                    onPress={() => handleHourChange(h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.hourBtnText, hour === h && styles.hourBtnTextActive]}>
                      {formatHour(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Current schedule label */}
            <View style={[styles.scheduleLabel, styles.rowBorder]}>
              <Text style={styles.scheduleLabelText}>
                {formatReminderLabel(day, hour, minute)}
              </Text>
            </View>
          </>
        )}
      </Card>
    </>
  )
}

// ─── Stress Check-In Section ──────────────────────────────────────────────────

const STRESS_PREF_ENABLED = storageKeys.stressCheckInEnabled
const STRESS_PREF_HOUR    = storageKeys.stressCheckInHour
const STRESS_PREF_MINUTE  = storageKeys.stressCheckInMinute

function StressCheckInSection() {
  const [enabled, setEnabled]           = useState(false)
  const [hour, setHour]                 = useState(20)    // 8 PM default
  const [minute]                        = useState(0)
  const [showDenied, setShowDenied]     = useState(false)
  const [prefsLoaded, setPrefsLoaded]   = useState(false)

  useEffect(() => {
    async function loadPrefs() {
      const [savedEnabled, savedHour] = await Promise.all([
        SecureStore.getItemAsync(STRESS_PREF_ENABLED),
        SecureStore.getItemAsync(STRESS_PREF_HOUR),
      ])
      if (savedEnabled !== null) setEnabled(savedEnabled === 'true')
      if (savedHour    !== null) setHour(parseInt(savedHour, 10))
      setPrefsLoaded(true)
    }
    loadPrefs()
  }, [])

  const handleToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermissions()
      if (!granted) {
        setShowDenied(true)
        return
      }
      setShowDenied(false)
      setEnabled(true)
      await SecureStore.setItemAsync(STRESS_PREF_ENABLED, 'true')
      await registerStressNotificationCategory()
      await scheduleDailyStressReminder(hour, minute)
    } else {
      setEnabled(false)
      setShowDenied(false)
      await SecureStore.setItemAsync(STRESS_PREF_ENABLED, 'false')
      await cancelDailyStressReminder()
    }
  }

  const handleHourChange = async (newHour: number) => {
    setHour(newHour)
    await SecureStore.setItemAsync(STRESS_PREF_HOUR, String(newHour))
    if (enabled) {
      await scheduleDailyStressReminder(newHour, minute)
    }
  }

  const formatStressHour = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${display} ${ampm}`
  }

  const formatStressLabel = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `You will be asked every day at ${display}:00 ${ampm}`
  }

  if (!prefsLoaded) return null

  return (
    <>
      <SectionLabel label="Daily stress check-in" style={styles.sectionLabel} />
      <Card padding={0} style={styles.groupCard}>
        {/* Toggle row */}
        <View style={[styles.row, styles.toggleRow]}>
          <Text style={styles.rowLabel}>Daily stress check-in</Text>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.bgCard}
          />
        </View>

        {/* Permission denied message */}
        {showDenied && (
          <View style={styles.deniedBanner}>
            <Text style={styles.deniedText}>
              Enable notifications in your device Settings to use stress check-ins.
            </Text>
          </View>
        )}

        {/* Time picker — only visible when enabled */}
        {enabled && (
          <>
            <View style={[styles.pickerSection, styles.rowBorder]}>
              <Text style={styles.pickerLabel}>Time of day</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hourRow}
              >
                {HOUR_OPTIONS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.hourBtn, hour === h && styles.hourBtnActive]}
                    onPress={() => handleHourChange(h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.hourBtnText, hour === h && styles.hourBtnTextActive]}>
                      {formatStressHour(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Schedule label */}
            <View style={[styles.scheduleLabel, styles.rowBorder]}>
              <Text style={styles.scheduleLabelText}>{formatStressLabel(hour)}</Text>
            </View>

            {/* Send test notification */}
            <TouchableOpacity
              style={[styles.stressPreview, styles.rowBorder]}
              onPress={async () => {
                const sent = await sendTestStressNotification()
                if (sent) {
                  Alert.alert('Test sent', 'You will receive the notification in ~3 seconds.')
                } else {
                  Alert.alert('Failed', 'Could not send test notification.')
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.stressPreviewTitle}>Send test notification</Text>
              <Text style={styles.stressPreviewHint}>
                Fires a real check-in notification in ~3 seconds so you can preview the action buttons.
              </Text>
            </TouchableOpacity>
          </>
        )}
      </Card>
    </>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { setSignedIn, setOnboardingDone, setUserId, setUserEmail, setUserName, userId, userEmail, userName, isSyncing } = useAppStore()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Your data is saved and will be available when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut()
            setUserId('')
            setUserEmail(null)
            setUserName(null)
            setSignedIn(false)
          },
        },
      ],
    )
  }

  const handleReplayOnboarding = async () => {
    await persistOnboardingDone(false)
    setOnboardingDone(false)
  }

  const handlePrivacyPolicy = () => {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'All your scans, progress data, and settings will be lost forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeleteError(null)
                      await deleteAccount()
                      setUserId('')
                      setUserEmail(null)
                      setUserName(null)
                      setSignedIn(false)
                    } catch (err) {
                      setDeleteError(
                        err instanceof Error ? err.message : 'Could not delete account. Please try again.',
                      )
                    }
                  },
                },
              ],
            )
          },
        },
      ],
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomTabOffset },
        ]}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          {isSyncing && (
            <View style={styles.syncRow}>
              <Text style={styles.syncDot}>●</Text>
              <Text style={styles.syncText}>Syncing to cloud…</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Account ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(60).duration(320).springify()}>
          <SectionLabel label="Account" style={styles.sectionLabel} />
          <Card padding={0} style={styles.groupCard}>
            {userName ? (
              <SettingsRow label="Name" value={userName} isFirst />
            ) : null}
            {userEmail ? (
              <SettingsRow label="Email" value={userEmail} isFirst={!userName} />
            ) : null}
            <SettingsRow
              label="User ID"
              value={userId ? `${userId.slice(0, 8)}…` : '—'}
              isFirst={!userName && !userEmail}
              onPress={userId ? () => Share.share({ message: userId }) : undefined}
            />
            <SettingsRow label="App Version" value="1.0.0" />
          </Card>
        </Animated.View>

        {/* ── Scan Reminders ───────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).duration(320).springify()}>
          <ScanRemindersSection />
        </Animated.View>

        {/* ── Daily Stress Check-In ────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(120).duration(320).springify()}>
          <StressCheckInSection />
        </Animated.View>

        {/* ── About ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(140).duration(320).springify()}>
          <SectionLabel label="About" style={styles.sectionLabel} />
          <Card padding={0} style={styles.groupCard}>
            <SettingsRow
              label="Replay Onboarding"
              onPress={handleReplayOnboarding}
              isFirst
            />
            <SettingsRow
              label="Privacy Policy"
              onPress={handlePrivacyPolicy}
            />
          </Card>
        </Animated.View>

        {/* ── Medical Disclaimer ───────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(180).duration(320)}>
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerTitle}>Medical Disclaimer</Text>
            <Text style={styles.disclaimerText}>
              VITImeasure is a personal tracking tool only. Measurements are estimates
              based on image analysis and are not a medical diagnosis. Always consult a
              qualified dermatologist for clinical evaluation and treatment decisions.
            </Text>
          </View>
        </Animated.View>

        {/* ── Delete account error ─────────────────────────────── */}
        {deleteError && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <View style={styles.deleteErrBox}>
              <Text style={styles.deleteErrText}>{deleteError}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Danger zone ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(220).duration(320)}>
          <Card level="danger" padding={0} style={styles.groupCard}>
            <SettingsRow
              label="Sign Out"
              onPress={handleSignOut}
              danger
              isFirst
            />
            <SettingsRow
              label="Delete Account"
              onPress={handleDeleteAccount}
              danger
            />
          </Card>
        </Animated.View>
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPage },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
  },

  header: { marginBottom: spacing['2xl'] },
  title: { ...typography.h1, color: colors.textPrimary },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  syncDot: {
    fontSize: 8,
    color: colors.primary,
    lineHeight: 14,
  },
  syncText: {
    ...typography.caption,
    color: colors.primary,
  },

  sectionLabel: { marginBottom: spacing.md, marginTop: spacing.sm },
  groupCard: { overflow: 'hidden', marginBottom: spacing.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  toggleRow: {
    justifyContent: 'space-between',
  },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  rowLabelDanger: { color: colors.danger },
  rowValue: { ...typography.bodySm, color: colors.textTertiary, marginRight: spacing.sm },
  rowChevron: { fontSize: 20, color: colors.textTertiary, fontWeight: '300' },

  // ── Permission denied banner ─────────────────────────────────────────
  deniedBanner: {
    backgroundColor: colors.warningSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.warningBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  deniedText: {
    ...typography.caption,
    color: colors.warning,
    lineHeight: 18,
  },

  // ── Picker sections ─────────────────────────────────────────────────
  pickerSection: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  pickerLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },

  // Day buttons
  dayRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dayBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    overflow: 'hidden',
  },
  dayBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  dayBtnTextActive: {
    color: colors.textOnPrimary,
  },

  // Hour chips
  hourRow: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  hourBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hourBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hourBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  hourBtnTextActive: {
    color: colors.textOnPrimary,
  },

  // Schedule label
  scheduleLabel: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  scheduleLabelText: {
    ...typography.bodySm,
    color: colors.primary,
    fontWeight: '600',
  },

  // ── Stress notification test button ──────────────────────────────────────────
  stressPreview: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  stressPreviewTitle: {
    ...typography.label,
    color: colors.primary,
    marginBottom: 4,
  },
  stressPreviewHint: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 17,
  },

  deleteErrBox: {
    backgroundColor: colors.dangerSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  deleteErrText: {
    ...typography.caption,
    color: colors.danger,
  },

  disclaimer: {
    backgroundColor: colors.warningSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  disclaimerTitle: { ...typography.label, color: colors.warning, marginBottom: spacing.sm },
  disclaimerText:  { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
})
