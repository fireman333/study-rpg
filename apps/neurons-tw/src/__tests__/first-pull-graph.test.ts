import { describe, it, expect } from 'vitest'
import {
  FAMILIES_BY_BRANCH,
  MAZE_GRAPHS,
  litNodes,
  litNodesWithStarter,
  nodeKey,
  representativeNode,
} from '../lib/maze/graph'

const key = (n: { familyId: string; slotIndex: number }) => nodeKey(n.familyId, n.slotIndex)

describe('representativeNode', () => {
  it('returns the hub-nearest (min pathLen) node of a family', () => {
    const fam = FAMILIES_BY_BRANCH.DA[0]
    const rep = representativeNode('DA', fam)
    expect(rep).not.toBeNull()
    expect(rep!.familyId).toBe(fam)
    const famNodes = MAZE_GRAPHS.DA.nodes.filter((n) => n.familyId === fam)
    const minLen = Math.min(...famNodes.map((n) => n.pathLen))
    expect(rep!.pathLen).toBe(minLen)
  })

  it('is deterministic on repeated calls', () => {
    const fam = FAMILIES_BY_BRANCH.GABA[0]
    expect(key(representativeNode('GABA', fam)!)).toBe(key(representativeNode('GABA', fam)!))
  })

  it('returns null for a family not present in the branch', () => {
    expect(representativeNode('DA', '__no_such_family__')).toBeNull()
  })
})

describe('litNodesWithStarter', () => {
  it('degrades to pure frontier when starterFamily is null', () => {
    expect(litNodesWithStarter('DA', 0, null)).toEqual(litNodes('DA', 0))
    expect(litNodesWithStarter('DA', 3, null).map(key)).toEqual(litNodes('DA', 3).map(key))
  })

  it('lights exactly the starter representative node at settles = 0', () => {
    const fam = FAMILIES_BY_BRANCH.DA[0]
    const lit = litNodesWithStarter('DA', 0, fam)
    const rep = representativeNode('DA', fam)!
    expect(lit).toHaveLength(1)
    expect(key(lit[0])).toBe(key(rep))
  })

  it('does not double-light when the frontier already covers the starter node', () => {
    const fam = FAMILIES_BY_BRANCH.DA[0]
    const total = MAZE_GRAPHS.DA.nodes.length
    const lit = litNodesWithStarter('DA', total, fam) // frontier = all nodes
    expect(lit).toHaveLength(total)
    const keys = lit.map(key)
    expect(new Set(keys).size).toBe(keys.length) // no duplicate node identities
  })

  it('adds exactly one node when the starter is outside the current frontier', () => {
    // Pick a family whose representative is NOT node 0 of the branch (so settles=0
    // frontier=[] and the starter adds one), verified via length math.
    const fam = FAMILIES_BY_BRANCH.Glu[FAMILIES_BY_BRANCH.Glu.length - 1]
    const rep = representativeNode('Glu', fam)
    if (!rep) return
    const lit = litNodesWithStarter('Glu', 0, fam)
    expect(lit).toHaveLength(1)
    expect(lit[0].familyId).toBe(fam)
  })
})
