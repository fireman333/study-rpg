/**
 * §8 per-cell progress-ranked route colour bands (redesign-neurons-maze-static-render D8).
 *
 * The maze corridor lattice is densely SHARED (84% of corridor cells carry ≥2 families, 62% carry
 * ≥4) — a per-family solid core stroke devolves into "last drawn wins" on shared trunks. Instead,
 * each WALKED corridor cell shows concentric thin bands of the up-to-3 MOST-PROGRESSED families
 * passing through it (rank key = the already-synced `maze:<fam>:settles` counter surfaced on the
 * view as `FamilyViewState.energy.settles` — ZERO new state, MAX-merged so the ordering converges
 * cross-device). Gold myelin is demoted to the base sheath/frame; family identity lives in these
 * bands. Unwalked cells keep the faint fog baseline (drawn by the caller, unchanged).
 *
 * Pure + Vitest-able: no canvas, no React. `buildBandRuns` turns explored prefixes + settle ranks
 * into contiguous equal-width polyline RUNS (widest first, so narrower bands nest on top when the
 * caller strokes them in order). Computation runs inside the discrete scene bake — never per-frame.
 */
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { FAMILY_GRAPHS, type Cell } from '../../lib/maze/graph'

/** Minimal route shape needed for band computation (FamilyGraph satisfies it structurally). */
export interface RouteGraphLike {
  path: Cell[]
  path2?: Cell[]
}

/** Per-family band inputs, derived by the caller from the maze view (no new read path). */
export interface BandFamilyInput {
  familyId: string
  /** Explored prefix index on route 1 / route 2 (same semantics as MazeGrid's exploredOnRoute). */
  explored1: number
  explored2: number
  /** Progress rank key — the family's settle count (`FamilyViewState.energy.settles`). */
  settles: number
}

/** One contiguous equal-width band segment along a family's explored corridor. */
export interface BandRun {
  familyId: string
  /** Polyline points (maze-space cells); always ≥ 2 points. */
  pts: Cell[]
  /** Band width in tile units (a BAND_WIDTHS value). */
  w: number
}

/**
 * Nested band widths (tile units) by how many families have walked the cell (k = 1..3, capped).
 * Index 0 = MOST progressed = narrowest = drawn LAST = the solid centre core. k=1's 0.62 matches
 * the owner-tuned solid core width the bands replace (tune-neurons-maze-path-colors).
 */
export const BAND_WIDTHS: Record<number, number[]> = {
  1: [0.62],
  2: [0.36, 0.72],
  3: [0.26, 0.5, 0.78],
}

const cellKey = (c: Cell): string => `${c[0]},${c[1]}`

/** cell key → familyIds whose route 1/2 passes through that cell (deduped per family). */
export function computeCellFamilies(
  graphs: Record<string, RouteGraphLike>,
  familyIds: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const fam of familyIds) {
    const g = graphs[fam]
    if (!g) continue
    const seen = new Set<string>()
    for (const pt of [...g.path, ...(g.path2 ?? [])]) {
      const k = cellKey(pt)
      if (seen.has(k)) continue
      seen.add(k)
      const arr = out.get(k)
      if (arr) arr.push(fam)
      else out.set(k, [fam])
    }
  }
  return out
}

/** Module-load precompute over the committed grid graph (the prod path uses this). */
export const CELL_FAMILIES: Map<string, string[]> = computeCellFamilies(FAMILY_GRAPHS, FAMILY_IDS)

/**
 * Build the explored-corridor band runs for the current view.
 *
 * Per cell: candidates = families whose route passes it AND whose explored frontier has reached it
 * ("walked" — a family the cell lies beyond contributes nothing); ranked by settles DESC with a
 * deterministic `familyIds`-order tie-break; capped at the top 3. A family's band width at the cell
 * is BAND_WIDTHS[k][rank] (k = candidate count ≤ 3) or none when outranked. Contiguous equal-width
 * stretches become runs (1-pt overlap across a width change so strokes join seamlessly; runs < 2
 * pts dropped). Output is sorted widest-first so stroking in order nests narrow cores on top.
 *
 * `graphs` / `familyIds` are injectable for tests; prod callers use the defaults.
 */
export function buildBandRuns(
  fams: readonly BandFamilyInput[],
  graphs: Record<string, RouteGraphLike> = FAMILY_GRAPHS,
  familyIds: readonly string[] = FAMILY_IDS,
): BandRun[] {
  const cellFams =
    graphs === FAMILY_GRAPHS && familyIds === FAMILY_IDS
      ? CELL_FAMILIES
      : computeCellFamilies(graphs, familyIds)

  // Walked cell-keys per family: route prefix 0..exploredIdx, only when the family actually has an
  // explored stroke on that route (exploredIdx ≥ 1 — mirrors the caller's explored-prefix draw gate).
  const walked = new Map<string, Set<string>>()
  const settles = new Map<string, number>()
  for (const f of fams) {
    settles.set(f.familyId, f.settles)
    const g = graphs[f.familyId]
    if (!g) continue
    const set = walked.get(f.familyId) ?? new Set<string>()
    const addPrefix = (path: Cell[] | undefined, explored: number): void => {
      if (!path || path.length < 2) return
      const exploredIdx = Math.min(path.length - 1, explored)
      if (exploredIdx < 1) return
      for (let i = 0; i <= exploredIdx; i++) set.add(cellKey(path[i]))
    }
    addPrefix(g.path, f.explored1)
    addPrefix(g.path2, f.explored2)
    walked.set(f.familyId, set)
  }

  const famIdx = new Map<string, number>()
  familyIds.forEach((f, i) => famIdx.set(f, i))
  // Per-bake memo: top-≤3 walked families at a cell, most-progressed first.
  const topCache = new Map<string, string[]>()
  const topAt = (k: string): string[] => {
    let t = topCache.get(k)
    if (!t) {
      const cand = (cellFams.get(k) ?? []).filter((f) => walked.get(f)?.has(k))
      cand.sort(
        (a, b) =>
          (settles.get(b) ?? 0) - (settles.get(a) ?? 0) ||
          (famIdx.get(a) ?? Number.MAX_SAFE_INTEGER) - (famIdx.get(b) ?? Number.MAX_SAFE_INTEGER),
      )
      t = cand.slice(0, 3)
      topCache.set(k, t)
    }
    return t
  }

  const out: BandRun[] = []
  for (const f of fams) {
    const g = graphs[f.familyId]
    if (!g) continue
    const routes: Array<[Cell[] | undefined, number]> = [
      [g.path, f.explored1],
      [g.path2, f.explored2],
    ]
    for (const [path, explored] of routes) {
      if (!path || path.length < 2) continue
      const exploredIdx = Math.min(path.length - 1, explored)
      if (exploredIdx < 1) continue
      let runPts: Cell[] = []
      let runW: number | null = null
      const flush = (): void => {
        if (runW != null && runPts.length >= 2) out.push({ familyId: f.familyId, pts: runPts, w: runW })
        runPts = []
        runW = null
      }
      for (let i = 0; i <= exploredIdx; i++) {
        const top = topAt(cellKey(path[i]))
        const rank = top.indexOf(f.familyId)
        const w = rank >= 0 ? (BAND_WIDTHS[top.length]?.[rank] ?? null) : null
        if (w == null) {
          flush() // outranked at this cell — gap; the cell's top-3 bands cover it
          continue
        }
        if (runW == null) {
          runW = w
          runPts = [path[i]]
        } else if (w === runW) {
          runPts.push(path[i])
        } else {
          // Width change: close the previous run, start the next one OVERLAPPING the last point
          // so consecutive strokes join without a seam.
          const prev = runPts[runPts.length - 1]
          flush()
          runW = w
          runPts = [prev, path[i]]
        }
      }
      flush()
    }
  }
  // Widest first → the caller strokes in order and narrower (more-progressed) bands nest on top.
  out.sort((a, b) => b.w - a.w)
  return out
}
