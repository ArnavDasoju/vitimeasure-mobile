/**
 * API Client — centralized fetch wrapper for all backend calls.
 *
 * - Reads the JWT from SecureStore and attaches it as Authorization: Bearer
 * - Returns parsed JSON on success
 * - On 401: calls the registered logout callback and throws "Session expired"
 * - On other errors: throws with the message from the response body
 */

import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'vitimeasure_token'

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'https://vitimeasure-api-e2f2ewb6dbcjcrct.eastus2-01.azurewebsites.net'

// Registered once during app initialisation by _layout.tsx so the API client
// can trigger logout on 401 without a circular import.
let logoutCallback: (() => void) | null = null

export function setLogoutCallback(fn: () => void): void {
  logoutCallback = fn
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api${endpoint}`, {
      ...options,
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
