/**
 * Report Viewer Screen
 *
 * Displays a saved HTML report in a scrollable WebView.
 * The bottom action bar provides Download (native share sheet) and Delete options.
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { deleteAsync, readAsStringAsync } from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppHeader } from '../../src/components/ui/AppHeader'
import { colors, radii, spacing, typography } from '../../src/theme'

export default function ReportViewerScreen() {
  const { filePath: encodedPath, title } = useLocalSearchParams<{
    filePath: string
    title?: string
  }>()
  const filePath = decodeURIComponent(encodedPath ?? '')
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const content = await readAsStringAsync(filePath)
        setHtml(content)
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [filePath])

  const handleDownload = async () => {
    try {
      const available = await Sharing.isAvailableAsync()
      if (available) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/html',
          dialogTitle: 'Share your vitiligo report',
          UTI: 'public.html',
        })
      }
    } catch {
      Alert.alert('Error', 'Could not open share sheet.')
    }
  }

  const handleDelete = () => {
    Alert.alert('Delete Report', 'Are you sure you want to delete this report?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAsync(filePath, { idempotent: true })
          } catch {}
          router.back()
        },
      },
    ])
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        title={title ?? 'Report'}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading report…</Text>
        </View>
      ) : loadError || !html ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load report.</Text>
        </View>
      ) : (
        <WebView
          source={{ html }}
          style={styles.webview}
          scrollEnabled
          showsVerticalScrollIndicator
          originWhitelist={['*']}
        />
      )}

      {!loading && !loadError && html && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleDownload}
            activeOpacity={0.8}
          >
            <Text style={styles.downloadBtnText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bgCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  downloadBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  downloadBtnText: {
    ...typography.bodyMedium,
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: colors.dangerSubtle,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  deleteBtnText: {
    ...typography.bodyMedium,
    color: colors.danger,
    fontWeight: '600',
  },
})
