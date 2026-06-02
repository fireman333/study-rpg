/**
 * Character-card render layer (add-neurons-og-share).
 *
 * `renderCharacterCard` draws the card with the native Canvas 2D API — no new
 * dependency. It takes a 2D context + a preloaded `CardAssets` bundle so it is
 * synchronous and unit-testable with a mock context (the browser-only
 * `loadCardAssets`, which uses `Image` / `document.fonts`, is covered by the
 * Chrome MCP smoke instead). Pixel sprites draw with smoothing disabled.
 *
 * All colours come from the theme's `cssVars` (single source of truth). Missing
 * sprites render an empty slot; a missing font falls back to a system CJK font —
 * the card never breaks. Capability spec:
 * openspec/specs/neurons-character-card/spec.md
 */

import { SPRITE_MAP, THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import type { VariantRarity } from './db'
import {
  CARD_BRANCH_ORDER,
  type BranchRepresentative,
  type CharacterCardPayload,
} from './services/character-card'

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

export interface CardAssets {
  /** Representative sprites keyed by spriteKey; null = failed/absent (empty slot). */
  sprites: Record<string, CanvasImageSource | null>
  /** Resolved font stack (Cubic 11 → Noto Sans TC → sans-serif). */
  fontFamily: string
}

const CARD_FONT_STACK = "'Cubic 11', 'Noto Sans TC', sans-serif"

const cv = (key: string, fallback: string): string =>
  THEME_PIXEL_NEURONS.cssVars[key] ?? fallback

const COLORS = {
  bg: cv('--bg-cream', '#f4ecd8'),
  ink: cv('--ink', '#1a1410'),
  frame: cv('--frame-cell-dark', '#5a3f29'),
  frameLight: cv('--frame-cell-light', '#8c6d4a'),
  panel: cv('--signal-bg', '#0c1418'),
  panelInk: cv('--signal-ink', '#cfe8e2'),
  cyan: cv('--signal-cyan', '#38e0d0'),
  amber: cv('--signal-amber', '#f0a830'),
}

const BRANCH_COLOR: Record<NtBranchId, string> = {
  DA: cv('--nt-da', '#d4a04d'),
  '5HT': cv('--nt-5ht', '#c44d4d'),
  GABA: cv('--nt-gaba', '#6a9bc4'),
  Glu: cv('--nt-glu', '#6a8c3f'),
}

const RARITY_COLOR: Record<VariantRarity, string> = {
  P1: '#d4a04d',
  P2: '#c44d4d',
  P3: '#6a8c3f',
  P4: '#6a9bc4',
  P5: '#9b9b9b',
}

function fit(ctx: CanvasRenderingContext2D, s: string, maxWidth: number): string {
  if (ctx.measureText(s).width <= maxWidth) return s
  let t = s
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function formatStudy(min: number): string {
  if (min < 60) return `${Math.round(min)} 分`
  return `${(min / 60).toFixed(1)} 小時`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-CA')
}

/**
 * Draw the character card onto `ctx`. Synchronous; assumes `assets` is already
 * loaded. Safe for empty collections and missing sprites (no throw).
 */
export function renderCharacterCard(
  ctx: CanvasRenderingContext2D,
  payload: CharacterCardPayload,
  assets: CardAssets,
  opts?: { width?: number; height?: number },
): void {
  const W = opts?.width ?? CARD_WIDTH
  const H = opts?.height ?? CARD_HEIGHT
  const fam = assets.fontFamily || CARD_FONT_STACK
  ctx.imageSmoothingEnabled = false

  // Background + double frame
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)
  ctx.lineWidth = 10
  ctx.strokeStyle = COLORS.frame
  ctx.strokeRect(5, 5, W - 10, H - 10)
  ctx.lineWidth = 2
  ctx.strokeStyle = COLORS.frameLight
  ctx.strokeRect(22, 22, W - 44, H - 44)

  const P = 64

  // Header: wordmark + nickname + optional title chip
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.frameLight
  ctx.font = `700 26px ${fam}`
  ctx.fillText('神經元 RPG · LTP', P, 84)

  ctx.fillStyle = COLORS.ink
  ctx.font = `700 76px ${fam}`
  ctx.fillText(fit(ctx, payload.nickname, W - 2 * P), P, 168)

  if (payload.title) {
    ctx.font = `400 30px ${fam}`
    const chipText = fit(ctx, payload.title, W - 2 * P - 40)
    const chipW = ctx.measureText(chipText).width + 40
    const chipX = P
    const chipY = 198
    const chipH = 50
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(chipX, chipY, chipW, chipH)
    ctx.lineWidth = 3
    ctx.strokeStyle = COLORS.amber
    ctx.strokeRect(chipX, chipY, chipW, chipH)
    ctx.fillStyle = COLORS.amber
    ctx.textBaseline = 'middle'
    ctx.fillText(chipText, chipX + 20, chipY + chipH / 2)
    ctx.textBaseline = 'alphabetic'
  }

  // Hero row: one representative per NT branch
  const heroTop = 300
  const cols = payload.reps.length
  const gap = 24
  const colW = (W - 2 * P - gap * (cols - 1)) / cols
  const boxSize = Math.min(colW, 200)
  payload.reps.forEach((rep, i) => {
    const x = P + i * (colW + gap)
    const boxX = x + (colW - boxSize) / 2
    const branch = CARD_BRANCH_ORDER[i]
    const color = BRANCH_COLOR[branch]

    ctx.fillStyle = COLORS.bg
    ctx.fillRect(boxX, heroTop, boxSize, boxSize)
    ctx.lineWidth = 6
    ctx.strokeStyle = color
    ctx.strokeRect(boxX, heroTop, boxSize, boxSize)

    const img = rep ? assets.sprites[rep.spriteKey] : null
    if (img) {
      const pad = 14
      ctx.drawImage(img, boxX + pad, heroTop + pad, boxSize - 2 * pad, boxSize - 2 * pad)
    } else {
      ctx.fillStyle = COLORS.frameLight
      ctx.font = `700 64px ${fam}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('?', boxX + boxSize / 2, heroTop + boxSize / 2)
      ctx.textBaseline = 'alphabetic'
    }

    const cx = x + colW / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.font = `700 30px ${fam}`
    ctx.fillText(branch, cx, heroTop + boxSize + 44)

    if (rep) {
      ctx.fillStyle = COLORS.ink
      ctx.font = `400 22px ${fam}`
      ctx.fillText(fit(ctx, rep.displayName, colW), cx, heroTop + boxSize + 78)
      ctx.fillStyle = RARITY_COLOR[rep.rarity]
      ctx.font = `700 20px ${fam}`
      ctx.fillText(rep.rarity, cx, heroTop + boxSize + 108)
    } else {
      ctx.fillStyle = COLORS.frameLight
      ctx.font = `400 22px ${fam}`
      ctx.fillText('未收集', cx, heroTop + boxSize + 78)
    }
  })
  ctx.textAlign = 'left'

  // Stats panel (dark EEG-signal surface)
  const panelX = P
  const panelTop = 740
  const panelW = W - 2 * P
  const panelH = 380
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(panelX, panelTop, panelW, panelH)
  ctx.lineWidth = 3
  ctx.strokeStyle = COLORS.cyan
  ctx.strokeRect(panelX, panelTop, panelW, panelH)

  ctx.fillStyle = COLORS.cyan
  ctx.font = `700 26px ${fam}`
  ctx.fillText('CONNECTOME 數據', panelX + 36, panelTop + 56)

  const stats: [string, string][] = [
    ['總放電 (AP)', formatNumber(payload.totalAp)],
    ['強連結 synapse', `${payload.strongSynapseCount}`],
    ['變體收集', `${payload.variantCount} / ${payload.variantTotal}`],
    ['完成科別', `${payload.familiesComplete} / ${payload.familyTotal}`],
    ['累積唸書', formatStudy(payload.totalStudyMinutes)],
  ]
  const rowTop = panelTop + 96
  const rowH = 54
  stats.forEach(([label, value], i) => {
    const y = rowTop + i * rowH
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = COLORS.panelInk
    ctx.font = `400 28px ${fam}`
    ctx.fillText(label, panelX + 36, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.amber
    ctx.font = `700 30px ${fam}`
    ctx.fillText(value, panelX + panelW - 36, y)
  })
  ctx.textBaseline = 'alphabetic'

  // Footer
  ctx.font = `400 24px ${fam}`
  ctx.fillStyle = COLORS.frameLight
  ctx.textAlign = 'left'
  ctx.fillText('med-study-rpg.com/neurons', P, H - 80)
  ctx.textAlign = 'right'
  ctx.fillText(formatDate(payload.renderedAt), W - P, H - 80)
  ctx.textAlign = 'left'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load sprite: ${url}`))
    img.src = url
  })
}

async function ensureCardFont(): Promise<string> {
  try {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      await document.fonts.load("700 76px 'Cubic 11'")
    }
  } catch {
    // fallback font is acceptable — never block the card on font loading
  }
  return CARD_FONT_STACK
}

/**
 * Preload the representative sprites + the pixel font for a payload. Browser-only
 * (uses `Image` / `document.fonts`). A sprite that fails to load resolves to
 * null (renders an empty slot); the font is best-effort (fallback if absent).
 */
export async function loadCardAssets(payload: CharacterCardPayload): Promise<CardAssets> {
  const sprites: Record<string, CanvasImageSource | null> = {}
  await Promise.all(
    payload.reps
      .filter((r): r is BranchRepresentative => r !== null)
      .map(async (rep) => {
        const url = SPRITE_MAP[rep.spriteKey]
        sprites[rep.spriteKey] = url ? await loadImage(url).catch(() => null) : null
      }),
  )
  return { sprites, fontFamily: await ensureCardFont() }
}
