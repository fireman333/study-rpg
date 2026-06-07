/**
 * build-tilemap-maze — REBUILD (redesign-neurons-maze-brain-tileset D10, owner reset 2026-06-05).
 *
 * DENSE weave maze (matches the owner's reference maze-brain-default.png + the
 * open-source weave-maze projects), classified into a 3-region 16px tilemap that
 * renders as FLAT COLORS first (tile art swaps in per-region later):
 *   PATH(2)       = the dense walkable corridor network (the carved channels)
 *   WALL(1)       = wall cells rimming a corridor (the carved edge)
 *   BACKGROUND(0) = deep wall interior + outer margin (the base / filler)
 *
 * METHOD (codex-consulted /tmp/maze-rebuild.log): rot.js EllerMaze at a LOGICAL
 * res (L²) → braid for loops + 4-way junctions → promote junctions to over/under
 * weave bridges → route 11 family corridors border→center (winding, straight-through
 * at bridges) → crossings = synapses → 10 nodes/family. Then SCALE ×SCALE → GRID²
 * so corridors are chunky (SCALE-wide) and walls thick (gives real WALL-rim vs
 * BACKGROUND-interior separation). Bridge density retuned DOWN (~150-250 crossings).
 *
 * Output grid-graph.json keeps the families/path/nodeCells/synapses/weave/center
 * shape IDENTICAL to the old generator (graph.ts/economy/useMaze unchanged; nodes
 * keyed family:slotIndex → save-data-safe) and ADDS `cellKinds` (RLE) + `scale`.
 * Plus a flat-color 3-region preview PNG for cheap validation before renderer wiring.
 *
 * Run: node ./scripts/build-tilemap-maze.mjs   (CI does NOT run this)
 * Tunables: L, SCALE, BRAID, WEAVE, WIND, SEED.
 */
import * as ROT from 'rot-js'
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = resolve(__dirname, '../src/assets/maze')

const L = Number(process.env.L) || 96 // logical maze size
const SCALE = Number(process.env.SCALE) || 4 // ×SCALE → chunky corridors + thick walls (96×4 = 384)
const GRID = L * SCALE
const BRAID = process.env.BRAID != null ? Number(process.env.BRAID) : 0.4 // loops + 4-way junctions
const WEAVE = process.env.WEAVE != null ? Number(process.env.WEAVE) : 0.7 // junctions → over/under bridges
const WIND = Number(process.env.WIND) || 30 // waypoints/route → MAX interweave (NOT shortest path; >110 crossings)
const NODES_PER_FAMILY = 10
// 二回目 (second-lap, add-neurons-maze-second-lap-variants): each family gets a SECOND
// longer route from center back out, reaching NEW weave crossings; up to SECOND_NODES_CAP
// of them become second-route nodes (slotIndex >= NODES_PER_FAMILY). RNG for these is
// consumed strictly AFTER all first-route generation, so the first route stays
// byte-for-byte reproducible (saves / tileset / circuit names unaffected).
const SECOND_NODES_CAP = Number(process.env.SECOND_CAP) || 10 // 二回目 second-route nodes/family
const WIND2 = Number(process.env.WIND2) || (WIND + 12) // second-route waypoints — longer than first route
const SEED = Number(process.env.SEED) || 20260605

const FAMILIES = [
  '藥理學', '公共衛生學', '寄生蟲學', '組織學', '生物化學',
  '病理學', '免疫學', '解剖學', '生理學', '胚胎學', '微生物學',
]
const PREVIEW_COLORS = [
  '#e0524d', '#e08a3c', '#d8c23a', '#7fb84e', '#43b59a',
  '#3f9bd8', '#5d6fd8', '#9b5dd8', '#d85db0', '#8a8f99', '#5a6b3a',
]
const key = (x, y) => `${x},${y}`
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] // N E S W

function genMaze() {
  ROT.RNG.setSeed(SEED)
  const maze = new ROT.Map.EllerMaze(L, L)
  const wall = Array.from({ length: L }, () => new Array(L).fill(1))
  maze.create((x, y, w) => { wall[y][x] = w })
  const passable = (x, y) => x >= 0 && y >= 0 && x < L && y < L && wall[y][x] === 0
  const deg = (x, y) => DIRS.filter(([dx, dy]) => passable(x + dx, y + dy)).length
  for (let y = 1; y < L - 1; y++) for (let x = 1; x < L - 1; x++) {
    if (wall[y][x] === 0 && deg(x, y) <= 2 && ROT.RNG.getUniform() < BRAID) {
      const cand = DIRS.map(([dx, dy]) => [x + dx, y + dy])
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < L - 1 && ny < L - 1 && wall[ny][nx] === 1)
      if (cand.length) { const [nx, ny] = cand[Math.floor(ROT.RNG.getUniform() * cand.length)]; wall[ny][nx] = 0 }
    }
  }
  return wall
}

function weaveCells(wall) {
  const passable = (x, y) => x >= 0 && y >= 0 && x < L && y < L && wall[y][x] === 0
  const weave = new Map()
  for (let y = 1; y < L - 1; y++) for (let x = 1; x < L - 1; x++) {
    if (wall[y][x] !== 0) continue
    const n = passable(x, y - 1), s = passable(x, y + 1), e = passable(x + 1, y), w = passable(x - 1, y)
    if (n && s && e && w && ROT.RNG.getUniform() < WEAVE) weave.set(key(x, y), ROT.RNG.getUniform() < 0.5 ? 'H' : 'V')
  }
  return weave
}
function nearestPassable(wall, tx, ty) {
  for (let r = 0; r < L; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
    const x = tx + dx, y = ty + dy
    if (x >= 0 && y >= 0 && x < L && y < L && wall[y][x] === 0) return [x, y]
  }
  return [tx, ty]
}
function borderEntries(wall) {
  const border = []
  for (let x = 0; x < L; x++) { border.push([x, 0]); border.push([x, L - 1]) }
  for (let y = 1; y < L - 1; y++) { border.push([0, y]); border.push([L - 1, y]) }
  const c = (L - 1) / 2, out = []
  for (let i = 0; i < FAMILIES.length; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / FAMILIES.length
    const ix = Math.round(c + Math.cos(th) * c), iy = Math.round(c + Math.sin(th) * c)
    let best = null, bd = Infinity
    for (const b of border) {
      if (wall[b[1]][b[0]] !== 0) continue
      if (out.some((o) => o[0] === b[0] && o[1] === b[1])) continue
      const d = (b[0] - ix) ** 2 + (b[1] - iy) ** 2
      if (d < bd) { bd = d; best = b }
    }
    out.push(best ?? nearestPassable(wall, ix, iy))
  }
  return out
}
function weavePath(wall, weave, from, to) {
  const passable = (x, y) => x >= 0 && y >= 0 && x < L && y < L && wall[y][x] === 0
  const prev = new Map(); const q = []
  for (let d = 0; d < 4; d++) { prev.set(`${from[0]},${from[1]},${d}`, null); q.push([from[0], from[1], d]) }
  let endState = null
  while (q.length) {
    const [x, y, indir] = q.shift()
    if (x === to[0] && y === to[1]) { endState = `${x},${y},${indir}`; break }
    const wv = weave.get(key(x, y))
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy
      if (!passable(nx, ny)) continue
      if (wv) {
        const axis = (d === 0 || d === 2) ? 'V' : 'H'
        const inAxis = (indir === 0 || indir === 2) ? 'V' : 'H'
        if (indir >= 0 && inAxis !== axis) continue
      }
      const ns = `${nx},${ny},${d}`
      if (!prev.has(ns)) { prev.set(ns, `${x},${y},${indir}`); q.push([nx, ny, d]) }
    }
  }
  if (!endState) return plainBFS(wall, from, to)
  const path = []; let s = endState
  while (s) { const [x, y] = s.split(',').map(Number); path.push([x, y]); s = prev.get(s) }
  return path.reverse()
}
function plainBFS(wall, from, to) {
  const passable = (x, y) => x >= 0 && y >= 0 && x < L && y < L && wall[y][x] === 0
  const prev = new Map([[key(from[0], from[1]), null]]); const q = [from]
  while (q.length) {
    const [x, y] = q.shift()
    if (x === to[0] && y === to[1]) break
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy
      if (passable(nx, ny) && !prev.has(key(nx, ny))) { prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]) } }
  }
  const path = []; let k = key(to[0], to[1])
  if (!prev.has(k)) return []
  while (k) { const [x, y] = k.split(',').map(Number); path.push([x, y]); k = prev.get(k) }
  return path.reverse()
}
function randPassable(wall) {
  for (let t = 0; t < 9999; t++) {
    const x = 1 + Math.floor(ROT.RNG.getUniform() * (L - 2)), y = 1 + Math.floor(ROT.RNG.getUniform() * (L - 2))
    if (wall[y][x] === 0) return [x, y]
  }
  return nearestPassable(wall, Math.floor(L / 2), Math.floor(L / 2))
}
function windingPath(wall, weave, from, to, k) {
  const pts = [from]
  for (let i = 0; i < k; i++) pts.push(randPassable(wall))
  pts.push(to)
  let full = []
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = weavePath(wall, weave, pts[i], pts[i + 1])
    if (!seg.length) continue
    full = full.length ? full.concat(seg.slice(1)) : seg
  }
  return full.length ? full : weavePath(wall, weave, from, to)
}

const sc = (lx, ly) => [lx * SCALE + (SCALE >> 1), ly * SCALE + (SCALE >> 1)] // logical → scaled centerline
const scPath = (p) => p.map(([lx, ly]) => sc(lx, ly))

function rleEncode(arr) {
  const out = []; let k = arr[0], c = 1
  for (let i = 1; i < arr.length; i++) { if (arr[i] === k) c++; else { out.push(k, c); k = arr[i]; c = 1 } }
  out.push(k, c); return out
}

function build() {
  const wall = genMaze()
  const weave = weaveCells(wall)
  const c = Math.round((L - 1) / 2)
  const center = nearestPassable(wall, c, c)
  const entries = borderEntries(wall)
  const families = {}
  const cellFams = new Map()
  FAMILIES.forEach((fam, i) => {
    const path = windingPath(wall, weave, entries[i], center, WIND)
    families[fam] = { entryCell: sc(entries[i][0], entries[i][1]), path: scPath(path), nodeCells: [] }
    for (let idx = 1; idx < path.length - 1; idx++) {
      const [x, y] = path[idx]
      if (!weave.has(key(x, y))) continue
      const axis = path[idx - 1][0] === x ? 'V' : 'H'
      const k = key(x, y)
      if (!cellFams.has(k)) cellFams.set(k, new Map())
      const m = cellFams.get(k)
      if (!m.has(fam)) m.set(fam, { axis, idx })
    }
  })
  const synapses = []
  const crossingsOnRoute = new Map(FAMILIES.map((f) => [f, []]))
  for (const [k, m] of cellFams) {
    let hf = null, vf = null
    for (const [fam, info] of m) { if (info.axis === 'H' && !hf) hf = fam; else if (info.axis === 'V' && !vf) vf = fam }
    if (hf && vf && hf !== vf) {
      const [lx, ly] = k.split(',').map(Number)
      synapses.push({ cell: sc(lx, ly), families: [hf, vf], over: hf, under: vf })
      crossingsOnRoute.get(hf).push({ cell: sc(lx, ly), idx: m.get(hf).idx })
      crossingsOnRoute.get(vf).push({ cell: sc(lx, ly), idx: m.get(vf).idx })
    }
  }
  FAMILIES.forEach((fam) => {
    const f = families[fam]
    const xs = crossingsOnRoute.get(fam).sort((a, b) => a.idx - b.idx)
    const usable = f.path.length > 1 ? f.path : [f.entryCell]
    for (let s = 0; s < NODES_PER_FAMILY; s++) {
      if (xs.length >= NODES_PER_FAMILY) {
        const pick = xs[Math.round((s / (NODES_PER_FAMILY - 1)) * (xs.length - 1))]
        f.nodeCells.push({ slotIndex: s, cell: pick.cell, t: 0, synapse: true })
      } else if (s < xs.length) {
        f.nodeCells.push({ slotIndex: s, cell: xs[s].cell, t: 0, synapse: true })
      } else {
        const t = (s + 0.5) / NODES_PER_FAMILY
        const ix = Math.min(usable.length - 1, Math.round(t * (usable.length - 1)))
        f.nodeCells.push({ slotIndex: s, cell: usable[ix], t: +t.toFixed(3), synapse: false })
      }
    }
  })

  // === SECOND ROUTE (二回目 — add-neurons-maze-second-lap-variants) ===
  // RNG consumed HERE, strictly AFTER all first-route generation above, so the first
  // route (paths / nodeCells / synapses / weave / cellKinds) stays byte-for-byte
  // reproducible. Each family winds a SECOND, longer route from the shared center back
  // out toward the opposite-ring border, threading fresh weave crossings the first
  // route's nodes never marked; up to SECOND_NODES_CAP of those become second-route
  // nodes (slotIndex >= NODES_PER_FAMILY). Runtime does ZERO generation — it parses
  // path2 / nodeCells2 the same way it parses path / nodeCells.
  const half = Math.floor(FAMILIES.length / 2)
  FAMILIES.forEach((fam, i) => {
    const f = families[fam]
    const exit = entries[(i + half) % FAMILIES.length] // opposite-ring border → crosses new regions
    let p2 = windingPath(wall, weave, center, exit, WIND2)
    // Guarantee the second route is LONGER than the first (spec): append fresh winding
    // segments until its cell count exceeds path1's (path is scaled 1:1 with logical → same length).
    let extendGuard = 0
    while (p2.length <= f.path.length && extendGuard++ < 30) {
      const more = weavePath(wall, weave, p2[p2.length - 1], randPassable(wall))
      if (more.length > 1) p2 = p2.concat(more.slice(1))
    }
    f.path2 = scPath(p2)
    // candidate second-route nodes = weave crossings on path2, route order, excluding
    // this family's first-route node cells (positions the first route never marked).
    const firstNodeKeys = new Set(f.nodeCells.map((n) => `${n.cell[0]},${n.cell[1]}`))
    const seen = new Set()
    const cand = []
    for (let idx = 1; idx < p2.length - 1; idx++) {
      const [lx, ly] = p2[idx]
      if (!weave.has(key(lx, ly))) continue
      const [sx, sy] = sc(lx, ly)
      const ck = `${sx},${sy}`
      if (firstNodeKeys.has(ck) || seen.has(ck)) continue
      seen.add(ck)
      cand.push([sx, sy])
    }
    f.nodeCells2 = []
    if (cand.length > 0) {
      const k2 = Math.min(SECOND_NODES_CAP, cand.length)
      for (let s = 0; s < k2; s++) {
        const pick = k2 === 1 ? cand[0] : cand[Math.round((s / (k2 - 1)) * (cand.length - 1))]
        f.nodeCells2.push({ slotIndex: NODES_PER_FAMILY + s, cell: pick, synapse: true })
      }
    } else {
      // defensive fallback (rare): evenly-spaced path2 cells if no fresh weave crossing.
      const usable = f.path2.length > 1 ? f.path2 : [f.path2[0] ?? f.nodeCells[0].cell]
      const kf = Math.min(SECOND_NODES_CAP, usable.length)
      for (let s = 0; s < kf; s++) {
        const ix = kf === 1 ? 0 : Math.round((s / (kf - 1)) * (usable.length - 1))
        f.nodeCells2.push({ slotIndex: NODES_PER_FAMILY + s, cell: usable[ix], synapse: false })
      }
    }
  })

  // scaled cellKinds: PATH(2) passages, WALL(1) rim, BACKGROUND(0) deep interior + margin
  const kinds = new Uint8Array(GRID * GRID)
  const isPassage = (lx, ly) => lx >= 0 && ly >= 0 && lx < L && ly < L && wall[ly][lx] === 0
  for (let ly = 0; ly < L; ly++) for (let lx = 0; lx < L; lx++) {
    const kind = isPassage(lx, ly) ? 2 : 1
    for (let by = 0; by < SCALE; by++) for (let bx = 0; bx < SCALE; bx++) kinds[(ly * SCALE + by) * GRID + (lx * SCALE + bx)] = kind
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? 0 : kinds[y * GRID + x])
  const demote = new Uint8Array(GRID * GRID)
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (kinds[y * GRID + x] !== 1) continue
    if (at(x, y - 1) === 2 || at(x, y + 1) === 2 || at(x - 1, y) === 2 || at(x + 1, y) === 2) continue
    demote[y * GRID + x] = 1
  }
  for (let i = 0; i < kinds.length; i++) if (demote[i]) kinds[i] = 0
  const counts = { bg: 0, wall: 0, path: 0 }
  for (let i = 0; i < kinds.length; i++) counts[kinds[i] === 2 ? 'path' : kinds[i] === 1 ? 'wall' : 'bg']++

  return {
    gridW: GRID, gridH: GRID, scale: SCALE, center: sc(center[0], center[1]), seed: SEED,
    weave: [...weave.entries()].map(([k, o]) => { const [lx, ly] = k.split(',').map(Number); return { cell: sc(lx, ly), over: o } }),
    families, synapses,
    cellKinds: { w: GRID, h: GRID, rle: rleEncode(kinds) },
    _kinds: kinds, _counts: counts,
  }
}

/** Flat-color 3-region preview (+ faint family routes) so the structure is eyeballable. */
async function writePreview(graph) {
  const CELL = 2 // px per tile in the preview (384×2 = 768)
  const W = GRID * CELL
  const C = { 0: [232, 230, 226], 1: [120, 120, 128], 2: [22, 22, 28] } // bg light / wall mid / path dark (flat, no images)
  const buf = Buffer.alloc(W * W * 4)
  const kinds = graph._kinds
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const col = C[kinds[y * GRID + x]]
    for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) {
      const i = ((y * CELL + yy) * W + (x * CELL + xx)) * 4
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255
    }
  }
  // faint family routes so 11 paths are visible in the preview (render layer draws these properly)
  const plot = (x, y, col) => {
    for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) {
      const px = x * CELL + xx, py = y * CELL + yy
      if (px < 0 || py < 0 || px >= W || py >= W) continue
      const i = (py * W + px) * 4
      buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255
    }
  }
  FAMILIES.forEach((fam, i) => {
    const hx = PREVIEW_COLORS[i].replace('#', '')
    const col = [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)]
    const dim = col.map((c) => Math.round(c * 0.5)) // second route drawn dimmer
    for (const [x, y] of graph.families[fam].path2 ?? []) plot(x, y, dim)
    for (const [x, y] of graph.families[fam].path) plot(x, y, col)
  })
  const out = resolve(ASSET_DIR, 'tiles/tilemap-preview.png')
  await sharp(buf, { raw: { width: W, height: W, channels: 4 } }).png().toFile(out)
  return out
}

const graph = build()
const { _kinds, _counts, ...committed } = graph
await writeFile(resolve(ASSET_DIR, 'grid-graph.json'), JSON.stringify(committed) + '\n')
const preview = await writePreview(graph)
const totalNodes = FAMILIES.reduce((a, f) => a + graph.families[f].nodeCells.length, 0)
const totalNodes2 = FAMILIES.reduce((a, f) => a + (graph.families[f].nodeCells2?.length ?? 0), 0)
const k2s = FAMILIES.map((f) => graph.families[f].nodeCells2?.length ?? 0)
const longer = FAMILIES.filter((f) => (graph.families[f].path2?.length ?? 0) > graph.families[f].path.length).length
const reachable = FAMILIES.filter((f) => graph.families[f].path.length > 0).length
const bytes = JSON.stringify(committed).length
console.log(`[tilemap-maze] logical ${L}² ×${SCALE} → ${GRID}² · braid=${BRAID} weave=${WEAVE} wind=${WIND}/${WIND2} seed=${SEED}`)
console.log(`[tilemap-maze] ${graph.weave.length} bridges · ${graph.synapses.length} synapses · ${totalNodes} first-route nodes · reachable=${reachable}/11`)
console.log(`[tilemap-maze] 二回目: ${totalNodes2} second-route nodes (per-family ${Math.min(...k2s)}–${Math.max(...k2s)}, cap ${SECOND_NODES_CAP}) · ${longer}/11 routes longer than first · total catalog target ${totalNodes + totalNodes2}`)
console.log(`[tilemap-maze] cellKinds: path=${_counts.path} wall=${_counts.wall} bg=${_counts.bg} · grid-graph.json=${(bytes / 1024).toFixed(0)}KB`)
console.log(`[tilemap-maze] preview → ${preview}`)
