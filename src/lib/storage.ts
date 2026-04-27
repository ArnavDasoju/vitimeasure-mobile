/**
 * VITImeasure Storage — per-user file-system data layer
 *
 * Each signed-in user gets their own JSON file keyed by email.
 * No data is shared between accounts.
 *
 * File path: <documentDirectory>/vm_<sanitized_email>.json
 */

import { File, Paths } from 'expo-file-system'
import type { TrackedPatch, ProgressEntry, BoundingBox } from '../types/app'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoredScan = {
  id: string
  date: string           // ISO string
  affectedPercent: number
  unaffectedPercent: number
  imageUrl?: string
  localImagePath?: string
  boundingBoxes?: BoundingBox[]
  dominantColor?: string
  accentColor?: string
  vasiScore?: number     // VASI contribution for this patch (added Day 4)
  // Fields from the Python vitiligo analyzer
  patchCount?: number
  skinTone?: string
  ratio?: string
  annotatedImage?: string  // base64 JPEG with cyan contour outlines
  detectionConfidence?: number  // 0.0–1.0, derived from skin_coverage when available
}

export type StoredInsightCache = {
  insightText: string
  generatedAt: string    // ISO timestamp
  patchId: string
  scanCountAtGeneration: number
}

export type StoredPatch = {
  id: string
  bodyLocation: string
  createdAt: string      // ISO string
  scans: StoredScan[]
}

export type TreatmentLogEntry = {
  id: string             // unique ID
  patchId: string        // which patch this treatment is for
  userId: string         // owner
  medicationName: string // e.g. "Ruxolitinib cream"
  dose: string           // e.g. "1.5%", free text
  startDate: string      // ISO date string
  endDate: string | null // ISO date string or null if ongoing
  notes: string          // optional notes, can be empty string
  createdAt: string      // ISO timestamp
  updatedAt: string      // ISO timestamp
  isActive: boolean      // true when endDate is null
}

export type WeeklyCheckIn = {
  id: string            // "checkin_{userId}_{weekKey}"
  userId: string
  weekKey: string       // ISO week identifier: "YYYY-Www"
  weekStartDate: string // ISO date of the Monday of this week
  stressScore: number   // 1-5: 1=very low, 5=very high
  sleepScore: number    // 1-5: 1=very poor, 5=excellent
  moodScore: number     // 1-5: 1=very low, 5=excellent
  completedAt: string   // ISO timestamp when submitted
  syncedAt: string | null // ISO timestamp when synced to cloud, null if not yet
}

export type DailyStressEntry = {
  id: string             // "stress_{userId}_{date}"
  userId: string
  date: string           // ISO date: "YYYY-MM-DD"
  stressScore: number    // 1–5
  source: 'notification' | 'in-app'
  loggedAt: string       // ISO timestamp
}

type UserData = {
  patches: StoredPatch[]
  insightCache?: Record<string, StoredInsightCache>
  treatments?: Record<string, TreatmentLogEntry[]> // key: patchId
  weeklyCheckIns?: WeeklyCheckIn[]
  dailyStress?: DailyStressEntry[]
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

function userFile(email: string): File {
  const safe = email.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60)
  return new File(Paths.document, `vm_${safe}.json`)
}

async function readData(email: string): Promise<UserData> {
  try {
    const file = userFile(email)
    if (!file.exists) return { patches: [] }
    return JSON.parse(await file.text()) as UserData
  } catch {
    return { patches: [] }
  }
}

async function writeData(email: string, data: UserData): Promise<void> {
  userFile(email).write(JSON.stringify(data))
}

// ─── Public API — patches ─────────────────────────────────────────────────────

export async function getPatches(userEmail: string): Promise<StoredPatch[]> {
  const data = await readData(userEmail)
  return data.patches
}

export async function getPatch(
  userEmail: string,
  bodyLocation: string,
): Promise<StoredPatch | null> {
  const data = await readData(userEmail)
  return data.patches.find((p) => p.bodyLocation === bodyLocation) ?? null
}

export async function addPatch(
  userEmail: string,
  bodyLocation: string,
): Promise<StoredPatch> {
  const data = await readData(userEmail)
  const existing = data.patches.find((p) => p.bodyLocation === bodyLocation)
  if (existing) return existing

  const patch: StoredPatch = {
    id: genId(),
    bodyLocation,
    createdAt: new Date().toISOString(),
    scans: [],
  }
  data.patches.push(patch)
  await writeData(userEmail, data)
  return patch
}

export async function deletePatch(
  userEmail: string,
  bodyLocation: string,
): Promise<void> {
  const data = await readData(userEmail)
  data.patches = data.patches.filter((p) => p.bodyLocation !== bodyLocation)
  await writeData(userEmail, data)
}

export async function addScanToPatch(
  userEmail: string,
  bodyLocation: string,
  scan: Omit<StoredScan, 'id'> & { id?: string },
): Promise<void> {
  const data = await readData(userEmail)
  let patch = data.patches.find((p) => p.bodyLocation === bodyLocation)
  if (!patch) {
    patch = {
      id: genId(),
      bodyLocation,
      createdAt: new Date().toISOString(),
      scans: [],
    }
    data.patches.push(patch)
  }
  // Deduplicate by scan id if provided
  const scanId = scan.id ?? genId()
  if (!patch.scans.some((s) => s.id === scanId)) {
    patch.scans.push({ ...scan, id: scanId })
  }
  await writeData(userEmail, data)
}

export async function updateScanLocalPath(
  userEmail: string,
  bodyLocation: string,
  scanId: string,
  localImagePath: string,
): Promise<void> {
  const data = await readData(userEmail)
  const patch = data.patches.find((p) => p.bodyLocation === bodyLocation)
  if (!patch) return
  const scan = patch.scans.find((s) => s.id === scanId)
  if (!scan) return
  scan.localImagePath = localImagePath
  await writeData(userEmail, data)
}

export async function deleteScan(
  userEmail: string,
  bodyLocation: string,
  scanId: string,
): Promise<void> {
  const data = await readData(userEmail)
  const patch = data.patches.find((p) => p.bodyLocation === bodyLocation)
  if (!patch) return
  patch.scans = patch.scans.filter((s) => s.id !== scanId)
  await writeData(userEmail, data)
}

// ─── Public API — insight cache ───────────────────────────────────────────────

export async function getInsightCache(
  userEmail: string,
  bodyLocation: string,
): Promise<StoredInsightCache | null> {
  const data = await readData(userEmail)
  return data.insightCache?.[bodyLocation] ?? null
}

export async function saveInsightCache(
  userEmail: string,
  bodyLocation: string,
  cache: StoredInsightCache,
): Promise<void> {
  const data = await readData(userEmail)
  if (!data.insightCache) data.insightCache = {}
  data.insightCache[bodyLocation] = cache
  await writeData(userEmail, data)
}

// ─── Public API — treatment logs ──────────────────────────────────────────────

export async function saveTreatmentLog(
  userEmail: string,
  entry: TreatmentLogEntry,
): Promise<void> {
  const data = await readData(userEmail)
  if (!data.treatments) data.treatments = {}
  const list = data.treatments[entry.patchId] ?? []
  const idx = list.findIndex((t) => t.id === entry.id)
  if (idx >= 0) {
    list[idx] = entry
  } else {
    list.push(entry)
  }
  data.treatments[entry.patchId] = list
  await writeData(userEmail, data)
}

export async function getTreatmentLogsForPatch(
  userEmail: string,
  patchId: string,
): Promise<TreatmentLogEntry[]> {
  const data = await readData(userEmail)
  const list = data.treatments?.[patchId] ?? []
  return [...list].sort((a, b) => b.startDate.localeCompare(a.startDate))
}

export async function deleteTreatmentLog(
  userEmail: string,
  id: string,
  patchId: string,
): Promise<void> {
  const data = await readData(userEmail)
  if (!data.treatments?.[patchId]) return
  data.treatments[patchId] = data.treatments[patchId].filter((t) => t.id !== id)
  await writeData(userEmail, data)
}

export async function getAllTreatmentLogs(
  userEmail: string,
): Promise<TreatmentLogEntry[]> {
  const data = await readData(userEmail)
  if (!data.treatments) return []
  return Object.values(data.treatments).flat()
}

// ─── Public API — weekly check-ins ────────────────────────────────────────────

/**
 * Saves a WeeklyCheckIn. If a check-in with the same weekKey already exists
 * it is replaced — one check-in per week per user.
 */
export async function saveWeeklyCheckIn(
  userEmail: string,
  checkIn: WeeklyCheckIn,
): Promise<void> {
  const data = await readData(userEmail)
  const list = data.weeklyCheckIns ?? []
  const idx = list.findIndex((c) => c.weekKey === checkIn.weekKey)
  if (idx >= 0) {
    list[idx] = checkIn
  } else {
    list.push(checkIn)
  }
  data.weeklyCheckIns = list
  await writeData(userEmail, data)
}

/**
 * Returns all check-ins for this user, sorted ascending by weekStartDate.
 */
export async function getWeeklyCheckIns(
  userEmail: string,
): Promise<WeeklyCheckIn[]> {
  const data = await readData(userEmail)
  const list = data.weeklyCheckIns ?? []
  return [...list].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))
}

/**
 * Returns the check-in for the current ISO week, or null if not yet completed.
 * Inlines the ISO week computation to avoid a circular dependency with weekUtils.
 */
export async function getThisWeeksCheckIn(
  userEmail: string,
): Promise<WeeklyCheckIn | null> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() || 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() - (day - 1) + 3) // Monday + 3 = Thursday
  const year = thursday.getFullYear()
  const ft = new Date(year, 0, 1)
  ft.setDate(ft.getDate() + (4 - (ft.getDay() || 7)))
  const weekNum = Math.floor((thursday.getTime() - ft.getTime()) / (7 * 86400000)) + 1
  const currentWeek = `${year}-W${weekNum.toString().padStart(2, '0')}`

  const data = await readData(userEmail)
  return (data.weeklyCheckIns ?? []).find((c) => c.weekKey === currentWeek) ?? null
}

// ─── Converters ───────────────────────────────────────────────────────────────

export function patchToTracked(patch: StoredPatch): TrackedPatch {
  const sorted = [...patch.scans].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null
  return {
    bodyLocation: patch.bodyLocation,
    latestAffectedPercent: latest?.affectedPercent ?? 0,
    latestScanDate: latest?.date ?? patch.createdAt,
    totalScans: patch.scans.length,
    changeFromLast:
      prev && latest ? latest.affectedPercent - prev.affectedPercent : null,
    sparklineData: sorted.map((s) => s.affectedPercent),
  }
}

export function scanToProgressEntry(
  scan: StoredScan,
  userId: string,
  bodyLocation: string,
): ProgressEntry {
  return {
    id: scan.id,
    userId,
    bodyLocation,
    scanDate: scan.date,
    affectedPercent: scan.affectedPercent,
    unaffectedPercent: scan.unaffectedPercent,
    imageUrl: scan.imageUrl ?? '',
    localImagePath: scan.localImagePath,
    boundingBoxes: scan.boundingBoxes ?? [],
    dominantColor: scan.dominantColor ?? '',
    accentColor: scan.accentColor ?? '',
    vasiScore: scan.vasiScore,
  }
}

// ─── Public API — daily stress entries ───────────────────────────────────────

/**
 * Saves a DailyStressEntry. If an entry for the same date already exists it is
 * replaced — one entry per day per user.
 */
export async function saveDailyStress(
  userEmail: string,
  entry: DailyStressEntry,
): Promise<void> {
  const data = await readData(userEmail)
  const list = data.dailyStress ?? []
  const idx = list.findIndex((e) => e.date === entry.date)
  if (idx >= 0) {
    list[idx] = entry
  } else {
    list.push(entry)
  }
  data.dailyStress = list
  await writeData(userEmail, data)
}

/**
 * Returns all daily stress entries for this user, sorted ascending by date.
 */
export async function getDailyStressEntries(
  userEmail: string,
): Promise<DailyStressEntry[]> {
  const data = await readData(userEmail)
  const list = data.dailyStress ?? []
  return [...list].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Returns today's stress entry or null if not yet logged today.
 */
export async function getTodaysStressEntry(
  userEmail: string,
): Promise<DailyStressEntry | null> {
  const today = new Date().toISOString().split('T')[0]
  const entries = await getDailyStressEntries(userEmail)
  return entries.find((e) => e.date === today) ?? null
}

/**
 * Returns daily stress entries within the given date range (inclusive), sorted
 * ascending by date.
 */
export async function getStressEntriesForDateRange(
  userEmail: string,
  startDate: string,
  endDate: string,
): Promise<DailyStressEntry[]> {
  const entries = await getDailyStressEntries(userEmail)
  return entries.filter((e) => e.date >= startDate && e.date <= endDate)
}

/**
 * Groups daily stress entries into Monday-Sunday buckets and returns the
 * average stress per week, sorted ascending by weekStartDate.
 *
 * Returns an empty array when there are no entries.
 */
export async function getWeeklyAverageStress(
  userEmail: string,
): Promise<Array<{ weekKey: string; weekStartDate: string; avgStress: number; entryCount: number }>> {
  const entries = await getDailyStressEntries(userEmail)
  if (entries.length === 0) return []

  // Compute the Monday of a given date string
  function getMondayOf(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    d.setHours(0, 0, 0, 0)
    const day = d.getDay() || 7  // 1=Mon … 7=Sun
    d.setDate(d.getDate() - (day - 1))
    return d.toISOString().split('T')[0]
  }

  // Group entries by their week's Monday date
  const buckets: Record<string, DailyStressEntry[]> = {}
  for (const entry of entries) {
    const monday = getMondayOf(entry.date)
    buckets[monday] = buckets[monday] ?? []
    buckets[monday].push(entry)
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, weekEntries]) => ({
      weekKey: monday,
      weekStartDate: monday,
      avgStress:
        Math.round(
          (weekEntries.reduce((sum, e) => sum + e.stressScore, 0) / weekEntries.length) * 10,
        ) / 10,
      entryCount: weekEntries.length,
    }))
}

// ─── Converters ───────────────────────────────────────────────────────────────

export function computeStats(patches: StoredPatch[]): {
  areasTracked: number
  avgAffected: number
  improving: number
} {
  const areasTracked = patches.length

  const withScans = patches.filter((p) => p.scans.length > 0)
  const avgAffected =
    withScans.length === 0
      ? 0
      : withScans.reduce((sum, p) => {
          const sorted = [...p.scans].sort((a, b) => a.date.localeCompare(b.date))
          return sum + (sorted[sorted.length - 1]?.affectedPercent ?? 0)
        }, 0) / withScans.length

  const improving = patches.filter((p) => {
    const sorted = [...p.scans].sort((a, b) => a.date.localeCompare(b.date))
    if (sorted.length < 2) return false
    return sorted[sorted.length - 1].affectedPercent < sorted[sorted.length - 2].affectedPercent
  }).length

  return { areasTracked, avgAffected, improving }
}
