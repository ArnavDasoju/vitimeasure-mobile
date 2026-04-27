import type { AnalyzeResult, ProgressEntry, ReportResult } from '../types/app'
import { getToken } from './auth'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://vitimeasure-api-e2f2ewb6dbcjcrct.eastus2-01.azurewebsites.net'

async function authHeader(): Promise<Record<string, string>> {
  const token = await getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function analyzeScan(
  imageUri: string,
  userId: string,
  bodyLocation: string,
): Promise<AnalyzeResult> {
  const formData = new FormData()
  formData.append('image', {
    uri: imageUri,
    name: 'scan.jpg',
    type: 'image/jpeg',
  } as any)
  formData.append('userId', userId)
  formData.append('bodyLocation', bodyLocation)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)

  const headers = await authHeader()

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/analyzeScan`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out. The server took too long to respond.')
    }
    throw new Error('Could not reach the server. Check your internet connection.')
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Server error (${res.status}). Please try again.`)
  }
  return res.json()
}

export async function getProgress(
  userId: string,
  bodyLocation: string,
): Promise<ProgressEntry[]> {
  const headers = await authHeader()
  const res = await fetch(
    `${API_BASE}/api/getProgress?userId=${userId}&bodyLocation=${encodeURIComponent(bodyLocation)}`,
    { headers },
  )
  if (!res.ok) return []
  return res.json()
}

export async function generateReport(
  userId: string,
  bodyLocation: string,
  startDate: string,
  endDate: string,
): Promise<ReportResult> {
  const headers = await authHeader()
  const res = await fetch(`${API_BASE}/api/generateReport`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, bodyLocation, startDate, endDate }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Failed to generate report')
  }
  return res.json()
}

export async function askAI(payload: {
  question: string
  context: {
    bodyLocation: string
    scans: { scanDate: string; affectedPercent: number; vasiScore?: number }[]
    vasiScore: number
    changeFromLast: number | null
  }
  conversationHistory: { role: 'user' | 'ai'; content: string }[]
}): Promise<{ answer: string }> {
  const headers = await authHeader()
  const res = await fetch(`${API_BASE}/api/askAI`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return { answer: '' }
  return res.json()
}

export async function generateInsights(
  scans: { scanDate: string; affectedPercent: number; bodyLocation: string }[],
): Promise<{ insight: string }> {
  const headers = await authHeader()
  const res = await fetch(`${API_BASE}/api/generateInsights`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(scans),
  })
  if (!res.ok) return { insight: '' }
  return res.json()
}
