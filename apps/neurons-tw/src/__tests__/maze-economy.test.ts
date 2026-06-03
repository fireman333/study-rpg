import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  mazeSpeedMultiplier,
  streakMultiplier,
  walkerFraction,
  accrueMazeSignal,
  accrueReadingSignalAllBranches,
  reconcileSettles,
  readMazeSignalState,
  collectedKeys,
  SIGNAL_PER_NODE,
  CORRECT_SIGNAL,
  READING_SIGNAL,
} from '../lib/maze/economy'
import { pickWalkerVariant } from '../lib/maze/useMaze'
import { FAMILIES_BY_BRANCH, MAZE_GRAPHS, NT_BRANCHES, nodeKey } from '../lib/maze/graph'
import type { NeuronVariantRow } from '../lib/db'

const resolve = (id: string): string => id

function row(familyId: string, slotIndex: number, rarity: NeuronVariantRow['rarity'], rolledAt = 1): NeuronVariantRow {
  return { familyId, slotIndex, rarity, displayName: 'x', spriteKey: 'k', rolledAt, wasPityFloor: false, copies: 1 }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('team speed + streak multipliers (shared across branches)', () => {
  it('base speed is never below 1 (empty team still progresses)', () => {
    expect(mazeSpeedMultiplier(0)).toBe(1)
  })
  it('buff is monotonic in collected count and capped', () => {
    expect(mazeSpeedMultiplier(5)).toBeGreaterThan(mazeSpeedMultiplier(0))
    expect(mazeSpeedMultiplier(10)).toBeGreaterThan(mazeSpeedMultiplier(5))
    expect(mazeSpeedMultiplier(10_000)).toBeLessThanOrEqual(2) // capped at +100%
  })
  it('streak multiplier ramps then saturates at 10', () => {
    expect(streakMultiplier(0)).toBeCloseTo(1, 6)
    expect(streakMultiplier(10)).toBeCloseTo(1.5, 6)
    expect(streakMultiplier(50)).toBeCloseTo(1.5, 6)
  })
})

describe('walkerFraction', () => {
  it('is the unspent-signal fraction toward the next node', () => {
    expect(walkerFraction({ signal: 0, settles: 0 })).toBe(0)
    expect(walkerFraction({ signal: SIGNAL_PER_NODE / 2, settles: 0 })).toBeCloseTo(0.5, 6)
    expect(walkerFraction({ signal: SIGNAL_PER_NODE, settles: 1 })).toBe(0) // just settled → resets
  })
})

describe('accrueMazeSignal (per-branch pools)', () => {
  it('adds base × speed multiplier and persists into the branch pool', async () => {
    await accrueMazeSignal('DA', CORRECT_SIGNAL) // empty team → ×1
    expect((await readMazeSignalState('DA')).signal).toBeCloseTo(CORRECT_SIGNAL, 6)
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.DA[0], i, 'P5'))
    await accrueMazeSignal('DA', CORRECT_SIGNAL)
    expect((await readMazeSignalState('DA')).signal).toBeGreaterThan(CORRECT_SIGNAL * 2) // buffed
  })

  it('pools are isolated — accruing one branch does not move another', async () => {
    await accrueMazeSignal('DA', CORRECT_SIGNAL)
    expect((await readMazeSignalState('DA')).signal).toBeGreaterThan(0)
    for (const b of ['5HT', 'GABA', 'Glu'] as const) {
      expect((await readMazeSignalState(b)).signal).toBe(0)
    }
  })

  it('the branch speed buff only counts that branch collection', async () => {
    // collect 5 GABA variants — DA accrual stays at base ×1
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.GABA[0], i, 'P5'))
    await accrueMazeSignal('DA', CORRECT_SIGNAL)
    expect((await readMazeSignalState('DA')).signal).toBeCloseTo(CORRECT_SIGNAL, 6) // unbuffed
  })
})

describe('accrueReadingSignalAllBranches', () => {
  it('splits reading signal evenly across all 4 branch pools', async () => {
    await accrueReadingSignalAllBranches(READING_SIGNAL)
    const per = READING_SIGNAL / NT_BRANCHES.length
    for (const b of NT_BRANCHES) {
      expect((await readMazeSignalState(b)).signal).toBeCloseTo(per, 6) // empty teams → ×1
    }
  })
})

describe('collectedKeys (per branch)', () => {
  it('returns only that branch family slots', async () => {
    await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.DA[0], 0, 'P5'))
    await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.GABA[0], 0, 'P5'))
    expect((await collectedKeys('DA')).size).toBe(1)
    expect((await collectedKeys('GABA')).size).toBe(1)
    expect((await collectedKeys('5HT')).size).toBe(0)
  })
})

describe('reconcileSettles (per branch)', () => {
  it('mints one fogged node per SIGNAL_PER_NODE of accrued signal', async () => {
    await db.meta.put({ key: 'maze:gaba:signal', value: String(SIGNAL_PER_NODE * 3) })
    const { newlyLit } = await reconcileSettles('GABA', resolve)
    expect(newlyLit).toHaveLength(3)
    expect((await collectedKeys('GABA')).size).toBe(3)
    expect((await readMazeSignalState('GABA')).settles).toBe(3)
    for (const n of newlyLit) {
      expect(MAZE_GRAPHS.GABA.nodes.some((m) => nodeKey(m.familyId, m.slotIndex) === nodeKey(n.familyId, n.slotIndex))).toBe(true)
    }
  })

  it('settle routes to the correct branch only (DA untouched)', async () => {
    await db.meta.put({ key: 'maze:5ht:signal', value: String(SIGNAL_PER_NODE * 2) })
    await reconcileSettles('5HT', resolve)
    expect((await collectedKeys('5HT')).size).toBe(2)
    expect((await collectedKeys('DA')).size).toBe(0)
  })

  it('is idempotent — re-running with no new signal mints nothing (DA regression guard)', async () => {
    await db.meta.put({ key: 'maze:da:signal', value: String(SIGNAL_PER_NODE * 2) })
    await reconcileSettles('DA', resolve)
    const after1 = (await collectedKeys('DA')).size
    const { newlyLit } = await reconcileSettles('DA', resolve)
    expect(newlyLit).toHaveLength(0)
    expect((await collectedKeys('DA')).size).toBe(after1)
  })

  it('guarantees previously-uncollected slots (never dupes a fogged settle)', async () => {
    await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.DA[0], 0, 'P5'))
    await db.meta.put({ key: 'maze:da:signal', value: String(SIGNAL_PER_NODE * 2) })
    const { newlyLit } = await reconcileSettles('DA', resolve)
    expect(newlyLit).toHaveLength(2)
    const keys = newlyLit.map((n) => nodeKey(n.familyId, n.slotIndex))
    expect(new Set(keys).size).toBe(2)
    expect(keys).not.toContain(nodeKey(FAMILIES_BY_BRANCH.DA[0], 0))
  })

  it('stops settling when all of a branch is lit (Glu = 40, no infinite mint)', async () => {
    await db.meta.put({ key: 'maze:glu:signal', value: String(SIGNAL_PER_NODE * 200) })
    const { newlyLit } = await reconcileSettles('Glu', resolve)
    expect(newlyLit.length).toBe(40)
    expect((await collectedKeys('Glu')).size).toBe(40)
    const again = await reconcileSettles('Glu', resolve)
    expect(again.newlyLit).toHaveLength(0)
  })
})

describe('pickWalkerVariant (rarest collected, tiebreak most-recent)', () => {
  it('returns null for an empty team', () => {
    expect(pickWalkerVariant([])).toBeNull()
  })
  it('picks the rarest collected variant', () => {
    const rows = [row('藥理學', 1, 'P5'), row('藥理學', 2, 'P2'), row('藥理學', 3, 'P4')]
    expect(pickWalkerVariant(rows)?.rarity).toBe('P2')
  })
  it('breaks rarity ties by most-recently rolled', () => {
    const rows = [row('藥理學', 1, 'P3', 100), row('藥理學', 2, 'P3', 200)]
    expect(pickWalkerVariant(rows)?.slotIndex).toBe(2)
  })
})
