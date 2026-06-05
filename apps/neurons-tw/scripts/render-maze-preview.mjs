/**
 * render-maze-preview — headless faithful render of the REAL maze (grid-graph.json
 * + maze-atlas.png + the renderer's autotiling rules), used to eyeball the tileset
 * without the Chrome rAF backgrounded-tab throttle. Debug only (not shipped).
 *
 * Mirrors MazeGrid.tsx: per-family multiply-tinted fiber tiles, autotiled by route
 * connectivity, weave-under gap, synapse boutons, center core. Renders ALL corridors
 * lit (fog off) so the full structure is visible.
 *
 * Run: node ./scripts/render-maze-preview.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const A = resolve(__dirname, '../src/assets/maze')
const graph = JSON.parse(readFileSync(resolve(A, 'grid-graph.json'), 'utf8'))
const TILE = 16

// atlas raw RGBA
const { data: atlas, info } = await sharp(resolve(A, 'tiles/maze-atlas.png'))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const AW = info.width

// mirror MazeGrid.tsx
const TILES = {
  straightH: [0, 0], straightV: [1, 0], curve: [2, 0], tee: [3, 0], cross: [4, 0],
  cap: [5, 0], weaveUnderH: [6, 0], weaveUnderV: [7, 0],
  bgTissue: [0, 1], fog: [1, 1], node: [2, 1], bouton: [3, 1], core: [4, 1], portal: [5, 1], walker: [6, 1],
}
const FAMILY_COLORS = ['#e0524d', '#e08a3c', '#d8c23a', '#7fb84e', '#43b59a', '#3f9bd8', '#5d6fd8', '#9b5dd8', '#d85db0', '#8a8f99', '#5a6b3a']
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const FIDS = Object.keys(graph.families)
const TINT = Object.fromEntries(FIDS.map((f, i) => [f, hex(FAMILY_COLORS[i % FAMILY_COLORS.length])]))

const dirOf = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W'
  return dy >= 0 ? 'S' : 'N'
}
function fiberTileFor(prev, cur, next, isUnder) {
  const s = new Set()
  if (prev) s.add(dirOf(cur, prev)); if (next) s.add(dirOf(cur, next))
  const h = (d) => s.has(d)
  if (h('E') && h('W')) return { key: isUnder ? 'weaveUnderH' : 'straightH', rot: 0 }
  if (h('N') && h('S')) return { key: isUnder ? 'weaveUnderV' : 'straightV', rot: 0 }
  if (h('E') && h('S')) return { key: 'curve', rot: 0 }
  if (h('S') && h('W')) return { key: 'curve', rot: 1 }
  if (h('W') && h('N')) return { key: 'curve', rot: 2 }
  if (h('N') && h('E')) return { key: 'curve', rot: 3 }
  if (s.size === 1) { const d = [...s][0]; return { key: 'cap', rot: d === 'S' ? 0 : d === 'W' ? 1 : d === 'N' ? 2 : 3 } }
  return { key: 'straightH', rot: 0 }
}
// read atlas tile pixel (with rotation k*90 CW), returns [r,g,b,a]
function tilePx(key, rot, lx, ly) {
  // invert rotation: dest (lx,ly) ← src
  let sx = lx, sy = ly
  for (let k = 0; k < ((4 - rot) % 4); k++) { const nx = sy, ny = TILE - 1 - sx; sx = nx; sy = ny }
  const [col, row] = TILES[key]
  const i = ((row * TILE + sy) * AW + (col * TILE + sx)) * 4
  return [atlas[i], atlas[i + 1], atlas[i + 2], atlas[i + 3]]
}

// --- output buffer ---
const under = new Map(graph.synapses.map((s) => [`${s.cell[0]},${s.cell[1]}|${s.under}`, true]))
const CELL = 12 // px per cell in the full map
const W = graph.gridW * CELL, H = graph.gridH * CELL
const out = new Uint8Array(W * H * 4)
const set = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  const sa = a / 255, da = out[i + 3] / 255, oa = sa + da * (1 - sa)
  if (oa <= 0) return
  out[i] = Math.round((r * sa + out[i] * da * (1 - sa)) / oa)
  out[i + 1] = Math.round((g * sa + out[i + 1] * da * (1 - sa)) / oa)
  out[i + 2] = Math.round((b * sa + out[i + 2] * da * (1 - sa)) / oa)
  out[i + 3] = Math.round(oa * 255)
}
// blit a tile to cell (cx,cy), scaled TILE→CELL nearest, optional multiply tint + alpha
function blit(key, rot, cx, cy, tint, alpha = 1, scale = 1) {
  const dpx = Math.round(CELL * scale)
  const ox = cx * CELL + (CELL - dpx) / 2, oy = cy * CELL + (CELL - dpx) / 2
  for (let dy = 0; dy < dpx; dy++) for (let dx = 0; dx < dpx; dx++) {
    const lx = Math.floor((dx / dpx) * TILE), ly = Math.floor((dy / dpx) * TILE)
    let [r, g, b, a] = tilePx(key, rot, lx, ly)
    if (a === 0) continue
    if (tint) { r = (r * tint[0]) / 255; g = (g * tint[1]) / 255; b = (b * tint[2]) / 255 }
    set(Math.round(ox + dx), Math.round(oy + dy), [r, g, b, Math.round(a * alpha)])
  }
}

// 1) bg tissue everywhere
for (let cy = 0; cy < graph.gridH; cy++) for (let cx = 0; cx < graph.gridW; cx++) blit('bgTissue', 0, cx, cy, null, 1)
// 2) corridors (all lit), per family tinted + autotiled
for (const fid of FIDS) {
  const p = graph.families[fid].path
  const tint = TINT[fid]
  for (let i = 0; i < p.length; i++) {
    const [x, y] = p[i]
    const isUnder = under.has(`${x},${y}|${fid}`)
    const { key, rot } = fiberTileFor(p[i - 1], p[i], p[i + 1], isUnder)
    blit(key, rot, x, y, tint, 1)
  }
}
// 3) variant nodes (tinted node glyph)
for (const fid of FIDS) for (const n of graph.families[fid].nodeCells) blit('node', 0, n.cell[0], n.cell[1], TINT[fid], 1, 1.1)
// 4) synapse boutons (untinted cyan) — preview all as 'strong'
for (const s of graph.synapses) blit('bouton', 0, s.cell[0], s.cell[1], null, 0.95, 1.2)
// 5) center core
blit('core', 0, graph.center[0], graph.center[1], null, 1, 2.2)

// full map
const full = resolve(A, 'tiles/real-maze-full.png')
await sharp(Buffer.from(out.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toFile(full)
console.log(`full → ${full} (${W}×${H})`)
// center crop ×3 for detail
const crop = 30 * CELL
const cx0 = (graph.center[0] - 15) * CELL, cy0 = (graph.center[1] - 15) * CELL
const cropPath = resolve(A, 'tiles/real-maze-center.png')
await sharp(Buffer.from(out.buffer), { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: cx0, top: cy0, width: crop, height: crop })
  .resize(crop * 3, crop * 3, { kernel: 'nearest' }).png().toFile(cropPath)
console.log(`center → ${cropPath}`)
