/**
 * Cloud Sync — pushes local data to Cosmos DB and restores from it.
 *
 * Design rules:
 *  • localImagePath is NEVER sent to the cloud — it is device-specific.
 *  • All functions are fire-and-forget safe: they never throw, only log.
 *  • syncFromCloud uses "cloud fills gaps" logic — if a patch/scan exists
 *    locally it is kept; cloud data is added only for missing records.
 *  • syncToCloud always pushes everything local — cloud is the full backup.
 *  • Treatment logs are synced alongside patches and scans (Day 4).
 */

import {
  getPatches,
  addPatch,
  addScanToPatch,
  getAllTreatmentLogs,
  getTreatmentLogsForPatch,
  saveTreatmentLog,
  getWeeklyCheckIns,
  saveWeeklyCheckIn,
  getDailyStressEntries,
  saveDailyStress,
} from '../lib/storage'
import { apiRequest } from './apiClient'
import type { StoredPatch, StoredScan, TreatmentLogEntry, WeeklyCheckIn, DailyStressEntry } from '../lib/storage'

// ─── Cloud types ──────────────────────────────────────────────────────────────

type CloudPatch = {
  id: string
  userId: string
  bodyLocation: string
  createdAt: string
  syncedAt?: string
}

type CloudScan = {
  id: string
  patchId: string
  userId: string
  date: string
  affectedPercent: number
  unaffectedPercent: number
  vasiScore?: number
  imageUrl?: string
  boundingBoxes?: Array<{ left: number; top: number; width: number; height: number }>
  dominantColor?: string
  accentColor?: string
  syncedAt?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCloudPatch(patch: StoredPatch, userId: string): CloudPatch {
  return {
    id: patch.id,
    userId,
    bodyLocation: patch.bodyLocation,
    createdAt: patch.createdAt,
  }
}

function toCloudScan(scan: StoredScan, patchId: string, userId: string): CloudScan {
  return {
    id: scan.id,
    patchId,
    userId,
    date: scan.date,
    affectedPercent: scan.affectedPercent,
    unaffectedPercent: scan.unaffectedPercent,
    vasiScore: scan.vasiScore,
    imageUrl: scan.imageUrl,
    boundingBoxes: scan.boundingBoxes,
    dominantColor: scan.dominantColor,
    accentColor: scan.accentColor,
    // localImagePath intentionally excluded
  }
}

// ─── syncToCloud ──────────────────────────────────────────────────────────────

export async function syncToCloud(userEmail: string, userId: string): Promise<{
  success: boolean
  patchesSynced: number
  scansSynced: number
  treatmentsSynced: number
  checkInsSynced: number
  stressEntriesSynced: number
}> {
  try {
    const patches = await getPatches(userEmail)
    if (patches.length === 0) {
      return { success: true, patchesSynced: 0, scansSynced: 0, treatmentsSynced: 0, checkInsSynced: 0, stressEntriesSynced: 0 }
    }

    const cloudPatches = patches.map((p) => toCloudPatch(p, userId))
    const cloudScans = patches.flatMap((p) =>
      p.scans.map((s) => toCloudScan(s, p.id, userId)),
    )

    let patchesSynced = 0
    let scansSynced = 0
    let treatmentsSynced = 0
    let checkInsSynced = 0
    let stressEntriesSynced = 0
    let success = true

    try {
      const patchRes = await apiRequest<{ synced: number }>('/sync/patches', {
        method: 'POST',
        body: JSON.stringify({ patches: cloudPatches }),
      })
      patchesSynced = patchRes.synced
    } catch (err) {
      console.error('[cloudSync] syncToCloud patches failed:', err)
      success = false
    }

    try {
      const scanRes = await apiRequest<{ synced: number }>('/sync/scans', {
        method: 'POST',
        body: JSON.stringify({ scans: cloudScans }),
      })
      scansSynced = scanRes.synced
    } catch (err) {
      console.error('[cloudSync] syncToCloud scans failed:', err)
      success = false
    }

    try {
      const allTreatments = await getAllTreatmentLogs(userEmail)
      if (allTreatments.length > 0) {
        const treatRes = await apiRequest<{ synced: number }>('/sync/treatments', {
          method: 'POST',
          body: JSON.stringify({ treatments: allTreatments }),
        })
        treatmentsSynced = treatRes.synced
      }
    } catch (err) {
      console.error('[cloudSync] syncToCloud treatments failed:', err)
      success = false
    }

    try {
      const allCheckIns = await getWeeklyCheckIns(userEmail)
      if (allCheckIns.length > 0) {
        const checkInRes = await apiRequest<{ synced: number }>('/sync/checkins', {
          method: 'POST',
          body: JSON.stringify({ checkIns: allCheckIns }),
        })
        checkInsSynced = checkInRes.synced
      }
    } catch (err) {
      console.error('[cloudSync] syncToCloud checkins failed:', err)
      success = false
    }

    // Sync daily stress entries — appended after existing sync logic
    try {
      const stressEntries = await getDailyStressEntries(userEmail)
      if (stressEntries.length > 0) {
        const stressRes = await apiRequest<{ synced: number }>('/sync/daily-stress', {
          method: 'POST',
          body: JSON.stringify({ entries: stressEntries }),
        })
        stressEntriesSynced = stressRes.synced
      }
    } catch (err) {
      console.error('[cloudSync] syncToCloud daily-stress failed:', err)
      success = false
    }

    return { success, patchesSynced, scansSynced, treatmentsSynced, checkInsSynced, stressEntriesSynced }
  } catch (err) {
    console.error('[cloudSync] syncToCloud failed:', err)
    return { success: false, patchesSynced: 0, scansSynced: 0, treatmentsSynced: 0, checkInsSynced: 0, stressEntriesSynced: 0 }
  }
}

// ─── syncFromCloud ─────────────────────────────────────────────────────────────

export async function syncFromCloud(userEmail: string, userId: string): Promise<{
  success: boolean
  patchesRestored: number
  scansRestored: number
  treatmentsRestored: number
  checkInsRestored: number
  stressEntriesRestored: number
}> {
  try {
    const localPatches = await getPatches(userEmail)
    const localPatchIds = new Set(localPatches.map((p) => p.id))
    const localScanIds = new Set(
      localPatches.flatMap((p) => p.scans.map((s) => s.id)),
    )

    const cloudPatchRes = await apiRequest<{ patches: CloudPatch[] }>('/sync/patches')
    const cloudPatches = cloudPatchRes.patches ?? []

    let patchesRestored = 0
    let scansRestored = 0
    let treatmentsRestored = 0
    let checkInsRestored = 0
    let stressEntriesRestored = 0

    for (const cp of cloudPatches) {
      if (!localPatchIds.has(cp.id)) {
        await addPatch(userEmail, cp.bodyLocation)
        patchesRestored++
      }

      // Restore scans for this patch
      let cloudScans: CloudScan[] = []
      try {
        const scanRes = await apiRequest<{ scans: CloudScan[] }>(`/sync/scans/${cp.id}`)
        cloudScans = scanRes.scans ?? []
      } catch (err) {
        console.error(`[cloudSync] Failed to fetch scans for patch ${cp.id}:`, err)
        continue
      }

      for (const cs of cloudScans) {
        if (!localScanIds.has(cs.id)) {
          await addScanToPatch(userEmail, cp.bodyLocation, {
            id: cs.id,
            date: cs.date,
            affectedPercent: cs.affectedPercent,
            unaffectedPercent: cs.unaffectedPercent,
            vasiScore: cs.vasiScore,
            imageUrl: cs.imageUrl,
            boundingBoxes: cs.boundingBoxes,
            dominantColor: cs.dominantColor,
            accentColor: cs.accentColor,
          })
          scansRestored++
        }
      }

      // Restore treatment logs for this patch
      try {
        const treatRes = await apiRequest<{ treatments: TreatmentLogEntry[] }>(
          `/sync/treatments/${cp.id}`,
        )
        const cloudTreatments = treatRes.treatments ?? []

        if (cloudTreatments.length > 0) {
          const localTreatments = await getTreatmentLogsForPatch(userEmail, cp.id)
          const localTreatIds = new Set(localTreatments.map((t) => t.id))

          for (const ct of cloudTreatments) {
            if (!localTreatIds.has(ct.id)) {
              await saveTreatmentLog(userEmail, ct)
              treatmentsRestored++
            }
          }
        }
      } catch (err) {
        console.error(`[cloudSync] Failed to fetch treatments for patch ${cp.id}:`, err)
      }
    }

    // Restore weekly check-ins
    try {
      const checkInRes = await apiRequest<{ checkIns: WeeklyCheckIn[] }>('/sync/checkins')
      const cloudCheckIns = checkInRes.checkIns ?? []

      if (cloudCheckIns.length > 0) {
        const localCheckIns = await getWeeklyCheckIns(userEmail)
        const localWeekKeys = new Set(localCheckIns.map((c) => c.weekKey))

        for (const cc of cloudCheckIns) {
          if (!localWeekKeys.has(cc.weekKey)) {
            await saveWeeklyCheckIn(userEmail, cc)
            checkInsRestored++
          }
        }
      }
    } catch (err) {
      console.error('[cloudSync] Failed to restore checkins:', err)
    }

    // Restore daily stress entries — appended after existing restore logic
    try {
      const { entries: cloudEntries } = await apiRequest<{ entries: DailyStressEntry[] }>('/sync/daily-stress')
      if (cloudEntries && cloudEntries.length > 0) {
        const localEntries = await getDailyStressEntries(userEmail)
        const localDates = new Set(localEntries.map((e) => e.date))
        for (const ce of cloudEntries) {
          if (!localDates.has(ce.date)) {
            await saveDailyStress(userEmail, ce)
            stressEntriesRestored++
          }
        }
      }
    } catch (e) {
      console.error('[cloudSync] Stress sync failed:', e)
    }

    return { success: true, patchesRestored, scansRestored, treatmentsRestored, checkInsRestored, stressEntriesRestored }
  } catch (err) {
    console.error('[cloudSync] syncFromCloud failed:', err)
    return { success: false, patchesRestored: 0, scansRestored: 0, treatmentsRestored: 0, checkInsRestored: 0, stressEntriesRestored: 0 }
  }
}

// ─── performInitialSync ────────────────────────────────────────────────────────

export async function performInitialSync(userEmail: string, userId: string): Promise<void> {
  const fromCloud = await syncFromCloud(userEmail, userId)
  const toCloud = await syncToCloud(userEmail, userId)

  if (__DEV__) {
    console.log(
      `[cloudSync] Initial sync complete: ` +
      `restored ${fromCloud.patchesRestored} patches, ${fromCloud.scansRestored} scans, ` +
      `${fromCloud.treatmentsRestored} treatments, ${fromCloud.checkInsRestored} check-ins, ` +
      `${fromCloud.stressEntriesRestored} stress entries. ` +
      `Pushed ${toCloud.patchesSynced} patches, ${toCloud.scansSynced} scans, ` +
      `${toCloud.treatmentsSynced} treatments, ${toCloud.checkInsSynced} check-ins, ` +
      `${toCloud.stressEntriesSynced} stress entries.`,
    )
  }
}
