/**
 * AIChatCard — conversational assistant embedded in the Patch Detail screen.
 *
 * Lets the user ask free-form questions about their scan data, graph, VASI score,
 * and anything else they want to understand. Context (scan history, body location,
 * VASI, trend) is sent with every request for full picture.
 *
 * Design mirrors InsightCard: indigo "ASK" label, same Card shell, same font
 * scale — it looks like a natural continuation of the insights section.
 *
 * Messages are rendered in a ScrollView capped at 260 pt so the card stays
 * compact; the outer patch-detail ScrollView handles page-level scrolling.
 */

import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Card } from './ui/Card'
import { askAI } from '../lib/api'
import { colors, radii, spacing, typography } from '../theme'
import type { ProgressEntry } from '../types/app'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string
  role: 'user' | 'ai'
  text: string
}

type Props = {
  bodyLocation: string
  /** Scans sorted ascending by date */
  scans: ProgressEntry[]
  vasiScore: number
  changeFromLast: number | null
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

const GREETING: Message = {
  id: 'greeting',
  role: 'ai',
  text: "Hi! Ask me anything about your vitiligo data — what the graph shows, what your VASI score means, how your trend compares to typical patterns, or anything else you'd like to understand.",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIChatCard({ bodyLocation, scans, vasiScore, changeFromLast }: Props) {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  const hasHistory = messages.length > 1

  const handleSend = async () => {
    const q = draft.trim()
    if (!q || loading) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: q }
    setDraft('')
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    // Build conversation history for the API (exclude the static greeting)
    const history = messages
      .filter((m) => m.id !== 'greeting')
      .map((m) => ({ role: m.role as 'user' | 'ai', content: m.text }))

    try {
      const result = await askAI({
        question: q,
        context: {
          bodyLocation,
          scans: scans.map((s) => ({
            scanDate: s.scanDate,
            affectedPercent: s.affectedPercent,
            vasiScore: s.vasiScore,
          })),
          vasiScore,
          changeFromLast,
        },
        conversationHistory: history,
      })

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        text: result.answer || "Sorry, I couldn't generate a response. Please try again.",
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'ai',
          text: 'Something went wrong. Check your connection and try again.',
        },
      ])
    } finally {
      setLoading(false)
      // Scroll to bottom after response arrives
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  const handleClear = () => {
    setMessages([GREETING])
    setDraft('')
  }

  return (
    <Card style={styles.card}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.aiLabel}>ASK</Text>
        {hasHistory && (
          <TouchableOpacity onPress={handleClear} hitSlop={10} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Messages ──────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.messagesArea}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={Platform.OS === 'android'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.bubble,
              msg.role === 'user' ? styles.userBubble : styles.aiBubble,
            ]}
          >
            <Text style={msg.role === 'user' ? styles.userText : styles.aiText}>
              {msg.text}
            </Text>
          </View>
        ))}

        {/* Typing indicator */}
        {loading && (
          <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </ScrollView>

      {/* ── Input row ─────────────────────────────────────────────── */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your data…"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={500}
          returnKeyType="send"
          enablesReturnKeyAutomatically
          blurOnSubmit
          onSubmitEditing={handleSend}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || loading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || loading}
          activeOpacity={0.75}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
    </Card>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },

  // ── Header ──────────────────────────────────────────────────────
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
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
  },

  // ── Messages ─────────────────────────────────────────────────────
  messagesArea: {
    maxHeight: 260,
    marginBottom: spacing.md,
  },
  messagesContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  aiText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  userText: {
    ...typography.bodySm,
    color: colors.textOnPrimary,
    lineHeight: 20,
  },
  typingBubble: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },

  // ── Input row ────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 10 : spacing.sm,
    paddingBottom: spacing.sm,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.primarySubtle,
  },
  sendIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textOnPrimary,
    lineHeight: 18,
  },
})
