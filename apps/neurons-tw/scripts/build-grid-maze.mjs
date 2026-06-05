/**
 * Build-time STRUCTURAL WEAVE maze pipeline (redesign-neurons-maze-rotjs-grid).
 *
 * Run ONCE to regenerate the committed grid graph; CI does NOT run this.
 *   pnpm --filter @study-rpg/neurons-tw build:grid-maze
 *
 * WEAVE model (owner-locked 2026-06-05): the WHOLE maze is structurally weave —
 * at many 4-way junctions the N-S corridor passes OVER the E-W corridor (or vice
 * versa) WITHOUT joining (a bridge / over-under crossing), like a true weave maze.
 * That gives the dense over/under look. We own this generator (no external dep —
 * meatfighter's canvas build fails on node 25, csmazes is CoffeeScript, daleobrien
 * is Python). Then the 11 family corridors are overlaid border→center; a weave cell
 * shared by two families is a gameplay SYNAPSE.
 *
 * Tunables (visual-pass knobs): GRID, BRAID (junction density), WEAVE (fraction of
 * junctions made into over/under bridges). The renderer zooms; owner eyeballs.
 */
import * as ROT from 'rot-js'
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = resolve(__dirname, '../src/assets/maze')

const GRID = Number(process.env.GRID) || 99 // big; renderer zooms so detail stays legible (owner-locked)
const BRAID = process.env.BRAID != null ? Number(process.env.BRAID) : 0.7 // sweet spot — higher KILLS 4-way junctions
const WEAVE = process.env.WEAVE != null ? Number(process.env.WEAVE) : 0.7 // fraction of junctions → over/under bridges (~1300 at G99)
const NODES_PER_FAMILY = 10
const SEED = Number(process.env.SEED) || 20260605

const FAMILIES = [
  '藥理學', '公共衛生學', '寄生蟲學', '組織學', '生物化學',
  '病理學', '免疫學', '解剖學', '生理學', '胚胎學', '微生物學',
]
const COLORS = [
  '#e0524d', '#e08a3c', '#d8c23a', '#7fb84e', '#43b59a',
  '#3f9bd8', '#5d6fd8', '#9b5dd8', '#d85db0', '#8a8f99', '#5a6b3a',
]
const key = (x, y) => `${x},${y}`
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] // N E S W

function genMaze() {
  ROT.RNG.setSeed(SEED)
  const maze = new ROT.Map.EllerMaze(GRID, GRID)
  const wall = Array.from({ length: GRID }, () => new Array(GRID).fill(1))
  maze.create((x, y, w) => { wall[y][x] = w })
  const passable = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && wall[y][x] === 0
  const deg = (x, y) => DIRS.filter(([dx, dy]) => passable(x + dx, y + dy)).length
  // braid: open walls to create loops + 4-way junctions
  for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) {
    if (wall[y][x] === 0 && deg(x, y) <= 2 && ROT.RNG.getUniform() < BRAID) {
      const cand = DIRS.map(([dx, dy]) => [x + dx, y + dy])
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < GRID - 1 && ny < GRID - 1 && wall[ny][nx] === 1)
      if (cand.length) { const [nx, ny] = cand[Math.floor(ROT.RNG.getUniform() * cand.length)]; wall[ny][nx] = 0 }
    }
  }
  return wall
}

/** Weave cells: 4-way junctions promoted to over/under bridges (N-S vs E-W do NOT join). */
function weaveCells(wall) {
  const passable = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && wall[y][x] === 0
  const weave = new Map() // "x,y" → 'H' (E-W over) | 'V' (N-S over)
  for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) {
    if (wall[y][x] !== 0) continue
    const n = passable(x, y - 1), s = passable(x, y + 1), e = passable(x + 1, y), w = passable(x - 1, y)
    if (n && s && e && w && ROT.RNG.getUniform() < WEAVE) {
      weave.set(key(x, y), ROT.RNG.getUniform() < 0.5 ? 'H' : 'V')
    }
  }
  return weave
}

function nearestPassable(wall, tx, ty) {
  for (let r = 0; r < GRID; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
    const x = tx + dx, y = ty + dy
    if (x >= 0 && y >= 0 && x < GRID && y < GRID && wall[y][x] === 0) return [x, y]
  }
  return [tx, ty]
}
function borderEntries(wall) {
  const border = []
  for (let x = 0; x < GRID; x++) { border.push([x, 0]); border.push([x, GRID - 1]) }
  for (let y = 1; y < GRID - 1; y++) { border.push([0, y]); border.push([GRID - 1, y]) }
  const c = (GRID - 1) / 2, out = []
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

/** BFS border→center; at a weave cell a path may only pass STRAIGHT (can't turn) — respects the bridge. */
function weavePath(wall, weave, from, to) {
  const idx = (x, y, d) => (y * GRID + x) * 4 + d // state = cell + incoming dir (for weave straight-through)
  const passable = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && wall[y][x] === 0
  const start = idx(from[0], from[1], -1 < 0 ? 0 : 0)
  // simpler: BFS over (x,y) with weave straight-through constraint enforced via incoming dir
  const prev = new Map()
  const q = []
  for (let d = 0; d < 4; d++) { const s = `${from[0]},${from[1]},${d}`; prev.set(s, null); q.push([from[0], from[1], d]) }
  let endState = null
  while (q.length) {
    const [x, y, indir] = q.shift()
    if (x === to[0] && y === to[1]) { endState = `${x},${y},${indir}`; break }
    const wv = weave.get(key(x, y))
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy
      if (!passable(nx, ny)) continue
      // weave straight-through: at a weave cell you must exit opposite to entry (no turn), and only on the matching axis
      if (wv) {
        const axis = (d === 0 || d === 2) ? 'V' : 'H'
        const inAxis = (indir === 0 || indir === 2) ? 'V' : 'H'
        if (indir >= 0 && inAxis !== axis) continue // can't turn at a bridge
      }
      const ns = `${nx},${ny},${d}`
      if (!prev.has(ns)) { prev.set(ns, `${x},${y},${indir}`); q.push([nx, ny, d]) }
    }
  }
  if (!endState) { // fallback: plain BFS ignoring weave (ensures reachability)
    return plainBFS(wall, from, to)
  }
  const path = []
  let s = endState
  while (s) { const [x, y] = s.split(',').map(Number); path.push([x, y]); s = prev.get(s) }
  return path.reverse()
}
function plainBFS(wall, from, to) {
  const passable = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && wall[y][x] === 0
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

/** A random interior passable cell (deterministic via ROT.RNG seed). */
function randPassable(wall) {
  for (let t = 0; t < 9999; t++) {
    const x = 1 + Math.floor(ROT.RNG.getUniform() * (GRID - 2))
    const y = 1 + Math.floor(ROT.RNG.getUniform() * (GRID - 2))
    if (wall[y][x] === 0) return [x, y]
  }
  return nearestPassable(wall, Math.floor(GRID / 2), Math.floor(GRID / 2))
}
/** WINDING route: chain weave paths through `k` random waypoints so the corridor meanders
 * across the map (NOT the shortest path) and crosses the other families many times. */
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

function build() {
  const wall = genMaze()
  const weave = weaveCells(wall)
  const c = Math.round((GRID - 1) / 2)
  const center = nearestPassable(wall, c, c)
  const entries = borderEntries(wall)
  const WIND = Number(process.env.WIND) || 10 // waypoints per route → winding/interweaving strength
  const families = {}
  const cellFams = new Map() // bridge cell → Map(familyId → { axis, idx })  (idx = first path index)
  FAMILIES.forEach((fam, i) => {
    const path = windingPath(wall, weave, entries[i], center, WIND)
    families[fam] = { entryCell: entries[i], path, nodeCells: [] }
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
  // Gameplay synapses = where two families' WINDING routes cross at a weave bridge (one passes
  // H / over, the other V / under). The interwoven crossings ARE the synapse nodes (owner). The
  // connectome (same-day co-fire) decides WHEN a pair's synapse forms; the maze supplies WHERE.
  const synapses = []
  const crossingsOnRoute = new Map(FAMILIES.map((f) => [f, []])) // fam → [{cell, idx}]
  for (const [k, m] of cellFams) {
    let hf = null, vf = null
    for (const [fam, info] of m) { if (info.axis === 'H' && !hf) hf = fam; else if (info.axis === 'V' && !vf) vf = fam }
    if (hf && vf && hf !== vf) {
      const [x, y] = k.split(',').map(Number)
      synapses.push({ cell: [x, y], families: [hf, vf], over: hf, under: vf })
      crossingsOnRoute.get(hf).push({ cell: [x, y], idx: m.get(hf).idx })
      crossingsOnRoute.get(vf).push({ cell: [x, y], idx: m.get(vf).idx })
    }
  }
  // Each family's 10 variant-slot nodes sit AT crossings on its route (interwoven points),
  // sampled evenly in route order; pad with evenly-spaced route cells if a route has < 10 crossings.
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
  return { gridW: GRID, gridH: GRID, center, seed: SEED, weave: [...weave.entries()].map(([k, o]) => ({ cell: k.split(',').map(Number), over: o })), families, synapses, _wall: wall, _weaveMap: weave }
}

async function writePreview(graph) {
  const S = Math.max(7, Math.min(16, Math.round(1100 / GRID))), pad = 10, W = GRID * S + pad * 2
  const cx = (x) => pad + x * S + S / 2
  const wall = graph._wall, weave = graph._weaveMap
  const passable = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && wall[y][x] === 0
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">`
  svg += `<rect width="${W}" height="${W}" fill="#0c1418"/>`
  // structural corridors: a segment between each pair of open neighbours (E and S only, no dup).
  // At a weave cell the UNDER axis gaps near the centre → looks like it tunnels under.
  const seg = (x1, y1, x2, y2, col, wdt, op) => `<line x1="${cx(x1)}" y1="${cx(y1)}" x2="${cx(x2)}" y2="${cx(y2)}" stroke="${col}" stroke-width="${wdt}" stroke-opacity="${op}" stroke-linecap="round"/>`
  // draw half-segments cell→neighbour so we can gap one side at weave cells
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!passable(x, y)) continue
    for (const [dx, dy, ax] of [[1, 0, 'H'], [0, 1, 'V']]) {
      const nx = x + dx, ny = y + dy
      if (!passable(nx, ny)) continue
      const mx = (x + nx) / 2, my = (y + ny) / 2
      // half from (x,y) to mid, and mid to (nx,ny); gap the half whose endpoint is an UNDER weave cell
      const under = (cell, axis) => weave.get(key(cell[0], cell[1])) && weave.get(key(cell[0], cell[1])) !== axis
      if (!under([x, y], ax)) svg += seg(x, y, mx, my, '#24414a', 5, 0.9)
      if (!under([nx, ny], ax)) svg += seg(mx, my, nx, ny, '#24414a', 5, 0.9)
    }
  }
  // weave bridge markers (the over axis gets a small highlight cap)
  for (const w of graph.weave) { const [x, y] = w.cell; svg += `<circle cx="${cx(x)}" cy="${cx(y)}" r="2.4" fill="#2f5b63"/>` }
  // 11 family corridors on top
  FAMILIES.forEach((fam, i) => {
    const f = graph.families[fam], col = COLORS[i]
    if (f.path.length) svg += `<polyline points="${f.path.map(([x, y]) => `${cx(x)},${cx(y)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2.6" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>`
    for (const n of f.nodeCells) svg += `<circle cx="${cx(n.cell[0])}" cy="${cx(n.cell[1])}" r="2.6" fill="${col}"/>`
    svg += `<circle cx="${cx(f.entryCell[0])}" cy="${cx(f.entryCell[1])}" r="5" fill="none" stroke="${col}" stroke-width="2"/>`
  })
  // gameplay synapses
  for (const s of graph.synapses) { const [x, y] = s.cell; svg += `<rect x="${cx(x) - 3.5}" y="${cx(y) - 3.5}" width="7" height="7" fill="none" stroke="#38e0d0" stroke-width="1.8" transform="rotate(45 ${cx(x)} ${cx(y)})"/>` }
  svg += `<circle cx="${cx(graph.center[0])}" cy="${cx(graph.center[1])}" r="8" fill="none" stroke="#f0a830" stroke-width="2.5"/></svg>`
  const out = resolve(ASSET_DIR, 'grid-preview.png')
  await sharp(Buffer.from(svg)).png().toFile(out)
  return out
}

const graph = build()
const { _wall, _weaveMap, ...committed } = graph
await writeFile(resolve(ASSET_DIR, 'grid-graph.json'), JSON.stringify(committed, null, 0) + '\n')
const previewPath = await writePreview(graph)
const totalNodes = FAMILIES.reduce((a, f) => a + graph.families[f].nodeCells.length, 0)
const reachable = FAMILIES.filter((f) => graph.families[f].path.length > 0).length
console.log(`[grid-maze:weave] ${GRID}×${GRID} braid=${BRAID} weave=${WEAVE} seed=${SEED}`)
console.log(`[grid-maze:weave] ${graph.weave.length} structural weave bridges · ${graph.synapses.length} gameplay synapses · ${totalNodes} nodes · reachable=${reachable}/11`)
console.log(`[grid-maze:weave] wrote grid-graph.json + ${previewPath}`)
