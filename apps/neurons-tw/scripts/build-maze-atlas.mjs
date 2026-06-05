/**
 * build-maze-atlas — generate the GBA-pixel maze tile atlas (polish-neurons-maze-tileset).
 *
 * Produces a committed 16×16-cell pixel-art atlas (seamless tintable structural
 * fiber tiles + dark neural-tissue bg/fog + hero glyphs) that MazeGrid.tsx blits
 * behind its draw seam. Seamless-by-construction (full-edge bands tile across
 * cells); fiber tiles are near-white so the renderer can multiply-tint per family.
 *
 * Art direction (owner, 2026-06-05): chunky/pixelated — narrow fiber + HARD dark
 * outline + coarse 2×2-grain dithered glow halo; fog reads as a grainy dim veil
 * (not a hard cut).
 *
 * Run: node ./scripts/build-maze-atlas.mjs
 * Outputs: src/assets/maze/tiles/maze-atlas.png (+ atlas-preview.png debug, gitignored)
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../src/assets/maze/tiles')
mkdirSync(OUT_DIR, { recursive: true })

const TILE = 16
const COLS = 8
const ROWS = 4
const AW = COLS * TILE
const AH = ROWS * TILE

const atlas = new Uint8Array(AW * AH * 4)
const setA = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= AW || y >= AH) return
  const i = (y * AW + x) * 4
  const sa = a / 255, da = atlas[i + 3] / 255, oa = sa + da * (1 - sa)
  if (oa <= 0) return
  atlas[i] = Math.round((r * sa + atlas[i] * da * (1 - sa)) / oa)
  atlas[i + 1] = Math.round((g * sa + atlas[i + 1] * da * (1 - sa)) / oa)
  atlas[i + 2] = Math.round((b * sa + atlas[i + 2] * da * (1 - sa)) / oa)
  atlas[i + 3] = Math.round(oa * 255)
}
const px = (col, row, lx, ly, rgba) => setA(col * TILE + lx, row * TILE + ly, rgba)

// --- fiber palette (near-white → tintable via multiply) ---
const CORE = [255, 255, 255, 255]
const BODY = [200, 230, 224, 255]
const OUTLINE = [40, 70, 66, 255]   // hard dark edge (GBA outline)
const GLOW = [120, 235, 220, 255]   // coarse halo colour (alpha applied in dither)

const C = 7.5
const IN = (v) => v >= 4 && v <= 11

// perpendicular/center distance for a tile's connected dirs (Infinity = not on fiber)
function fiberDist(lx, ly, dirs, gap) {
  let d = Infinity
  if (!gap && IN(lx) && IN(ly)) d = Math.min(d, Math.max(Math.abs(lx - C), Math.abs(ly - C)))
  if (dirs.includes('E') && lx >= 8 && IN(ly)) { if (!gap || lx >= 11) d = Math.min(d, Math.abs(ly - C)) }
  if (dirs.includes('W') && lx <= 7 && IN(ly)) { if (!gap || lx <= 4) d = Math.min(d, Math.abs(ly - C)) }
  if (dirs.includes('S') && ly >= 8 && IN(lx)) d = Math.min(d, Math.abs(lx - C))
  if (dirs.includes('N') && ly <= 7 && IN(lx)) d = Math.min(d, Math.abs(lx - C))
  return d
}

/** Chunky fiber: narrow solid band (core/body) + hard 1px outline + coarse 2×2 glow. */
function fiber(col, row, dirs, { gap = false, cap = false } = {}) {
  const SOLID = 2.0 // band half-width (→ 4px band, chunky)
  const kind = (lx, ly) => {
    const d = fiberDist(lx, ly, dirs, gap)
    if (d === Infinity) return 0
    if (d < 0.8) return 3 // core
    if (d <= SOLID) return 2 // body
    return 0
  }
  // myelin segmentation: punch a 1px constriction every 4px along straight runs
  const isStraight = !gap && !cap && dirs.length === 2 && (dirs.join('') === 'EW' || dirs.join('') === 'NS')
  const solid = (lx, ly) => kind(lx, ly) > 0
  // 1) solid core/body
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    let k = kind(lx, ly)
    if (k === 0) continue
    if (isStraight) {
      const along = dirs.join('') === 'EW' ? lx : ly
      if (along % 4 === 0 && k === 2) continue // constriction → segmented myelin look
    }
    px(col, row, lx, ly, k === 3 ? CORE : BODY)
  }
  if (cap) {
    for (let ly = 4; ly <= 11; ly++) for (let lx = 4; lx <= 11; lx++) {
      const dd = Math.hypot(lx - C, ly - C)
      if (dd <= 3.4) px(col, row, lx, ly, dd < 1.4 ? CORE : BODY)
    }
  }
  // 2) hard outline around solid (1px, chunky)
  const solidNow = (lx, ly) => {
    if (lx < 0 || ly < 0 || lx >= TILE || ly >= TILE) {
      // treat out-of-tile as solid if an arm reaches that edge (so outline doesn't seal the corridor mouth)
      const ex = Math.max(0, Math.min(TILE - 1, lx)), ey = Math.max(0, Math.min(TILE - 1, ly))
      return kind(ex, ey) > 0
    }
    return kind(lx, ly) > 0
  }
  const outlinePts = []
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    if (solidNow(lx, ly)) continue
    let adj = false
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (solidNow(lx + dx, ly + dy)) { adj = true; break }
    if (adj) outlinePts.push([lx, ly])
  }
  for (const [lx, ly] of outlinePts) px(col, row, lx, ly, OUTLINE)
  // 3) coarse 2×2-grain glow beyond the outline (Cheby ≤ 2 of solid, not solid/outline)
  const isOutline = new Set(outlinePts.map(([x, y]) => `${x},${y}`))
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    if (solidNow(lx, ly) || isOutline.has(`${lx},${ly}`)) continue
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 2) continue
      if (solidNow(lx + dx, ly + dy)) { near = true; break }
    }
    if (!near) continue
    // coarse grain: 2×2 blocks on/off
    if ((((lx >> 1) + (ly >> 1)) & 1) === 0) px(col, row, lx, ly, [GLOW[0], GLOW[1], GLOW[2], 110])
  }
}

// structural fiber tiles (row 0)
fiber(0, 0, ['E', 'W'])
fiber(1, 0, ['N', 'S'])
fiber(2, 0, ['E', 'S'])
fiber(3, 0, ['W', 'E', 'S'])
fiber(4, 0, ['N', 'E', 'S', 'W'])
fiber(5, 0, ['S'], { cap: true })
fiber(6, 0, ['E', 'W'], { gap: true })
fiber(7, 0, ['N', 'S'], { gap: true })

// bg neural tissue (0,1) — chunky 2×2-grain dither, opaque
const T0 = [13, 20, 24, 255], T1 = [17, 27, 32, 255], T2 = [23, 38, 44, 255]
for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
  const bx = lx >> 1, by = ly >> 1
  const h = (bx * 7 + by * 13 + bx * by * 5) % 11
  px(0, 1, lx, ly, h === 0 ? T2 : h < 4 ? T1 : T0)
}
// fog (1,1) — grainy translucent veil (coarse 2×2), no hard edge
for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
  const on = (((lx >> 1) + (ly >> 1)) & 1) === 0
  px(1, 1, lx, ly, [7, 11, 14, on ? 205 : 150])
}

// --- hero glyphs (row 1) ---
const disc = (col, row, cx, cy, r, rgba) => {
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    if (Math.hypot(lx - cx, ly - cy) <= r) px(col, row, lx, ly, rgba)
  }
}
const ringOutline = (col, row, cx, cy, r, rgba) => {
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    const dd = Math.hypot(lx - cx, ly - cy)
    if (dd <= r && dd > r - 1.4) px(col, row, lx, ly, rgba)
  }
}
// nodeNeuron (2,1) — tintable near-white soma, hard outline + dendrites
disc(2, 1, 7.5, 7.5, 4.2, OUTLINE)
disc(2, 1, 7.5, 7.5, 3.3, BODY)
disc(2, 1, 7.5, 7.5, 1.5, CORE)
for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  px(2, 1, Math.round(7.5 + dx * 5), Math.round(7.5 + dy * 5), OUTLINE)
  px(2, 1, Math.round(7.5 + dx * 4), Math.round(7.5 + dy * 4), BODY)
}
// bouton (3,1) — cyan terminal, hard outline
disc(3, 1, 7.5, 7.5, 4.2, OUTLINE)
disc(3, 1, 7.5, 7.5, 3.3, [56, 224, 208, 255])
disc(3, 1, 7.5, 7.5, 1.5, [200, 250, 244, 255])
// core (4,1) — amber synaptic core, chunky radial
disc(4, 1, 7.5, 7.5, 6.0, OUTLINE)
disc(4, 1, 7.5, 7.5, 5.0, [240, 168, 48, 255])
disc(4, 1, 7.5, 7.5, 3.0, [255, 207, 112, 255])
disc(4, 1, 7.5, 7.5, 1.2, [255, 246, 220, 255])
// portal (5,1) — cyan entry ring
disc(5, 1, 7.5, 7.5, 6.0, OUTLINE)
ringOutline(5, 1, 7.5, 7.5, 5.6, [56, 224, 208, 235])
ringOutline(5, 1, 7.5, 7.5, 3.2, [56, 224, 208, 170])
// walker (6,1) — growth cone (tintable near-white) + filopodia
disc(6, 1, 7.5, 9.5, 3.0, OUTLINE)
disc(6, 1, 7.5, 9.5, 2.2, BODY)
disc(6, 1, 7.5, 9.5, 1.0, CORE)
for (const [x2, y2] of [[4, 2], [8, 1], [12, 2]]) {
  const steps = 6
  for (let s = 2; s <= steps; s++) {
    px(6, 1, Math.round(7.5 + (x2 - 7.5) * s / steps), Math.round(8 + (y2 - 8) * s / steps), OUTLINE)
  }
}

// write the committed atlas
const atlasPath = resolve(OUT_DIR, 'maze-atlas.png')
await sharp(Buffer.from(atlas.buffer), { raw: { width: AW, height: AH, channels: 4 } }).png().toFile(atlasPath)
console.log(`atlas → ${atlasPath} (${AW}×${AH})`)

// ============================================================
// Mock-maze PREVIEW (debug) — seamless tiling + per-family tint + fog-as-dim-route
// ============================================================
const MW = 22, MH = 14, SCALE = 14
const pw = MW * TILE, ph = MH * TILE
const scene = new Uint8Array(pw * ph * 4)
const sceneSet = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= pw || y >= ph) return
  const i = (y * pw + x) * 4
  const sa = a / 255, da = scene[i + 3] / 255, oa = sa + da * (1 - sa)
  if (oa <= 0) return
  scene[i] = Math.round((r * sa + scene[i] * da * (1 - sa)) / oa)
  scene[i + 1] = Math.round((g * sa + scene[i + 1] * da * (1 - sa)) / oa)
  scene[i + 2] = Math.round((b * sa + scene[i + 2] * da * (1 - sa)) / oa)
  scene[i + 3] = Math.round(oa * 255)
}
const tilePx = (col, row, lx, ly) => {
  const i = ((row * TILE + ly) * AW + (col * TILE + lx)) * 4
  return [atlas[i], atlas[i + 1], atlas[i + 2], atlas[i + 3]]
}
const blit = (col, row, mcx, mcy, tint, dim = 1) => {
  for (let ly = 0; ly < TILE; ly++) for (let lx = 0; lx < TILE; lx++) {
    let [r, g, b, a] = tilePx(col, row, lx, ly)
    if (a === 0) continue
    if (tint) { r = (r * tint[0]) / 255; g = (g * tint[1]) / 255; b = (b * tint[2]) / 255 }
    sceneSet(mcx * TILE + lx, mcy * TILE + ly, [r, g, b, Math.round(a * dim)])
  }
}
for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) blit(0, 1, cx, cy)
const RED = [224, 82, 77], CYAN = [120, 220, 235], GREEN = [127, 184, 78], PURPLE = [165, 110, 220]
// RED corridor: straight, turns down
for (let cx = 1; cx <= 9; cx++) blit(0, 0, cx, 3, RED)
blit(3, 0, 10, 3, RED) // T-ish elbow placeholder
for (let cy = 4; cy <= 8; cy++) blit(1, 0, 10, cy, RED)
// CYAN vertical crossing red (weave: cyan dips UNDER at the crossing)
for (let cy = 1; cy <= 11; cy++) blit(1, 0, 5, cy, CYAN)
blit(7, 0, 5, 3, CYAN) // weave-under V at the crossing
// GREEN corridor
for (let cx = 13; cx <= 19; cx++) blit(0, 0, cx, 6, GREEN)
for (let cy = 6; cy <= 10; cy++) blit(1, 0, 16, cy, GREEN)
// PURPLE corridor — UNEXPLORED (fog model = dim route, NOT a hard veil)
for (let cx = 12; cx <= 20; cx++) blit(0, 0, cx, 11, PURPLE, 0.32)
for (let cy = 9; cy <= 11; cy++) blit(1, 0, 20, cy, PURPLE, 0.32)
// nodes / bouton / core / portal
blit(2, 1, 9, 3, RED)
blit(2, 1, 5, 9, CYAN)
blit(2, 1, 16, 10, GREEN)
blit(3, 1, 5, 3) // bouton at red/cyan crossing
blit(4, 1, 11, 7) // amber core
blit(5, 1, 1, 3, RED) // portal entry
// a few grainy fog tiles scattered over the unexplored purple area (grain, no hard line)
for (let cy = 10; cy < MH; cy++) for (let cx = 11; cx < MW; cx++) if (((cx + cy) & 1) === 0) blit(1, 1, cx, cy)

const previewPath = resolve(OUT_DIR, 'atlas-preview.png')
await sharp(Buffer.from(scene.buffer), { raw: { width: pw, height: ph, channels: 4 } })
  .resize(pw * SCALE, ph * SCALE, { kernel: 'nearest' }).png().toFile(previewPath)
console.log(`preview → ${previewPath} (${pw * SCALE}×${ph * SCALE})`)
