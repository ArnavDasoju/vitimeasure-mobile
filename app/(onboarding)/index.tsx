/**
 * Onboarding Screen — 3-slide intro before first use
 *
 * Premium full-screen experience with gradient header,
 * large icon illustrations, step badge, and smooth transitions.
 */

import React, { useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Path, Svg, Circle, Rect, Line } from 'react-native-svg'
import * as SecureStore from 'expo-secure-store'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore } from '../../src/store/appStore'
import { Button } from '../../src/components/ui/Button'
import { colors, gradients, layout, radii, spacing, typography } from '../../src/theme'

const { width: SCREEN_W } = Dimensions.get('window')

// ─── Slide icons (large SVG illustrations) ───────────────────────────────────

function IconScan({ color }: { color: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.2} />
      <Path d="M12 2a10 10 0 0110 10" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.4} />
      <Circle cx={12} cy={12} r={1.5} fill={color} />
    </Svg>
  )
}

function IconChart({ color }: { color: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
      <Path d="M3 20L8 14l4 4 5-7 4 4" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={8} cy={14} r={2} stroke={color} strokeWidth={1.2} />
      <Circle cx={12} cy={18} r={2} stroke={color} strokeWidth={1.2} />
      <Circle cx={17} cy={11} r={2} stroke={color} strokeWidth={1.2} />
    </Svg>
  )
}

function IconShare({ color }: { color: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={3} width={16} height={18} rx={2} stroke={color} strokeWidth={1.3} />
      <Line x1={8} y1={9} x2={16} y2={9} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Line x1={8} y1={13} x2={16} y2={13} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Line x1={8} y1={17} x2={13} y2={17} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M16 15l2 2 2-2" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={18} y1={17} x2={18} y2={12} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  )
}

const SLIDES = [
  {
    title: 'Track your patch,\nnot just your mood',
    subtitle:
      'Take consistent photos of your vitiligo patches. Measure your depigmented area so you have real data — not guesses.',
    Icon: IconScan,
  },
  {
    title: 'See if your treatment\nis working',
    subtitle:
      'Track percentage change over weeks and months. Watch your trend line improve in real time.',
    Icon: IconChart,
  },
  {
    title: 'Share with your\ndermatologist',
    subtitle:
      'Export a clean PDF report with before/after images, trend charts, and analysis — ready for your next appointment.',
    Icon: IconShare,
  },
]

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const { setOnboardingDone } = useAppStore()
  const [index, setIndex] = useState(0)
  const flatRef = useRef<FlatList>(null)

  const next = () => {
    if (index < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true })
      setIndex(index + 1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }
  }

  const finish = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    await SecureStore.setItemAsync('onboardingDone', 'true')
    setOnboardingDone(true)
  }

  const isLast = index === SLIDES.length - 1

  return (
    <View style={styles.screen}>
      {/* ── Gradient top accent ──────────────────────────────── */}
      <LinearGradient
        colors={[...gradients.primaryHero]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.topGradient, { paddingTop: insets.top + spacing.xl }]}
      >
        <Text style={styles.brandName}>VITImeasure</Text>
      </LinearGradient>

      {/* ── Slides ──────────────────────────────────────────────── */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        style={styles.flatList}
        renderItem={({ item, index: slideIdx }) => (
          <Animated.View entering={FadeIn.duration(400)} style={styles.slide}>
            {/* Icon circle */}
            <View style={styles.iconCircle}>
              <LinearGradient
                colors={[...gradients.primarySoft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <item.Icon color={colors.primary} />
            </View>

            {/* Step badge */}
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{slideIdx + 1} of {SLIDES.length}</Text>
            </View>

            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </Animated.View>
        )}
      />

      {/* ── Dot indicators ─────────────────────────────────────── */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label={isLast ? 'Get Started' : 'Next'}
          onPress={isLast ? finish : next}
          size="lg"
          fullWidth
        />
        {!isLast && (
          <TouchableOpacity onPress={finish} hitSlop={8} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip intro</Text>
          </TouchableOpacity>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          VITImeasure is for personal tracking only.{'\n'}Results are estimates, not medical diagnoses.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },

  // ── Top gradient ──────────────────────────────────────────────────────
  topGradient: {
    paddingBottom: spacing['3xl'],
    alignItems: 'center',
    borderBottomLeftRadius: radii['2xl'],
    borderBottomRightRadius: radii['2xl'],
  },
  brandName: {
    ...typography.h2,
    color: colors.textOnPrimary,
    letterSpacing: -0.5,
    fontWeight: '800',
  },

  // ── Slides ──────────────────────────────────────────────────────────────
  flatList: {
    flex: 1,
  },
  slide: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding + spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    overflow: 'hidden',
  },
  stepBadge: {
    backgroundColor: colors.primarySubtle,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },

  // ── Dots ──────────────────────────────────────────────────────────────
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textDisabled,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // ── Actions ────────────────────────────────────────────────────────────
  actions: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.xs,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  skipText: {
    ...typography.bodySm,
    color: colors.textTertiary,
  },

  // ── Disclaimer ─────────────────────────────────────────────────────────
  disclaimer: {
    ...typography.micro,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 16,
    marginTop: spacing.sm,
  },
})
