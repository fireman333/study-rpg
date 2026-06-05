/**
 * Flat-grid maze graph loader (redesign-neurons-maze-rotjs-grid).
 *
 * Replaces the four-NT-branch image-pipeline maze with ONE unified square weave
 * grid. Parses the committed, build-time-generated `assets/maze/grid-graph.json`
 * (see `scripts/build-grid-maze.mjs`) into typed structures. Runtime does ZERO
 * generation / routing / skeletonization — it only consumes the JSON (spec
 * "Runtime does not regenerate the grid").
 *
 * The 11 subject families each enter from a distinct border cell and wind inward
 * to a shared center; their route crossings (weave over/under bridges) are the
 * gameplay synapses. Each family's 10 variant-slot nodes sit at crossings on its
 * route, in route order (entry-first). NT-branch data lives in the content pack
 * now (`@study-rpg/content-neurons-tw`); the maze no longer groups families.
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
}

/** A variant-slot node on a family's winding route (1 node = 1 variant slot). */
export interface MazeNode {
  familyId: string
  slotIndex: number
  cell: Cell
  /** True iff the node sits at a route crossing (a synapse cell). */
  synapse: boolean
  /** Index of this node's cell along its family's `path` (monotonic, entry-first). */
  pathIndex: number
  /** Cumulative arc-length (in cells) from the border entry to this node. */
  arc: number
}

/** One family's winding corridor + its nodes, parsed + arc-parameterized. */
export interface FamilyGraph {
  familyId: string
  entryCell: Cell
  /** Corridor centerline cells, border entry → center (the walker polyline). */
  path: Cell[]
  /** Cumulative arc-length at each path cell (`path[i] ↔ arc[i]`). */
  arc: number[]
  /** Total corridor length (= arc[arc.length-1]). */
  pathLen: number
  /** The family's 10 variant-slot nodes, in route order (entry-first). */
  nodes: MazeNode[]
}

interface RawGrid {
  gridW: number
  gridH: number
  center: Cell
  seed: number
  weave: WeaveBridge[]
  families: Record<string, { entryCell: Cell; path: Cell[]; nodeCells: { slotIndex: number; cell: Cell; t: number; synapse: boolean }[] }>
  synapses: GridSynapse[]
}

const RAW = gridGraphRaw as unknown as RawGrid

export const GRID_W = RAW.gridW
export const GRID_H = RAW.gridH
export const GRID_CENTER: Cell = RAW.center
export const WEAVE_BRIDGES: WeaveBridge[] = RAW.weave
export const GRID_SYNAPSES: GridSynapse[] = RAW.synapses

const cellEq = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1]

/** Arc-length-parameterize a cell polyline (euclidean step between consecutive cells). */
function arcLengths(path: Cell[]): { arc: number[]; pathLen: number } {
  const arc = [0]
  for (let i = 1; i < path.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  }
  return { arc, pathLen: arc[arc.length - 1] || 0 }
}

/** Parse one raw family entry into a FamilyGraph (arc-parameterized + node path-indices). */
function parseFamily(familyId: string, raw: RawGrid['families'][string]): FamilyGraph {
  const path = raw.path as Cell[]
  const { arc, pathLen } = arcLengths(path)
  // Assign each node its first path index at/after the previous node's index
  // (monotonic — a winding path can revisit a cell; we want entry-first order).
  let cursor = 0
  const nodes: MazeNode[] = raw.nodeCells
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((nc) => {
      let idx = -1
      for (let i = cursor; i < path.length; i++) {
        if (cellEq(path[i], nc.cell as Cell)) {
          idx = i
          break
        }
      }
      if (idx < 0) idx = path.findIndex((c) => cellEq(c, nc.cell as Cell))
      if (idx < 0) idx = Math.min(path.length - 1, cursor) // defensive: keep monotonic
      cursor = idx
      return {
        familyId,
        slotIndex: nc.slotIndex,
        cell: nc.cell as Cell,
        synapse: nc.synapse,
        pathIndex: idx,
        arc: arc[Math.min(idx, arc.length - 1)] ?? 0,
      }
    })
  return { familyId, entryCell: raw.entryCell as Cell, path, arc, pathLen, nodes }
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

/** A family's node count (= its variant-slot count). */
export const familyNodeCount = (familyId: string): number => FAMILY_GRAPHS[familyId]?.nodes.length ?? 0

// --- Frontier-order helpers (route order, entry-first) ---
// Lit state is FRONTIER-derived (cumulative settle count), NOT collected-derived:
// settle pulls are random, so the variant collected at a settle is not necessarily
// the lit node's own slot. Nodes light in route order (along the winding corridor).

/** A family's nodes in route order (entry-first). */
export function nodesInRouteOrder(familyId: string): MazeNode[] {
  return FAMILY_GRAPHS[familyId]?.nodes ?? []
}

/** The lit nodes of a family = the first `min(settles, nodeCount)` in route order. */
export function litNodes(familyId: string, settles: number): MazeNode[] {
  const nodes = nodesInRouteOrder(familyId)
  const n = Math.min(Math.max(0, Math.floor(settles)), nodes.length)
  return nodes.slice(0, n)
}

/** The node lit by settle index `settles` (the walker's current target), or null in 二週目. */
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
 * Lit nodes of a family including the first-pull starter node. `frontier(settles)`
 * UNIONed with this family's representative node when the family is named in the
 * legacy first-pull starter keys (`starterFamilies` = the SET of familyIds those
 * keys point to). Deduped by node identity. first-pull is unchanged by this
 * redesign — the maze just reads the key VALUES to light starter reps.
 */
export function litNodesWithStarter(
  familyId: string,
  settles: number,
  starterFamilies: ReadonlySet<string>,
): MazeNode[] {
  const frontier = litNodes(familyId, settles)
  if (!starterFamilies.has(familyId)) return frontier
  const rep = representativeNode(familyId)
  if (!rep) return frontier
  if (frontier.some((n) => n.slotIndex === rep.slotIndex)) return frontier
  return [...frontier, rep]
}

/** Linear-interpolate a point at arc-length `targetArc` along a family's corridor. */
export function pointAtArc(familyId: string, targetArc: number): Cell {
  const g = FAMILY_GRAPHS[familyId]
  if (!g || g.path.length === 0) return GRID_CENTER
  if (g.path.length === 1 || g.pathLen <= 0) return g.path[0]
  const t = Math.max(0, Math.min(g.pathLen, targetArc))
  for (let i = 1; i < g.path.length; i++) {
    if (g.arc[i] >= t) {
      const seg = g.arc[i] - g.arc[i - 1] || 1
      const f = (t - g.arc[i - 1]) / seg
      return [
        g.path[i - 1][0] + (g.path[i][0] - g.path[i - 1][0]) * f,
        g.path[i - 1][1] + (g.path[i][1] - g.path[i - 1][1]) * f,
      ]
    }
  }
  return g.path[g.path.length - 1]
}

/**
 * Walker position (a grid cell coord) for a family at `settles` with partial
 * progress `frac` (0..1) toward the next node. Tweens along the corridor
 * centerline by arc-length from the last lit node to the frontier target (= the
 * action-potential propagating inward). In 二週目 (all nodes lit) it rests at center.
 */
export function walkerCell(familyId: string, settles: number, frac: number): Cell {
  const g = FAMILY_GRAPHS[familyId]
  if (!g) return GRID_CENTER
  const target = frontierNode(familyId, settles)
  if (!target) return pointAtArc(familyId, g.pathLen) // 二週目 → at center
  const lastArc = settles > 0 ? nodesInRouteOrder(familyId)[settles - 1]?.arc ?? 0 : 0
  const span = target.arc - lastArc
  return pointAtArc(familyId, lastArc + span * Math.max(0, Math.min(1, frac)))
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

/** Mean node cell of a family (fallback synapse-overlay anchor for crossing-less pairs). */
const FAMILY_CENTROID: Map<string, Cell> = (() => {
  const out = new Map<string, Cell>()
  for (const fam of FAMILY_IDS) {
    const nodes = nodesInRouteOrder(fam)
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
