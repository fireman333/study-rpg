/**
 * Build initial SimNode / SimEdge collections for the connectome force-sim from
 * a content pack + current synapse state.
 *
 * Initial positions are seeded from the bilateral phylogenetic layout (root
 * center, monoamines left, amino acids right, leaves around branches, year
 * sub-nodes in a small cluster around each leaf). The simulation then relaxes
 * the layout under spring + repulsion + soft anchors so the final positions
 * read as organic brain circuitry while keeping the NT-side grouping intact.
 */

import type { ContentPack, Question, Subject } from '@study-rpg/core'
import type { SynapseRow } from '../../lib/db'
import type { SimNode, SimEdge, Vec2 } from './force-sim'
import { NT_BRANCH_ORDER, type NtBranch } from './layout'

export interface GraphBuildResult {
  nodes: SimNode[]
  edges: SimEdge[]
  /** Anchor positions for fixed root + each branch sub-root (used by sim). */
  anchors: {
    root: Vec2
    branch: Map<NtBranch, Vec2>
    side: Map<NtBranch, Vec2>
  }
  bounds: { width: number; height: number }
  /** Years extracted per family (preserved order for renderer convenience). */
  yearsByFamily: Map<string, number[]>
}

const WIDTH = 1400
const HEIGHT = 960

const ROOT: Vec2 = { x: WIDTH / 2, y: HEIGHT / 2 }
// Distances tuned so the layout reads as "root → branch → leaf → year"
// radiating outward, with sub-roots clearly extending out from the center and
// leaves continuing the projection rather than surrounding their sub-root.
const BRANCH_RADIUS = 165
const LEAF_DIST = 170
const YEAR_DIST = 150

/** Parse "<year>-<session>-..." from Question.id; returns null if it doesn't fit. */
function parseYear(q: Question): number | null {
  const head = q.id.split('-')[0]
  const n = Number.parseInt(head, 10)
  if (!Number.isFinite(n)) return null
  return n
}

/** Extract unique sorted years per subject. */
export function extractYearsByFamily(pack: ContentPack): Map<string, number[]> {
  const out = new Map<string, Set<number>>()
  for (const q of pack.questions) {
    const y = parseYear(q)
    if (y == null) continue
    const set = out.get(q.subject) ?? new Set<number>()
    set.add(y)
    out.set(q.subject, set)
  }
  const sorted = new Map<string, number[]>()
  for (const [k, set] of out) {
    sorted.set(k, Array.from(set).sort((a, b) => a - b))
  }
  return sorted
}

function groupByBranch(subjects: readonly Subject[]): Map<NtBranch, Subject[]> {
  const out = new Map<NtBranch, Subject[]>()
  for (const b of NT_BRANCH_ORDER) out.set(b, [])
  for (const s of subjects) {
    const b = s.group as NtBranch
    if (!out.has(b)) continue
    out.get(b)!.push(s)
  }
  return out
}

export interface GraphBuilderInput {
  pack: ContentPack
  synapses: readonly SynapseRow[]
}

export function buildGraph({ pack, synapses }: GraphBuilderInput): GraphBuildResult {
  const grouped = groupByBranch(pack.subjects)
  const yearsByFamily = extractYearsByFamily(pack)

  const nodes: SimNode[] = []
  const edges: SimEdge[] = []

  // 1. Root — fixed at canvas center. Largest collision radius so hubs +
  // leaves clearly stay outside the brain icon disc.
  nodes.push({
    id: 'root',
    type: 'root',
    pos: { ...ROOT },
    vel: { x: 0, y: 0 },
    fixed: true,
    mass: 6,
    repelStrength: 1.0,
    radius: 70,
  })

  // 2. Branch sub-roots — placed around root with each hub claiming an angular
  // slice proportional to its leaf count (4/11, 3/11, 2/11, 2/11) × 360°. Each
  // hub's leaves then fill that slice with equal per-leaf angular spacing, so
  // adjacent leaves across the whole circle are spaced uniformly (~32.7°).
  // Order around the circle: DA → GABA → Glu → 5HT (canonical NT_BRANCH_ORDER
  // walks alphabetically; chosen so monoamines and amino-acid families
  // alternate around the disc).
  const branchAnchors = new Map<NtBranch, Vec2>()
  const sideAnchors = new Map<NtBranch, Vec2>()
  const branchAngles: Record<NtBranch, number> = {} as Record<NtBranch, number>
  const branchSliceWidth: Record<NtBranch, number> = {} as Record<NtBranch, number>

  const totalLeaves = NT_BRANCH_ORDER.reduce(
    (sum, b) => sum + (grouped.get(b)?.length ?? 0),
    0,
  )
  const SLICE_ORDER: NtBranch[] = ['DA', 'GABA', 'Glu', '5HT']
  // Start at top of circle and walk clockwise.
  let cumAngle = -Math.PI / 2
  for (const branch of SLICE_ORDER) {
    const count = grouped.get(branch)?.length ?? 0
    const sliceWidth = (count / totalLeaves) * Math.PI * 2
    const centerAngle = cumAngle + sliceWidth / 2
    branchAngles[branch] = centerAngle
    branchSliceWidth[branch] = sliceWidth
    cumAngle += sliceWidth
  }

  for (const branch of NT_BRANCH_ORDER) {
    const angle = branchAngles[branch]
    const anchor: Vec2 = {
      x: ROOT.x + Math.cos(angle) * BRANCH_RADIUS,
      y: ROOT.y + Math.sin(angle) * BRANCH_RADIUS,
    }
    branchAnchors.set(branch, anchor)
    sideAnchors.set(branch, anchor)

    nodes.push({
      id: `branch:${branch}`,
      type: 'branch',
      pos: { x: anchor.x, y: anchor.y },
      vel: { x: 0, y: 0 },
      // PINNED — first layer is a stable cross around the root. Each sub-root
      // becomes its own satellite "hub" with leaves + years radiating outward
      // from it. Users can still drag-rearrange them but the sim won't drift
      // them away from this position.
      fixed: true,
      mass: 3,
      repelStrength: 0.7,
      radius: 50,
    })

    edges.push({
      source: 'root',
      target: `branch:${branch}`,
      restLength: BRANCH_RADIUS,
      stiffness: 0.05,
      kind: 'branch-link',
    })
  }

  // 3. Leaves — placed outward from their branch sub-root along the branch's
  // outward angle (relative to root). Each leaf fans within ±0.7 rad of the
  // branch angle so same-branch leaves cluster but stay distinct.
  const leafSeen = new Set<string>()
  for (const branch of NT_BRANCH_ORDER) {
    const leaves = grouped.get(branch) ?? []
    const branchAnchor = branchAnchors.get(branch)!
    const branchAngle = branchAngles[branch]
    // Distribute leaves uniformly across this hub's angular slice. Per-leaf
    // angular step = sliceWidth / count, so leaves of every hub sit at the
    // same spacing around the full circle (uniform petals on a sunflower).
    const slice = branchSliceWidth[branch]
    const perLeafStep = slice / leaves.length
    leaves.forEach((leaf, idx) => {
      const localAngle = (idx - (leaves.length - 1) / 2) * perLeafStep
      const angle = branchAngle + localAngle
      const baseX = branchAnchor.x + LEAF_DIST * Math.cos(angle)
      const baseY = branchAnchor.y + LEAF_DIST * Math.sin(angle)
      nodes.push({
        id: `leaf:${leaf.id}`,
        type: 'leaf',
        pos: { x: baseX, y: baseY },
        vel: { x: 0, y: 0 },
        fixed: false,
        mass: 2,
        // Soft outward anchor — pulls the leaf toward its spawn position
        // (which is OUTWARD from the pinned branch sub-root) so leaves stay
        // radiating outward instead of orbiting around the hub.
        anchor: { x: baseX, y: baseY },
        anchorK: 0.012,
        repelStrength: 1.0,
        radius: 32,
      })
      leafSeen.add(leaf.id)

      // Edge from branch sub-root to leaf.
      edges.push({
        source: `branch:${branch}`,
        target: `leaf:${leaf.id}`,
        restLength: LEAF_DIST,
        stiffness: 0.03,
        kind: 'parent-child',
      })

      // 4. Year sub-nodes — projected further OUTWARD from root (continuing
      // the root → branch → leaf direction). Each year sits in a tight arc
      // beyond the leaf so the whole chain reads as one radiating dendrite.
      const years = yearsByFamily.get(leaf.id) ?? []
      // Outward direction = unit vector from root to leaf.
      const outDx = baseX - ROOT.x
      const outDy = baseY - ROOT.y
      const outLen = Math.hypot(outDx, outDy) || 1
      const outwardAngle = Math.atan2(outDy, outDx)
      void outLen
      years.forEach((year, yIdx) => {
        // Wider arc ±~60° around the outward direction so years scatter into a
        // dispersed terminal arborization, not a tight halo.
        const ySpread = (yIdx / Math.max(years.length - 1, 1)) * 2.1 - 1.05
        const yAngle = outwardAngle + ySpread
        const yx = baseX + YEAR_DIST * Math.cos(yAngle)
        const yy = baseY + YEAR_DIST * Math.sin(yAngle)
        nodes.push({
          id: `year:${leaf.id}:${year}`,
          type: 'year',
          pos: { x: yx, y: yy },
          vel: { x: 0, y: 0 },
          fixed: false,
          mass: 1,
          // Very loose anchor — repulsion + spring dominate so years can spread
          // freely along the outward arc.
          anchor: { x: yx, y: yy },
          anchorK: 0.004,
          repelStrength: 0.6,
          radius: 14,
        })
        edges.push({
          source: `leaf:${leaf.id}`,
          target: `year:${leaf.id}:${year}`,
          restLength: YEAR_DIST,
          stiffness: 0.05,
          kind: 'parent-child',
        })
      })
    })
  }

  // 5. Synapse edges (between leaves only; skip dormant — invisible).
  for (const syn of synapses) {
    if (syn.state === 'dormant') continue
    const [a, b] = syn.pairKey.split('|')
    if (!leafSeen.has(a) || !leafSeen.has(b)) continue
    edges.push({
      source: `leaf:${a}`,
      target: `leaf:${b}`,
      restLength: 480,
      stiffness: syn.state === 'strong' ? 0.012 : 0.006,
      kind: 'synapse',
    })
  }

  return {
    nodes,
    edges,
    anchors: { root: ROOT, branch: branchAnchors, side: sideAnchors },
    bounds: { width: WIDTH, height: HEIGHT },
    yearsByFamily,
  }
}
