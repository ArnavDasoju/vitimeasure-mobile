/**
 * Tab Navigator Layout
 *
 * 4 tabs: Home, History, Report, Settings
 * Fully custom tab bar with animated pill highlight,
 * spring animation, and haptic feedback.
 */

import { Tabs } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import React from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Circle, Line, Path, Rect, Svg } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { colors } from '../../src/theme'

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconHome({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9 21V12h6v9"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function IconHistory({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 7v5l3 3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function IconReport({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={3} width={16} height={18} rx={2} stroke={color} strokeWidth={1.8} />
      <Line x1={8} y1={9} x2={16} y2={9} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={8} y1={13} x2={16} y2={13} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={8} y1={17} x2={12} y2={17} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

function IconSettings({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ─── Tab definitions ───────────────────────────────────────────────────────────

type TabName = 'index' | 'history' | 'report' | 'settings'

const TAB_ICONS: Record<TabName, React.FC<{ color: string }>> = {
  index: IconHome,
  history: IconHistory,
  report: IconReport,
  settings: IconSettings,
}

const TAB_LABELS: Record<TabName, string> = {
  index: 'Home',
  history: 'History',
  report: 'Reports',
  settings: 'Settings',
}

// ─── Single tab button ───────────────────────────────────────────────────────

function TabButton({ name, focused, onPress }: { name: TabName; focused: boolean; onPress: () => void }) {
  const scale = useSharedValue(1)
  const prevFocused = React.useRef(focused)

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  React.useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.06, { damping: 14, stiffness: 280 })
      if (!prevFocused.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      }
    } else {
      scale.value = withSpring(1, { damping: 14, stiffness: 280 })
    }
    prevFocused.current = focused
  }, [focused])

  const Icon = TAB_ICONS[name]
  const label = TAB_LABELS[name]
  const iconColor = focused ? colors.primary : colors.textTertiary

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <Animated.View style={[styles.tabContent, animStyle]}>
        {focused && <View style={styles.activePill} />}
        <Icon color={iconColor} />
        <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

// ─── Custom tab bar ──────────────────────────────────────────────────────────

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
      <View style={styles.tabRow}>
        {state.routes.map((route, index) => (
          <TabButton
            key={route.key}
            name={route.name as TabName}
            focused={state.index === index}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!event.defaultPrevented) {
                navigation.navigate(route.name)
              }
            }}
          />
        ))}
      </View>
    </View>
  )
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="report" />
      <Tabs.Screen name="settings" />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  tabRow: {
    flexDirection: 'row',
    height: 56,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 2,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: 'rgba(79, 70, 229, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.12)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
})
