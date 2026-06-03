/**
 * Build-time brain-maze graph pipeline (add-neurons-brain-maze-slice).
 *
 * Run ONCE to regenerate the committed graph JSON; CI does NOT run this.
 *   pnpm --filter @study-rpg/neurons-tw build:maze-graph
 *
 * Pipeline (per design D2 / D9, validated by the v7 prototype):
 *   flat-saturated single-color tract PNG
 *     → sharp decode @ analysis resolution
 *     → HSV-threshold single-color mask
 *     → morphological close (repair 1–3px AI gaps)
 *     → Zhang-Suen skeletonize (1px centerline)
 *     → prune short spurs
 *     → skeleton → graph (degree 1 = endpoint, 2 = continuation, ≥3 = branch)
 *     → trace edges into ordered polylines
 *     → RDP simplify (self-written, no dep)
 *     → arc-length parameterize
 *     → select EXACTLY `SLOT_COUNT` node anchors bound to topology
 *     → write per-branch graph JSON (coords normalized 0..1)
 *
 * Per-branch by design (D9): the slice runs one branch (DA). Adding 5HT/GABA/Glu
 * later = add a BRANCHES entry + its single-color image; this script and the
 * runtime loader stay unchanged. DA's image is never regenerated → DA node
 * positions stay stable across expansion.
 */
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = resolve(__dirname, '../src/assets/maze')

// Analysis resolution (≥ 384×256 per spec). Higher = finer skeleton; this is a
// one-time build so cost is irrelevant. 3:2 to match the 1536×1024 source.
const AW = 384
const AH = 256

/**
 * Per-branch source images. Slice = DA only. To expand, add an entry with a
 * single-color tract PNG and its dominant hue window — nothing else changes.
 */
const BRANCHES = [
  {
    branch: 'DA',
    image: 'da-basemap.png',
    // amber/orange fibers: hue window + saturation/value floors isolate tracts
    // from the navy background (hue ~220) and the faint gray brain outline (low sat).
    hue: [18, 65],
    minValue: 120, // 0..255 on the max channel
    minSat: 0.42, // (max-min)/max
    // The 20 DA variant slots span two families (10 each); anchors are split
    // deterministically into these in declaration order (see assignSlots).
    families: ['藥理學', '公共衛生學'],
    slotsPerFamily: 10,
  },
]

const SPUR_MIN = 4 // skeleton spur shorter than this (px) is pruned
const RDP_EPS = 0.5 // polyline simplification tolerance (analysis px) — low = hug fiber curves faithfully

// ---------- pixel helpers ----------
const idx = (x, y) => y * AW + x

function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = -1
  if (d >= 8) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = mx === 0 ? 0 : d / mx
  return { h, s, v: mx }
}

async function loadMask(imagePath, hueWin, minValue, minSat) {
  const { data } = await sharp(imagePath)
    .resize(AW, AH, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const channels = data.length / (AW * AH)
  const mask = new Uint8Array(AW * AH)
  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      const i = (y * AW + x) * channels
      const { h, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2])
      if (v >= minValue && s >= minSat && h >= hueWin[0] && h <= hueWin[1]) {
        mask[idx(x, y)] = 1
      }
    }
  }
  return mask
}

// ---------- morphology ----------
function dilate(mask) {
  const out = new Uint8Array(mask)
  for (let y = 1; y < AH - 1; y++)
    for (let x = 1; x < AW - 1; x++) {
      if (mask[idx(x, y)]) continue
      let any = 0
      for (let dy = -1; dy <= 1 && !any; dy++)
        for (let dx = -1; dx <= 1; dx++) if (mask[idx(x + dx, y + dy)]) { any = 1; break }
      if (any) out[idx(x, y)] = 1
    }
  return out
}
function erode(mask) {
  const out = new Uint8Array(mask)
  for (let y = 1; y < AH - 1; y++)
    for (let x = 1; x < AW - 1; x++) {
      if (!mask[idx(x, y)]) continue
      let all = 1
      for (let dy = -1; dy <= 1 && all; dy++)
        for (let dx = -1; dx <= 1; dx++) if (!mask[idx(x + dx, y + dy)]) { all = 0; break }
      if (!all) out[idx(x, y)] = 0
    }
  return out
}
const morphClose = (mask) => erode(dilate(mask))

// Hub (VTA/SN origin) = densest local amber region on the FILLED mask (the big
// convergence blob), found by max box-sum. Used as the walk root.
function findHub(mask, win = 6) {
  let best = [Math.floor(AW / 2), Math.floor(AH / 2)], bestSum = -1
  for (let y = win; y < AH - win; y += 2) {
    for (let x = win; x < AW - win; x += 2) {
      let s = 0
      for (let dy = -win; dy <= win; dy += 2) for (let dx = -win; dx <= win; dx += 2) if (mask[idx(x + dx, y + dy)]) s++
      if (s > bestSum) { bestSum = s; best = [x, y] }
    }
  }
  return best
}

// ---------- Zhang-Suen thinning (ported from validated v7 prototype) ----------
function thin(mask) {
  const nb = (x, y) => [
    mask[idx(x, y - 1)], mask[idx(x + 1, y - 1)], mask[idx(x + 1, y)], mask[idx(x + 1, y + 1)],
    mask[idx(x, y + 1)], mask[idx(x - 1, y + 1)], mask[idx(x - 1, y)], mask[idx(x - 1, y - 1)],
  ]
  let changed = true, guard = 0
  while (changed && guard++ < 200) {
    changed = false
    for (let s = 0; s < 2; s++) {
      const rm = []
      for (let y = 1; y < AH - 1; y++)
        for (let x = 1; x < AW - 1; x++) {
          if (!mask[idx(x, y)]) continue
          const n = nb(x, y)
          const B = n[0] + n[1] + n[2] + n[3] + n[4] + n[5] + n[6] + n[7]
          if (B < 2 || B > 6) continue
          let A = 0
          for (let i = 0; i < 8; i++) if (n[i] === 0 && n[(i + 1) % 8] === 1) A++
          if (A !== 1) continue
          const p2 = n[0], p4 = n[2], p6 = n[4], p8 = n[6]
          if (s === 0) { if (p2 * p4 * p6) continue; if (p4 * p6 * p8) continue }
          else { if (p2 * p4 * p8) continue; if (p2 * p6 * p8) continue }
          rm.push(idx(x, y))
        }
      if (rm.length) { changed = true; for (const i of rm) mask[i] = 0 }
    }
  }
  return mask
}

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
function neighbors(mask, x, y) {
  const out = []
  for (const [dx, dy] of N8) {
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < AW && ny < AH && mask[idx(nx, ny)]) out.push([nx, ny])
  }
  return out
}
const deg = (mask, x, y) => neighbors(mask, x, y).length

// ---------- prune short spurs ----------
function pruneSpurs(mask, minLen) {
  let pruned = true, guard = 0
  while (pruned && guard++ < 20) {
    pruned = false
    for (let y = 1; y < AH - 1; y++)
      for (let x = 1; x < AW - 1; x++) {
        if (!mask[idx(x, y)] || deg(mask, x, y) !== 1) continue
        // walk the spur from this endpoint until a branch/endpoint; remove if short
        const chain = [[x, y]]
        let [cx, cy] = [x, y]
        let prev = null
        while (true) {
          const ns = neighbors(mask, cx, cy).filter(([nx, ny]) => !(prev && nx === prev[0] && ny === prev[1]))
          if (ns.length !== 1) break
          prev = [cx, cy];[cx, cy] = ns[0]; chain.push([cx, cy])
          if (deg(mask, cx, cy) !== 2) break
          if (chain.length > minLen + 2) break
        }
        const endDeg = deg(mask, cx, cy)
        if (chain.length <= minLen && endDeg >= 3) {
          for (let i = 0; i < chain.length - 1; i++) mask[idx(chain[i][0], chain[i][1])] = 0
          pruned = true
        }
      }
  }
  return mask
}

// ---------- skeleton → graph ----------
function buildGraph(mask) {
  const nodeKey = new Map() // "x,y" -> node id
  const nodes = []
  for (let y = 0; y < AH; y++)
    for (let x = 0; x < AW; x++) {
      if (!mask[idx(x, y)]) continue
      const d = deg(mask, x, y)
      if (d === 1 || d >= 3) {
        const k = `${x},${y}`
        if (!nodeKey.has(k)) { nodeKey.set(k, nodes.length); nodes.push({ x, y, kind: d === 1 ? 'endpoint' : 'branch', degree: d }) }
      }
    }
  // trace edges: from each node, walk each unused skeleton direction along
  // degree-2 chains to the next node.
  const edges = []
  const usedEdge = new Set() // "ax,ay->bx,by" undirected guard via sorted key
  const isNode = (x, y) => nodeKey.has(`${x},${y}`)
  for (const [k, nid] of nodeKey) {
    const [sx, sy] = k.split(',').map(Number)
    for (const [nx, ny] of neighbors(mask, sx, sy)) {
      // start tracing toward (nx,ny)
      const poly = [[sx, sy]]
      let prev = [sx, sy]
      let [cx, cy] = [nx, ny]
      let safety = 0
      while (safety++ < AW * AH) {
        poly.push([cx, cy])
        if (isNode(cx, cy)) break
        const ns = neighbors(mask, cx, cy).filter(([ax, ay]) => !(ax === prev[0] && ay === prev[1]))
        if (ns.length !== 1) break // dead-end or unexpected branch w/o node
        prev = [cx, cy];[cx, cy] = ns[0]
      }
      const [ex, ey] = poly[poly.length - 1]
      if (!isNode(ex, ey)) continue
      const a = nid, b = nodeKey.get(`${ex},${ey}`)
      if (a === b) continue
      const ek = a < b ? `${a}->${b}` : `${b}->${a}`
      if (usedEdge.has(ek)) continue
      usedEdge.add(ek)
      edges.push({ from: a, to: b, polyline: poly })
    }
  }
  return { nodes, edges }
}

// ---------- adjacency + Dijkstra (route root → anchor along fibers) ----------
function buildAdjacency(graph) {
  const adj = new Map() // nodeId -> [{ to, poly (oriented from this node), len }]
  const add = (a, b, poly, len) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a).push({ to: b, poly, len })
  }
  for (const e of graph.edges) {
    const len = polyLen(e.polyline)
    add(e.from, e.to, e.polyline, len)
    add(e.to, e.from, [...e.polyline].reverse(), len)
  }
  return adj
}
function dijkstra(adj, rootId, nodeCount) {
  const dist = new Array(nodeCount).fill(Infinity)
  const prev = new Array(nodeCount).fill(-1)
  const prevPoly = new Array(nodeCount).fill(null)
  dist[rootId] = 0
  const visited = new Uint8Array(nodeCount)
  for (let it = 0; it < nodeCount; it++) {
    let u = -1, ud = Infinity
    for (let i = 0; i < nodeCount; i++) if (!visited[i] && dist[i] < ud) { ud = dist[i]; u = i }
    if (u === -1) break
    visited[u] = 1
    for (const { to, poly, len } of adj.get(u) ?? []) {
      if (dist[u] + len < dist[to]) { dist[to] = dist[u] + len; prev[to] = u; prevPoly[to] = poly }
    }
  }
  return { dist, prev, prevPoly }
}
function reconstructPath(rootId, targetId, prev, prevPoly) {
  if (targetId === rootId) return [[0, 0]] // caller overwrites with root coords
  if (prev[targetId] === -1) return null // unreachable
  const segments = []
  let cur = targetId
  while (cur !== rootId && prev[cur] !== -1) { segments.push(prevPoly[cur]); cur = prev[cur] }
  if (cur !== rootId) return null
  segments.reverse()
  const path = [segments[0][0]]
  for (const seg of segments) for (let i = 1; i < seg.length; i++) path.push(seg[i])
  return path
}
const nearestNodeId = (graph, x, y) => {
  let best = -1, bd = Infinity
  graph.nodes.forEach((nd, id) => { const d = (nd.x - x) ** 2 + (nd.y - y) ** 2; if (d < bd) { bd = d; best = id } })
  return best
}

// ---------- RDP polyline simplify (self-written) ----------
function rdp(points, eps) {
  if (points.length < 3) return points.slice()
  const [x1, y1] = points[0]
  const [x2, y2] = points[points.length - 1]
  let maxD = -1, maxI = 0
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    const d = Math.abs((px - x1) * dy - (py - y1) * dx) / len
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, maxI + 1), eps)
    const right = rdp(points.slice(maxI), eps)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[points.length - 1]]
}

const polyLen = (poly) => {
  let s = 0
  for (let i = 1; i < poly.length; i++) s += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])
  return s
}

// ---------- select EXACTLY n node anchors, spatially spread on topology ----------
const MERGE_RADIUS = 9 // collapse candidates within this many px (kills bud rosettes)

function selectAnchors(graph, n) {
  // Candidate pool: endpoints (tract tips — natural collectible spots) first,
  // then branch hubs, then mid-points of long edges to fill gaps. Each candidate
  // carries a priority weight so the seed + ties favor real tips over noise.
  const incident = new Map()
  for (const e of graph.edges) {
    const L = polyLen(e.polyline)
    incident.set(e.from, (incident.get(e.from) ?? 0) + L)
    incident.set(e.to, (incident.get(e.to) ?? 0) + L)
  }
  const cands = []
  graph.nodes.forEach((nd, id) => {
    if (nd.kind === 'endpoint') cands.push({ x: nd.x, y: nd.y, kind: 'endpoint', w: 2 + (incident.get(id) ?? 0) })
    else cands.push({ x: nd.x, y: nd.y, kind: 'branch', w: 1 })
  })
  // mid-points of longer edges → coverage along trunks, not just tips/junctions
  for (const e of graph.edges) {
    if (polyLen(e.polyline) < 14) continue
    const mid = e.polyline[Math.floor(e.polyline.length / 2)]
    cands.push({ x: mid[0], y: mid[1], kind: 'mid', w: 0.5 })
  }
  // dedupe within MERGE_RADIUS, keeping the highest-weight candidate
  cands.sort((a, b) => b.w - a.w)
  const merged = []
  for (const c of cands) {
    if (merged.some((m) => (m.x - c.x) ** 2 + (m.y - c.y) ** 2 < MERGE_RADIUS * MERGE_RADIUS)) continue
    merged.push(c)
  }
  // farthest-point sampling for spatial spread. Seed = highest-weight (best tip).
  const picked = [merged[0]]
  while (picked.length < n && picked.length < merged.length) {
    let best = null, bestD = -1
    for (const c of merged) {
      if (picked.includes(c)) continue
      let dmin = Infinity
      for (const p of picked) { const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < dmin) dmin = d }
      if (dmin > bestD) { bestD = dmin; best = c }
    }
    if (!best) break
    picked.push(best)
  }
  // if the pool was too small, top up with mid-points of the longest edges
  if (picked.length < n) {
    const longEdges = [...graph.edges].sort((a, b) => polyLen(b.polyline) - polyLen(a.polyline))
    let ei = 0
    while (picked.length < n && longEdges.length) {
      const e = longEdges[ei % longEdges.length]
      const t = ((ei % 3) + 1) / 4
      const pt = e.polyline[Math.floor(e.polyline.length * t)]
      if (!picked.some((p) => (p.x - pt[0]) ** 2 + (p.y - pt[1]) ** 2 < 16)) picked.push({ x: pt[0], y: pt[1], kind: 'mid', w: 0 })
      ei++
    }
  }
  return picked.slice(0, n)
}

// ---------- main ----------
async function run() {
  for (const cfg of BRANCHES) {
    const imgPath = resolve(ASSET_DIR, cfg.image)
    let mask = await loadMask(imgPath, cfg.hue, cfg.minValue, cfg.minSat)
    const maskCount = mask.reduce((a, b) => a + b, 0)
    // morphological close repairs AI gaps but can bridge closely-spaced fibers
    // (false skeleton cross-links → Dijkstra shortcuts off-fiber). The codex
    // image has clean continuous tracts, so it is OFF by default; set CLOSE=1 to
    // re-enable if a future image needs gap repair.
    if (process.env.CLOSE) mask = morphClose(mask)
    const hub = findHub(mask) // detect on FILLED mask (before thinning)
    thin(mask)
    pruneSpurs(mask, SPUR_MIN)
    const graph = buildGraph(mask)
    const slotCount = cfg.families.length * cfg.slotsPerFamily
    const anchorPts = selectAnchors(graph, slotCount)

    // Snap each anchor to its nearest topology node (spec: nodes bound to skeleton
    // topology) and dedupe so we end with `slotCount` DISTINCT graph nodes.
    const anchorNodeIds = []
    for (const a of anchorPts) {
      let id = nearestNodeId(graph, a.x, a.y)
      if (anchorNodeIds.includes(id)) {
        // pick the nearest not-yet-used node instead
        const ranked = graph.nodes
          .map((nd, i) => ({ i, d: (nd.x - a.x) ** 2 + (nd.y - a.y) ** 2 }))
          .sort((p, q) => p.d - q.d)
        const free = ranked.find((r) => !anchorNodeIds.includes(r.i))
        id = free ? free.i : id
      }
      anchorNodeIds.push(id)
    }

    // Root = graph node nearest the detected hub (VTA/SN origin blob).
    const rootId = nearestNodeId(graph, hub[0], hub[1])
    const rootDeg = graph.nodes[rootId].degree

    // Route root → each anchor along the skeleton (Dijkstra), reconstruct walk path.
    const adj = buildAdjacency(graph)
    const { prev, prevPoly } = dijkstra(adj, rootId, graph.nodes.length)
    const rootNode = graph.nodes[rootId]
    let unreachable = 0

    const norm = ([x, y]) => [+(x / AW).toFixed(4), +(y / AH).toFixed(4)]
    const buildNode = (nodeId, familyId, slotIndex) => {
      const nd = graph.nodes[nodeId]
      let raw = reconstructPath(rootId, nodeId, prev, prevPoly)
      if (raw) raw[0] = [rootNode.x, rootNode.y]
      if (!raw) { unreachable++; raw = [[rootNode.x, rootNode.y], [nd.x, nd.y]] } // straight fallback
      const path = rdp(raw, RDP_EPS).map(norm)
      const cum = [0]
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
      return {
        familyId, slotIndex, kind: nd.kind,
        x: norm([nd.x, nd.y])[0], y: norm([nd.x, nd.y])[1],
        path, arc: cum.map((v) => +v.toFixed(5)), pathLen: +cum[cum.length - 1].toFixed(5),
      }
    }

    // Assign anchors → (family, slot): radial sort around the hub for a stable,
    // visually-spread mapping, split evenly across the branch's families.
    const order = anchorNodeIds
      .map((id) => ({ id, ang: Math.atan2(graph.nodes[id].y - rootNode.y, graph.nodes[id].x - rootNode.x) }))
      .sort((a, b) => a.ang - b.ang)
    const slotNodes = order.map((o, i) =>
      buildNode(o.id, cfg.families[Math.floor(i / cfg.slotsPerFamily)], i % cfg.slotsPerFamily),
    )

    const out = {
      branch: cfg.branch,
      generatedFrom: cfg.image,
      analysisResolution: { w: AW, h: AH },
      slotCount,
      root: norm([rootNode.x, rootNode.y]),
      nodes: slotNodes,
    }
    const outPath = resolve(ASSET_DIR, `${cfg.branch.toLowerCase()}-graph.json`)
    await writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')

    if (process.env.DEBUG) {
      // composite: dimmed basemap + skeleton (cyan) + edges(green) + anchors(red)
      const base = await sharp(imgPath).resize(AW, AH, { fit: 'fill' }).removeAlpha().raw().toBuffer()
      const buf = Buffer.alloc(AW * AH * 3)
      for (let i = 0; i < AW * AH; i++) { buf[i * 3] = base[i * 3] >> 2; buf[i * 3 + 1] = base[i * 3 + 1] >> 2; buf[i * 3 + 2] = base[i * 3 + 2] >> 2 }
      for (let p = 0; p < mask.length; p++) if (mask[p]) { buf[p * 3] = 0; buf[p * 3 + 1] = 90; buf[p * 3 + 2] = 90 }
      const plot = (nx, ny, r, g, b, rad) => {
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const x = Math.round(nx) + dx, y = Math.round(ny) + dy
          if (x < 0 || y < 0 || x >= AW || y >= AH || dx * dx + dy * dy > rad * rad) continue
          const i = (y * AW + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b
        }
      }
      // draw walk paths (magenta) to verify they hug the fibers
      slotNodes.forEach((nd) => nd.path.forEach((pt) => plot(pt[0] * AW, pt[1] * AH, 255, 0, 200, 1)))
      plot(out.root[0] * AW, out.root[1] * AH, 80, 200, 255, 5) // root = blue
      slotNodes.forEach((nd, i) => plot(nd.x * AW, nd.y * AH, 255, i < cfg.slotsPerFamily ? 60 : 220, 40, 3))
      await sharp(buf, { raw: { width: AW, height: AH, channels: 3 } }).png().toFile(resolve(ASSET_DIR, `${cfg.branch.toLowerCase()}-debug.png`))
      console.log(`[maze-graph] DEBUG png written`)
    }
    console.log(
      `[maze-graph] ${cfg.branch}: mask=${maskCount}px → skeleton nodes=${graph.nodes.length} edges=${graph.edges.length} → root=${rootId}(deg ${rootDeg}) → anchors=${slotNodes.length}/${slotCount} (unreachable→straight: ${unreachable}) → ${outPath}`,
    )
    if (slotNodes.length !== slotCount) {
      console.error(`[maze-graph] WARNING: anchor count ${slotNodes.length} != slotCount ${slotCount}`)
      process.exitCode = 1
    }
  }
}

run().catch((err) => {
  console.error('[maze-graph] failed:', err)
  process.exit(1)
})
