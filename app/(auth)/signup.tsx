/**
 * Create Account Screen
 *
 * Fields: Full Name · Email · Password · Confirm Password
 * Each field shows:
 *   - Red inline error below when invalid
 *   - Green checkmark inline when valid and touched
 */

import React, { useState } from 'react'
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAppStore } from '../../src/store/appStore'
import { createAccount } from '../../src/lib/auth'
import { AppHeader } from '../../src/components/ui/AppHeader'
import { Button } from '../../src/components/ui/Button'
import { colors, layout, radii, spacing, typography } from '../../src/theme'

// ─── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HAS_NUMBER = /\d/

function validateName(v: string) { return v.trim() ? '' : 'Name is required' }
function validateEmail(v: string) {
  if (!v.trim()) return 'Email is required'
  if (!EMAIL_RE.test(v.trim())) return 'Please enter a valid email address'
  return ''
}
function validatePassword(v: string) {
  if (v.length < 8 || !HAS_NUMBER.test(v))
    return 'Password must be at least 8 characters and include a number'
  return ''
}
function validateConfirm(pw: string, confirm: string) {
  if (!confirm) return 'Please confirm your password'
  if (pw !== confirm) return 'Passwords do not match'
  return ''
}

// ─── Field component ──────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  value: string
  onChangeText: (t: string) => void
  placeholder: string
  error?: string
  valid?: boolean
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'email-address'
  autoComplete?: 'name' | 'email' | 'new-password' | 'off'
  textContentType?: 'name' | 'emailAddress' | 'newPassword' | 'none'
  autoCapitalize?: 'none' | 'words'
}

function Field({ label, error, valid, ...inputProps }: FieldProps) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={fieldStyles.group}>
      <View style={fieldStyles.labelRow}>
        <Text style={fieldStyles.label}>{label}</Text>
        {valid && !error && <Text style={fieldStyles.checkmark}>✓</Text>}
      </View>
      <TextInput
        style={[
          fieldStyles.input,
          focused && fieldStyles.inputFocused,
          !!error && fieldStyles.inputError,
          valid && !error && fieldStyles.inputValid,
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
}

const fieldStyles = StyleSheet.create({
  group: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...typography.label, fontSize: 11, color: colors.textSecondary },
  checkmark: { fontSize: 14, color: colors.success, fontWeight: '700' },
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
  inputValid:   { borderColor: colors.success },
  errorText:    { ...typography.caption, color: colors.danger, marginTop: 2 },
})

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SignUpScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { setSignedIn, setUserId, setUserEmail, setUserName } = useAppStore()

  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [confirm, setConfirm] = useState('')

  const [nameErr,    setNameErr]    = useState('')
  const [emailErr,   setEmailErr]   = useState('')
  const [passErr,    setPassErr]    = useState('')
  const [confirmErr, setConfirmErr] = useState('')

  const [nameTouched,    setNameTouched]    = useState(false)
  const [emailTouched,   setEmailTouched]   = useState(false)
  const [passTouched,    setPassTouched]    = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)

  const [authErr, setAuthErr] = useState<{ msg: string; action?: { label: string; onPress: () => void } } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleNameChange = (t: string) => {
    setName(t); setNameTouched(true); setNameErr(validateName(t))
  }
  const handleEmailChange = (t: string) => {
    setEmail(t); setEmailTouched(true); setEmailErr(validateEmail(t))
    if (authErr) setAuthErr(null)
  }
  const handlePassChange = (t: string) => {
    setPass(t); setPassTouched(true); setPassErr(validatePassword(t))
    if (confirm) setConfirmErr(validateConfirm(t, confirm))
  }
  const handleConfirmChange = (t: string) => {
    setConfirm(t); setConfirmTouched(true); setConfirmErr(validateConfirm(pass, t))
  }

  const handleSubmit = async () => {
    const nErr = validateName(name)
    const eErr = validateEmail(email)
    const pErr = validatePassword(pass)
    const cErr = validateConfirm(pass, confirm)
    setNameErr(nErr); setEmailErr(eErr); setPassErr(pErr); setConfirmErr(cErr)
    setNameTouched(true); setEmailTouched(true); setPassTouched(true); setConfirmTouched(true)
    if (nErr || eErr || pErr || cErr) return

    setLoading(true)
    setAuthErr(null)
    try {
      const session = await createAccount(name.trim(), email.trim(), pass)
      setUserId(session.userId)
      setUserEmail(session.email)
      setUserName(session.name)
      setSignedIn(true)
    } catch (err: any) {
      if (err?.code === 'EMAIL_IN_USE') {
        setAuthErr({
          msg: 'Email already in use.',
          action: { label: 'Sign in instead?', onPress: () => router.replace('/(auth)/signin') },
        })
      } else {
        setAuthErr({ msg: 'Something went wrong. Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  const nameValid    = nameTouched    && !nameErr    && !!name.trim()
  const emailValid   = emailTouched   && !emailErr   && !!email.trim()
  const passValid    = passTouched    && !passErr    && !!pass
  const confirmValid = confirmTouched && !confirmErr && !!confirm

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* AppHeader handles safe-area top padding internally */}
      <AppHeader title="Create Account" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.titleBlock}>
          <Text style={styles.title}>Start tracking today</Text>
          <Text style={styles.subtitle}>
            Create your free account and start measuring your vitiligo progress.
          </Text>
        </Animated.View>

        {/* ── Form ───────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(400).springify()}
          style={styles.form}
        >
          {authErr && (
            <View style={styles.authErrBox}>
              <Text style={styles.authErrText}>
                {authErr.msg}
                {authErr.action && (
                  <>
                    {'  '}
                    <Text style={styles.authErrLink} onPress={authErr.action.onPress}>
                      {authErr.action.label}
                    </Text>
                  </>
                )}
              </Text>
            </View>
          )}

          <Field
            label="FULL NAME"
            value={name}
            onChangeText={handleNameChange}
            placeholder="Your name"
            error={nameErr}
            valid={nameValid}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />
          <Field
            label="EMAIL"
            value={email}
            onChangeText={handleEmailChange}
            placeholder="you@example.com"
            error={emailErr}
            valid={emailValid}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Field
            label="PASSWORD"
            value={pass}
            onChangeText={handlePassChange}
            placeholder="Min. 8 chars, include a number"
            error={passErr}
            valid={passValid}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label="CONFIRM PASSWORD"
            value={confirm}
            onChangeText={handleConfirmChange}
            placeholder="Re-enter your password"
            error={confirmErr}
            valid={confirmValid}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />

          <Button
            label="Create Account"
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            style={styles.submitBtn}
          />

          <Text style={styles.terms}>
            By creating an account you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://vitimeasure.com/terms')}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://vitimeasure.com/privacy')}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: colors.bgPage },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
  },

  titleBlock: { marginBottom: spacing['2xl'] },
  title:    { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  form: { gap: spacing.lg },

  authErrBox: {
    backgroundColor: colors.dangerSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.md,
  },
  authErrText: { ...typography.caption, color: colors.danger },
  authErrLink: { ...typography.caption, color: colors.danger, fontWeight: '700', textDecorationLine: 'underline' },

  submitBtn: { marginTop: spacing.sm },
  terms: {
    ...typography.micro,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
  termsLink: {
    ...typography.micro,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
})
