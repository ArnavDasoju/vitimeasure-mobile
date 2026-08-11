/**
 * VITImeasure Auth
 *
 * Authenticates against the backend API. The returned JWT is stored in
 * SecureStore and attached to every subsequent API request.
 */

import * as SecureStore from 'expo-secure-store'
import { API_BASE, storageKeys } from '../config'

const SESSION_KEY = storageKeys.session
const TOKEN_KEY   = storageKeys.token

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Session = {
  email: string
  userId: string
  name: string
}

export type AuthErrorCode =
  | 'EMAIL_NOT_FOUND'
  | 'WRONG_PASSWORD'
  | 'TOO_MANY_ATTEMPTS'
  | 'EMAIL_IN_USE'
  | 'EMAIL_NOT_FOUND_RESET'

const authErr = (code: AuthErrorCode) => ({ code })

// ─── Public API ────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.')
  }

  if (res.status === 401) throw authErr('WRONG_PASSWORD')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Sign in failed')
  }

  const { token, userId } = await res.json() as { token: string; userId: string }
  const session: Session = {
    email: email.trim().toLowerCase(),
    userId,
    name: email.split('@')[0],
  }

  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  return session
}

export async function createAccount(
  name: string,
  email: string,
  password: string,
): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() }),
    })
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.')
  }

  if (res.status === 409) throw authErr('EMAIL_IN_USE')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Registration failed')
  }

  const { token, userId } = await res.json() as { token: string; userId: string }
  const session: Session = {
    email: email.trim().toLowerCase(),
    userId,
    name: name.trim(),
  }

  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  return session
}

export async function signOut(): Promise<void> {
  try { await SecureStore.deleteItemAsync(SESSION_KEY) } catch {}
  try { await SecureStore.deleteItemAsync(TOKEN_KEY) } catch {}
}

export async function getSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

// ─── Onboarding flag ───────────────────────────────────────────────────────────
// Owned here rather than read inline by screens, so the key lives in one place.

export async function getOnboardingDone(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(storageKeys.onboardingDone)) === 'true'
  } catch {
    return false
  }
}

export async function setOnboardingDone(done: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(storageKeys.onboardingDone, done ? 'true' : 'false')
  } catch {
    // SecureStore unavailable — the flag re-prompts onboarding next launch.
  }
}

export async function requestPasswordReset(_email: string): Promise<void> {
  // Password reset via email is not yet supported by the backend.
  throw authErr('EMAIL_NOT_FOUND_RESET')
}

export async function deleteAccount(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null)
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(`${API_BASE}/api/auth/account`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Delete failed (${res.status})`)
  }

  // Clear all local credentials after successful deletion
  await signOut()
}
