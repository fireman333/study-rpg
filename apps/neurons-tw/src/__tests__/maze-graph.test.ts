import { describe, it, expect } from 'vitest'
import { FAMILY_IDS, VARIANT_COUNT_BY_FAMILY } from '@study-rpg/content-neurons-tw'
import {
  FAMILY_GRAPHS,
  GRID_W,
  GRID_H,
  GRID_CENTER,
  GRID_SYNAPSES,
  WEAVE_BRIDGES,
  nodeKey,
  familyNodeCount,
  litNodes,
  frontierNode,
  representativeNode,
  pointAtArc,
  synapseCell,
} from '../lib/maze/graph'

// Entries sit on the perimeter RING — EllerMaze's outermost cells are walls, so
// the nearest passable border cell lands a few cells in. "Border entry" = a
// peripheral cell far from the center (the routes converge to the center).
const peripheral = (x: number, y: number) =>
  Math.hypot(x - GRID_CENTER[0], y - GRID_CENTER[1]) > Math.max(GRID_W, GRID_H) * 0.35

describe('flat-grid maze graph', () => {
  it('loads one square grid with 11 family routes', () => {
    expect(GRID_W).toBe(99)
    expect(GRID_H).toBe(99)
    expect(GRID_CENTER).toHaveLength(2)
    expect(Object.keys(FAMILY_GRAPHS).sort()).toEqual([...FAMILY_IDS].sort())
  })

  it('has a dense structural weave + many crossing-synapses (≥ 110)', () => {
    expect(WEAVE_BRIDGES.length).toBeGreaterThan(500) // hundreds of over/under bridges
    expect(GRID_SYNAPSES.length).toBeGreaterThanOrEqual(110)
    for (const s of GRID_SYNAPSES) {
      expect(s.families[0]).not.toBe(s.families[1])
      expect(s.cell[0]).toBeGreaterThanOrEqual(0)
      expect(s.cell[0]).toBeLessThan(GRID_W)
    }
  })

  it('each family has 10 nodes = its variant-slot count; 110 distinct (family,slot) keys', () => {
    const allKeys = new Set<string>()
    for (const fam of FAMILY_IDS) {
      const g = FAMILY_GRAPHS[fam]
      expect(g.nodes).toHaveLength(10)
      expect(familyNodeCount(fam)).toBe(VARIANT_COUNT_BY_FAMILY[fam]) // node count = slot count
      const famKeys = new Set<string>()
      g.nodes.forEach((n, i) => {
        expect(n.familyId).toBe(fam)
        expect(n.slotIndex).toBe(i) // route order = slot order, 0..9
        const k = nodeKey(n.familyId, n.slotIndex)
        famKeys.add(k)
        allKeys.add(k)
      })
      expect(famKeys.size).toBe(10)
    }
    expect(allKeys.size).toBe(110) // no cross-family collision
  })

  it('every family enters from the border ring and winds toward the center', () => {
    const entries = new Set<string>()
    for (const fam of FAMILY_IDS) {
      const g = FAMILY_GRAPHS[fam]
      expect(g.path.length).toBeGreaterThan(2)
      expect(peripheral(g.entryCell[0], g.entryCell[1])).toBe(true)
      entries.add(`${g.entryCell[0]},${g.entryCell[1]}`)
      // path[0] is the border entry; the route ends near the shared center.
      expect(g.path[0]).toEqual(g.entryCell)
      const last = g.path[g.path.length - 1]
      const dist = Math.hypot(last[0] - GRID_CENTER[0], last[1] - GRID_CENTER[1])
      expect(dist).toBeLessThanOrEqual(3)
    }
    expect(entries.size).toBe(FAMILY_IDS.length) // distinct entries
  })

  it('frontier order is route order (entry-first); litNodes is the prefix', () => {
    const fam = FAMILY_IDS[0]
    expect(litNodes(fam, 0)).toEqual([])
    expect(litNodes(fam, 3).map((n) => n.slotIndex)).toEqual([0, 1, 2])
    expect(frontierNode(fam, 0)?.slotIndex).toBe(0)
    expect(frontierNode(fam, 3)?.slotIndex).toBe(3)
    expect(frontierNode(fam, 10)).toBeNull() // all lit → 二週目
    expect(representativeNode(fam)?.slotIndex).toBe(0)
  })

  it('most variant nodes sit at route crossings (synapse-flagged)', () => {
    let synapseNodes = 0
    let total = 0
    for (const fam of FAMILY_IDS) {
      for (const n of FAMILY_GRAPHS[fam].nodes) {
        total += 1
        if (n.synapse) synapseNodes += 1
      }
    }
    expect(total).toBe(110)
    expect(synapseNodes).toBeGreaterThan(total / 2) // majority are interwoven crossings
  })

  it('pointAtArc walks the corridor entry → center; synapseCell resolves a pair', () => {
    const fam = FAMILY_IDS[0]
    const g = FAMILY_GRAPHS[fam]
    const start = pointAtArc(fam, 0)
    expect(start[0]).toBeCloseTo(g.entryCell[0], 3)
    expect(start[1]).toBeCloseTo(g.entryCell[1], 3)
    const end = pointAtArc(fam, g.pathLen)
    const lastCell = g.path[g.path.length - 1]
    expect(end[0]).toBeCloseTo(lastCell[0], 3)
    expect(end[1]).toBeCloseTo(lastCell[1], 3)
    // a committed crossing pair resolves to a cell
    const s = GRID_SYNAPSES[0]
    const cell = synapseCell(s.families[0], s.families[1])
    expect(cell).not.toBeNull()
  })
})
