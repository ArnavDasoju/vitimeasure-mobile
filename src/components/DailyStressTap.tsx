/**
 * DailyStressTap
 *
 * A row of 5 emoji circles the user taps once per day to log their stress level.
 * On tap the selected circle springs to 1.15× scale, then the whole card fades
 * out after 800 ms and the component removes itself from the tree.
 *
 * Props:
 *   userEmail  — used to write the entry to local storage
 *   userId     — stored on the DailyStressEntry record
 *   onLogged   — called with the chosen score so the parent can update state
 */

import React, { useRef, useState } from 'react'
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { saveDailyStress } from '../lib/storage'
import { getStressColor } from '../utils/stressColors'
import { colors, radii, spacing, typography } from '../theme'

const SCORES = [1, 2, 3, 4, 5]

type Props = {
  userEmail: string
  userId: string
  onLogged: (score: number) => void
}

export function DailyStressTap({ userEmail, userId, onLogged }: Props) {
  const [logged, setLogged] = useState(false)
  const [selectedScore, setSelectedScore] = useState<number | null>(null)

  // One scale value per circle
  const scales = useRef(SCORES.map(() => new Animated.Value(1))).current
  const containerOpacity = useRef(new Animated.Value(1)).current

  const handleTap = async (score: number) => {
    if (logged) return
    setSelectedScore(score)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})

    const idx = score - 1

    // Spring the selected circle
    Animated.spring(scales[idx], {
      toValue: 1.15,
      useNativeDriver: true,
      speed: 30,
      bounciness: 8,
    }).start()

    // After 800 ms fade the whole card out, then mark logged
    setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setLogged(true)
      })
    }, 800)

    const today = new Date().toISOString().split('T')[0]
    await saveDailyStress(userEmail, {
      id: `stress_${userId}_${today}`,
      userId,
      date: today,
      stressScore: score,
      source: 'in-app',
      loggedAt: new Date().toISOString(),
    })

    onLogged(score)
  }

  if (logged) return null

  return (
    <Animated.View style={[styles.card, { opacity: containerOpacity }]}>
      <Text style={styles.label}>How stressed are you today?</Text>
      <View style={styles.row}>
        {SCORES.map((score, idx) => {
          const color = getStressColor(score)
          const isSelected = selectedScore === score
          return (
            <Animated.View
              key={score}
              style={{ transform: [{ scale: scales[idx] }] }}
            >
              <TouchableOpacity
                style={[
                  styles.circle,
                  { backgroundColor: color + '22', borderColor: color },
                  isSelected && { backgroundColor: color + '44' },
                ]}
                onPress={() => handleTap(score)}
                activeOpacity={0.8}
                disabled={selectedScore !== null}
              >
                <Text style={[styles.scoreLabel, { color }]}>{score}</Text>
              </TouchableOpacity>
            </Animated.View>
          )
        })}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 0,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 3,
  },
  label: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
})
