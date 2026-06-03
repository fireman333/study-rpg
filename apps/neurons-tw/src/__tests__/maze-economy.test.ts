import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  mazeSpeedMultiplier,
  streakMultiplier,
  walkerFraction,
  accrueMazeEnergy,
  accrueReadingEnergyAllBranches,
  reconcileSettles,
  readMazeEnergyState,
  collectedKeys,
  nodeCost,
  cumulativeCost,
  affordableSettles,
  PACING_BASE,
  CORRECT_ENERGY,
  READING_ENERGY,
} from '../lib/maze/economy'
import { pickWalkerVariant } from '../lib/maze/useMaze'
import { FAMILIES_BY_BRANCH, MAZE_GRAPHS, NT_BRANCHES } from '../lib/maze/graph'
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import type { NeuronVariantRow } from '../lib/db'

const resolve = (id: string): string => id

function row(familyId: string, slotIndex: number, rarity: NeuronVariantRow['rarity'], rolledAt = 1): NeuronVariantRow {
  return { familyId, slotIndex, rarity, displayName: 'x', spriteKey: 'k', rolledAt, wasPityFloor: false, copies: 1 }
}

/** Seed a familyAccrual row for every family in a branch (pullVariant requires it). */
async function seedBranchFamilies(branch: NtBranchId): Promise<void> {
  for (const fam of FAMILIES_BY_BRANCH[branch]) {
    await db.familyAccrual.put({
      familyId: fam,
      ap: 0,
      firedToday: false,
      lastFireDate: null,
      unlockedSlots: [],
      sameDayCorrect: 0,
      pullCount: 0,
    })
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('team speed + streak multipliers (shared across branches)', () => {
  it('base speed is never below 1 (empty team still progresses)', () => {
    expect(mazeSpeedMultiplier(0)).toBe(1)
  })
  it('buff is monotonic in collected count and capped at +100%', () => {
    expect(mazeSpeedMultiplier(5)).toBeGreaterThan(mazeSpeedMultiplier(0))
    expect(mazeSpeedMultiplier(10)).toBeGreaterThan(mazeSpeedMultiplier(5))
    expect(mazeSpeedMultiplier(10_000)).toBeLessThanOrEqual(2)
  })
  it('streak multiplier ramps then saturates at 10', () => {
    expect(streakMultiplier(0)).toBeCloseTo(1, 6)
    expect(streakMultiplier(10)).toBeCloseTo(1.5, 6)
    expect(streakMultiplier(50)).toBeCloseTo(1.5, 6)
  })
})

describe('pacing curve — front-loaded cost(N)', () => {
  it('the first settle is the cheapest (= PACING_BASE)', () => {
    expect(nodeCost(0)).toBe(PACING_BASE)
  })
  it('cost is strictly increasing, including past the node count (二週目 ramps too)', () => {
    expect(nodeCost(1)).toBeGreaterThan(nodeCost(0))
    expect(nodeCost(50)).toBeGreaterThan(nodeCost(10))
    expect(nodeCost(150)).toBeGreaterThan(nodeCost(110))
  })
  it('affordableSettles is the max S with cumulativeCost(S) ≤ earned', () => {
    expect(affordableSettles(0)).toBe(0)
    expect(affordableSettles(nodeCost(0))).toBe(1)
    expect(affordableSettles(cumulativeCost(5))).toBe(5)
    expect(affordableSettles(cumulativeCost(5) - 1)).toBe(4)
  })
})

describe('walkerFraction', () => {
  it('is the unspent-energy fraction toward the next settle', () => {
    expect(walkerFraction({ earned: 0, settles: 0 })).toBe(0)
    expect(walkerFraction({ earned: nodeCost(0) / 2, settles: 0 })).toBeCloseTo(0.5, 6)
    expect(walkerFraction({ earned: cumulativeCost(1), settles: 1 })).toBe(0) // just settled → resets
  })
})

describe('accrueMazeEnergy (per-branch pools)', () => {
  it('adds base × speed multiplier and persists into the branch pool', async () => {
    await accrueMazeEnergy('DA', CORRECT_ENERGY) // empty team → ×1
    expect((await readMazeEnergyState('DA')).earned).toBeCloseTo(CORRECT_ENERGY, 6)
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.DA[0], i, 'P5'))
    await accrueMazeEnergy('DA', CORRECT_ENERGY)
    expect((await readMazeEnergyState('DA')).earned).toBeGreaterThan(CORRECT_ENERGY * 2) // buffed
  })

  it('pools are isolated — accruing one branch does not move another', async () => {
    await accrueMazeEnergy('DA', CORRECT_ENERGY)
    expect((await readMazeEnergyState('DA')).earned).toBeGreaterThan(0)
    for (const b of ['5HT', 'GABA', 'Glu'] as const) {
      expect((await readMazeEnergyState(b)).earned).toBe(0)
    }
  })

  it('the branch speed buff only counts that branch collection', async () => {
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(FAMILIES_BY_BRANCH.GABA[0], i, 'P5'))
    await accrueMazeEnergy('DA', CORRECT_ENERGY)
    expect((await readMazeEnergyState('DA')).earned).toBeCloseTo(CORRECT_ENERGY, 6) // unbuffed
  })
})

describe('accrueReadingEnergyAllBranches', () => {
  it('splits reading energy evenly across all 4 branch pools', async () => {
    await accrueReadingEnergyAllBranches(READING_ENERGY)
    const per = READING_ENERGY / NT_BRANCHES.length
    for (const b of NT_BRANCHES) {
      expect((await readMazeEnergyState(b)).earned).toBeCloseTo(per, 6) // empty teams → ×1
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

describe('reconcileSettles (per branch — consumes energy + triggers a random pull)', () => {
  it('settles once per affordable cost(N); each settle triggers exactly one pull (one instance)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedBranchFamilies('GABA')
    await db.meta.put({ key: 'maze:gaba:earned', value: String(cumulativeCost(3)) })
    const { newlyLit } = await reconcileSettles('GABA', resolve)
    expect(newlyLit).toHaveLength(3) // 3 frontier nodes lit
    expect((await readMazeEnergyState('GABA')).settles).toBe(3)
    expect(await db.neuronInstances.count()).toBe(3) // 3 pulls = 3 individuals minted
  })

  it('settle routes to the correct branch only (DA untouched)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedBranchFamilies('5HT')
    await db.meta.put({ key: 'maze:5ht:earned', value: String(cumulativeCost(2)) })
    await reconcileSettles('5HT', resolve)
    expect((await readMazeEnergyState('5HT')).settles).toBe(2)
    expect((await readMazeEnergyState('DA')).settles).toBe(0)
    expect(await db.neuronInstances.count()).toBe(2)
  })

  it('is idempotent — re-running with no new energy settles nothing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedBranchFamilies('DA')
    await db.meta.put({ key: 'maze:da:earned', value: String(cumulativeCost(2)) })
    await reconcileSettles('DA', resolve)
    const after1 = (await readMazeEnergyState('DA')).settles
    const { newlyLit } = await reconcileSettles('DA', resolve)
    expect(newlyLit).toHaveLength(0)
    expect((await readMazeEnergyState('DA')).settles).toBe(after1)
  })

  it('lit nodes cap at node count but settles continue past it (二週目 — no dead-end)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedBranchFamilies('Glu')
    const gluNodes = MAZE_GRAPHS.Glu.nodes.length
    await db.meta.put({ key: 'maze:glu:earned', value: String(cumulativeCost(gluNodes + 5)) })
    const { newlyLit } = await reconcileSettles('Glu', resolve)
    expect(newlyLit).toHaveLength(gluNodes) // only the frontier nodes get "lit"
    expect((await readMazeEnergyState('Glu')).settles).toBe(gluNodes + 5) // settles continue past node count
    expect(await db.neuronInstances.count()).toBe(gluNodes + 5) // every settle still pulled (二週目)
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
