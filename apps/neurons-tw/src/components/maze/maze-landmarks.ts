/**
 * maze-landmarks — large textbook NEURON-SYMBOL sprites at static maze hubs (the "obvious neuron"
 * lever; locked via grilled-neurons-maze-looks-like-brain-2026-06-06).
 *
 * v2 placement is ANATOMICALLY GROUNDED (OpenEvidence consult 2026-06-06 — Stadelmann 2019
 * Physiol Rev 10.1152/physrev.00031.2018; Ghosh 2017 Neuroscientist 10.1177/1073858417710897;
 * Alix 2011 Neurology 10.1212/WNL.0b013e3182088273; Tanaka 2021 Glia 10.1002/glia.24055):
 *   - SOMA (cell body) sits at the TRACT ORIGIN (each subject's border-entry tract start).
 *   - The ~10 collection nodes along a tract are NODES OF RANVIER (drawn small + on-route by the
 *     existing NODE_STYLES 'ranvier' marker; fog-gated — NOT landmarks here).
 *   - SYNAPSE boutons are at TERMINALS converging into the CENTER (NOT at simple tract crossings —
 *     "no synapses form at simple white-matter crossings"; axons just intermingle).
 *   - ASTROCYTE / OLIGODENDROCYTE are glia: off-route (interfascicular), near crossings / along tracts.
 *
 * The 11 origin somas are ALWAYS-VISIBLE anchors (muted alpha, no rarity/identity reveal) so a fresh
 * save still reads as a brain at a glance (fog-of-war preserved — Codex consult). Placement is STATIC
 * (derived from the committed grid graph), anchored on existing graph cells → auto-aligned.
 */
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { GRID_CENTER, GRID_SYNAPSES, nodesInRouteOrder, type Cell } from '../../lib/maze/graph'
import somaMultipolar from '../../assets/maze/landmarks/soma-multipolar.png'
import somaPyramidal from '../../assets/maze/landmarks/soma-pyramidal.png'
import synapseImg from '../../assets/maze/landmarks/synapse.png'
import astrocyteImg from '../../assets/maze/landmarks/astrocyte.png'
import oligodendrocyteImg from '../../assets/maze/landmarks/oligodendrocyte.png'

export interface Landmark {
  cell: Cell
  src: string
  /** Rendered HEIGHT in world cells (width follows the sprite aspect). */
  cells: number
  /** Sprite opacity (anchors muted, center synapses bright). */
  alpha: number
  /** Soft gold halo strength behind the sprite (0 = none). Codex: rings not opaque discs. */
  halo: number
}

const dist2 = (a: Cell, b: Cell): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

/** A family's node nearest a fractional position along its route (0 = origin/border, 1 = center). */
function nodeAtFrac(familyId: string, frac: number): Cell | null {
  const nodes = nodesInRouteOrder(familyId)
  if (nodes.length === 0) return null
  const i = Math.min(nodes.length - 1, Math.max(0, Math.round((nodes.length - 1) * frac)))
  return nodes[i].cell
}

// Mid-density distribution (owner 2026-06-06: 分布更密集一點 → ~50 sprites). The density is added on
// the GLIA (astrocytes tile the whole CNS; oligodendrocytes are interfascicular along every bundle),
// which is anatomically correct; the SOMA stay 1-per-tract-origin and the SYNAPSE boutons stay on the
// inner terminals converging to center (NOT scattered onto white-matter crossings) — same OE anchors.
// Off-route glia are anchored on a node cell then nudged a few cells off the corridor (interfascicular).
const astroFracs = [0.40, 0.55, 0.68, 0.50, 0.62, 0.45, 0.70, 0.58, 0.42, 0.66, 0.52]
const oligoFracs = [0.35, 0.62, 0.48, 0.70, 0.40, 0.58, 0.66, 0.44, 0.52, 0.60, 0.38]

export const MAZE_LANDMARKS: Landmark[] = (() => {
  const out: Landmark[] = []
  // 11 SOMA origin anchors — one per subject near its tract origin (border end), always visible but
  // muted; alternating multipolar / pyramidal. The 11 somas + the gold tracts converging to center
  // read as "11 neurons wired to a hub" even on a fresh save (Hebb).
  FAMILY_IDS.forEach((fam, i) => {
    const cell = nodeAtFrac(fam, 0.26)
    if (cell) out.push({ cell, src: i % 2 === 0 ? somaMultipolar : somaPyramidal, cells: 30, alpha: 0.9, halo: 0.18 })
  })
  // ~8 SYNAPSE terminals — inner nodes (near center) of the first 8 families = tracts terminating into
  // the central convergence field (anatomically synapses are at terminals, not crossings).
  FAMILY_IDS.slice(0, 8).forEach((fam, k) => {
    const cell = nodeAtFrac(fam, 0.90 + (k % 2) * 0.04)
    if (cell) out.push({ cell, src: synapseImg, cells: 15, alpha: 0.9, halo: 0.28 })
  })
  // ~18 ASTROCYTE glia — astrocytes tile the whole CNS, so scatter along EVERY tract (varied frac,
  // nudged off-route) plus around the central-most crossings; muted.
  FAMILY_IDS.forEach((fam, i) => {
    const cell = nodeAtFrac(fam, astroFracs[i % astroFracs.length])
    if (!cell) return
    const off: Cell = [cell[0] + (i % 2 ? 4 : -4), cell[1] + (i % 3 === 0 ? -4 : 3)]
    out.push({ cell: off, src: astrocyteImg, cells: 16, alpha: 0.5, halo: 0 })
  })
  const central = [...GRID_SYNAPSES].sort((a, b) => dist2(a.cell, GRID_CENTER) - dist2(b.cell, GRID_CENTER)).slice(0, 7)
  central.forEach((s, k) => {
    const off: Cell = [s.cell[0] + (k % 2 ? 5 : -5), s.cell[1] + (k % 2 ? -5 : 4)]
    out.push({ cell: off, src: astrocyteImg, cells: 15, alpha: 0.45, halo: 0 })
  })
  // ~11 OLIGODENDROCYTE glia — interfascicular (between bundles) along EVERY tract; explains why the
  // tracts are gold-myelinated. Anchored on a mid-tract node, nudged off the corridor.
  FAMILY_IDS.forEach((fam, i) => {
    const cell = nodeAtFrac(fam, oligoFracs[i % oligoFracs.length])
    if (!cell) return
    const off: Cell = [cell[0] + (i % 2 ? -5 : 5), cell[1] + (i % 2 ? 4 : -4)]
    out.push({ cell: off, src: oligodendrocyteImg, cells: 20, alpha: 0.5, halo: 0 })
  })
  return out
})()

/** Every family's variant-slot node cells (static). Used for faint unlit position pins — reveals
 * POSITION only (not shape/rarity), so the tracts read as populated while fog-of-war is preserved. */
export const ALL_NODE_CELLS: Cell[] = FAMILY_IDS.flatMap((fam) => nodesInRouteOrder(fam).map((n) => n.cell))

// Lazy image cache — the scene bake (drawScene) calls landmarkImage(src) and draws once .complete.
const cache = new Map<string, HTMLImageElement>()
export function landmarkImage(src: string): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    cache.set(src, img)
  }
  return img
}
