export type BoundingBox = {
  left: number
  top: number
  width: number
  height: number
}

export type ProgressEntry = {
  id: string
  userId: string
  bodyLocation: string
  scanDate: string
  affectedPercent: number
  unaffectedPercent: number
  imageUrl: string
  localImagePath?: string
  boundingBoxes: BoundingBox[]
  dominantColor: string
  accentColor: string
  vasiScore?: number
}

export type TrackedPatch = {
  bodyLocation: string
  latestAffectedPercent: number
  latestScanDate: string
  totalScans: number
  changeFromLast: number | null
  sparklineData: number[]
}

export type AnalyzeResult = {
  id: string
  userId: string
  bodyLocation: string
  scanDate: string
  affectedPercent: number
  unaffectedPercent: number
  boundingBoxes: BoundingBox[]
  imageUrl: string
  dominantColor: string
  accentColor: string
  changeFromPrevious?: number
  // Fields from the Python vitiligo analyzer
  patchCount?: number
  skinTone?: string
  ratio?: string
  annotatedImage?: string  // base64 JPEG with cyan contour outlines
  detectionConfidence?: number  // 0.0–1.0, derived from skin_coverage when available
}

export type ReportResult = {
  reportUrl: string
}
