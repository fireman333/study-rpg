import { describe, it, expect } from 'vitest'
import { FAMILY_NT_BRANCH } from '@study-rpg/content-neurons-tw'
import {
  MAZE_GRAPH,
  MAZE_FAMILIES,
  nodeKey,
  isNodeLit,
  foggedNodes,
  nextTarget,
  pointAtFraction,
} from '../lib/maze/graph'

describe('maze graph (da-graph.json)', () => {
  it('covers exactly the DA branch families', () => {
    const da = Object.entries(FAMILY_NT_BRANCH).filter(([, b]) => b === 'DA').map(([f]) => f)
    expect(MAZE_FAMILIES.sort()).toEqual(da.sort())
    expect(MAZE_FAMILIES).toContain('藥理學')
    expect(MAZE_FAMILIES).toContain('公共衛生學')
  })

  it('has exactly 20 nodes = 2 families × 10 slots (1 node = 1 variant slot)', () => {
    expect(MAZE_GRAPH.slotCount).toBe(20)
    expect(MAZE_GRAPH.nodes).toHaveLength(20)
  })

  it('maps every node to a DA family + valid slot, all distinct', () => {
    const keys = new Set<string>()
    for (const n of MAZE_GRAPH.nodes) {
      expect(MAZE_FAMILIES).toContain(n.familyId)
      expect(n.slotIndex).toBeGreaterThanOrEqual(0)
      expect(n.slotIndex).toBeLessThan(10)
      keys.add(nodeKey(n.familyId, n.slotIndex))
    }
    expect(keys.size).toBe(20) // bijection — no duplicate (family, slot)
    // 10 per family
    for (const fam of MAZE_FAMILIES) {
      expect(MAZE_GRAPH.nodes.filter((n) => n.familyId === fam)).toHaveLength(10)
    }
  })

  it('has a hub root and on-fiber walk paths anchored at topology', () => {
    expect(MAZE_GRAPH.root).toHaveLength(2)
    for (const n of MAZE_GRAPH.nodes) {
      expect(n.path.length).toBeGreaterThanOrEqual(2)
      expect(n.arc.length).toBe(n.path.length)
      expect(n.pathLen).toBeGreaterThan(0)
      expect(['endpoint', 'branch', 'mid']).toContain(n.kind)
    }
  })

  it('lit/fog derivation: nodes are lit iff their slot is collected', () => {
    const sample = MAZE_GRAPH.nodes[0]
    const collected = new Set([nodeKey(sample.familyId, sample.slotIndex)])
    expect(isNodeLit(sample, collected)).toBe(true)
    expect(foggedNodes(collected)).toHaveLength(19)
    // next target = nearest fogged to hub; never the already-lit node
    const t = nextTarget(collected)
    expect(t).not.toBeNull()
    expect(nodeKey(t!.familyId, t!.slotIndex)).not.toBe(nodeKey(sample.familyId, sample.slotIndex))
  })

  it('nextTarget is null when everything is collected', () => {
    const all = new Set(MAZE_GRAPH.nodes.map((n) => nodeKey(n.familyId, n.slotIndex)))
    expect(nextTarget(all)).toBeNull()
    expect(foggedNodes(all)).toHaveLength(0)
  })

  it('pointAtFraction walks the path from hub root to the node', () => {
    const n = MAZE_GRAPH.nodes[5]
    const start = pointAtFraction(n, 0)
    const end = pointAtFraction(n, 1)
    expect(start[0]).toBeCloseTo(MAZE_GRAPH.root[0], 3)
    expect(start[1]).toBeCloseTo(MAZE_GRAPH.root[1], 3)
    expect(end[0]).toBeCloseTo(n.x, 3)
    expect(end[1]).toBeCloseTo(n.y, 3)
  })
})
