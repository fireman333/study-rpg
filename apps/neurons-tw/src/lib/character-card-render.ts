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
  type ConnectorCardPayload,
  type VariantCardPayload,
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
  P0: '#a64dd4',
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

/** Wrap `text` to at most `maxLines` lines that each fit `maxWidth`; last line ellipsised. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = Array.from(text)
  const lines: string[] = []
  let line = ''
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line)
      line = ch
      if (lines.length === maxLines - 1) break
    } else {
      line += ch
    }
  }
  const consumed = lines.join('').length
  let rest = chars.slice(consumed).join('')
  if (lines.length < maxLines) rest = fit(ctx, rest, maxWidth)
  if (rest) lines.push(rest)
  return lines.slice(0, maxLines)
}

/** Shared background + double frame (single-color). */
function drawCardBase(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)
  ctx.lineWidth = 10
  ctx.strokeStyle = COLORS.frame
  ctx.strokeRect(5, 5, W - 10, H - 10)
  ctx.lineWidth = 2
  ctx.strokeStyle = COLORS.frameLight
  ctx.strokeRect(22, 22, W - 44, H - 44)
}

/** Wordmark + nickname + optional title chip header (shared layout). */
function drawCardHeader(
  ctx: CanvasRenderingContext2D,
  W: number,
  P: number,
  fam: string,
  nickname: string,
  title: string | null,
  wordmark: string,
): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.frameLight
  ctx.font = `700 26px ${fam}`
  ctx.fillText(wordmark, P, 84)

  ctx.fillStyle = COLORS.ink
  ctx.font = `700 76px ${fam}`
  ctx.fillText(fit(ctx, nickname, W - 2 * P), P, 168)

  if (title) {
    ctx.font = `400 30px ${fam}`
    const chipText = fit(ctx, title, W - 2 * P - 40)
    const chipW = ctx.measureText(chipText).width + 40
    const chipY = 198
    const chipH = 50
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(P, chipY, chipW, chipH)
    ctx.lineWidth = 3
    ctx.strokeStyle = COLORS.amber
    ctx.strokeRect(P, chipY, chipW, chipH)
    ctx.fillStyle = COLORS.amber
    ctx.textBaseline = 'middle'
    ctx.fillText(chipText, P + 20, chipY + chipH / 2)
    ctx.textBaseline = 'alphabetic'
  }
}

/** Draw a centered sprite (or a `?` empty slot) inside a framed box. */
function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | null,
  boxX: number,
  boxY: number,
  size: number,
  frameColor: string,
  fam: string,
): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(boxX, boxY, size, size)
  ctx.lineWidth = 8
  ctx.strokeStyle = frameColor
  ctx.strokeRect(boxX, boxY, size, size)
  if (img) {
    const pad = 28
    ctx.drawImage(img, boxX + pad, boxY + pad, size - 2 * pad, size - 2 * pad)
  } else {
    ctx.fillStyle = COLORS.frameLight
    ctx.font = `700 140px ${fam}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', boxX + size / 2, boxY + size / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
}

/**
 * Draw the 變體 share card: one featured collected variant. Synchronous; safe
 * for a missing sprite (empty slot) — never throws.
 */
export function renderVariantCard(
  ctx: CanvasRenderingContext2D,
  payload: VariantCardPayload,
  assets: CardAssets,
  opts?: { width?: number; height?: number },
): void {
  const W = opts?.width ?? CARD_WIDTH
  const H = opts?.height ?? CARD_HEIGHT
  const fam = assets.fontFamily || CARD_FONT_STACK
  const P = 64
  ctx.imageSmoothingEnabled = false
  drawCardBase(ctx, W, H)
  drawCardHeader(ctx, W, P, fam, payload.nickname, payload.title, '神經元 RPG · 變體立繪')

  const rarityColor = RARITY_COLOR[payload.rarity]
  const size = 520
  const boxX = (W - size) / 2
  const boxY = 290
  drawHeroSprite(ctx, assets.sprites[payload.spriteKey] ?? null, boxX, boxY, size, rarityColor, fam)

  // Name
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.ink
  ctx.font = `700 52px ${fam}`
  ctx.fillText(fit(ctx, payload.displayName, W - 2 * P), W / 2, boxY + size + 78)

  // Rarity badge
  ctx.fillStyle = rarityColor
  ctx.font = `700 34px ${fam}`
  ctx.fillText(payload.rarityLabel, W / 2, boxY + size + 132)

  // Family / subject
  ctx.fillStyle = COLORS.frameLight
  ctx.font = `400 30px ${fam}`
  ctx.fillText(payload.familyId, W / 2, boxY + size + 178)
  ctx.textAlign = 'left'

  // Caption panel (dark EEG surface, wrapped birth caption)
  const panelX = P
  const panelW = W - 2 * P
  const panelTop = boxY + size + 210
  const panelH = 150
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(panelX, panelTop, panelW, panelH)
  ctx.lineWidth = 3
  ctx.strokeStyle = COLORS.cyan
  ctx.strokeRect(panelX, panelTop, panelW, panelH)
  ctx.font = `400 28px ${fam}`
  ctx.fillStyle = COLORS.panelInk
  const lines = wrapLines(ctx, payload.caption, panelW - 64, 3)
  lines.forEach((ln, i) => ctx.fillText(ln, panelX + 32, panelTop + 50 + i * 40))

  // Footer
  ctx.font = `400 24px ${fam}`
  ctx.fillStyle = COLORS.frameLight
  ctx.fillText(`變體收集 ${payload.variantCount} / ${payload.variantTotal}`, P, H - 70)
  ctx.textAlign = 'right'
  ctx.fillText('med-study-rpg.com/neurons', W - P, H - 70)
  ctx.textAlign = 'left'
}

/** Draw a split-color outer frame (left = colorA, right = colorB). */
function drawSplitFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  colorA: string,
  colorB: string,
  t: number,
): void {
  const mid = W / 2
  ctx.fillStyle = colorA
  ctx.fillRect(0, 0, mid, t) // top-left
  ctx.fillRect(0, H - t, mid, t) // bottom-left
  ctx.fillRect(0, 0, t, H) // left bar
  ctx.fillStyle = colorB
  ctx.fillRect(mid, 0, mid, t) // top-right
  ctx.fillRect(mid, H - t, mid, t) // bottom-right
  ctx.fillRect(W - t, 0, t, H) // right bar
}

/**
 * Draw the 連結 share card: one featured unlocked connector. Synchronous; safe
 * for a missing sprite (empty slot) — never throws.
 */
export function renderConnectorCard(
  ctx: CanvasRenderingContext2D,
  payload: ConnectorCardPayload,
  assets: CardAssets,
  opts?: { width?: number; height?: number },
): void {
  const W = opts?.width ?? CARD_WIDTH
  const H = opts?.height ?? CARD_HEIGHT
  const fam = assets.fontFamily || CARD_FONT_STACK
  const P = 64
  ctx.imageSmoothingEnabled = false

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)
  drawSplitFrame(ctx, W, H, payload.colorA, payload.colorB, 16)
  ctx.lineWidth = 2
  ctx.strokeStyle = COLORS.frameLight
  ctx.strokeRect(28, 28, W - 56, H - 56)

  drawCardHeader(ctx, W, P, fam, payload.nickname, null, '神經元 RPG · 連結神經元')

  // Sprite box with a split-color frame echoing the two subjects
  const size = 520
  const boxX = (W - size) / 2
  const boxY = 300
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(boxX, boxY, size, size)
  drawSplitFrame2(ctx, boxX, boxY, size, payload.colorA, payload.colorB, 8)
  const img = assets.sprites[payload.spriteKey] ?? null
  if (img) {
    const pad = 28
    ctx.drawImage(img, boxX + pad, boxY + pad, size - 2 * pad, size - 2 * pad)
  } else {
    ctx.fillStyle = COLORS.frameLight
    ctx.font = `700 140px ${fam}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🔗', boxX + size / 2, boxY + size / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }

  // "familyA ↔ familyB" — each family in its own color, centered
  ctx.font = `700 48px ${fam}`
  const sep = '  ↔  '
  const wA = ctx.measureText(payload.familyA).width
  const wSep = ctx.measureText(sep).width
  const wB = ctx.measureText(payload.familyB).width
  const totalW = wA + wSep + wB
  let cx = (W - totalW) / 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const baseline = boxY + size + 88
  ctx.fillStyle = payload.colorA
  ctx.fillText(payload.familyA, cx, baseline)
  cx += wA
  ctx.fillStyle = COLORS.ink
  ctx.fillText(sep, cx, baseline)
  cx += wSep
  ctx.fillStyle = payload.colorB
  ctx.fillText(payload.familyB, cx, baseline)

  // Subtitle + descriptor
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.frameLight
  ctx.font = `400 30px ${fam}`
  ctx.fillText('兩科 strong wire 共鳴時誕生的橋接 hub', W / 2, baseline + 56)
  ctx.fillStyle = COLORS.amber
  ctx.font = `700 30px ${fam}`
  ctx.fillText(
    `連結神經元 ${payload.connectorCount} / ${payload.connectorTotal}`,
    W / 2,
    baseline + 108,
  )
  ctx.textAlign = 'left'

  // Footer
  ctx.font = `400 24px ${fam}`
  ctx.fillStyle = COLORS.frameLight
  ctx.fillText(formatDate(payload.unlockedAt), P, H - 70)
  ctx.textAlign = 'right'
  ctx.fillText('med-study-rpg.com/neurons', W - P, H - 70)
  ctx.textAlign = 'left'
}

/** Split-color frame around a box at (x,y) of `size` (left colorA / right colorB). */
function drawSplitFrame2(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colorA: string,
  colorB: string,
  t: number,
): void {
  const mid = x + size / 2
  ctx.fillStyle = colorA
  ctx.fillRect(x, y, size / 2, t)
  ctx.fillRect(x, y + size - t, size / 2, t)
  ctx.fillRect(x, y, t, size)
  ctx.fillStyle = colorB
  ctx.fillRect(mid, y, size / 2, t)
  ctx.fillRect(mid, y + size - t, size / 2, t)
  ctx.fillRect(x + size - t, y, t, size)
}

/** Preload one sprite by key + the card font (browser-only; sprite failure → null). */
async function loadSingleSpriteAssets(spriteKey: string): Promise<CardAssets> {
  const sprites: Record<string, CanvasImageSource | null> = {}
  const url = SPRITE_MAP[spriteKey]
  sprites[spriteKey] = url ? await loadImage(url).catch(() => null) : null
  return { sprites, fontFamily: await ensureCardFont() }
}

/** Preload assets for a 變體 card. */
export function loadVariantCardAssets(payload: VariantCardPayload): Promise<CardAssets> {
  return loadSingleSpriteAssets(payload.spriteKey)
}

/** Preload assets for a 連結 card. */
export function loadConnectorCardAssets(payload: ConnectorCardPayload): Promise<CardAssets> {
  return loadSingleSpriteAssets(payload.spriteKey)
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
