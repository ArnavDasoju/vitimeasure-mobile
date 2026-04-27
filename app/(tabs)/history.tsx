/**
 * History Tab — full scan timeline across all tracked areas
 *
 * Shows all tracked patches sorted by most recently scanned.
 * Tapping a row drills into the Patch Detail screen.
 * Reads from local file-system storage (same layer as the Home tab).
 */

import React, { useState, useCallback } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '../../src/components/ui/Card'
import { TrendBadge } from '../../src/components/ui/Badge'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { PatchCardSkeleton } from '../../src/components/ui/Skeleton'
import { Sparkline } from '../../src/components/charts/LineChart'
// useTrackedPatches (src/hooks/useTrackedPatches.ts) is intentionally not used here —
// it reads from the remote getProgress API (old architecture) and stores locations in
// SecureStore. This screen uses the local file-system storage layer (getPatches) which
// is consistent with the rest of the app.
import { getPatches, patchToTracked, getDailyStressEntries, type DailyStressEntry } from '../../src/lib/storage'
import { useAppStore } from '../../src/store/appStore'
import { StressCalendar } from '../../src/components/StressCalendar'
import { SectionLabel } from '../../src/components/ui/SectionLabel'
import { colors, layout, spacing, typography } from '../../src/theme'
import { timeAgo } from '../../src/lib/format'
import type { TrackedPatch } from '../../src/types/app'

// ─── Patch Row ────────────────────────────────────────────────────────────────

function HistoryCard({ patch, index }: { patch: TrackedPatch; index: number }) {
  const router = useRouter()
  const isImproving = (patch.changeFromLast ?? 0) < 0
  const sparkColor = isImproving ? colors.success : colors.primary

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(320).springify()}>
      <Card
        onPress={() => router.push(`/patch/${encodeURIComponent(patch.bodyLocation)}`)}
        style={styles.card}
      >
        <View style={styles.cardInner}>
          <View style={styles.cardContent}>
            {/* Top row: location + trend badge */}
            <View style={styles.topRow}>
              <Text style={styles.location} numberOfLines={1}>{patch.bodyLocation}</Text>
              <TrendBadge value={patch.changeFromLast} label="vs last" size="sm" />
            </View>

            {/* Meta */}
            <Text style={styles.meta}>
              {patch.totalScans} scan{patch.totalScans !== 1 ? 's' : ''}
              {'  ·  '}
              {timeAgo(patch.latestScanDate)}
            </Text>

            {/* Bottom row: big % + sparkline */}
            <View style={styles.bottomRow}>
              <View>
                <Text style={styles.metric}>{patch.latestAffectedPercent.toFixed(1)}%</Text>
                <Text style={styles.metricLabel}>AFFECTED</Text>
              </View>
              {patch.sparklineData.length >= 2 && (
                <Sparkline
                  data={patch.sparklineData}
                  width={88}
                  height={36}
                  color={sparkColor}
                />
              )}
            </View>
          </View>

          {/* Chevron */}
          <Text style={styles.chevron}>›</Text>
        </View>
      </Card>
    </Animated.View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userEmail } = useAppStore()

  const [patches, setPatches] = useState<TrackedPatch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  // Daily stress entries for calendar — separate state, does not modify existing state
  const [allStressEntries, setAllStressEntries] = useState<DailyStressEntry[]>([])

  const loadPatches = useCallback(async () => {
    if (!userEmail) { setLoading(false); return }
    try {
      const stored = await getPatches(userEmail)
      const tracked = stored.map(patchToTracked)
      const sorted = tracked.sort((a, b) => b.latestScanDate.localeCompare(a.latestScanDate))
      setPatches(sorted)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [userEmail])

  useFocusEffect(
    useCallback(() => {
      loadPatches()
    }, [loadPatches]),
  )

  // Load daily stress entries separately — read-only, does not touch existing state
  useFocusEffect(
    useCallback(() => {
      if (!userEmail) return
      getDailyStressEntries(userEmail).then(setAllStressEntries)
    }, [userEmail]),
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadPatches()
    setRefreshing(false)
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={loading ? [] : patches}
        keyExtractor={(p) => p.bodyLocation}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomTabOffset },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
              <View>
                <Text style={styles.title}>History</Text>
                <Text style={styles.subtitle}>
                  {loading ? 'Loading…' : `${patches.length} tracked area${patches.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
            </Animated.View>

            {loading && (
              <>
                <PatchCardSkeleton />
                <PatchCardSkeleton />
                <PatchCardSkeleton />
              </>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            error ? (
              <EmptyState
                title="Could not load your history"
                subtitle="Pull down to try again."
              />
            ) : (
              <EmptyState
                title="No scans yet"
                subtitle="Add a body area on the Home tab to get started."
                cta={{ label: 'Go to Dashboard', onPress: () => router.push('/(tabs)') }}
              />
            )
          ) : null
        }
        renderItem={({ item, index }) => (
          <HistoryCard patch={item} index={index} />
        )}
        ListFooterComponent={
          allStressEntries.length > 0 ? (
            <View style={styles.calendarSection}>
              <SectionLabel label="Stress history" style={styles.calendarHeader} />
              <StressCalendar
                stressEntries={allStressEntries}
                month={new Date()}
              />
            </View>
          ) : null
        }
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing['2xl'],
  },

  // ── Header ──────────────────────────────────────────────────────────
  header: {
    marginBottom: spacing['2xl'],
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textTertiary,
  },

  // ── Patch row card ───────────────────────────────────────────────────
  card: {
    marginBottom: spacing.md,
    paddingBottom: spacing.lg,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  location: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  meta: {
    ...typography.micro,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  metric: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1.5,
    lineHeight: 38,
  },
  metricLabel: {
    ...typography.label,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: colors.textTertiary,
    fontWeight: '300',
    marginLeft: spacing.sm,
  },

  // ── Stress calendar ──────────────────────────────────────────────────
  calendarSection: {
    marginTop: spacing.lg,
  },
  calendarHeader: {
    marginBottom: spacing.md,
  },
})
