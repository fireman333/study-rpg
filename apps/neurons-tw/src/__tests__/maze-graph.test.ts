import { describe, it, expect } from 'vitest'
import { FAMILY_NT_BRANCH, type NtBranchId } from '@study-rpg/content-neurons-tw'
import {
  MAZE_GRAPHS,
  NT_BRANCHES,
  FAMILIES_BY_BRANCH,
  branchOfFamily,
  nodeKey,
  isNodeLit,
  foggedNodes,
  nextTarget,
  pointAtFraction,
} from '../lib/maze/graph'

const EXPECTED: Record<NtBranchId, number> = { DA: 20, '5HT': 20, GABA: 30, Glu: 40 }

describe('maze graph (multi-branch)', () => {
  it('covers all four NT branches in canonical order', () => {
    expect(NT_BRANCHES).toEqual(['DA', '5HT', 'GABA', 'Glu'])
    for (const b of NT_BRANCHES) expect(MAZE_GRAPHS[b].branch).toBe(b)
  })

  it('FAMILIES_BY_BRANCH partitions the 11 families per FAMILY_NT_BRANCH', () => {
    for (const [fam, branch] of Object.entries(FAMILY_NT_BRANCH)) {
      expect(FAMILIES_BY_BRANCH[branch]).toContain(fam)
      expect(branchOfFamily(fam)).toBe(branch)
    }
    expect(FAMILIES_BY_BRANCH.DA.sort()).toEqual(['公共衛生學', '藥理學'].sort())
    expect(FAMILIES_BY_BRANCH['5HT'].sort()).toEqual(['寄生蟲學', '組織學'].sort())
    expect(FAMILIES_BY_BRANCH.GABA.sort()).toEqual(['免疫學', '病理學', '生物化學'].sort())
    expect(FAMILIES_BY_BRANCH.Glu.sort()).toEqual(['微生物學', '生理學', '胚胎學', '解剖學'].sort())
  })

  it('each branch node count = its slot count (DA20 / 5HT20 / GABA30 / Glu40)', () => {
    for (const b of NT_BRANCHES) {
      expect(MAZE_GRAPHS[b].slotCount).toBe(EXPECTED[b])
      expect(MAZE_GRAPHS[b].nodes).toHaveLength(EXPECTED[b])
    }
  })

  it('1 node = 1 slot, distinct within branch, no cross-branch (family,slot) collision', () => {
    const allKeys = new Set<string>()
    for (const b of NT_BRANCHES) {
      const fams = FAMILIES_BY_BRANCH[b]
      const branchKeys = new Set<string>()
      for (const n of MAZE_GRAPHS[b].nodes) {
        expect(fams).toContain(n.familyId)
        expect(n.slotIndex).toBeGreaterThanOrEqual(0)
        expect(n.slotIndex).toBeLessThan(10)
        const k = nodeKey(n.familyId, n.slotIndex)
        branchKeys.add(k)
        allKeys.add(k)
      }
      expect(branchKeys.size).toBe(EXPECTED[b])
      for (const fam of fams) {
        expect(MAZE_GRAPHS[b].nodes.filter((n) => n.familyId === fam)).toHaveLength(10)
      }
    }
    expect(allKeys.size).toBe(20 + 20 + 30 + 40) // 110, no cross-branch dupes
  })

  it('each branch has a hub root and on-fiber walk paths anchored at topology', () => {
    for (const b of NT_BRANCHES) {
      const g = MAZE_GRAPHS[b]
      expect(g.root).toHaveLength(2)
      for (const n of g.nodes) {
        expect(n.path.length).toBeGreaterThanOrEqual(2)
        expect(n.arc.length).toBe(n.path.length)
        expect(n.pathLen).toBeGreaterThan(0)
        expect(['endpoint', 'branch', 'mid']).toContain(n.kind)
      }
    }
  })

  it('lit/fog derivation + nextTarget, per branch', () => {
    for (const b of NT_BRANCHES) {
      const sample = MAZE_GRAPHS[b].nodes[0]
      const collected = new Set([nodeKey(sample.familyId, sample.slotIndex)])
      expect(isNodeLit(sample, collected)).toBe(true)
      expect(foggedNodes(b, collected)).toHaveLength(EXPECTED[b] - 1)
      const t = nextTarget(b, collected)
      expect(t).not.toBeNull()
      expect(nodeKey(t!.familyId, t!.slotIndex)).not.toBe(nodeKey(sample.familyId, sample.slotIndex))
    }
  })

  it('nextTarget is null when a branch is fully collected', () => {
    const b: NtBranchId = '5HT'
    const all = new Set(MAZE_GRAPHS[b].nodes.map((n) => nodeKey(n.familyId, n.slotIndex)))
    expect(nextTarget(b, all)).toBeNull()
    expect(foggedNodes(b, all)).toHaveLength(0)
  })

  it('pointAtFraction walks hub root → node, per branch', () => {
    for (const b of NT_BRANCHES) {
      const g = MAZE_GRAPHS[b]
      const n = g.nodes[5] ?? g.nodes[0]
      const start = pointAtFraction(n, 0)
      const end = pointAtFraction(n, 1)
      expect(start[0]).toBeCloseTo(g.root[0], 3)
      expect(start[1]).toBeCloseTo(g.root[1], 3)
      expect(end[0]).toBeCloseTo(n.x, 3)
      expect(end[1]).toBeCloseTo(n.y, 3)
    }
  })
})
