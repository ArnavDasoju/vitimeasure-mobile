/**
 * InsightCard — weekly insight for a tracked patch.
 *
 * States:
 *   gated   — fewer than 3 scans; API is never called
 *   loading — skeleton placeholder while API call is in progress
 *   success — insight text with refresh button
 *   error   — retry prompt; entire card is tappable
 *
 * Caching rules (checked on mount, skipped on manual refresh):
 *   • Cache exists for this bodyLocation
 *   • Cache is less than 7 days old
 *   • Scan count has not changed since cache was generated
 * All three must be true to use the cache. Any failure → call API.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { generateInsights } from '../lib/api'
import {
  getInsightCache,
  saveInsightCache,
  type StoredInsightCache,
  type StoredScan,
} from '../lib/storage'
import { useAppStore } from '../store/appStore'
import { Card } from './ui/Card'
import { colors, radii, spacing, typography } from '../theme'

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightState =
  | { kind: 'loading' }
  | { kind: 'gated' }
  | { kind: 'success'; text: string }
  | { kind: 'error' }

type Props = {
  patchId: string
  bodyLocation: string
  scanHistory: StoredScan[]
}

// ─── Skeleton line ────────────────────────────────────────────────────────────

function SkeletonLine({ width }: { width: `${number}%` }) {
  const shimmer = useSharedValue(0)

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    )
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(shimmer.value, [0, 1], [colors.bgSubtle, colors.bgElevated]),
  }))

  return (
    <Animated.View
      style={[
        styles.skeletonLine,
        { width: width as any },
        animStyle,
      ]}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InsightCard({ patchId, bodyLocation, scanHistory }: Props) {
  const { userEmail } = useAppStore()
  const [state, setState] = useState<InsightState>({ kind: 'loading' })

  // Take the last 4 scans sorted newest-first for the API call
  const last4 = [...scanHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)

  const fetchInsight = useCallback(
    async (forceRefresh: boolean) => {
      if (!userEmail) return
      if (scanHistory.length < 3) {
        setState({ kind: 'gated' })
        return
      }

      if (!forceRefresh) {
        const cached = await getInsightCache(userEmail, bodyLocation)
        if (cached) {
          const ageMs = Date.now() - new Date(cached.generatedAt).getTime()
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
          if (ageMs < sevenDaysMs && cached.scanCountAtGeneration === scanHistory.length) {
            setState({ kind: 'success', text: cached.insightText })
            return
          }
        }
      }

      setState({ kind: 'loading' })
      try {
        const scansForApi = last4.map((s) => ({
          scanDate: s.date,
          affectedPercent: s.affectedPercent,
          bodyLocation,
        }))
        const result = await generateInsights(scansForApi)
        if (!result.insight) throw new Error('empty')

        const cache: StoredInsightCache = {
          insightText: result.insight,
          generatedAt: new Date().toISOString(),
          patchId,
          scanCountAtGeneration: scanHistory.length,
        }
        await saveInsightCache(userEmail, bodyLocation, cache)
        setState({ kind: 'success', text: result.insight })
      } catch {
        setState({ kind: 'error' })
      }
    },
    [userEmail, bodyLocation, patchId, scanHistory.length],
  )

  // On mount (and when scan count changes) check cache then maybe call API
  useEffect(() => {
    if (scanHistory.length < 3) {
      setState({ kind: 'gated' })
      return
    }
    fetchInsight(false)
  }, [bodyLocation, scanHistory.length])

  // ── Gated ──────────────────────────────────────────────────────────────────

  if (state.kind === 'gated') {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.aiLabel}>INSIGHTS</Text>
        </View>
        <Text style={styles.gatedText}>
          Scan this patch at least 3 times to unlock insights.
        </Text>
      </Card>
    )
  }

  // ── Loading (skeleton) ─────────────────────────────────────────────────────

  if (state.kind === 'loading') {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.aiLabel}>INSIGHTS</Text>
        </View>
        <View style={styles.skeletonWrap}>
          <SkeletonLine width="95%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="65%" />
        </View>
      </Card>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (state.kind === 'error') {
    return (
      <TouchableOpacity onPress={() => fetchInsight(true)} activeOpacity={0.75}>
        <Card style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.aiLabel}>INSIGHTS</Text>
          </View>
          <Text style={styles.errorText}>
            Could not generate insight. Tap to retry.
          </Text>
        </Card>
      </TouchableOpacity>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.aiLabel}>INSIGHTS</Text>
        <TouchableOpacity
          onPress={() => fetchInsight(true)}
          hitSlop={10}
          style={styles.refreshBtn}
        >
          <Text style={styles.refreshIcon}>↻</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.insightText}>{state.text}</Text>
    </Card>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  aiLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primary,
  },

  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 16,
    color: colors.primary,
    lineHeight: 18,
  },

  insightText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },

  gatedText: {
    ...typography.body,
    color: colors.textTertiary,
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },

  errorText: {
    ...typography.body,
    color: colors.warning,
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },

  skeletonWrap: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  skeletonLine: {
    height: 14,
    borderRadius: radii.xs,
  },
})
