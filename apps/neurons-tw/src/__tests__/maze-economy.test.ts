import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS, PACING_BASE, PACING_K, RAMP_CAP_N } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import {
  mazeSpeedMultiplier,
  streakMultiplier,
  walkerFraction,
  accrueMazeEnergy,
  reconcileSettles,
  readMazeEnergyState,
  nodeCost,
  cumulativeCost,
  affordableSettles,
  CORRECT_ANSWER_ENERGY,
  READING_MINUTE_ENERGY,
} from '../lib/maze/economy'
import { pickWalkerVariant } from '../lib/maze/useMaze'
import { familyNodeCount } from '../lib/maze/graph'
import type { NeuronVariantRow } from '../lib/db'

const resolve = (id: string): string => id
const FAM = FAMILY_IDS[0] // 藥理學
const OTHER = FAMILY_IDS[1] // 公共衛生學

function row(familyId: string, slotIndex: number, rarity: NeuronVariantRow['rarity'], rolledAt = 1): NeuronVariantRow {
  return { familyId, slotIndex, rarity, displayName: 'x', spriteKey: 'k', rolledAt, wasPityFloor: false, copies: 1 }
}

/** Seed a familyAccrual row for one family (pullVariant requires it). */
async function seedFamily(familyId: string): Promise<void> {
  await db.familyAccrual.put({
    familyId,
    ap: 0,
    firedToday: false,
    lastFireDate: null,
    unlockedSlots: [],
    sameDayCorrect: 0,
    pullCount: 0,
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('team speed + streak multipliers', () => {
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

describe('pacing curve — front-loaded capped cost(N), recalibrated PACING_BASE=11', () => {
  it('the first settle is the cheapest (= PACING_BASE)', () => {
    expect(nodeCost(0)).toBe(PACING_BASE)
    expect(PACING_BASE).toBe(11)
  })
  it('cost is strictly increasing up to the ramp cap', () => {
    expect(nodeCost(1)).toBeGreaterThan(nodeCost(0))
    expect(nodeCost(RAMP_CAP_N)).toBeGreaterThan(nodeCost(RAMP_CAP_N - 1))
  })
  it('cost FLATTENS past RAMP_CAP_N (rebalance-neurons-maze-economy) — completionist tail does not escalate', () => {
    const capped = Math.round(PACING_BASE * (1 + PACING_K * RAMP_CAP_N))
    expect(nodeCost(RAMP_CAP_N)).toBe(capped)
    expect(nodeCost(RAMP_CAP_N + 1)).toBe(capped)
    expect(nodeCost(50)).toBe(capped)
    expect(nodeCost(150)).toBe(capped)
    // with the defaults (base 11, k 0.1, cap 20) the flat tail cost is 33
    expect(capped).toBe(33)
  })
  it('cumulativeCost grows linearly (constant increment) past the cap', () => {
    const capped = nodeCost(RAMP_CAP_N)
    const step = cumulativeCost(RAMP_CAP_N + 5) - cumulativeCost(RAMP_CAP_N + 4)
    expect(step).toBe(capped)
  })
  it('affordableSettles is the max S with cumulativeCost(S) ≤ earned', () => {
    expect(affordableSettles(0)).toBe(0)
    expect(affordableSettles(nodeCost(0))).toBe(1)
    expect(affordableSettles(cumulativeCost(5))).toBe(5)
    expect(affordableSettles(cumulativeCost(5) - 1)).toBe(4)
  })
  it('crossing a settle threshold raises affordableSettles (drives the quiz feedback escalation)', () => {
    // The QuizModal strip escalates when affordableSettles(after) > affordableSettles(before).
    const justBelow = cumulativeCost(3) - 1
    const justAbove = cumulativeCost(3)
    expect(affordableSettles(justBelow)).toBe(2)
    expect(affordableSettles(justAbove)).toBe(3)
    expect(affordableSettles(justAbove) > affordableSettles(justBelow)).toBe(true)
  })
})

describe('walkerFraction', () => {
  it('is the unspent-energy fraction toward the next settle', () => {
    expect(walkerFraction({ earned: 0, settles: 0 })).toBe(0)
    expect(walkerFraction({ earned: nodeCost(0) / 2, settles: 0 })).toBeCloseTo(0.5, 6)
    expect(walkerFraction({ earned: cumulativeCost(1), settles: 1 })).toBe(0) // just settled → resets
  })
})

describe('accrueMazeEnergy (per-family pools)', () => {
  it('adds base × speed multiplier and persists into the family pool', async () => {
    await accrueMazeEnergy(FAM, CORRECT_ANSWER_ENERGY) // empty team → ×1
    expect((await readMazeEnergyState(FAM)).earned).toBeCloseTo(CORRECT_ANSWER_ENERGY, 6)
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(FAM, i, 'P5'))
    await accrueMazeEnergy(FAM, CORRECT_ANSWER_ENERGY)
    expect((await readMazeEnergyState(FAM)).earned).toBeGreaterThan(CORRECT_ANSWER_ENERGY * 2) // buffed
  })

  it('pools are isolated — accruing one family does not move another', async () => {
    await accrueMazeEnergy(FAM, CORRECT_ANSWER_ENERGY)
    expect((await readMazeEnergyState(FAM)).earned).toBeGreaterThan(0)
    expect((await readMazeEnergyState(OTHER)).earned).toBe(0)
  })

  it('the speed buff only counts that family collection', async () => {
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(OTHER, i, 'P5'))
    await accrueMazeEnergy(FAM, CORRECT_ANSWER_ENERGY)
    expect((await readMazeEnergyState(FAM)).earned).toBeCloseTo(CORRECT_ANSWER_ENERGY, 6) // unbuffed
  })
})

describe('per-subject reading (add-neurons-maze-zoom-and-focus)', () => {
  // The reading-timer now accrues each study-minute entirely into the chosen
  // family's pool via accrueMazeEnergy (the old even-split helper is retired).
  it('reading energy accrues entirely to the chosen family, not split across families', async () => {
    await accrueMazeEnergy(FAM, READING_MINUTE_ENERGY) // empty team → ×1
    expect((await readMazeEnergyState(FAM)).earned).toBeCloseTo(READING_MINUTE_ENERGY, 6)
    // No other family receives any reading energy (proves there is no split).
    for (const f of FAMILY_IDS) {
      if (f === FAM) continue
      expect((await readMazeEnergyState(f)).earned).toBe(0)
    }
  })
})

describe('reconcileSettles (per family — consumes energy + triggers a random pull)', () => {
  it('settles once per affordable cost(N); each settle triggers exactly one pull (one instance)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedFamily(FAM)
    await db.meta.put({ key: `maze:${FAM}:earned`, value: String(cumulativeCost(3)) })
    const { newlyLit } = await reconcileSettles(FAM, resolve)
    expect(newlyLit).toHaveLength(3) // 3 frontier nodes lit
    expect((await readMazeEnergyState(FAM)).settles).toBe(3)
    expect(await db.neuronInstances.count()).toBe(3) // 3 pulls = 3 individuals minted
  })

  it('settle routes to the correct family only (OTHER untouched)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedFamily(FAM)
    await db.meta.put({ key: `maze:${FAM}:earned`, value: String(cumulativeCost(2)) })
    await reconcileSettles(FAM, resolve)
    expect((await readMazeEnergyState(FAM)).settles).toBe(2)
    expect((await readMazeEnergyState(OTHER)).settles).toBe(0)
    expect(await db.neuronInstances.count()).toBe(2)
  })

  it('is idempotent — re-running with no new energy settles nothing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedFamily(FAM)
    await db.meta.put({ key: `maze:${FAM}:earned`, value: String(cumulativeCost(2)) })
    await reconcileSettles(FAM, resolve)
    const after1 = (await readMazeEnergyState(FAM)).settles
    const { newlyLit } = await reconcileSettles(FAM, resolve)
    expect(newlyLit).toHaveLength(0)
    expect((await readMazeEnergyState(FAM)).settles).toBe(after1)
  })

  it('lit nodes cap at node count but settles continue past it (二週目 — no dead-end)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await seedFamily(FAM)
    const n = familyNodeCount(FAM)
    await db.meta.put({ key: `maze:${FAM}:earned`, value: String(cumulativeCost(n + 5)) })
    const { newlyLit } = await reconcileSettles(FAM, resolve)
    expect(newlyLit).toHaveLength(n) // only the frontier nodes get "lit"
    expect((await readMazeEnergyState(FAM)).settles).toBe(n + 5) // settles continue past node count
    expect(await db.neuronInstances.count()).toBe(n + 5) // every settle still pulled (二週目)
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
