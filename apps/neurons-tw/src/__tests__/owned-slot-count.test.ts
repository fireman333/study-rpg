import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type NeuronVariantRow, type NeuronInstanceRow } from '../lib/db'
import { NEURONS_ADAPTERS } from '../lib/sync/tables'
import {
  computeOwnedSlotCount,
  computeOwnedSlotCountByFamily,
  ownedSlotCount,
  ownedSlotCountForFamily,
} from '../lib/services/variant-ownership'
import { buildLeaderboardPayload } from '../lib/services/neurons-leaderboard'
import { buildAchievementStats } from '../lib/services/achievement'
import { buildCharacterCardPayload, loadVariantShareState } from '../lib/services/character-card'

/**
 * Locks the canonical `ownedSlotCount` distinct-owned projection
 * (neuron-variant-fusion spec): a slot counts as owned ONLY when ≥ 1
 * neuronInstances individual is held (`consumedAt == null`). A cross-device
 * fusion ghost slot (neuronVariants row whose every individual is consumed)
 * must NOT inflate the chip / achievement-stat / leaderboard counts.
 * DO NOT revert any of these consumers to a raw `db.neuronVariants` row count.
 */

function variant(familyId: string, slotIndex: number, copies = 1): NeuronVariantRow {
  return {
    familyId,
    slotIndex,
    rarity: 'P4',
    displayName: `${familyId}-${slotIndex}`,
    spriteKey: `variant:${familyId}:${slotIndex}`,
    rolledAt: 1717070400000,
    wasPityFloor: false,
    copies,
  }
}

function inst(
  instanceId: string,
  familyId: string,
  slotIndex: number,
  consumedAt: number | null,
): NeuronInstanceRow {
  return {
    instanceId,
    familyId,
    slotIndex,
    rarity: 'P4',
    spriteKey: `variant:${familyId}:${slotIndex}`,
    rolledAt: 1717070400000,
    consumedAt,
  }
}

describe('computeOwnedSlotCount (pure core)', () => {
  it('0 variants → 0', () => {
    expect(computeOwnedSlotCount([], [])).toBe(0)
  })

  it('1 slot with 1 held individual → 1', () => {
    expect(
      computeOwnedSlotCount(
        [{ familyId: 'a', slotIndex: 1 }],
        [{ familyId: 'a', slotIndex: 1, consumedAt: null }],
      ),
    ).toBe(1)
  })

  it('1 slot with 2 held + 1 consumed → 1 (individual count is irrelevant)', () => {
    expect(
      computeOwnedSlotCount(
        [{ familyId: 'a', slotIndex: 1 }],
        [
          { familyId: 'a', slotIndex: 1, consumedAt: null },
          { familyId: 'a', slotIndex: 1, consumedAt: null },
          { familyId: 'a', slotIndex: 1, consumedAt: 123 },
        ],
      ),
    ).toBe(1)
  })

  it('ghost slot (0 held + 3 consumed) → 0', () => {
    expect(
      computeOwnedSlotCount(
        [{ familyId: 'a', slotIndex: 1 }],
        [
          { familyId: 'a', slotIndex: 1, consumedAt: 1 },
          { familyId: 'a', slotIndex: 1, consumedAt: 2 },
          { familyId: 'a', slotIndex: 1, consumedAt: 3 },
        ],
      ),
    ).toBe(0)
  })

  it('3 slots: A held / B consumed-all / C mixed → 2', () => {
    const variants = [
      { familyId: 'a', slotIndex: 1 },
      { familyId: 'b', slotIndex: 1 },
      { familyId: 'c', slotIndex: 1 },
    ]
    const instances = [
      { familyId: 'a', slotIndex: 1, consumedAt: null }, // A owned
      { familyId: 'b', slotIndex: 1, consumedAt: 1 }, // B ghost
      { familyId: 'b', slotIndex: 1, consumedAt: 2 },
      { familyId: 'c', slotIndex: 1, consumedAt: null }, // C owned (1 held + 1 consumed)
      { familyId: 'c', slotIndex: 1, consumedAt: 3 },
    ]
    expect(computeOwnedSlotCount(variants, instances)).toBe(2)
  })
})

describe('computeOwnedSlotCountByFamily (pure per-family core)', () => {
  it('excludes a family ghost slot (1, not 2) and omits zero-owned families', () => {
    const variants = [
      { familyId: 'a', slotIndex: 1 }, // owned
      { familyId: 'a', slotIndex: 2 }, // ghost (every individual consumed)
      { familyId: 'b', slotIndex: 1 }, // ghost only → family b should be absent
    ]
    const instances = [
      { familyId: 'a', slotIndex: 1, consumedAt: null },
      { familyId: 'a', slotIndex: 2, consumedAt: 1 },
      { familyId: 'b', slotIndex: 1, consumedAt: 2 },
    ]
    const map = computeOwnedSlotCountByFamily(variants, instances)
    expect(map.get('a')).toBe(1) // ghost slot a:2 excluded
    expect(map.get('b') ?? 0).toBe(0) // family b is all-ghost → absent
  })

  it('counts distinct owned slots per family (dupes do not inflate)', () => {
    const variants = [
      { familyId: 'a', slotIndex: 1 },
      { familyId: 'a', slotIndex: 2 },
      { familyId: 'b', slotIndex: 1 },
    ]
    const instances = [
      { familyId: 'a', slotIndex: 1, consumedAt: null },
      { familyId: 'a', slotIndex: 1, consumedAt: null }, // dupe individual, same slot
      { familyId: 'a', slotIndex: 2, consumedAt: null },
      { familyId: 'b', slotIndex: 1, consumedAt: null },
    ]
    const map = computeOwnedSlotCountByFamily(variants, instances)
    expect(map.get('a')).toBe(2) // 2 distinct owned slots, not 3 individuals
    expect(map.get('b')).toBe(1)
  })
})

describe('ownedSlotCount(db) + consumer integration', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    // Seeded state: 2 owned slots (a, b) + 1 ghost slot (whose both individuals
    // were consumed in a cross-device fusion race). Raw row count = 3, owned = 2.
    await db.neuronVariants.bulkPut([
      variant('解剖學', 1),
      variant('生理學', 1),
      variant('藥理學', 2, 2), // ghost slot, copies=2 lifetime
    ])
    await db.neuronInstances.bulkPut([
      inst('a1', '解剖學', 1, null),
      inst('b1', '生理學', 1, null),
      inst('g1', '藥理學', 2, 100), // consumed
      inst('g2', '藥理學', 2, 101), // consumed
    ])
  })

  it('ownedSlotCount(db) excludes the ghost slot (2, not 3)', async () => {
    expect(await db.neuronVariants.count()).toBe(3) // raw rows
    expect(await ownedSlotCount(db)).toBe(2) // owned slots
  })

  it('leaderboard variant_count equals ownedSlotCount, not raw row count', async () => {
    const payload = await buildLeaderboardPayload('tester', true)
    expect(payload.variant_count).toBe(2) // ghost slot excluded, NOT 3
  })

  it('achievement variantCount equals ownedSlotCount, not raw row count', async () => {
    const stats = await buildAchievementStats()
    expect(stats.variantCount).toBe(2) // ghost slot excluded, NOT 3
  })

  it('ownedSlotCountForFamily excludes the family ghost slot (藥理學 → 0)', async () => {
    // 藥理學 has a neuronVariants row (slot 2) but every individual is consumed.
    expect(await db.neuronVariants.where('familyId').equals('藥理學').count()).toBe(1) // raw row
    expect(await ownedSlotCountForFamily(db, '藥理學')).toBe(0) // ghost slot → not owned
    expect(await ownedSlotCountForFamily(db, '解剖學')).toBe(1) // held
    expect(await ownedSlotCountForFamily(db, '生理學')).toBe(1) // held
  })

  it('character-card variantCount equals ownedSlotCount, not raw row count', async () => {
    const payload = await buildCharacterCardPayload()
    expect(payload.variantCount).toBe(2) // ghost slot excluded, NOT 3
  })

  it('variant share-card ownedCount equals ownedSlotCount, not raw row count', async () => {
    const vs = await loadVariantShareState()
    expect(vs.variants.length).toBe(3) // picker still lists every collected row
    expect(vs.ownedCount).toBe(2) // ghost slot excluded from the displayed count
  })
})

describe('cross-device fusion race produces a ghost slot but no inflated count', () => {
  const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'neuronInstances')!

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('both devices consume a different individual → both consumed, copies preserved, ownedSlotCount excludes', async () => {
    // Shared starting state for slot (藥理學, 2): 2 held individuals, copies=2.
    await db.neuronVariants.put(variant('藥理學', 2, 2))
    // Device A's local state after A promote-consumes I1 (keeping I2):
    await db.neuronInstances.bulkPut([
      inst('I1', '藥理學', 2, 500), // A consumed I1
      inst('I2', '藥理學', 2, null), // A still holds I2
    ])
    // Device B's snapshot arrives (B consumed I2, B still holds I1):
    await adapter.apply(db, [
      inst('I1', '藥理學', 2, null), // B holds I1 → monotonic-OR keeps local consumed
      inst('I2', '藥理學', 2, 600), // B consumed I2 → merges to consumed
    ])

    // Both individuals now consumed (the ghost slot).
    expect((await db.neuronInstances.get('I1'))?.consumedAt).not.toBeNull()
    expect((await db.neuronInstances.get('I2'))?.consumedAt).not.toBeNull()
    // Lifetime copies on the neuronVariants row is unchanged (monotonic).
    expect((await db.neuronVariants.get(['藥理學', 2]))?.copies).toBe(2)
    // The canonical projection excludes the ghost slot.
    expect(await ownedSlotCount(db)).toBe(0)
  })
})
