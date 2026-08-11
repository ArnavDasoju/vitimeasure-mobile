/**
 * Backend endpoints for scanning, progress and AI features.
 *
 * Every call goes through `apiRequest`, which attaches the JWT and triggers a
 * global logout on 401. Do not hand-roll fetch here — a second fetch stack is
 * how these endpoints previously ended up silently ignoring expired sessions.
 */

import type { AnalyzeResult, ProgressEntry, ReportResult } from '../types/app'
import { apiRequest } from '../services/apiClient'

/** Image upload + inference is well over the default 30s budget. */
const ANALYZE_TIMEOUT_MS = 60_000

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

  return apiRequest<AnalyzeResult>('/analyzeScan', {
    method: 'POST',
    body: formData,
    timeoutMs: ANALYZE_TIMEOUT_MS,
  })
}

export async function getProgress(
  userId: string,
  bodyLocation: string,
): Promise<ProgressEntry[]> {
  const query = `userId=${encodeURIComponent(userId)}&bodyLocation=${encodeURIComponent(bodyLocation)}`
  try {
    return await apiRequest<ProgressEntry[]>(`/getProgress?${query}`)
  } catch {
    // Progress is a read-only enrichment — fall back to local data on failure.
    return []
  }
}

export async function generateReport(
  userId: string,
  bodyLocation: string,
  startDate: string,
  endDate: string,
): Promise<ReportResult> {
  return apiRequest<ReportResult>('/generateReport', {
    method: 'POST',
    body: JSON.stringify({ userId, bodyLocation, startDate, endDate }),
  })
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
  return apiRequest<{ answer: string }>('/askAI', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function generateInsights(
  scans: { scanDate: string; affectedPercent: number; bodyLocation: string }[],
): Promise<{ insight: string }> {
  return apiRequest<{ insight: string }>('/generateInsights', {
    method: 'POST',
    body: JSON.stringify(scans),
  })
}
