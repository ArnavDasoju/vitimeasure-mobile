/**
 * Root Layout — auth guard + global providers
 *
 * Launch flow:
 *  1. Read token from SecureStore
 *  2. If no token → signin screen
 *  3. If token present → decode and check exp claim
 *  4. If expired → clear token/session, set sessionExpired, → signin with banner
 *  5. If valid → restore session into Zustand, register logout callback,
 *     fire performInitialSync in background, → tabs
 */

import 'react-native-get-random-values'
import { useEffect, useRef, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SecureStore from 'expo-secure-store'
import * as SplashScreen from 'expo-splash-screen'
import { jwtDecode } from 'jwt-decode'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useAppStore } from '../src/store/appStore'
import { getSession, signOut } from '../src/lib/auth'
import { setLogoutCallback } from '../src/services/apiClient'
import { performInitialSync } from '../src/services/cloudSync'
import {
  getExpoPushToken,
  setupNotificationHandlers,
} from '../src/services/notifications'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { colors } from '../src/theme'

SplashScreen.preventAutoHideAsync()

const TOKEN_KEY = 'vitimeasure_token'

type JwtPayload = {
  userId: string
  email: string
  exp?: number
}

function AuthGuard() {
  const router = useRouter()
  const segments = useSegments()
  const {
    signedIn, setSignedIn,
    setUserId, setUserEmail, setUserName,
    onboardingDone, setOnboardingDone,
    setSessionExpired, setIsSyncing,
  } = useAppStore()
  const [ready, setReady] = useState(false)
  const notificationCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        // Register the global logout callback so apiClient can trigger it on 401
        setLogoutCallback(async () => {
          await signOut()
          setUserId('')
          setUserEmail(null)
          setUserName(null)
          setSessionExpired(true)
          setSignedIn(false)
        })

        let token: string | null = null
        let onboarded: string | null = null
        try {
          ;[token, onboarded] = await Promise.all([
            SecureStore.getItemAsync(TOKEN_KEY),
            SecureStore.getItemAsync('onboardingDone'),
          ])
        } catch {
          // SecureStore unavailable — treat as signed out
        }

        setOnboardingDone(onboarded === 'true')

        if (!token) {
          setSignedIn(false)
          return
        }

        // Decode and check expiry before trusting the stored session
        try {
          const decoded = jwtDecode<JwtPayload>(token)
          const isExpired = decoded.exp ? decoded.exp * 1000 < Date.now() : false

          if (isExpired) {
            await signOut()
            setSessionExpired(true)
            setSignedIn(false)
            return
          }

          // Token is valid — restore session from SecureStore
          const session = await getSession()
          if (session) {
            setUserId(session.userId)
            setUserEmail(session.email)
            setUserName(session.name)
            setSignedIn(true)

            // Fire initial sync in background — do NOT block the UI
            setIsSyncing(true)
            performInitialSync(session.email, session.userId)
              .catch(() => {
                // Sync failure is silent — local data is safe, retry on next launch
              })
              .finally(() => setIsSyncing(false))
          } else {
            // Token exists but session JSON is missing — clear and force re-login
            await signOut()
            setSessionExpired(true)
            setSignedIn(false)
          }
        } catch {
          // Malformed token
          await signOut()
          setSignedIn(false)
        }
      } finally {
        setReady(true)
        SplashScreen.hideAsync().catch(() => {})
      }
    }

    init()
  }, [])

  useEffect(() => {
    if (!ready) return
    const inAuth       = segments[0] === '(auth)'
    const inOnboarding = segments[0] === '(onboarding)'

    if (!signedIn) {
      if (!inAuth) router.replace('/(auth)/signin')
    } else if (!onboardingDone) {
      if (!inOnboarding) router.replace('/(onboarding)')
    } else {
      if (inAuth || inOnboarding) router.replace('/(tabs)')
    }
  }, [ready, signedIn, onboardingDone, segments])

  // Set up push notification handlers once per session after the user is authenticated.
  // Permissions are NOT requested automatically — the user must enable them via Settings.
  // Never blocks the app from loading — all failures are caught internally.
  useEffect(() => {
    if (!signedIn) {
      notificationCleanupRef.current?.()
      notificationCleanupRef.current = null
      return
    }

    let cancelled = false

    // Register handlers only; push token fetch is best-effort if already permitted.
    Promise.resolve().then(() => {
      if (cancelled) return
      getExpoPushToken().catch(() => {})
      notificationCleanupRef.current = setupNotificationHandlers()
    }).catch(() => {
      // Notification setup must never crash the app
    })

    return () => {
      cancelled = true
      notificationCleanupRef.current?.()
      notificationCleanupRef.current = null
    }
  }, [signedIn])

  return null
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <AuthGuard />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgPage },
              animation: 'slide_from_right',
            }}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}
