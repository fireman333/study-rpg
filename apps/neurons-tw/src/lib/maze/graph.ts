/**
 * Flat-grid maze graph loader (redesign-neurons-maze-rotjs-grid +
 * add-neurons-maze-second-lap-variants).
 *
 * Parses the committed, build-time-generated `assets/maze/grid-graph.json`
 * (see `scripts/build-tilemap-maze.mjs`) into typed structures. Runtime does ZERO
 * generation / routing / skeletonization — it only consumes the JSON (spec
 * "Runtime does not regenerate the grid").
 *
 * The 11 subject families each enter from a distinct border cell and wind inward
 * to a shared center; their route crossings (weave over/under bridges) are the
 * gameplay synapses. Each family's first-route variant-slot nodes (slotIndex
 * 0..9) sit at crossings on its route, in route order (entry-first).
 *
 * 二回目 (second lap, add-neurons-maze-second-lap-variants): each family also has a
 * SECOND, longer committed route (`path2`) from the shared center back out, whose
 * nodes (slotIndex 10..N) are NEW positions the first route never marked. The
 * runtime models a family as the first-route nodes FOLLOWED BY the second-route
 * nodes; lit / frontier / walker logic extends past the first-route node count
 * (walker tweens the second-route polyline instead of resting at center).
 */
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import gridGraphRaw from '../../assets/maze/grid-graph.json'

export type Cell = [number, number]

/** A committed weave bridge: the `over` axis passes over the gapped `under` axis. */
export interface WeaveBridge {
  cell: Cell
  over: 'H' | 'V'
}

/** A committed crossing-synapse: where two families' routes cross at a bridge. */
export interface GridSynapse {
  cell: Cell
  families: [string, string]
  /** familyId whose route passes over (H) / under (V) at this cell. */
  over: string
  under: string
  /** Neuroanatomical location name (name-neurons-maze-circuit-locations); 中文. */
  location?: string
}

/** A variant-slot node on a family's winding route (1 node = 1 variant slot). */
export interface MazeNode {
  familyId: string
  slotIndex: number
  cell: Cell
  /** True iff the node sits at a route crossing (a synapse / weave cell). */
  synapse: boolean
  /** Which route this node lives on: 1 = first route, 2 = 二回目 second route. */
  route: 1 | 2
  /** Index of this node's cell along its OWN route's path (monotonic, entry-first). */
  pathIndex: number
  /** Cumulative arc-length (in cells) from the route start to this node (own route). */
  arc: number
  /** Learning-circuit location name (name-neurons-maze-circuit-locations); null for padded non-synapse nodes. */
  location: string | null
}

/** One family's winding corridor(s) + its nodes, parsed + arc-parameterized. */
export interface FamilyGraph {
  familyId: string
  entryCell: Cell
  /** First-route corridor centerline cells, border entry → center (walker polyline). */
  path: Cell[]
  /** Cumulative arc-length at each path cell (`path[i] ↔ arc[i]`). */
  arc: number[]
  /** Total first-route corridor length (= arc[arc.length-1]). */
  pathLen: number
  /** Second-route (二回目) centerline cells, center → far border; [] for legacy graphs. */
  path2: Cell[]
  /** Cumulative arc-length at each path2 cell. */
  arc2: number[]
  /** Total second-route corridor length. */
  pathLen2: number
  /** The family's variant-slot nodes, in route order: first route (0..9) then second route. */
  nodes: MazeNode[]
  /** Count of first-route nodes (slotIndex 0..firstRouteNodeCount-1). */
  firstRouteNodeCount: number
}

/** Run-length-encoded 3-region tilemap (build-tilemap-maze D10): [kind,count,...]. */
interface CellKindsRaw {
  w: number
  h: number
  rle: number[]
}

interface RawNodeCell {
  slotIndex: number
  cell: Cell
  synapse: boolean
  t?: number
  location?: string
}

interface RawGrid {
  gridW: number
  gridH: number
  /** Logical→scaled factor of the tilemap generator (chunky corridors). */
  scale?: number
  center: Cell
  seed: number
  weave: WeaveBridge[]
  families: Record<
    string,
    {
      entryCell: Cell
      path: Cell[]
      nodeCells: RawNodeCell[]
      /** 二回目 second route (add-neurons-maze-second-lap-variants); absent on legacy graphs. */
      path2?: Cell[]
      nodeCells2?: RawNodeCell[]
    }
  >
  synapses: GridSynapse[]
  cellKinds?: CellKindsRaw
}

const RAW = gridGraphRaw as unknown as RawGrid

export const GRID_W = RAW.gridW
export const GRID_H = RAW.gridH
export const GRID_SCALE = RAW.scale ?? 1
export const GRID_CENTER: Cell = RAW.center
export const WEAVE_BRIDGES: WeaveBridge[] = RAW.weave
export const GRID_SYNAPSES: GridSynapse[] = RAW.synapses

/** Cell-kind codes for the 3-region tilemap. */
export const CELL_BACKGROUND = 0
export const CELL_WALL = 1
export const CELL_PATH = 2

/** Decoded 3-region tilemap (RLE → flat Uint8Array), or null for legacy graphs. */
export const CELL_KINDS: { w: number; h: number; data: Uint8Array } | null = (() => {
  const ck = RAW.cellKinds
  if (!ck) return null
  const data = new Uint8Array(ck.w * ck.h)
  let i = 0
  for (let r = 0; r + 1 < ck.rle.length; r += 2) {
    const kind = ck.rle[r]
    const count = ck.rle[r + 1]
    data.fill(kind, i, i + count)
    i += count
  }
  return { w: ck.w, h: ck.h, data }
})()

/** Cell kind at (x,y); BACKGROUND outside bounds / for legacy graphs. */
export function cellKindAt(x: number, y: number): number {
  const ck = CELL_KINDS
  if (!ck || x < 0 || y < 0 || x >= ck.w || y >= ck.h) return CELL_BACKGROUND
  return ck.data[y * ck.w + x]
}

const cellEq = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1]

/** Map a synapse cell → its committed crossing record (for first-route locations). */
const SYNAPSE_BY_CELL: Map<string, GridSynapse> = (() => {
  const m = new Map<string, GridSynapse>()
  for (const s of GRID_SYNAPSES) m.set(`${s.cell[0]},${s.cell[1]}`, s)
  return m
})()

/** Arc-length-parameterize a cell polyline (euclidean step between consecutive cells). */
function arcLengths(path: Cell[]): { arc: number[]; pathLen: number } {
  if (path.length === 0) return { arc: [], pathLen: 0 }
  const arc = [0]
  for (let i = 1; i < path.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  }
  return { arc, pathLen: arc[arc.length - 1] || 0 }
}

/** Map a node cell to its first path-index at/after `cursor` (monotonic, entry-first). */
function nodePathIndex(path: Cell[], cell: Cell, cursor: number): number {
  let idx = -1
  for (let i = cursor; i < path.length; i++) {
    if (cellEq(path[i], cell)) {
      idx = i
      break
    }
  }
  if (idx < 0) idx = path.findIndex((c) => cellEq(c, cell))
  if (idx < 0) idx = Math.min(Math.max(0, path.length - 1), cursor) // defensive: keep monotonic
  return idx
}

/** Parse one raw family entry into a FamilyGraph (arc-parameterized + node path-indices). */
function parseFamily(familyId: string, raw: RawGrid['families'][string]): FamilyGraph {
  const path = raw.path as Cell[]
  const { arc, pathLen } = arcLengths(path)
  const path2 = (raw.path2 ?? []) as Cell[]
  const { arc: arc2, pathLen: pathLen2 } = arcLengths(path2)

  // First-route nodes (slotIndex 0..9): arc along `path`, location from synapse cell.
  let cursor = 0
  const firstNodes: MazeNode[] = (raw.nodeCells ?? [])
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((nc) => {
      const idx = nodePathIndex(path, nc.cell as Cell, cursor)
      cursor = idx
      return {
        familyId,
        slotIndex: nc.slotIndex,
        cell: nc.cell as Cell,
        synapse: nc.synapse,
        route: 1 as const,
        pathIndex: idx,
        arc: arc[Math.min(idx, Math.max(0, arc.length - 1))] ?? 0,
        location: SYNAPSE_BY_CELL.get(`${nc.cell[0]},${nc.cell[1]}`)?.location ?? null,
      }
    })

  // Second-route nodes (二回目, slotIndex >= firstRouteNodeCount): arc along `path2`,
  // location stamped onto the committed nodeCells2 entry (assign-circuit-locations).
  let cursor2 = 0
  const secondNodes: MazeNode[] = (raw.nodeCells2 ?? [])
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((nc) => {
      const idx = nodePathIndex(path2, nc.cell as Cell, cursor2)
      cursor2 = idx
      return {
        familyId,
        slotIndex: nc.slotIndex,
        cell: nc.cell as Cell,
        synapse: nc.synapse,
        route: 2 as const,
        pathIndex: idx,
        arc: arc2[Math.min(idx, Math.max(0, arc2.length - 1))] ?? 0,
        location: nc.location ?? null,
      }
    })

  return {
    familyId,
    entryCell: raw.entryCell as Cell,
    path,
    arc,
    pathLen,
    path2,
    arc2,
    pathLen2,
    nodes: [...firstNodes, ...secondNodes],
    firstRouteNodeCount: firstNodes.length,
  }
}

/** All 11 family graphs, keyed by familyId. */
export const FAMILY_GRAPHS: Record<string, FamilyGraph> = (() => {
  const out: Record<string, FamilyGraph> = {}
  for (const fam of FAMILY_IDS) {
    const raw = RAW.families[fam]
    if (raw) out[fam] = parseFamily(fam, raw)
  }
  return out
})()

/** Stable key for a (family, slot) pair — matches the variant collection key. */
export const nodeKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/** A family's TOTAL node count (first route + second route = its variant-slot count). */
export const familyNodeCount = (familyId: string): number => FAMILY_GRAPHS[familyId]?.nodes.length ?? 0

/** A family's first-route node count (the 二回目 entry boundary). */
export const firstRouteNodeCount = (familyId: string): number =>
  FAMILY_GRAPHS[familyId]?.firstRouteNodeCount ?? 0

/**
 * Whether (familyId, slotIndex) is a 二回目 second-route location-variant slot
 * (slotIndex >= the family's first-route node count). Pure-derived.
 */
export function isSecondLapSlot(familyId: string, slotIndex: number): boolean {
  return slotIndex >= firstRouteNodeCount(familyId)
}

// --- Frontier-order helpers (route order, entry-first) ---
// Lit state is FRONTIER-derived (cumulative settle count), NOT collected-derived:
// first-route settle pulls are random, so the variant collected at a settle is not
// necessarily the lit node's own slot. Nodes light in route order (first route then
// second route). 二回目 settle pulls are deterministic position-bound (per
// neurons-maze-second-lap), so the frontier node's slot IS the unlocked variant.

/** A family's nodes in route order (first route 0..9, then second route). */
export function nodesInRouteOrder(familyId: string): MazeNode[] {
  return FAMILY_GRAPHS[familyId]?.nodes ?? []
}

/** The lit nodes of a family = the first `min(settles, totalNodeCount)` in route order. */
export function litNodes(familyId: string, settles: number): MazeNode[] {
  const nodes = nodesInRouteOrder(familyId)
  const n = Math.min(Math.max(0, Math.floor(settles)), nodes.length)
  return nodes.slice(0, n)
}

/**
 * The node lit by settle index `settles` (the walker's current target), or null
 * once BOTH routes are fully lit (settles >= total node count). For
 * firstRouteNodeCount <= settles < total this returns the next SECOND-route node.
 */
export function frontierNode(familyId: string, settles: number): MazeNode | null {
  const nodes = nodesInRouteOrder(familyId)
  const i = Math.max(0, Math.floor(settles))
  return i < nodes.length ? nodes[i] : null
}

/** A family's representative (border-nearest) node = its first route node (slot 0). */
export function representativeNode(familyId: string): MazeNode | null {
  return nodesInRouteOrder(familyId)[0] ?? null
}

/**
 * The learning-circuit location name of the node at (familyId, slotIndex), or null
 * when that node is a padded non-synapse route cell. Pure-derived
 * (name-neurons-maze-circuit-locations) — first-route nodes resolve from the
 * crossing-synapse at their cell; second-route nodes carry their own committed
 * location. A second device computes the identical name from the committed graph.
 */
export function synapseLocationFor(familyId: string, slotIndex: number): string | null {
  const node = nodesInRouteOrder(familyId).find((n) => n.slotIndex === slotIndex)
  return node?.location ?? null
}

/** Interpolate a point at arc-length `targetArc` along `path` (with its `arc` table). */
function interpAlong(path: Cell[], arc: number[], pathLen: number, targetArc: number): Cell | null {
  if (path.length === 0) return null
  if (path.length === 1 || pathLen <= 0) return path[0]
  const t = Math.max(0, Math.min(pathLen, targetArc))
  for (let i = 1; i < path.length; i++) {
    if (arc[i] >= t) {
      const seg = arc[i] - arc[i - 1] || 1
      const f = (t - arc[i - 1]) / seg
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f,
      ]
    }
  }
  return path[path.length - 1]
}

/** Linear-interpolate a point at arc-length `targetArc` along a family's FIRST corridor. */
export function pointAtArc(familyId: string, targetArc: number): Cell {
  const g = FAMILY_GRAPHS[familyId]
  if (!g) return GRID_CENTER
  return interpAlong(g.path, g.arc, g.pathLen, targetArc) ?? GRID_CENTER
}

/** Point along a family's route `route` (1 = path, 2 = path2) at arc-length `targetArc`. */
function pointOnRoute(g: FamilyGraph, route: 1 | 2, targetArc: number): Cell {
  if (route === 2) return interpAlong(g.path2, g.arc2, g.pathLen2, targetArc) ?? GRID_CENTER
  return interpAlong(g.path, g.arc, g.pathLen, targetArc) ?? GRID_CENTER
}

/**
 * Walker position (a grid cell coord) for a family at `settles` with partial
 * progress `frac` (0..1) toward the next node. Tweens along the active route's
 * centerline by arc-length from the last lit node to the frontier target. On the
 * first route this runs entry → center; in 二回目 it tweens the SECOND route
 * (center → far border). Once both routes are fully lit it rests at the second
 * route's far end (or center for legacy single-route graphs).
 */
export function walkerCell(familyId: string, settles: number, frac: number): Cell {
  const g = FAMILY_GRAPHS[familyId]
  if (!g) return GRID_CENTER
  const target = frontierNode(familyId, settles)
  if (!target) {
    return g.path2.length > 0 ? pointOnRoute(g, 2, g.pathLen2) : pointOnRoute(g, 1, g.pathLen)
  }
  const nodes = nodesInRouteOrder(familyId)
  const i = Math.max(0, Math.floor(settles))
  const prev = i > 0 ? nodes[i - 1] : null
  const f = Math.max(0, Math.min(1, frac))
  if (target.route === 1) {
    const lastArc = prev && prev.route === 1 ? prev.arc : 0
    return pointOnRoute(g, 1, lastArc + (target.arc - lastArc) * f)
  }
  // Second route: when crossing from route 1 (prev is a route-1 node) start at
  // path2's origin (the shared center, arc 0); otherwise continue from the prev
  // second-route node's arc along path2.
  const lastArc2 = prev && prev.route === 2 ? prev.arc : 0
  return pointOnRoute(g, 2, lastArc2 + (target.arc - lastArc2) * f)
}

// --- Synapse crossing lookup (for the render overlay; design D6) ---

const sortedPairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Map a family pair (order-independent) → the committed crossing cell, if any. */
const SYNAPSE_CELL_BY_PAIR: Map<string, Cell> = (() => {
  const out = new Map<string, Cell>()
  for (const s of GRID_SYNAPSES) {
    const k = sortedPairKey(s.families[0], s.families[1])
    if (!out.has(k)) out.set(k, s.cell)
  }
  return out
})()

/** Mean FIRST-ROUTE node cell of a family (fallback synapse-overlay anchor). */
const FAMILY_CENTROID: Map<string, Cell> = (() => {
  const out = new Map<string, Cell>()
  for (const fam of FAMILY_IDS) {
    // Use first-route nodes only so the overlay anchor is unchanged by 二回目.
    const nodes = nodesInRouteOrder(fam).filter((n) => n.route === 1)
    if (nodes.length === 0) continue
    const sx = nodes.reduce((s, n) => s + n.cell[0], 0) / nodes.length
    const sy = nodes.reduce((s, n) => s + n.cell[1], 0) / nodes.length
    out.set(fam, [sx, sy])
  }
  return out
})()

/**
 * The on-grid cell to draw a synapse between families A and B: the committed
 * crossing cell when their routes cross, else the midpoint of their centroids
 * (spec D6 fallback). Returns null only if a family has no nodes.
 */
export function synapseCell(famA: string, famB: string): Cell | null {
  const committed = SYNAPSE_CELL_BY_PAIR.get(sortedPairKey(famA, famB))
  if (committed) return committed
  const a = FAMILY_CENTROID.get(famA)
  const b = FAMILY_CENTROID.get(famB)
  if (!a || !b) return null
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}
