/**
 * Report Tab — pick a tracked area to generate a PDF report
 *
 * Lists all tracked patches the user has actually created.
 * Tapping navigates to /report/[bodyLocation] for date range + generation.
 */

import React, { useState, useCallback } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '../../src/components/ui/Card'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { PatchCardSkeleton } from '../../src/components/ui/Skeleton'
import { TrendBadge } from '../../src/components/ui/Badge'
import { getPatches, patchToTracked } from '../../src/lib/storage'
import { useAppStore } from '../../src/store/appStore'
import { colors, layout, radii, spacing, typography } from '../../src/theme'
import { timeAgo } from '../../src/lib/format'
import type { TrackedPatch } from '../../src/types/app'

// ─── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ patch, index }: { patch: TrackedPatch; index: number }) {
  const router = useRouter()
  const hasScans = patch.totalScans > 0

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(320).springify()}>
      <Card
        onPress={() => hasScans
          ? router.push(`/report/${encodeURIComponent(patch.bodyLocation)}`)
          : router.push(`/scan/${encodeURIComponent(patch.bodyLocation)}`)
        }
        style={styles.card}
      >
        {/* Top row: icon + info */}
        <View style={styles.topRow}>
          <View style={styles.info}>
            <Text style={styles.location} numberOfLines={1}>{patch.bodyLocation}</Text>
            <Text style={styles.meta}>
              {hasScans
                ? `${patch.totalScans} scan${patch.totalScans !== 1 ? 's' : ''}  ·  Last ${timeAgo(patch.latestScanDate)}`
                : 'No scans yet'}
            </Text>
          </View>

          <Text style={styles.chevron}>›</Text>
        </View>

        {/* Bottom row: metric + badge */}
        <View style={styles.bottomRow}>
          {hasScans ? (
            <>
              <View style={styles.metricWrap}>
                <Text style={styles.metric}>{patch.latestAffectedPercent.toFixed(1)}%</Text>
                <Text style={styles.metricLabel}>current</Text>
              </View>

              <TrendBadge value={patch.changeFromLast} label="vs last" size="sm" />

              <View style={styles.generateTag}>
                <Text style={styles.generateText}>Generate Report →</Text>
              </View>
            </>
          ) : (
            <View style={styles.generateTag}>
              <Text style={[styles.generateText, styles.scanFirstText]}>Scan first →</Text>
            </View>
          )}
        </View>
      </Card>
    </Animated.View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReportTabScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userEmail } = useAppStore()

  const [patches, setPatches] = useState<TrackedPatch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadPatches = useCallback(async () => {
    if (!userEmail) { setLoading(false); return }
    try {
      const stored = await getPatches(userEmail)
      setPatches(stored.map(patchToTracked))
    } catch {
      setPatches([])
    } finally {
      setLoading(false)
    }
  }, [userEmail])

  useFocusEffect(
    useCallback(() => {
      loadPatches()
    }, [loadPatches]),
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadPatches()
    setRefreshing(false)
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
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
      >
        {/* ── Inline header ─────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <View>
            <Text style={styles.title}>Reports</Text>
            <Text style={styles.subtitle}>
              Select a tracked area to generate a PDF
            </Text>
          </View>
        </Animated.View>

        {/* ── Explainer chip ────────────────────────────────────── */}
        {!loading && patches.length > 0 && (
          <Animated.View entering={FadeIn.delay(60).duration(350)}>
            <View style={styles.infoChip}>
              <Text style={styles.infoText}>
                Choose a body area · pick a date range · download your PDF
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── Cards / States ────────────────────────────────────── */}
        {loading ? (
          <>
            <PatchCardSkeleton />
            <PatchCardSkeleton />
          </>
        ) : patches.length === 0 ? (
          <EmptyState
            title="Nothing to report yet"
            subtitle="Add a body area on the Home tab before generating a report."
            cta={{ label: 'Go to Dashboard', onPress: () => router.push('/(tabs)') }}
          />
        ) : (
          patches.map((patch, i) => (
            <ReportCard key={patch.bodyLocation} patch={patch} index={i} />
          ))
        )}
      </ScrollView>
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

  // ── Info chip ────────────────────────────────────────────────────────
  infoChip: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
    alignSelf: 'flex-start',
  },
  infoText: {
    ...typography.micro,
    color: colors.primary,
  },

  // ── Report card ──────────────────────────────────────────────────────
  card: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  info: { flex: 1 },
  location: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  meta: {
    ...typography.micro,
    color: colors.textTertiary,
  },
  chevron: {
    fontSize: 20,
    color: colors.textTertiary,
    fontWeight: '300',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    flexWrap: 'wrap',
  },
  metricWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  metric: {
    ...typography.h2,
    color: colors.primary,
  },
  metricLabel: {
    ...typography.label,
    fontSize: 9,
    color: colors.textTertiary,
  },
  generateTag: {
    marginLeft: 'auto',
  },
  generateText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  scanFirstText: {
    color: colors.textTertiary,
  },
})
