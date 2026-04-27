/**
 * Forgot Password Screen
 *
 * Calls POST /auth/forgot-password — backend always returns 200 regardless
 * of whether the email exists (prevents user enumeration).
 * Email delivery is not yet wired; the backend stub is in place.
 */

import React, { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { AppHeader } from '../../src/components/ui/AppHeader'
import { Button } from '../../src/components/ui/Button'
import { apiRequest } from '../../src/services/apiClient'
import { colors, layout, radii, spacing, typography } from '../../src/theme'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [email,     setEmail]     = useState('')
  const [emailErr,  setEmailErr]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [apiMsg,    setApiMsg]    = useState('')

  const handleEmailChange = (t: string) => {
    setEmail(t)
    if (emailErr) setEmailErr('')
  }

  const handleSubmit = async () => {
    const trimmed = email.trim()
    if (!trimmed) { setEmailErr('Email is required'); return }
    if (!EMAIL_RE.test(trimmed)) { setEmailErr('Please enter a valid email address'); return }

    setLoading(true)
    try {
      const res = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: trimmed }),
      })
      setApiMsg(res.message ?? 'Check your inbox for reset instructions.')
      setSubmitted(true)
    } catch (err: any) {
      // Even on error, show the same generic message to prevent enumeration
      setApiMsg('If that email is registered, reset instructions have been sent.')
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppHeader title="Reset Password" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {submitted ? (

          // ── Success state ──────────────────────────────────────
          <Animated.View entering={FadeInDown.duration(350)} style={styles.successBox}>
            <Text style={styles.successTitle}>Check your inbox</Text>
            <Text style={styles.successBody}>{apiMsg}</Text>

            <Button
              label="Back to Sign In"
              onPress={() => router.replace('/(auth)/signin')}
              fullWidth
              style={styles.btn}
            />
          </Animated.View>
        ) : (
          // ── Input state ────────────────────────────────────────
          <Animated.View entering={FadeInDown.duration(350)} style={styles.form}>
            <Text style={styles.title}>Forgot your password?</Text>
            <Text style={styles.body}>
              Enter your email address and we'll send you a link to reset your
              password.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={[
                  styles.input,
                  !!emailErr && styles.inputError,
                ]}
                value={email}
                onChangeText={handleEmailChange}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                autoCapitalize="none"
              />
              {!!emailErr && (
                <Text style={styles.fieldError}>{emailErr}</Text>
              )}
            </View>

            <Button
              label="Send Reset Link"
              onPress={handleSubmit}
              loading={loading}
              fullWidth
              style={styles.btn}
            />

            <Button
              label="Back to Sign In"
              onPress={() => router.back()}
              variant="ghost"
              fullWidth
            />
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
    alignItems: 'center',
  },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  icon: { fontSize: 30 },

  // ── Input state ────────────────────────────────────────────────
  form: { width: '100%', gap: spacing.lg },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  fieldGroup: { gap: spacing.xs },
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
  inputError: { borderColor: colors.danger },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 2,
  },

  noteCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: spacing.md,
    width: '100%',
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },

  btn: { marginTop: spacing.xs },

  // ── Success state ──────────────────────────────────────────────
  successBox: { width: '100%', gap: spacing.lg, alignItems: 'center' },
  successTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
})
