import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Haptics from 'expo-haptics'
import { File, Directory, Paths } from 'expo-file-system'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ClipPath, Defs, Ellipse, Line, Path, Rect as SvgRect, Svg } from 'react-native-svg'
import { useAppStore } from '../../src/store/appStore'
import { analyzeScan } from '../../src/lib/api'
import { colors, radii, spacing } from '../../src/theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const OVAL_W = SCREEN_W * 0.72
const OVAL_H = SCREEN_H * 0.38

export default function ScanScreen() {
  const { bodyLocation: encoded } = useLocalSearchParams<{ bodyLocation: string }>()
  const bodyLocation = decodeURIComponent(encoded ?? '')
  const router = useRouter()
  const { userId } = useAppStore()

  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [facing, setFacing] = useState<CameraType>('back')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<CameraView>(null)

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [])

  const handleCapture = async () => {
    if (!cameraRef.current || analyzing) return
    try {
      setError(null)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setAnalyzing(true)

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false })
      if (!photo) throw new Error('Failed to capture photo')

      // Crop to the oval guide region so the backend only receives the skin area,
      // then resize and compress for upload.
      const scaleX = photo.width / SCREEN_W
      const scaleY = photo.height / SCREEN_H
      const cropRegion = {
        originX: ((SCREEN_W - OVAL_W) / 2) * scaleX,
        originY: ((SCREEN_H - OVAL_H) / 2) * scaleY,
        width: OVAL_W * scaleX,
        height: OVAL_H * scaleY,
      }

      const resized = await ImageManipulator.ImageManipulator
        .manipulate(photo.uri)
        .crop(cropRegion)
        .resize({ width: 1600 })
        .renderAsync()
        .then((r) => r.saveAsync({ compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }))

      const result = await analyzeScan(resized.uri, userId!, bodyLocation)

      // Save a permanent local copy of the compressed image so thumbnails
      // survive after the Azure imageUrl expires.
      let localImagePath = ''
      try {
        const scanDir = new Directory(Paths.document, 'vitiligo_scans')
        if (!scanDir.exists) scanDir.create({ intermediates: true })
        const destFile = new File(scanDir, result.id + '.jpg')
        new File(resized.uri).copy(destFile)
        localImagePath = destFile.uri
      } catch (copyErr) {
        console.error('[VITImeasure] Failed to save local scan image:', copyErr)
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace({
        pathname: '/results',
        params: { data: JSON.stringify(result), localImagePath },
      })
    } catch (err: any) {
      setError(err.message ?? 'Analysis failed. Please try again.')
      setAnalyzing(false)
    }
  }

  if (!permission) return <View style={styles.container} />

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permText}>VITImeasure needs your camera to photograph vitiligo patches.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      {/* Oval overlay — SVG mask for clean cutout */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SCREEN_W} height={SCREEN_H}>
          <Defs>
            <ClipPath id="hole">
              <SvgRect x={0} y={0} width={SCREEN_W} height={SCREEN_H} />
              <Ellipse
                cx={SCREEN_W / 2}
                cy={SCREEN_H / 2}
                rx={OVAL_W / 2}
                ry={OVAL_H / 2}
              />
            </ClipPath>
          </Defs>
          {/* Dark overlay with oval hole */}
          <SvgRect
            x={0} y={0}
            width={SCREEN_W}
            height={SCREEN_H}
            fill="rgba(0,0,0,0.55)"
            clipPath="url(#hole)"
            clipRule="evenodd"
          />
          {/* Oval border */}
          <Ellipse
            cx={SCREEN_W / 2}
            cy={SCREEN_H / 2}
            rx={OVAL_W / 2}
            ry={OVAL_H / 2}
            fill="none"
            stroke="rgba(129,140,248,0.5)"
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        </Svg>
      </View>

      {/* Top instruction */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Line x1={6} y1={6} x2={18} y2={18} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
            <Line x1={18} y1={6} x2={6} y2={18} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.instruction}>Center your patch within the oval</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Location tag */}
      <View style={styles.locationTag}>
        <Text style={styles.locationText}>{bodyLocation}</Text>
      </View>

      {/* Analyzing overlay */}
      {analyzing && (
        <View style={styles.analyzingOverlay}>
          <View style={styles.analyzingRing}>
            <ActivityIndicator color="#818CF8" size="large" />
          </View>
          <Text style={styles.analyzingText}>Analyzing scan…</Text>
          <Text style={styles.analyzingSubtext}>This usually takes a few seconds</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { bottom: insets.bottom + 32 }]}>
        <TouchableOpacity
          style={styles.flipBtn}
          onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
          accessibilityLabel="Flip camera"
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M16 3h5v5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M4 20L21 3" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M21 16v5h-5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M15 15l6 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M4 4l5 5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureBtn, analyzing && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={analyzing}
          accessibilityLabel="Capture photo"
          accessibilityRole="button"
        >
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>

        <View style={{ width: 56 }} />
      </View>

      <Text style={[styles.tip, { bottom: insets.bottom + 8 }]}>Keep consistent lighting for accurate comparisons</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  instruction: {
    fontSize: 13,
    color: colors.textOnPrimary,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  locationTag: {
    position: 'absolute',
    top: (SCREEN_H - OVAL_H) / 2 - 40,
    alignSelf: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
  },
  locationText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: '700' },
  analyzingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,10,20,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  analyzingRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  analyzingText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  analyzingSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  errorBanner: {
    position: 'absolute',
    bottom: 160,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(248,113,113,0.9)',
    borderRadius: 12,
    padding: spacing.md,
  },
  errorText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  flipBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3.5,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: { opacity: 0.3 },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  tip: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  permTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  permText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 },
  permBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: 32 },
  permBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
})
