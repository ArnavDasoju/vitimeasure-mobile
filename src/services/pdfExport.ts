/**
 * PDF Export Service
 *
 * Generates a clinical-quality HTML report and exports it as a PDF
 * using expo-print. The native share sheet opens automatically so the
 * user can save to Files, share via Mail, etc.
 */

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import {
  getInfoAsync,
  readAsStringAsync,
  makeDirectoryAsync,
  copyAsync,
  documentDirectory,
  EncodingType,
} from 'expo-file-system/legacy'
import { computeVASI, getVASISeverity } from '../utils/vasiScore'
import {
  generateVelocityInsightText,
  type RepigmentationVelocityResult,
} from '../utils/repigmentationVelocity'
import type { StoredScan, StoredPatch, TreatmentLogEntry } from '../lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PdfExportParams {
  patch: StoredPatch
  scans: StoredScan[]
  treatments: TreatmentLogEntry[]
  velocityResult: RepigmentationVelocityResult | null
  dateRange: { start: string; end: string }
  userName: string
  /** Optional: pass the most recent scan to include the analysis summary table */
  latestAnalysis?: {
    percentage: number
    healthyPct: number
    ratio: string
    patchCount: number
    skinTone: string
    scanDate: string
    annotatedImage?: string // base64 JPEG
  }
}

// ─── Date formatting helpers ──────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtProjectedDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `~${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

// ─── Load image as base64 (silently skips on error) ──────────────────────────

async function loadImageBase64(scan: StoredScan): Promise<string | null> {
  try {
    if (scan.localImagePath) {
      const info = await getInfoAsync(scan.localImagePath)
      if (info.exists) {
        const b64 = await readAsStringAsync(scan.localImagePath, {
          encoding: EncodingType.Base64,
        })
        return `data:image/jpeg;base64,${b64}`
      }
    }
  } catch {
    // fall through silently
  }
  return null
}

// ─── HTML generation ──────────────────────────────────────────────────────────

export async function generatePatchReport(params: PdfExportParams): Promise<string> {
  const { patch, scans, treatments, velocityResult, dateRange, userName, latestAnalysis } = params

  const today = fmtDate(new Date().toISOString())

  // Filter scans to date range, sorted ascending
  const rangeScans = scans
    .filter((s) => {
      const d = s.date.split('T')[0]
      return d >= dateRange.start && d <= dateRange.end
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const firstScan = rangeScans[0]
  const lastScan = rangeScans[rangeScans.length - 1]
  const startPct = firstScan?.affectedPercent ?? 0
  const endPct = lastScan?.affectedPercent ?? 0
  const diff = endPct - startPct

  // All scans sorted for the full-history chart
  const allScansSorted = [...scans].sort((a, b) => a.date.localeCompare(b.date))

  // ── CSS variables & styles ────────────────────────────────────────────
  const cssVars = `
    <style>
      :root {
        --bg-primary: #0a0e1a;
        --bg-card: rgba(255,255,255,0.04);
        --bg-card-hover: rgba(255,255,255,0.07);
        --border: rgba(255,255,255,0.08);
        --border-accent: rgba(99,102,241,0.3);
        --text-primary: #e8eaed;
        --text-secondary: #9aa0b0;
        --text-muted: #5a6070;
        --accent: #818cf8;
        --accent-bright: #a5b4fc;
        --accent-glow: rgba(129,140,248,0.15);
        --success: #34d399;
        --success-dim: rgba(52,211,153,0.15);
        --danger: #f87171;
        --danger-dim: rgba(248,113,113,0.15);
        --warning: #fbbf24;
        --warning-dim: rgba(251,191,36,0.15);
        --cyan: #22d3ee;
        --cyan-dim: rgba(34,211,238,0.12);
        --gradient-hero: linear-gradient(135deg, #0a0e1a 0%, #1a1040 50%, #0f172a 100%);
        --gradient-accent: linear-gradient(135deg, #6366f1, #818cf8, #a5b4fc);
        --gradient-success: linear-gradient(135deg, #059669, #34d399);
        --gradient-danger: linear-gradient(135deg, #dc2626, #f87171);
        --font: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      }
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        font-family: var(--font);
        background: var(--bg-primary);
        color: var(--text-primary);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }
      .container { max-width: 680px; margin: 0 auto; padding: 32px 24px; }
      .card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 20px;
        backdrop-filter: blur(12px);
      }
      .card-glow {
        border-color: var(--border-accent);
        box-shadow: 0 0 40px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .section-tag {
        display: inline-block;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--accent);
        background: var(--accent-glow);
        padding: 4px 10px;
        border-radius: 6px;
        margin-bottom: 12px;
      }
      h2 {
        font-size: 18px;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 16px;
        letter-spacing: -0.3px;
      }
      .stat-grid {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .stat-box {
        flex: 1;
        min-width: 120px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
      }
      .stat-value {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -1px;
        line-height: 1.1;
      }
      .stat-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--text-muted);
        margin-top: 6px;
      }
      .progress-bar-bg {
        width: 100%;
        height: 6px;
        background: rgba(255,255,255,0.06);
        border-radius: 3px;
        overflow: hidden;
        margin-top: 8px;
      }
      .progress-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.3s;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid var(--border);
      }
      thead th {
        padding: 12px 16px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-muted);
        background: rgba(255,255,255,0.03);
        text-align: left;
        border-bottom: 1px solid var(--border);
      }
      tbody td {
        padding: 11px 16px;
        font-size: 13px;
        color: var(--text-secondary);
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      tbody tr:last-child td { border-bottom: none; }
      tbody tr:hover { background: rgba(255,255,255,0.02); }
      .badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .badge-success { background: var(--success-dim); color: var(--success); }
      .badge-danger { background: var(--danger-dim); color: var(--danger); }
      .badge-warning { background: var(--warning-dim); color: var(--warning); }
      .badge-neutral { background: rgba(255,255,255,0.06); color: var(--text-muted); }
      .badge-accent { background: var(--accent-glow); color: var(--accent-bright); }
      .chart-container {
        position: relative;
        width: 100%;
        height: 180px;
        background: rgba(255,255,255,0.02);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      .chart-bar {
        position: absolute;
        bottom: 0;
        background: linear-gradient(to top, rgba(99,102,241,0.6), rgba(129,140,248,0.2));
        border-radius: 4px 4px 0 0;
        min-width: 4px;
      }
      .chart-dot {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent-bright);
        border: 2px solid var(--bg-primary);
        box-shadow: 0 0 8px var(--accent);
        transform: translate(-50%, 50%);
      }
      .chart-label {
        position: absolute;
        bottom: -20px;
        font-size: 8px;
        color: var(--text-muted);
        transform: translateX(-50%);
        white-space: nowrap;
      }
      .divider {
        border: none;
        border-top: 1px solid var(--border);
        margin: 24px 0;
      }
      .insight-box {
        background: var(--accent-glow);
        border: 1px solid var(--border-accent);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 16px;
      }
      .insight-box p {
        font-size: 13px;
        color: var(--accent-bright);
        line-height: 1.6;
      }
      .confidence-meter {
        display: flex;
        gap: 3px;
        align-items: center;
      }
      .confidence-bar {
        width: 24px;
        height: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.08);
      }
      .confidence-bar.active { background: var(--accent); }
      .photo-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .photo-card {
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid var(--border);
        width: 160px;
      }
      .photo-card img {
        width: 160px;
        height: 160px;
        object-fit: cover;
        display: block;
      }
      .photo-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 8px 10px;
        background: linear-gradient(transparent, rgba(0,0,0,0.85));
      }
      .photo-overlay span {
        font-size: 10px;
        color: #fff;
        display: block;
      }
      .timeline-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .timeline-row:last-child { border-bottom: none; }
      .timeline-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .timeline-line {
        width: 2px;
        height: 20px;
        background: var(--border);
        margin-left: 4px;
      }
    </style>
  `

  // ── SECTION: Hero Header ──────────────────────────────────────────────
  const headerHtml = `
    <div style="background:var(--gradient-hero);border-radius:20px;padding:32px 28px;margin-bottom:24px;border:1px solid var(--border);position:relative;overflow:hidden;">
      <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;background:radial-gradient(circle,rgba(99,102,241,0.12) 0%,transparent 70%);"></div>
      <div style="position:absolute;bottom:-60px;left:-20px;width:160px;height:160px;background:radial-gradient(circle,rgba(34,211,238,0.08) 0%,transparent 70%);"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;">
        <div>
          <div style="font-size:32px;font-weight:800;letter-spacing:-1px;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">VITImeasure</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;font-weight:500;">Vitiligo Progress Report</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--text-muted);line-height:1.8;">
            <div><span style="color:var(--text-secondary);font-weight:600;">Patient</span> &nbsp;${userName}</div>
            <div><span style="color:var(--text-secondary);font-weight:600;">Generated</span> &nbsp;${today}</div>
            <div><span style="color:var(--text-secondary);font-weight:600;">Period</span> &nbsp;${fmtShortDate(dateRange.start)} &ndash; ${fmtShortDate(dateRange.end)}</div>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap;">
        <span class="badge badge-accent">${patch.bodyLocation}</span>
        <span class="badge badge-neutral">${rangeScans.length} scan${rangeScans.length !== 1 ? 's' : ''} in range</span>
        ${velocityResult ? `<span class="badge ${velocityResult.isImproving ? 'badge-success' : velocityResult.isWorsening ? 'badge-danger' : 'badge-neutral'}">${velocityResult.isImproving ? 'Improving' : velocityResult.isWorsening ? 'Worsening' : 'Stable'}</span>` : ''}
        ${treatments.length > 0 ? `<span class="badge badge-warning">${treatments.filter(t => t.isActive).length} active treatment${treatments.filter(t => t.isActive).length !== 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>
  `

  // ── SECTION: Executive Summary ────────────────────────────────────────
  let summaryVerdict = ''
  let summaryColor = 'var(--text-muted)'
  if (firstScan && lastScan && firstScan.id !== lastScan.id) {
    if (diff < -1) {
      summaryVerdict = `Affected area decreased by ${Math.abs(diff).toFixed(1)}% over this period — positive trend.`
      summaryColor = 'var(--success)'
    } else if (diff > 1) {
      summaryVerdict = `Affected area increased by ${diff.toFixed(1)}% over this period — discuss with your dermatologist.`
      summaryColor = 'var(--danger)'
    } else {
      summaryVerdict = 'Condition has remained stable over the selected period.'
      summaryColor = 'var(--text-secondary)'
    }
  } else if (rangeScans.length === 1) {
    summaryVerdict = 'Only one scan in this period — trend assessment requires multiple data points.'
  } else {
    summaryVerdict = 'No scan data available for the selected period.'
  }

  const lastVasi = lastScan ? computeVASI(patch.bodyLocation, lastScan.affectedPercent) : 0
  const lastSev = getVASISeverity(lastVasi)

  const executiveSummaryHtml = `
    <div class="card card-glow">
      <div class="section-tag">Executive Summary</div>
      <h2>Key Findings</h2>
      <p style="font-size:14px;color:${summaryColor};line-height:1.7;margin-bottom:16px;">${summaryVerdict}</p>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-value" style="color:var(--accent);">${rangeScans.length}</div>
          <div class="stat-label">Total Scans</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:var(--text-primary);">${firstScan ? startPct.toFixed(1) + '%' : '—'}</div>
          <div class="stat-label">Starting</div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(startPct, 100)}%;background:var(--gradient-accent);"></div></div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:${diff < 0 ? 'var(--success)' : diff > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${lastScan ? endPct.toFixed(1) + '%' : '—'}</div>
          <div class="stat-label">Current</div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(endPct, 100)}%;background:${diff < 0 ? 'var(--gradient-success)' : diff > 0 ? 'var(--gradient-danger)' : 'var(--gradient-accent)'};"></div></div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:${diff < 0 ? 'var(--success)' : diff > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
            ${firstScan && lastScan && firstScan.id !== lastScan.id ? (diff > 0 ? '+' : '') + diff.toFixed(1) + '%' : '—'}
          </div>
          <div class="stat-label">Net Change</div>
        </div>
      </div>
      ${lastScan ? `
        <div style="margin-top:16px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:11px;color:var(--text-muted);font-weight:600;">Current VASI:</span>
          <span style="font-size:13px;font-weight:700;color:${lastSev.color};font-family:var(--font-mono);">${lastVasi.toFixed(2)}</span>
          <span class="badge" style="background:${lastSev.color}22;color:${lastSev.color};">${lastSev.label}</span>
        </div>
      ` : ''}
    </div>
  `

  // ── SECTION: Progress Chart (CSS bar chart) ───────────────────────────
  let chartHtml = ''
  if (allScansSorted.length >= 2) {
    const maxPct = Math.max(...allScansSorted.map(s => s.affectedPercent), 1)
    const chartH = 150
    const barW = Math.max(8, Math.min(40, Math.floor(580 / allScansSorted.length) - 8))

    const bars = allScansSorted.map((s, i) => {
      const h = Math.max(4, (s.affectedPercent / maxPct) * chartH)
      const left = 16 + i * (barW + 8)
      const inRange = rangeScans.some(rs => rs.id === s.id)
      const barColor = inRange
        ? 'linear-gradient(to top, rgba(99,102,241,0.8), rgba(165,180,252,0.4))'
        : 'linear-gradient(to top, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
      return `<div style="position:absolute;bottom:28px;left:${left}px;width:${barW}px;height:${h}px;background:${barColor};border-radius:4px 4px 0 0;"></div>
              <div style="position:absolute;bottom:${h + 30}px;left:${left}px;width:${barW}px;text-align:center;font-size:8px;color:${inRange ? 'var(--accent-bright)' : 'var(--text-muted)'};font-weight:600;font-family:var(--font-mono);">${s.affectedPercent.toFixed(1)}</div>
              <div style="position:absolute;bottom:8px;left:${left}px;width:${barW}px;text-align:center;font-size:7px;color:var(--text-muted);white-space:nowrap;">${new Date(s.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>`
    }).join('')

    const chartWidth = 32 + allScansSorted.length * (barW + 8)

    chartHtml = `
      <div class="card">
        <div class="section-tag">Progress Timeline</div>
        <h2>Affected Area Over Time</h2>
        <div style="position:relative;width:100%;height:${chartH + 50}px;overflow-x:auto;overflow-y:hidden;">
          <div style="position:relative;width:${Math.max(chartWidth, 100)}px;height:100%;">
            ${bars}
          </div>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;">
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:8px;border-radius:2px;background:var(--accent);"></div><span style="font-size:10px;color:var(--text-muted);">Selected range</span></div>
          <div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:8px;border-radius:2px;background:rgba(255,255,255,0.12);"></div><span style="font-size:10px;color:var(--text-muted);">Outside range</span></div>
        </div>
      </div>
    `
  }

  // ── SECTION: Skin Analysis ────────────────────────────────────────────
  let aiSummaryHtml = ''
  if (latestAnalysis) {
    const annotatedImgTag = latestAnalysis.annotatedImage
      ? `<div style="margin:16px 0;text-align:center;">
           <img src="data:image/jpeg;base64,${latestAnalysis.annotatedImage}"
                style="width:100%;max-width:480px;border-radius:12px;display:inline-block;border:1px solid var(--border);" />
           <div style="font-size:10px;color:var(--text-muted);margin-top:8px;">
             Annotated image &mdash; cyan outlines mark detected vitiligo regions
           </div>
         </div>`
      : ''

    const healthyPctBar = Math.min(latestAnalysis.healthyPct, 100)
    const affectedPctBar = Math.min(latestAnalysis.percentage, 100)

    aiSummaryHtml = `
      <div class="card card-glow">
        <div class="section-tag">Skin Analysis</div>
        <h2>Skin Analysis Summary</h2>
        ${annotatedImgTag}
        <div class="stat-grid" style="margin-top:12px;">
          <div class="stat-box" style="border-color:rgba(34,211,238,0.2);">
            <div class="stat-value" style="color:var(--cyan);font-size:24px;">${latestAnalysis.percentage.toFixed(2)}%</div>
            <div class="stat-label">Vitiligo Area</div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${affectedPctBar}%;background:linear-gradient(90deg,var(--cyan),rgba(34,211,238,0.4));"></div></div>
          </div>
          <div class="stat-box" style="border-color:rgba(52,211,153,0.2);">
            <div class="stat-value" style="color:var(--success);font-size:24px;">${latestAnalysis.healthyPct.toFixed(2)}%</div>
            <div class="stat-label">Healthy Skin</div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${healthyPctBar}%;background:var(--gradient-success);"></div></div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <table>
            <tbody>
              <tr>
                <td style="font-weight:600;color:var(--text-secondary);">Skin : Vitiligo ratio</td>
                <td style="font-family:var(--font-mono);color:var(--accent-bright);">${latestAnalysis.ratio}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:var(--text-secondary);">Patches detected</td>
                <td style="font-family:var(--font-mono);color:var(--text-primary);">${latestAnalysis.patchCount}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:var(--text-secondary);">Skin tone</td>
                <td style="color:var(--text-primary);">${latestAnalysis.skinTone}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:var(--text-secondary);">Scan date</td>
                <td style="color:var(--text-primary);">${fmtShortDate(latestAnalysis.scanDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style="font-size:10px;color:var(--text-muted);margin-top:12px;line-height:1.5;">
          Analysis performed by Vitiligo Analyzer v3.0. Results are approximate and should be reviewed by a qualified dermatologist.
        </p>
      </div>
    `
  }

  // ── SECTION: VASI Trend ───────────────────────────────────────────────
  const vasiRows = rangeScans.map((s) => {
    const vasi = computeVASI(patch.bodyLocation, s.affectedPercent)
    const sev = getVASISeverity(vasi)
    return `
      <tr>
        <td style="font-family:var(--font-mono);font-size:12px;">${fmtShortDate(s.date)}</td>
        <td style="font-family:var(--font-mono);">${s.affectedPercent.toFixed(1)}%</td>
        <td style="font-family:var(--font-mono);font-weight:700;">${vasi.toFixed(2)}</td>
        <td><span class="badge" style="background:${sev.color}22;color:${sev.color};">${sev.label}</span></td>
      </tr>
    `
  }).join('')

  const vasiHtml = `
    <div class="card">
      <div class="section-tag">Clinical Index</div>
      <h2>VASI Score Trend</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Affected %</th>
            <th>VASI Score</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          ${vasiRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No scans in selected date range</td></tr>'}
        </tbody>
      </table>
    </div>
  `

  // ── SECTION: Repigmentation Velocity ──────────────────────────────────
  let velocityHtml = ''
  if (velocityResult) {
    const insightText = generateVelocityInsightText(velocityResult)
    const confLevel = velocityResult.projectionConfidence === 'high' ? 3
      : velocityResult.projectionConfidence === 'medium' ? 2 : 1
    const confBars = [1,2,3].map(i =>
      `<div class="confidence-bar${i <= confLevel ? ' active' : ''}" style="${i <= confLevel ? 'box-shadow:0 0 6px var(--accent);' : ''}"></div>`
    ).join('')

    let milestonesHtml = ''
    const milestones: Array<{ label: string; days: number | null; icon: string }> = [
      { label: '50% affected', days: velocityResult.daysTo50Percent, icon: '50' },
      { label: '25% affected', days: velocityResult.daysTo25Percent, icon: '25' },
      { label: '10% affected', days: velocityResult.daysTo10Percent, icon: '10' },
    ]
    const futureMilestones = milestones.filter((m) => m.days !== null)
    if (futureMilestones.length > 0) {
      const rows = futureMilestones.map((m) => `
        <tr>
          <td>
            <span style="font-family:var(--font-mono);font-weight:700;color:var(--accent-bright);margin-right:6px;">${m.icon}%</span>
            <span style="color:var(--text-secondary);">${m.label}</span>
          </td>
          <td style="font-family:var(--font-mono);color:var(--text-primary);">${fmtProjectedDate(m.days!)}</td>
          <td style="font-family:var(--font-mono);color:var(--accent-bright);">${m.days} days</td>
        </tr>
      `).join('')

      milestonesHtml = `
        <div style="margin-top:16px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Projected Milestones</div>
          <table>
            <thead><tr><th>Target</th><th>Projected Date</th><th>Days Remaining</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `
    }

    // Acceleration indicator
    let accelTag = ''
    if (velocityResult.isAccelerating) {
      accelTag = '<span class="badge badge-success" style="margin-left:8px;">Accelerating</span>'
    } else if (velocityResult.isDecelerating) {
      accelTag = '<span class="badge badge-warning" style="margin-left:8px;">Decelerating</span>'
    }

    velocityHtml = `
      <div class="card card-glow">
        <div class="section-tag">Velocity Analysis</div>
        <h2>Repigmentation Velocity</h2>
        <div class="insight-box">
          <p>${insightText}</p>
        </div>
        <div class="stat-grid">
          <div class="stat-box" style="border-color:${velocityResult.isImproving ? 'rgba(52,211,153,0.2)' : velocityResult.isWorsening ? 'rgba(248,113,113,0.2)' : 'var(--border)'};">
            <div class="stat-value" style="font-size:22px;color:${velocityResult.isImproving ? 'var(--success)' : velocityResult.isWorsening ? 'var(--danger)' : 'var(--text-muted)'};">
              ${velocityResult.isImproving ? '-' : velocityResult.isWorsening ? '+' : ''}${Math.abs(velocityResult.velocityPerWeek).toFixed(1)}%
            </div>
            <div class="stat-label">Per Week</div>
          </div>
          <div class="stat-box">
            <div style="display:flex;justify-content:center;align-items:center;gap:4px;margin-bottom:4px;">
              <div class="confidence-meter">${confBars}</div>
            </div>
            <div class="stat-value" style="font-size:16px;color:var(--text-primary);">${velocityResult.projectionConfidence.charAt(0).toUpperCase() + velocityResult.projectionConfidence.slice(1)}</div>
            <div class="stat-label">Confidence</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" style="font-size:22px;color:var(--accent-bright);">${velocityResult.scanCount}</div>
            <div class="stat-label">Scans Analyzed</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" style="font-size:22px;color:var(--text-primary);">${velocityResult.daysSinceFirstScan}d</div>
            <div class="stat-label">Period Tracked</div>
          </div>
        </div>
        ${accelTag ? `<div style="margin-top:12px;">${accelTag}</div>` : ''}
        <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:10px;color:var(--text-muted);font-weight:600;">Model fit (R&sup2;):</span>
          <div style="flex:1;max-width:120px;" class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${(velocityResult.rSquared * 100).toFixed(0)}%;background:var(--gradient-accent);"></div>
          </div>
          <span style="font-size:11px;font-family:var(--font-mono);color:var(--accent-bright);font-weight:700;">${velocityResult.rSquared.toFixed(3)}</span>
        </div>
        ${milestonesHtml}
      </div>
    `
  } else {
    velocityHtml = `
      <div class="card">
        <div class="section-tag">Velocity Analysis</div>
        <h2>Repigmentation Velocity</h2>
        <p style="font-size:13px;color:var(--text-muted);padding:12px 0;">Insufficient scan data for velocity calculation (minimum 4 scans required).</p>
      </div>
    `
  }

  // ── SECTION: Treatment Log ────────────────────────────────────────────
  let treatmentsHtml = ''
  if (treatments.length === 0) {
    treatmentsHtml = `
      <div class="card">
        <div class="section-tag">Treatment Plan</div>
        <h2>Active Treatments</h2>
        <p style="font-size:13px;color:var(--text-muted);padding:12px 0;">No treatments logged for this patch.</p>
      </div>
    `
  } else {
    const sortedTreatments = [...treatments].sort((a, b) => b.startDate.localeCompare(a.startDate))
    const activeTx = sortedTreatments.filter(t => t.isActive)
    const inactiveTx = sortedTreatments.filter(t => !t.isActive)

    const txRow = (t: TreatmentLogEntry) => {
      const statusBadge = t.isActive
        ? '<span class="badge badge-success">Active</span>'
        : `<span class="badge badge-neutral">Ended ${t.endDate ? fmtShortDate(t.endDate) : ''}</span>`
      const duration = t.endDate
        ? Math.ceil((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (1000*60*60*24))
        : Math.ceil((Date.now() - new Date(t.startDate).getTime()) / (1000*60*60*24))
      return `
        <tr>
          <td style="font-weight:600;color:var(--text-primary);">${t.medicationName}</td>
          <td style="font-family:var(--font-mono);color:var(--accent-bright);">${t.dose || '—'}</td>
          <td style="font-family:var(--font-mono);font-size:12px;">${fmtShortDate(t.startDate)}</td>
          <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${duration}d</td>
          <td>${statusBadge}</td>
        </tr>
      `
    }

    const allRows = [...activeTx, ...inactiveTx].map(txRow).join('')

    treatmentsHtml = `
      <div class="card">
        <div class="section-tag">Treatment Plan</div>
        <h2>Treatments &mdash; ${activeTx.length} Active / ${inactiveTx.length} Past</h2>
        <table>
          <thead>
            <tr>
              <th>Medication</th>
              <th>Dose</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${allRows}</tbody>
        </table>
        ${sortedTreatments.some(t => t.notes) ? `
          <div style="margin-top:16px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Treatment Notes</div>
            ${sortedTreatments.filter(t => t.notes).map(t => `
              <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:6px;">
                <div style="font-size:11px;font-weight:700;color:var(--accent-bright);">${t.medicationName}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${t.notes}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  // ── SECTION: Scan Timeline ────────────────────────────────────────────
  let timelineHtml = ''
  if (rangeScans.length > 0) {
    const timelineItems = rangeScans.map((s, i) => {
      const vasi = computeVASI(patch.bodyLocation, s.affectedPercent)
      const sev = getVASISeverity(vasi)
      const prevScan = i > 0 ? rangeScans[i - 1] : null
      const changeTxt = prevScan
        ? (() => {
            const c = s.affectedPercent - prevScan.affectedPercent
            if (Math.abs(c) < 0.1) return '<span style="color:var(--text-muted);">No change</span>'
            return c < 0
              ? `<span style="color:var(--success);">-${Math.abs(c).toFixed(1)}%</span>`
              : `<span style="color:var(--danger);">+${c.toFixed(1)}%</span>`
          })()
        : '<span style="color:var(--text-muted);">Baseline</span>'

      return `
        <div class="timeline-row">
          <div class="timeline-dot" style="background:${sev.color};box-shadow:0 0 8px ${sev.color}44;"></div>
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${fmtShortDate(s.date)}</span>
              ${changeTxt}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              ${s.affectedPercent.toFixed(1)}% affected &middot; VASI ${vasi.toFixed(2)} &middot;
              <span style="color:${sev.color};">${sev.label}</span>
              ${s.detectionConfidence !== undefined ? ` &middot; Confidence ${(s.detectionConfidence * 100).toFixed(0)}%` : ''}
            </div>
          </div>
        </div>
      `
    }).join('')

    timelineHtml = `
      <div class="card">
        <div class="section-tag">Scan-by-Scan</div>
        <h2>Detailed Timeline</h2>
        ${timelineItems}
      </div>
    `
  }

  // ── SECTION: Scan Photos ──────────────────────────────────────────────
  const photoResults = await Promise.all(rangeScans.map(async (s) => {
    const b64 = await loadImageBase64(s)
    if (!b64) return null
    return { dataUri: b64, date: fmtShortDate(s.date), pct: s.affectedPercent.toFixed(1) }
  }))

  const photos = photoResults.filter((p): p is NonNullable<typeof photoResults[0]> => p !== null)

  let photosHtml = ''
  if (photos.length === 0 && rangeScans.length > 0) {
    photosHtml = `
      <div class="card">
        <div class="section-tag">Visual Record</div>
        <h2>Scan Photos</h2>
        <p style="font-size:13px;color:var(--text-muted);padding:12px 0;">
          Photos are stored locally on the device that captured them and are not available on this device.
        </p>
      </div>
    `
  } else if (photos.length > 0) {
    const photoItems = photos.map((p) => `
      <div class="photo-card">
        <img src="${p.dataUri}" />
        <div class="photo-overlay">
          <span style="font-weight:700;">${p.date}</span>
          <span style="opacity:0.8;">${p.pct}% affected</span>
        </div>
      </div>
    `).join('')

    // First vs last comparison
    let comparisonHtml = ''
    if (photos.length >= 2) {
      const firstPhoto = photos[0]
      const lastPhoto = photos[photos.length - 1]
      comparisonHtml = `
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Before &amp; After Comparison</div>
          <div style="display:flex;gap:16px;">
            <div style="flex:1;text-align:center;">
              <img src="${firstPhoto.dataUri}" style="width:100%;max-width:240px;border-radius:12px;border:2px solid var(--border-accent);" />
              <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);font-weight:600;">${firstPhoto.date} &mdash; ${firstPhoto.pct}%</div>
              <span class="badge badge-neutral" style="margin-top:4px;">Before</span>
            </div>
            <div style="flex:1;text-align:center;">
              <img src="${lastPhoto.dataUri}" style="width:100%;max-width:240px;border-radius:12px;border:2px solid ${diff < 0 ? 'rgba(52,211,153,0.4)' : diff > 0 ? 'rgba(248,113,113,0.4)' : 'var(--border-accent)'};" />
              <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);font-weight:600;">${lastPhoto.date} &mdash; ${lastPhoto.pct}%</div>
              <span class="badge ${diff < 0 ? 'badge-success' : diff > 0 ? 'badge-danger' : 'badge-neutral'}" style="margin-top:4px;">After</span>
            </div>
          </div>
        </div>
        <hr class="divider" />
      `
    }

    photosHtml = `
      <div class="card">
        <div class="section-tag">Visual Record</div>
        <h2>Scan Photos</h2>
        ${comparisonHtml}
        <div class="photo-grid">
          ${photoItems}
        </div>
      </div>
    `
  }

  // ── SECTION: Report Metadata & Disclaimer ─────────────────────────────
  const disclaimerHtml = `
    <div style="margin-top:32px;padding:24px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Report Metadata</span>
        <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">VITImeasure v3.0</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:20px;margin-bottom:16px;">
        <div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Report ID</div>
          <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);">${patch.id.slice(0, 12)}-${Date.now().toString(36)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Total scans (all time)</div>
          <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);">${scans.length}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Patch created</div>
          <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);">${fmtShortDate(patch.createdAt)}</div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Treatments logged</div>
          <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);">${treatments.length}</div>
        </div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin-bottom:12px;" />
      <p style="font-size:10px;color:var(--text-muted);line-height:1.6;">
        This report was generated by VITImeasure for personal health tracking purposes only. All measurements are
        estimated from photographs and are not clinically validated. This is not a medical diagnosis and should
        not replace professional dermatological assessment. Always consult a qualified dermatologist regarding
        your vitiligo treatment and management.
      </p>
    </div>
  `

  // ── Assemble full HTML ────────────────────────────────────────────────
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>VITImeasure Report</title>
        ${cssVars}
      </head>
      <body>
        <div class="container">
          ${headerHtml}
          ${executiveSummaryHtml}
          ${chartHtml}
          ${aiSummaryHtml}
          ${vasiHtml}
          ${velocityHtml}
          ${treatmentsHtml}
          ${timelineHtml}
          ${photosHtml}
          ${disclaimerHtml}
        </div>
      </body>
    </html>
  `
}

// ─── Save HTML for in-app viewing ────────────────────────────────────────────

/**
 * Generates the report HTML and saves it to the local reports directory.
 * Returns the HTML string and the saved file path so the viewer screen can
 * display and manage the file without immediately triggering the share sheet.
 */
export async function preparePatchReportHtml(
  params: PdfExportParams,
): Promise<{ html: string; filePath: string }> {
  const html = await generatePatchReport(params)

  const reportsDir = `${documentDirectory}reports/`
  await makeDirectoryAsync(reportsDir, { intermediates: true })

  const filename = `${params.patch.id}_${params.dateRange.start}.html`
  const filePath = reportsDir + filename

  const { writeAsStringAsync, EncodingType: Enc } = await import('expo-file-system/legacy')
  await writeAsStringAsync(filePath, html, { encoding: Enc.UTF8 })

  return { html, filePath }
}

// ─── Export as PDF ────────────────────────────────────────────────────────────

export async function exportPatchReportAsPDF(
  params: PdfExportParams,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const html = await generatePatchReport(params)
    const sharingAvailable = await Sharing.isAvailableAsync()

    if (!sharingAvailable) {
      return { success: false, error: 'Sharing is not available on this device.' }
    }

    // Preferred path: generate a real PDF via expo-print
    try {
      const printed = await Print.printToFileAsync({ html, base64: false })

      const reportsDir = `${documentDirectory}reports/`
      await makeDirectoryAsync(reportsDir, { intermediates: true })

      const filename = `${params.patch.id}_${params.dateRange.start}.pdf`
      const permanentPath = reportsDir + filename

      await copyAsync({ from: printed.uri, to: permanentPath })

      await Sharing.shareAsync(permanentPath, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share your vitiligo report',
      })

      return { success: true, filePath: permanentPath }
    } catch {
      // expo-print unavailable — fall back to HTML
    }

    // Fallback: share as HTML file when expo-print is not in the build
    const reportsDir = `${documentDirectory}reports/`
    await makeDirectoryAsync(reportsDir, { intermediates: true })

    const filename = `${params.patch.id}_${params.dateRange.start}.html`
    const permanentPath = reportsDir + filename

    const { writeAsStringAsync, EncodingType: Enc } = await import('expo-file-system/legacy')
    await writeAsStringAsync(permanentPath, html, { encoding: Enc.UTF8 })

    await Sharing.shareAsync(permanentPath, {
      mimeType: 'text/html',
      dialogTitle: 'Share your vitiligo report',
      UTI: 'public.html',
    })

    return { success: true, filePath: permanentPath }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
