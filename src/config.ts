/**
 * VITImeasure runtime config
 *
 * Single source of truth for the API base URL, the EAS project id, and every
 * SecureStore key. Nothing else in the app should read `process.env` or write
 * a key string inline — duplicating either has silently diverged before.
 */

import Constants from 'expo-constants'

const FALLBACK_API_BASE =
  'https://vitimeasure-api-1.onrender.com'

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_API_BASE

if (__DEV__ && !process.env.EXPO_PUBLIC_API_BASE_URL) {
  console.warn(
    '[config] EXPO_PUBLIC_API_BASE_URL is not set — falling back to the production API. ' +
      'Copy .env.example to .env if this is not what you want.',
  )
}

/**
 * Read from app.json (`extra.eas.projectId`) so the id is declared once. The
 * literal fallback keeps push tokens working if `expoConfig` is unavailable at
 * runtime — it must stay in sync with app.json.
 */
export const EAS_PROJECT_ID: string =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId ?? 'f0640210-dd8b-4561-8476-6e0b68177d9e'

/** Every SecureStore key used by the app. */
export const storageKeys = {
  token: 'vitimeasure_token',
  session: 'vitimeasure_session',
  onboardingDone: 'onboardingDone',

  pushToken: 'expo_push_token',
  scanReminderId: 'scan_reminder_id',
  stressReminderId: 'stress_reminder_id',

  scanReminderEnabled: 'scan_reminder_enabled',
  scanReminderDay: 'scan_reminder_day',
  scanReminderHour: 'scan_reminder_hour',
  scanReminderMinute: 'scan_reminder_minute',

  stressCheckInEnabled: 'stress_checkin_enabled',
  stressCheckInHour: 'stress_checkin_hour',
  stressCheckInMinute: 'stress_checkin_minute',

  seenXaiTooltip: 'has_seen_xai_tooltip',
} as const
