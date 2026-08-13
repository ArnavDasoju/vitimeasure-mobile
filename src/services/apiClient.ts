/**
 * API Client — centralized fetch wrapper for all backend calls.
 *
 * - Reads the JWT from SecureStore and attaches it as Authorization: Bearer
 * - Returns parsed JSON on success
 * - On 401: calls the registered logout callback and throws "Session expired"
 * - On other errors: throws with the message from the response body
 */

import * as SecureStore from 'expo-secure-store'
import { API_BASE, storageKeys } from '../config'

const DEFAULT_TIMEOUT_MS = 90_000

// Registered once during app initialisation by _layout.tsx so the API client
// can trigger logout on 401 without a circular import.
let logoutCallback: (() => void) | null = null

export function setLogoutCallback(fn: () => void): void {
  logoutCallback = fn
}

export type ApiRequestOptions = RequestInit & {
  /** Overrides the default 30s abort timeout. Uploads need longer. */
  timeoutMs?: number
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options
  const token = await SecureStore.getItemAsync(storageKeys.token)

  // FormData bodies must set their own Content-Type so fetch can attach the
  // multipart boundary — forcing application/json here corrupts the upload.
  const isFormData = init.body instanceof FormData

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api${endpoint}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw new Error('Connection failed. Check your internet and try again.')
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status === 401) {
    logoutCallback?.()
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }

  return res.json() as Promise<T>
}
