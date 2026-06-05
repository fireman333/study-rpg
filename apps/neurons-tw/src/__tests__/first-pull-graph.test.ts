import { describe, it, expect } from 'vitest'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import {
  FAMILY_GRAPHS,
  litNodes,
  litNodesWithStarter,
  nodeKey,
  representativeNode,
} from '../lib/maze/graph'

/**
 * first-pull starter-lit behavior against the flat-grid per-family graph
 * (redesign-neurons-maze-rotjs-grid). first-pull itself is UNCHANGED — the maze
 * reads the legacy starter-family key VALUES (familyIds) to light each named
 * family's representative (route-first) node.
 */

const key = (n: { familyId: string; slotIndex: number }) => nodeKey(n.familyId, n.slotIndex)
const FAM = FAMILY_IDS[0]
const OTHER = FAMILY_IDS[1]

describe('representativeNode (flat-grid)', () => {
  it('returns the route-first (slot 0, border-nearest) node of a family', () => {
    const rep = representativeNode(FAM)
    expect(rep).not.toBeNull()
    expect(rep!.familyId).toBe(FAM)
    expect(rep!.slotIndex).toBe(0)
  })

  it('is deterministic on repeated calls', () => {
    expect(key(representativeNode(FAM)!)).toBe(key(representativeNode(FAM)!))
  })

  it('returns null for an unknown family', () => {
    expect(representativeNode('__no_such_family__')).toBeNull()
  })
})

describe('litNodesWithStarter (flat-grid)', () => {
  const EMPTY = new Set<string>()

  it('degrades to pure frontier when the family is not a starter', () => {
    expect(litNodesWithStarter(FAM, 0, EMPTY)).toEqual(litNodes(FAM, 0))
    expect(litNodesWithStarter(FAM, 3, EMPTY).map(key)).toEqual(litNodes(FAM, 3).map(key))
  })

  it('lights exactly the starter representative node at settles = 0', () => {
    const lit = litNodesWithStarter(FAM, 0, new Set([FAM]))
    const rep = representativeNode(FAM)!
    expect(lit).toHaveLength(1)
    expect(key(lit[0])).toBe(key(rep))
  })

  it('does not double-light when the frontier already covers the starter node', () => {
    const total = FAMILY_GRAPHS[FAM].nodes.length
    const lit = litNodesWithStarter(FAM, total, new Set([FAM])) // frontier = all nodes
    expect(lit).toHaveLength(total)
    const keys = lit.map(key)
    expect(new Set(keys).size).toBe(keys.length) // no duplicate node identities
  })

  it('only lights the starter rep for families in the starter set', () => {
    // OTHER is not a starter → its lit set at settles=0 is empty (pure frontier).
    expect(litNodesWithStarter(OTHER, 0, new Set([FAM]))).toHaveLength(0)
  })
})
