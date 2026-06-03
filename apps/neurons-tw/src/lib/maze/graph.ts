/**
 * Brain-maze graph loader (add-neurons-brain-maze-slice).
 *
 * Parses the committed, build-time-generated `da-graph.json` (see
 * scripts/build-maze-graph.mjs) into typed structures. Runtime does ZERO
 * skeletonization / image analysis — it only consumes this JSON (design D2).
 *
 * Per-branch by design (D9): this slice loads the DA branch only. Expansion =
 * load `5ht-graph.json` etc. and concat — no code change to consumers.
 */
import { FAMILY_NT_BRANCH } from '@study-rpg/content-neurons-tw'
import daGraphRaw from '../../assets/maze/da-graph.json'

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
  /** Hub origin (VTA/SN), normalized 0..1. */
  root: [number, number]
  slotCount: number
  nodes: MazeNode[]
}

export const MAZE_GRAPH: MazeGraph = daGraphRaw as unknown as MazeGraph

/** The NT branch this slice covers (internal; not part of the module's public API). */
const MAZE_BRANCH = 'DA'

/** Families belonging to the maze branch, from the single-source mapping. */
export const MAZE_FAMILIES: string[] = Object.entries(FAMILY_NT_BRANCH)
  .filter(([, b]) => b === MAZE_BRANCH)
  .map(([fam]) => fam)

/** Stable key for a (family, slot) pair — matches the variant collection key. */
export const nodeKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/** A node is lit iff its variant slot is collected (derived; see design D5/migration). */
export const isNodeLit = (node: MazeNode, collected: ReadonlySet<string>): boolean =>
  collected.has(nodeKey(node.familyId, node.slotIndex))

/** Fogged (uncollected) nodes, ordered closest-to-hub first so exploration radiates outward. */
export function foggedNodes(collected: ReadonlySet<string>): MazeNode[] {
  return MAZE_GRAPH.nodes
    .filter((n) => !isNodeLit(n, collected))
    .sort((a, b) => a.pathLen - b.pathLen)
}

/** The next node the walker heads toward (nearest fogged to the hub), or null when all lit. */
export const nextTarget = (collected: ReadonlySet<string>): MazeNode | null =>
  foggedNodes(collected)[0] ?? null

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
