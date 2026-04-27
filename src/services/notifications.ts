/**
 * Notifications Service
 *
 * Guards against missing native module using NativeModules check —
 * the only reliable way in Hermes to detect a missing native module
 * without crashing (require() try-catch does NOT work in Hermes).
 */

import * as SecureStore from 'expo-secure-store'
import { NativeModules, Platform } from 'react-native'
import { router } from 'expo-router'
import { saveDailyStress } from '../lib/storage'
import { useAppStore } from '../store/appStore'

const PUSH_TOKEN_KEY = 'expo_push_token'
const REMINDER_ID_KEY = 'scan_reminder_id'
const STRESS_REMINDER_ID_KEY = 'stress_reminder_id'
const EAS_PROJECT_ID = 'f0640210-dd8b-4561-8476-6e0b68177d9e'

// Check if the native module exists before importing anything from expo-notifications.
// NativeModules check is synchronous and safe in Hermes — no try-catch needed.
const NOTIFICATIONS_AVAILABLE = !!NativeModules.ExpoPushTokenManager

// Only import if native module is present
// eslint-disable-next-line @typescript-eslint/no-var-requires
const N = NOTIFICATIONS_AVAILABLE
  ? (require('expo-notifications') as typeof import('expo-notifications'))
  : null

if (N) {
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
}

// ─── requestNotificationPermissions ──────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!N) return false
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('scan-reminders', {
        name: 'Scan Reminders',
        importance: N.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
      })
    }
    const { status } = await N.requestPermissionsAsync()
    return status === 'granted'
  } catch (err) {
    console.warn('[notifications] requestNotificationPermissions failed:', err)
    return false
  }
}

// ─── getExpoPushToken ─────────────────────────────────────────────────────────

export async function getExpoPushToken(): Promise<string | null> {
  if (!N) return null
  try {
    const tokenData = await N.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })
    const token = tokenData.data
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token)
    return token
  } catch (err) {
    console.warn('[notifications] getExpoPushToken failed:', err)
    return null
  }
}

// ─── scheduleWeeklyScanReminder ───────────────────────────────────────────────

export async function scheduleWeeklyScanReminder(
  dayOfWeek: number,
  hour: number,
  minute: number,
): Promise<string> {
  if (!N) return ''
  await cancelScanReminder()
  const id = await N.scheduleNotificationAsync({
    content: {
      title: 'Time to scan your patches',
      body: 'Track your vitiligo progress with a quick scan. It only takes a minute.',
      data: { type: 'scan_reminder' },
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.CALENDAR,
      weekday: dayOfWeek + 1,
      hour,
      minute,
      repeats: true,
    },
  })
  await SecureStore.setItemAsync(REMINDER_ID_KEY, id)
  return id
}

// ─── cancelScanReminder ───────────────────────────────────────────────────────

export async function cancelScanReminder(): Promise<void> {
  try {
    const id = await SecureStore.getItemAsync(REMINDER_ID_KEY)
    if (id) {
      if (N) await N.cancelScheduledNotificationAsync(id)
      await SecureStore.deleteItemAsync(REMINDER_ID_KEY)
    }
  } catch (err) {
    console.warn('[notifications] cancelScanReminder failed:', err)
  }
}

// ─── hasNotificationPermission ────────────────────────────────────────────────

export async function hasNotificationPermission(): Promise<boolean> {
  if (!N) return false
  try {
    const { status } = await N.getPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

// ─── registerStressNotificationCategory ──────────────────────────────────────

/**
 * Registers the STRESS_CHECK interactive notification category with 5 action
 * buttons (one per stress level). Must be called before scheduling stress
 * reminders.
 */
export async function registerStressNotificationCategory(): Promise<void> {
  if (!N) return
  try {
    await N.setNotificationCategoryAsync('STRESS_CHECK', [
      { identifier: 'STRESS_1', buttonTitle: '1 – Very Low',  options: { opensAppToForeground: false } },
      { identifier: 'STRESS_2', buttonTitle: '2 – Low',       options: { opensAppToForeground: false } },
      { identifier: 'STRESS_3', buttonTitle: '3 – Moderate',  options: { opensAppToForeground: false } },
      { identifier: 'STRESS_4', buttonTitle: '4 – High',      options: { opensAppToForeground: false } },
      { identifier: 'STRESS_5', buttonTitle: '5 – Very High', options: { opensAppToForeground: false } },
    ])
  } catch (err) {
    console.warn('[notifications] registerStressNotificationCategory failed:', err)
  }
}

// ─── scheduleDailyStressReminder ─────────────────────────────────────────────

export async function scheduleDailyStressReminder(
  hour: number,
  minute: number,
): Promise<string> {
  if (!N) return ''
  await cancelDailyStressReminder()
  const id = await N.scheduleNotificationAsync({
    content: {
      title: 'How stressed are you today?',
      body: 'Tap a number — takes 2 seconds',
      data: { type: 'daily_stress_check' },
      categoryIdentifier: 'STRESS_CHECK',
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  })
  await SecureStore.setItemAsync(STRESS_REMINDER_ID_KEY, id)
  return id
}

// ─── cancelDailyStressReminder ────────────────────────────────────────────────

export async function cancelDailyStressReminder(): Promise<void> {
  try {
    const id = await SecureStore.getItemAsync(STRESS_REMINDER_ID_KEY)
    if (id) {
      if (N) await N.cancelScheduledNotificationAsync(id)
      await SecureStore.deleteItemAsync(STRESS_REMINDER_ID_KEY)
    }
  } catch (err) {
    console.warn('[notifications] cancelDailyStressReminder failed:', err)
  }
}

// ─── setupNotificationHandlers ────────────────────────────────────────────────

export function setupNotificationHandlers(): () => void {
  if (!N) return () => {}

  const receivedSub = N.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as { type?: string }
    if (__DEV__ && data?.type === 'scan_reminder') {
      console.log('[notifications] Scan reminder received while app is open')
    }
  })

  const responseSub = N.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data as { type?: string }
    const actionIdentifier = response.actionIdentifier

    // ── Handle daily stress check-in notification ──────────────────────────
    if (data?.type === 'daily_stress_check') {
      if (actionIdentifier.startsWith('STRESS_')) {
        const score = parseInt(actionIdentifier.replace('STRESS_', ''), 10)
        if (score >= 1 && score <= 5) {
          const { userId, userEmail } = useAppStore.getState()
          if (userEmail) {
            const today = new Date().toISOString().split('T')[0]
            await saveDailyStress(userEmail, {
              id: `stress_${userId}_${today}`,
              userId: userId ?? '',
              date: today,
              stressScore: score,
              source: 'notification',
              loggedAt: new Date().toISOString(),
            })
          }
        }
      }
      if (actionIdentifier === N.DEFAULT_ACTION_IDENTIFIER) {
        router.replace('/(tabs)')
      }
      return  // safety gate — prevents scan_reminder logic from running
    }
    // ── ALL EXISTING CODE BELOW IS UNTOUCHED ──────────────────────────────
    if (data?.type === 'scan_reminder') {
      router.replace('/(tabs)')
    }
  })

  return () => {
    receivedSub.remove()
    responseSub.remove()
  }
}

// ─── sendTestStressNotification ───────────────────────────────────────────────

export async function sendTestStressNotification(): Promise<boolean> {
  if (!N) return false
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: 'How stressed are you today?',
        body: 'Tap a number — takes 2 seconds',
        data: { type: 'daily_stress_check' },
        categoryIdentifier: 'STRESS_CHECK',
      },
      trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, repeats: false },
    })
    return true
  } catch (err) {
    console.warn('[notifications] sendTestStressNotification failed:', err)
    return false
  }
}
