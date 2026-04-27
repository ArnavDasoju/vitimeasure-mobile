/**
 * Sign In Screen
 *
 * UI:
 *   ┌─ Settings gear (absolute top-right)
 *   ├─ Amber "session expired" banner (dismissable, shows only when flagged)
 *   ├─ Logo circle + app name + tagline (centered)
 *   ├─ EMAIL field  →  inline error below
 *   ├─ PASSWORD field → inline error below
 *   ├─ Auth error banner (wrong password / locked / network)
 *   ├─ Sign In button (loading spinner while in-flight)
 *   ├─ Forgot password? link
 *   ├─ ── or ── divider
 *   └─ New here? Create account footer
 */

import React, { useRef, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAppStore } from '../../src/store/appStore'
import { signIn } from '../../src/lib/auth'
import { performInitialSync } from '../../src/services/cloudSync'
import { Button } from '../../src/components/ui/Button'
import { colors, gradients, layout, radii, spacing, typography } from '../../src/theme'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(v: string): string {
  if (!v.trim()) return 'Email is required'
  if (!EMAIL_RE.test(v.trim())) return 'Please enter a valid email address'
  return ''
}
function validatePassword(v: string): string {
  if (!v) return 'Password is required'
  return ''
}

// ─── Field component ──────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  value: string
  onChangeText: (t: string) => void
  placeholder: string
  error?: string
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'email-address'
  autoComplete?: 'email' | 'password' | 'off'
  textContentType?: 'emailAddress' | 'password'
  returnKeyType?: 'default' | 'next' | 'done' | 'go' | 'search' | 'send'
  onSubmitEditing?: () => void
  blurOnSubmit?: boolean
}

const Field = React.forwardRef<TextInput, FieldProps>(
  function Field({ label, error, ...inputProps }, ref) {
    const [focused, setFocused] = useState(false)
    return (
      <View style={fieldStyles.group}>
        <Text style={fieldStyles.label}>{label}</Text>
        <TextInput
          ref={ref}
          style={[
            fieldStyles.input,
            focused && fieldStyles.inputFocused,
            !!error && fieldStyles.inputError,
          ]}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {!!error && <Text style={fieldStyles.errorText}>{error}</Text>}
      </View>
    )
  },
)

const fieldStyles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: {
    ...typography.label,
    fontSize: 11,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputFocused: { borderColor: colors.borderFocus },
  inputError:   { borderColor: colors.danger },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 2,
  },
})

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SignInScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const {
    setSignedIn, setUserId, setUserEmail, setUserName,
    sessionExpired, setSessionExpired,
    setIsSyncing,
  } = useAppStore()

  const passwordRef = useRef<TextInput>(null)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [passErr,  setPassErr]  = useState('')
  const [authErr,  setAuthErr]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  // Clear field-level errors as user types; also clear inline auth error
  const handleEmailChange = (t: string) => {
    setEmail(t)
    if (emailErr) setEmailErr('')
    if (authErr)  setAuthErr(null)
  }
  const handlePasswordChange = (t: string) => {
    setPassword(t)
    if (passErr)  setPassErr('')
    if (authErr)  setAuthErr(null)
  }

  const handleSignIn = async () => {
    const eErr = validateEmail(email)
    const pErr = validatePassword(password)
    setEmailErr(eErr)
    setPassErr(pErr)
    if (eErr || pErr) return

    setLoading(true)
    setAuthErr(null)
    try {
      const session = await signIn(email.trim(), password)
      setUserId(session.userId)
      setUserEmail(session.email)
      setUserName(session.name)
      setSessionExpired(false)
      setSignedIn(true)

      // Background sync — do not await, do not block the UI
      const email_ = session.email
      setIsSyncing(true)
      performInitialSync(email_, session.userId).finally(() => setIsSyncing(false))
    } catch (err: any) {
      const msg: string = err?.message ?? ''
      if (msg.includes('Incorrect email') || err?.code === 'WRONG_PASSWORD') {
        setAuthErr('Incorrect email or password')
      } else if (msg.includes('Too many') || err?.code === 'TOO_MANY_ATTEMPTS') {
        setAuthErr('Too many attempts. Please wait 15 minutes.')
      } else if (msg.includes('Connection failed') || msg.includes('reach the server')) {
        setAuthErr('Connection failed. Check your internet and try again.')
      } else {
        setAuthErr('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSettingsPress = () => {
    Alert.alert('VITImeasure', 'Version 1.0.0\n\nAI-powered vitiligo tracking.')
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Settings gear ───────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.gearBtn, { top: insets.top + spacing.md }]}
        onPress={handleSettingsPress}
        hitSlop={12}
      >
        <Text style={styles.gearIcon}>⚙</Text>
      </TouchableOpacity>

      {/* ── Session expired amber banner ─────────────────────── */}
      {sessionExpired && (
        <View style={[styles.sessionBanner, { top: insets.top }]}>
          <Text style={styles.sessionBannerText}>
            Your session expired. Please sign in again.
          </Text>
          <TouchableOpacity
            onPress={() => setSessionExpired(false)}
            hitSlop={10}
            style={styles.sessionBannerClose}
          >
            <Text style={styles.sessionBannerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: sessionExpired
              ? insets.top + 96
              : insets.top + 56,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo / Brand ─────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.brand}>
          <View style={styles.logoCircle}>
            <LinearGradient
              colors={[...gradients.primaryHero]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.logoMark}>V</Text>
          </View>
          <Text style={styles.brandName}>VITImeasure</Text>
          <Text style={styles.brandTagline}>Track your skin. Own your progress.</Text>
        </Animated.View>

        {/* ── Form ────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(400).springify()}
          style={styles.form}
        >
          <Field
            label="EMAIL"
            value={email}
            onChangeText={handleEmailChange}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={emailErr}
          />

          <Field
            ref={passwordRef}
            label="PASSWORD"
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            error={passErr}
          />

          {/* Inline auth error — no Alert() */}
          {authErr && (
            <View style={styles.authErrBox}>
              <Text style={styles.authErrText}>{authErr}</Text>
            </View>
          )}

          <Button
            label="Sign In"
            onPress={handleSignIn}
            loading={loading}
            fullWidth
            style={styles.signInBtn}
          />

          <TouchableOpacity
            style={styles.forgotRow}
            onPress={() => router.push('/(auth)/forgot-password')}
            hitSlop={8}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Create account ───────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(400).springify()}
          style={styles.footer}
        >
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
            <Text style={styles.footerText}>
              New here?{'  '}
              <Text style={styles.footerLink}>Create account</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgPage },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    justifyContent: 'center',
  },

  // ── Gear button ──────────────────────────────────────────────────────
  gearBtn: {
    position: 'absolute',
    right: layout.screenPadding,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: {
    fontSize: 16,
    color: colors.primary,
  },

  // ── Session expired banner ────────────────────────────────────────────
  sessionBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  sessionBannerText: {
    flex: 1,
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '600',
    lineHeight: 18,
  },
  sessionBannerClose: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionBannerCloseText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Brand ────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    marginBottom: spacing['4xl'],
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoMark: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.textOnPrimary,
    letterSpacing: -1,
  },
  brandName: {
    ...typography.h1,
    color: colors.textPrimary,
    letterSpacing: -1,
    marginBottom: spacing.xs,
  },
  brandTagline: {
    ...typography.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // ── Form ─────────────────────────────────────────────────────────────
  form: { gap: spacing['2xl'] },

  authErrBox: {
    backgroundColor: colors.dangerSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.md,
  },
  authErrText: {
    ...typography.caption,
    color: colors.danger,
  },

  signInBtn: { marginTop: spacing.xs },

  forgotRow: { alignItems: 'center', paddingVertical: spacing.xs },
  forgotText: { ...typography.caption, color: colors.primary },

  // ── Footer ────────────────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    marginTop: spacing['2xl'],
    width: '100%',
  },
  footerText: { ...typography.body, color: colors.textSecondary },
  footerLink: { color: colors.primary, fontWeight: '600' },
})
