/**
 * Brain-maze graph loader (multi-branch — expand-neurons-brain-maze-all-branches,
 * generalizes the DA-only add-neurons-brain-maze-slice).
 *
 * Parses the committed, build-time-generated per-branch graph JSONs (see
 * scripts/build-maze-graph.mjs) into typed structures. Runtime does ZERO
 * skeletonization / image analysis — it only consumes these JSONs (design D2).
 *
 * Per-branch by design (D9/D10): one graph JSON per NT branch. The four are
 * co-registered (normalized 0..1 over a common canvas) so the tract layers
 * overlay in register on the shared brain outline. DA's `da-graph.json` is
 * byte-stable across this expansion (its node positions never move).
 */
import { FAMILY_NT_BRANCH, type NtBranchId } from '@study-rpg/content-neurons-tw'
import daGraphRaw from '../../assets/maze/da-graph.json'
import fiveHtGraphRaw from '../../assets/maze/5ht-graph.json'
import gabaGraphRaw from '../../assets/maze/gaba-graph.json'
import gluGraphRaw from '../../assets/maze/glu-graph.json'

export type MazeNodeKind = 'endpoint' | 'branch' | 'mid'

export interface MazeNode {
  familyId: string
  slotIndex: number
  kind: MazeNodeKind
  /** Node position, normalized 0..1 over the base image. */
  x: number
  y: number
  /** Walk polyline from the hub root to this node (normalized 0..1 points). */
  path: [number, number][]
  /** Cumulative arc-length at each polyline point (path[i] ↔ arc[i]). */
  arc: number[]
  /** Total walk length to this node (= arc[arc.length-1]). */
  pathLen: number
}

export interface MazeGraph {
  branch: string
  /** Hub origin (per branch, e.g. VTA/SN for DA), normalized 0..1. */
  root: [number, number]
  slotCount: number
  nodes: MazeNode[]
}

/** The four NT branches, in canonical render/iteration order. */
export const NT_BRANCHES: NtBranchId[] = ['DA', '5HT', 'GABA', 'Glu']

/** Raw per-branch graphs as committed (each normalized 0..1 over its OWN source image). */
const RAW_GRAPHS: Record<NtBranchId, MazeGraph> = {
  DA: daGraphRaw as unknown as MazeGraph,
  '5HT': fiveHtGraphRaw as unknown as MazeGraph,
  GABA: gabaGraphRaw as unknown as MazeGraph,
  Glu: gluGraphRaw as unknown as MazeGraph,
}

// --- Canonical brain-frame normalization (co-registration; per codex consult A+) ---
// The 4 source images each placed the brain differently, so each graph lives in its
// own frame. We DON'T render the source images; we fit each graph's own point extent
// into one canonical brain box (the playable interior of the shared outline) so all
// four tract systems sit in a single coherent brain. DA stays identity (byte-stable).

/** Playable brain interior in normalized 0..1 viewBox space (the shared outline's brain). */
const CANONICAL_BRAIN_BOX = { x: 0.2, y: 0.16, w: 0.62, h: 0.66 }

/**
 * Per-branch fit: DA = identity (byte-stable render); others placed in their
 * anatomically-correct territory (OE-grounded, sagittal brain — rostral=left,
 * dorsal=top, ventral-brainstem hub=center-low). Refs: Camí NEJM 2003
 * (10.1056/NEJMra023160), Yetnikoff Neuroscience 2014 (VTA), Ren eLife 2019 (raphe).
 *  - DA (VTA/SNc, ventral midbrain → striatum + frontal): identity = hub center-low,
 *    fans rostral/dorsal (up-left). Already correct.
 *  - 5HT (raphe, midline brainstem → diffuse rostral forebrain): low-center hub,
 *    spreads up; vertically compressed so it stays in the brain mass.
 *  - GABA (basal ganglia central + cerebellar Purkinje lower-right): center → caudal-ventral.
 *  - Glu (cortex, dorsal + widespread + thalamus): fills the upper cerebrum.
 */
const BRANCH_FIT: Record<NtBranchId, { fit: boolean; dx: number; dy: number; sx: number; sy: number }> = {
  DA: { fit: false, dx: 0, dy: 0, sx: 1, sy: 1 },
  '5HT': { fit: true, dx: 0.02, dy: -0.03, sx: 0.95, sy: 0.82 },
  GABA: { fit: true, dx: 0.1, dy: 0.05, sx: 0.86, sy: 0.86 },
  Glu: { fit: true, dx: -0.02, dy: -0.08, sx: 1, sy: 0.82 },
}

/** Robust extent of all graph geometry (nodes + path points), 2nd–98th percentile per axis. */
function robustExtent(graph: MazeGraph): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs: number[] = []
  const ys: number[] = []
  for (const n of graph.nodes) {
    xs.push(n.x)
    ys.push(n.y)
    for (const [px, py] of n.path) {
      xs.push(px)
      ys.push(py)
    }
  }
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  const pct = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))]
  return { minX: pct(xs, 0.02), maxX: pct(xs, 0.98), minY: pct(ys, 0.02), maxY: pct(ys, 0.98) }
}

/** Affine-fit a graph's own extent into CANONICAL_BRAIN_BOX (uniform scale, centered, + nudge). */
function normalizeGraph(graph: MazeGraph, branch: NtBranchId): MazeGraph {
  const cfg = BRANCH_FIT[branch]
  if (!cfg.fit) return graph // DA identity — byte-stable
  const ext = robustExtent(graph)
  const ew = Math.max(1e-6, ext.maxX - ext.minX)
  const eh = Math.max(1e-6, ext.maxY - ext.minY)
  const box = CANONICAL_BRAIN_BOX
  const scale = Math.min(box.w / ew, box.h / eh)
  const sX = scale * cfg.sx
  const sY = scale * cfg.sy
  const offX = box.x + (box.w - ew * sX) / 2 + cfg.dx
  const offY = box.y + (box.h - eh * sY) / 2 + cfg.dy
  const tx = (x: number) => offX + (x - ext.minX) * sX
  const ty = (y: number) => offY + (y - ext.minY) * sY
  const nodes: MazeNode[] = graph.nodes.map((n) => {
    const path = n.path.map(([px, py]) => [tx(px), ty(py)] as [number, number])
    const arc = [0]
    for (let i = 1; i < path.length; i++) arc.push(arc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
    return { ...n, x: tx(n.x), y: ty(n.y), path, arc, pathLen: arc[arc.length - 1] }
  })
  return { ...graph, root: [tx(graph.root[0]), ty(graph.root[1])], nodes }
}

/** Per-branch graph, co-registered into one canonical brain frame (DA identity). */
export const MAZE_GRAPHS: Record<NtBranchId, MazeGraph> = Object.fromEntries(
  NT_BRANCHES.map((b) => [b, normalizeGraph(RAW_GRAPHS[b], b)]),
) as Record<NtBranchId, MazeGraph>

/** Families belonging to each branch, derived from the single-source mapping. */
export const FAMILIES_BY_BRANCH: Record<NtBranchId, string[]> = (() => {
  const out = { DA: [], '5HT': [], GABA: [], Glu: [] } as Record<NtBranchId, string[]>
  for (const [fam, branch] of Object.entries(FAMILY_NT_BRANCH)) out[branch].push(fam)
  return out
})()

/** The NT branch a family belongs to (or undefined if unmapped). */
export const branchOfFamily = (familyId: string): NtBranchId | undefined => FAMILY_NT_BRANCH[familyId]

/** Stable key for a (family, slot) pair — matches the variant collection key. */
export const nodeKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/** A node is lit iff its variant slot is collected (derived; see design D5/migration). */
export const isNodeLit = (node: MazeNode, collected: ReadonlySet<string>): boolean =>
  collected.has(nodeKey(node.familyId, node.slotIndex))

/** Fogged (uncollected) nodes of a branch, ordered closest-to-hub first so exploration radiates outward. */
export function foggedNodes(branch: NtBranchId, collected: ReadonlySet<string>): MazeNode[] {
  return MAZE_GRAPHS[branch].nodes
    .filter((n) => !isNodeLit(n, collected))
    .sort((a, b) => a.pathLen - b.pathLen)
}

/** The next node a branch's walker heads toward (nearest fogged to the hub), or null when all lit. */
export const nextTarget = (branch: NtBranchId, collected: ReadonlySet<string>): MazeNode | null =>
  foggedNodes(branch, collected)[0] ?? null

// --- Frontier-order helpers (promote-maze-to-home / Model A) ---
// Lit state is FRONTIER-derived (cumulative settle count), NOT collected-derived,
// because settle pulls are random (the variant collected at a settle is not
// necessarily the lit node's own slot). Nodes light in hub-distance order.

/** All of a branch's nodes ordered closest-to-hub first (stable frontier order). */
export function nodesByPathLen(branch: NtBranchId): MazeNode[] {
  return [...MAZE_GRAPHS[branch].nodes].sort((a, b) => a.pathLen - b.pathLen)
}

/** The lit nodes of a branch = the first `min(settles, nodeCount)` in frontier order. */
export function litNodes(branch: NtBranchId, settles: number): MazeNode[] {
  const n = Math.min(Math.max(0, Math.floor(settles)), MAZE_GRAPHS[branch].nodes.length)
  return nodesByPathLen(branch).slice(0, n)
}

/** The node lit by settle index `settles` (the walker's current target), or null in 二週目 (all lit). */
export function frontierNode(branch: NtBranchId, settles: number): MazeNode | null {
  const nodes = nodesByPathLen(branch)
  const i = Math.max(0, Math.floor(settles))
  return i < nodes.length ? nodes[i] : null
}

/** Linear-interpolate a point at arc-length fraction `t` (0..1) along a node's walk path. */
export function pointAtFraction(node: MazeNode, t: number): [number, number] {
  const { path, arc, pathLen } = node
  if (path.length === 1 || pathLen <= 0) return path[0]
  const target = Math.max(0, Math.min(1, t)) * pathLen
  for (let i = 1; i < path.length; i++) {
    if (arc[i] >= target) {
      const seg = arc[i] - arc[i - 1] || 1
      const f = (target - arc[i - 1]) / seg
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f]
    }
  }
  return path[path.length - 1]
}
