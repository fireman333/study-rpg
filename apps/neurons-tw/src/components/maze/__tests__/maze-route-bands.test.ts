/**
 * §8 per-cell progress-ranked colour bands (redesign-neurons-maze-static-render D8) —
 * pure-module tests for `maze-route-bands.ts`: CELL_FAMILIES dedupe, the top-3 band cap,
 * settles-rank ordering, deterministic familyIds tie-break, walked-frontier gating, and
 * call-to-call determinism. Uses small synthetic graphs (the module's injectable
 * `graphs`/`familyIds` params); one test validates the real precomputed CELL_FAMILIES.
 */
import { describe, expect, it } from 'vitest'
import {
  BAND_WIDTHS,
  CELL_FAMILIES,
  buildBandRuns,
  computeCellFamilies,
  type BandFamilyInput,
  type RouteGraphLike,
} from '../maze-route-bands'
import type { Cell } from '../../../lib/maze/graph'

const cells = (pts: number[][]): Cell[] => pts.map(([x, y]) => [x, y] as Cell)

// Four families sharing the middle corridor (2,0)-(3,0)-(4,0), each with a 2-cell exclusive
// prefix and suffix (long enough to form ≥2-pt runs of their own).
const SHARED: Record<string, RouteGraphLike> = {
  A: { path: cells([[0, 10], [1, 10], [2, 0], [3, 0], [4, 0], [5, 10], [6, 10]]) },
  B: { path: cells([[0, 11], [1, 11], [2, 0], [3, 0], [4, 0], [5, 11], [6, 11]]) },
  C: { path: cells([[0, 12], [1, 12], [2, 0], [3, 0], [4, 0], [5, 12], [6, 12]]) },
  D: { path: cells([[0, 13], [1, 13], [2, 0], [3, 0], [4, 0], [5, 13], [6, 13]]) },
}
const SHARED_IDS = ['A', 'B', 'C', 'D'] as const

const fullWalk = (familyId: string, settles: number): BandFamilyInput => ({
  familyId,
  explored1: 6, // full path explored
  explored2: 0,
  settles,
})

const runsThrough = (runs: ReturnType<typeof buildBandRuns>, fam: string, cell: Cell) =>
  runs.filter(
    (r) => r.familyId === fam && r.pts.some((p) => p[0] === cell[0] && p[1] === cell[1]),
  )

describe('computeCellFamilies / CELL_FAMILIES', () => {
  it('dedupes a family whose path and path2 revisit the same cell', () => {
    const g: Record<string, RouteGraphLike> = {
      E: { path: cells([[0, 0], [1, 0]]), path2: cells([[1, 0], [2, 0]]) },
    }
    const m = computeCellFamilies(g, ['E'])
    expect(m.get('1,0')).toEqual(['E'])
    expect(m.get('0,0')).toEqual(['E'])
    expect(m.get('2,0')).toEqual(['E'])
  })

  it('real precomputed CELL_FAMILIES has no duplicate family per cell', () => {
    expect(CELL_FAMILIES.size).toBeGreaterThan(0)
    for (const [, fams] of CELL_FAMILIES) {
      expect(new Set(fams).size).toBe(fams.length)
    }
  })
})

describe('buildBandRuns', () => {
  it('caps a shared cell at the 3 most-progressed families (4th gets no band there)', () => {
    const runs = buildBandRuns(
      [fullWalk('A', 4), fullWalk('B', 3), fullWalk('C', 2), fullWalk('D', 1)],
      SHARED,
      SHARED_IDS,
    )
    const mid: Cell = [3, 0]
    expect(runsThrough(runs, 'A', mid)).toHaveLength(1)
    expect(runsThrough(runs, 'B', mid)).toHaveLength(1)
    expect(runsThrough(runs, 'C', mid)).toHaveLength(1)
    expect(runsThrough(runs, 'D', mid)).toHaveLength(0) // outranked — no 4th band
    // D still gets its exclusive prefix/suffix bands at the 1-family width.
    expect(runsThrough(runs, 'D', [1, 13] as Cell)[0]?.w).toBe(BAND_WIDTHS[1][0])
  })

  it('ranks shared-cell band widths by settles (most-progressed = narrowest core)', () => {
    const runs = buildBandRuns(
      [fullWalk('A', 4), fullWalk('B', 3), fullWalk('C', 2), fullWalk('D', 1)],
      SHARED,
      SHARED_IDS,
    )
    const mid: Cell = [3, 0]
    expect(runsThrough(runs, 'A', mid)[0]?.w).toBe(BAND_WIDTHS[3][0]) // 0.26 — narrowest
    expect(runsThrough(runs, 'B', mid)[0]?.w).toBe(BAND_WIDTHS[3][1]) // 0.50
    expect(runsThrough(runs, 'C', mid)[0]?.w).toBe(BAND_WIDTHS[3][2]) // 0.78 — widest
  })

  it('breaks settle ties by familyIds order (deterministic)', () => {
    const runs = buildBandRuns(
      [fullWalk('A', 0), fullWalk('B', 0), fullWalk('C', 0), fullWalk('D', 0)],
      SHARED,
      SHARED_IDS,
    )
    const mid: Cell = [3, 0]
    expect(runsThrough(runs, 'A', mid)[0]?.w).toBe(BAND_WIDTHS[3][0])
    expect(runsThrough(runs, 'B', mid)[0]?.w).toBe(BAND_WIDTHS[3][1])
    expect(runsThrough(runs, 'C', mid)[0]?.w).toBe(BAND_WIDTHS[3][2])
    expect(runsThrough(runs, 'D', mid)).toHaveLength(0)
  })

  it('gates by walked frontier: a family that has not reached a shared cell contributes no band and no rank', () => {
    // B's frontier stops at index 1 (its exclusive prefix) — it never reaches the shared corridor.
    const runs = buildBandRuns(
      [fullWalk('A', 1), { familyId: 'B', explored1: 1, explored2: 0, settles: 99 }],
      SHARED,
      ['A', 'B'],
    )
    const mid: Cell = [3, 0]
    // A walks the shared cells alone → k=1 single-band width, despite B's higher settles.
    expect(runsThrough(runs, 'A', mid)[0]?.w).toBe(BAND_WIDTHS[1][0])
    expect(runsThrough(runs, 'B', mid)).toHaveLength(0)
    // B's walked prefix still bands.
    expect(runsThrough(runs, 'B', [1, 11] as Cell)[0]?.w).toBe(BAND_WIDTHS[1][0])
  })

  it('an unexplored family (frontier at 0) produces no runs at all', () => {
    const runs = buildBandRuns(
      [{ familyId: 'A', explored1: 0, explored2: 0, settles: 5 }],
      SHARED,
      ['A'],
    )
    expect(runs).toHaveLength(0)
  })

  it('is deterministic across calls and sorted widest-first', () => {
    const input = [fullWalk('A', 4), fullWalk('B', 3), fullWalk('C', 2), fullWalk('D', 1)]
    const r1 = buildBandRuns(input, SHARED, SHARED_IDS)
    const r2 = buildBandRuns(input, SHARED, SHARED_IDS)
    expect(r1).toEqual(r2)
    for (let i = 1; i < r1.length; i++) expect(r1[i - 1].w).toBeGreaterThanOrEqual(r1[i].w)
    // Adjacent runs of one family overlap by one point across a width change (no seam).
    const aRuns = r1.filter((r) => r.familyId === 'A')
    const prefix = aRuns.find((r) => r.pts.some((p) => p[1] === 10) && r.pts.some((p) => p[0] === 0))
    const sharedRun = aRuns.find((r) => r.pts.some((p) => p[0] === 3 && p[1] === 0))
    expect(prefix && sharedRun).toBeTruthy()
    if (prefix && sharedRun) {
      const last = prefix.pts[prefix.pts.length - 1]
      expect(sharedRun.pts.some((p) => p[0] === last[0] && p[1] === last[1])).toBe(true)
    }
  })
})
