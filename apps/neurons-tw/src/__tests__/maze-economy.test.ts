import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  mazeSpeedMultiplier,
  streakMultiplier,
  walkerFraction,
  accrueMazeSignal,
  reconcileSettles,
  readMazeSignalState,
  collectedDaKeys,
  SIGNAL_PER_NODE,
  CORRECT_SIGNAL,
} from '../lib/maze/economy'
import { pickWalkerVariant } from '../lib/maze/useMaze'
import { MAZE_FAMILIES, MAZE_GRAPH, nodeKey } from '../lib/maze/graph'
import type { NeuronVariantRow } from '../lib/db'

const resolve = (id: string): string => id

function row(familyId: string, slotIndex: number, rarity: NeuronVariantRow['rarity'], rolledAt = 1): NeuronVariantRow {
  return { familyId, slotIndex, rarity, displayName: 'x', spriteKey: 'k', rolledAt, wasPityFloor: false, copies: 1 }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('team speed + streak multipliers', () => {
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

describe('accrueMazeSignal', () => {
  it('adds base × speed multiplier and persists', async () => {
    await accrueMazeSignal(CORRECT_SIGNAL) // empty team → ×1
    expect((await readMazeSignalState()).signal).toBeCloseTo(CORRECT_SIGNAL, 6)
    // collect 5 DA variants → speed buff > 1 → next accrual is larger
    for (let i = 0; i < 5; i++) await db.neuronVariants.put(row(MAZE_FAMILIES[0], i, 'P5'))
    await accrueMazeSignal(CORRECT_SIGNAL)
    const total = (await readMazeSignalState()).signal
    expect(total).toBeGreaterThan(CORRECT_SIGNAL * 2) // second accrual was buffed
  })
})

describe('reconcileSettles', () => {
  it('mints one fogged node per SIGNAL_PER_NODE of accrued signal', async () => {
    await db.meta.put({ key: 'maze:da:signal', value: String(SIGNAL_PER_NODE * 3) })
    const { newlyLit } = await reconcileSettles(resolve)
    expect(newlyLit).toHaveLength(3)
    const collected = await collectedDaKeys()
    expect(collected.size).toBe(3)
    expect((await readMazeSignalState()).settles).toBe(3)
    // every settled node is a real DA maze node
    for (const n of newlyLit) {
      expect(MAZE_GRAPH.nodes.some((m) => nodeKey(m.familyId, m.slotIndex) === nodeKey(n.familyId, n.slotIndex))).toBe(true)
    }
  })

  it('is idempotent — re-running with no new signal mints nothing', async () => {
    await db.meta.put({ key: 'maze:da:signal', value: String(SIGNAL_PER_NODE * 2) })
    await reconcileSettles(resolve)
    const after1 = (await collectedDaKeys()).size
    const { newlyLit } = await reconcileSettles(resolve)
    expect(newlyLit).toHaveLength(0)
    expect((await collectedDaKeys()).size).toBe(after1)
  })

  it('guarantees previously-uncollected slots (never dupes a fogged settle)', async () => {
    // pre-collect one DA node, then settle 2 more — they must be DISTINCT new slots
    await db.neuronVariants.put(row(MAZE_FAMILIES[0], 0, 'P5'))
    await db.meta.put({ key: 'maze:da:signal', value: String(SIGNAL_PER_NODE * 2) })
    const { newlyLit } = await reconcileSettles(resolve)
    expect(newlyLit).toHaveLength(2)
    const keys = newlyLit.map((n) => nodeKey(n.familyId, n.slotIndex))
    expect(new Set(keys).size).toBe(2) // distinct
    expect(keys).not.toContain(nodeKey(MAZE_FAMILIES[0], 0)) // not the pre-collected one
  })

  it('stops settling when all nodes are lit (no infinite mint)', async () => {
    await db.meta.put({ key: 'maze:da:signal', value: String(SIGNAL_PER_NODE * 100) })
    const { newlyLit } = await reconcileSettles(resolve)
    expect(newlyLit.length).toBe(20) // all 20 nodes, no more
    expect((await collectedDaKeys()).size).toBe(20)
    const again = await reconcileSettles(resolve)
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
