import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { DMN_CARD_CATALOG, EQUIPMENT_CATALOG } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { drawDmnCard } from '../lib/services/dmn-fate-card'

/**
 * Verify draw mechanics (add-neurons-acceleration-system): the draw branches to
 * a low-probability permanent equipment vs a consumable (→ backpack deposit, NO
 * auto-fire); consumable pool-removal caps at 22.
 *
 * RNG is injected for determinism: `noEquip` (≥ EQUIPMENT_DRAW_RATE → always a
 * consumable) and `forceEquip` (0 → equipment branch, first P1). Rarity-weight
 * distribution is not asserted (RNG-sensitive); the catalog validators cover it.
 */

const META_KEY_DRAWS = 'dmnDrawsAvailable'

// Never rolls equipment (0.99 ≥ EQUIPMENT_DRAW_RATE); deterministic consumable pick.
const noEquip = (): number => 0.99
// Always rolls equipment (0 < EQUIPMENT_DRAW_RATE), first P1 of the pool.
const forceEquip = (): number => 0

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.familyAccrual.put({
    familyId: '藥理學',
    ap: 0,
    firedToday: false,
    lastFireDate: null,
    unlockedSlots: [],
    sameDayCorrect: 0,
    pullCount: 0,
  })
})

async function setDraws(n: number): Promise<void> {
  await db.meta.put({ key: META_KEY_DRAWS, value: String(n) })
}

describe('drawDmnCard — consumable branch', () => {
  it('returns null when draws available = 0', async () => {
    await setDraws(0)
    expect(await drawDmnCard(noEquip)).toBeNull()
  })

  it('deposits to the backpack (no auto-fire) + decrements draws + inserts dmnCards', async () => {
    await setDraws(3)
    expect(await db.dmnCards.count()).toBe(0)
    const result = await drawDmnCard(noEquip)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('consumable')
    expect(await db.dmnCards.count()).toBe(1)
    expect((await db.meta.get(META_KEY_DRAWS))?.value).toBe('2')
    // Backpack deposit: stock incremented for the drawn kind…
    if (result!.kind === 'consumable') {
      const stock = await db.inventory.get(result!.card.eventKind)
      expect(stock?.count).toBe(1)
    }
    // …and NO effect auto-fired (no active buff inserted on draw).
    expect(await db.dmnActiveBuffs.count()).toBe(0)
  })

  it('never re-draws an already-owned consumable (pool-removal), 22 unique', async () => {
    await setDraws(22)
    const drawnIds = new Set<string>()
    for (let i = 0; i < 22; i += 1) {
      const result = await drawDmnCard(noEquip)
      expect(result).not.toBeNull()
      expect(result!.kind).toBe('consumable')
      if (result!.kind === 'consumable') {
        expect(drawnIds.has(result!.card.cardId)).toBe(false)
        drawnIds.add(result!.card.cardId)
      }
    }
    expect(drawnIds.size).toBe(22)
    expect(await db.dmnCards.count()).toBe(22)
  })

  it('writes a dmnEventLog provenance row per consumable draw', async () => {
    await setDraws(3)
    await drawDmnCard(noEquip)
    await drawDmnCard(noEquip)
    expect(await db.dmnEventLog.count()).toBe(2)
  })

  it('increments dmnLifetimeDrawsConsumed counter', async () => {
    await setDraws(3)
    await drawDmnCard(noEquip)
    await drawDmnCard(noEquip)
    expect((await db.meta.get('dmnLifetimeDrawsConsumed'))?.value).toBe('2')
  })
})

describe('drawDmnCard — equipment branch', () => {
  it('forced rng awards a permanent equipment (no dmnCards / no backpack)', async () => {
    await setDraws(1)
    const result = await drawDmnCard(forceEquip)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('equipment')
    if (result!.kind === 'equipment') {
      expect(result!.def.rarity).toBe(result!.equipment.rarity)
      expect(await db.equipment.get(result!.equipment.equipmentId)).toBeTruthy()
    }
    expect(await db.equipment.count()).toBe(1)
    expect(await db.dmnCards.count()).toBe(0) // equipment is not a consumable card
    expect(await db.inventory.count()).toBe(0) // no backpack deposit for equipment
    expect((await db.meta.get(META_KEY_DRAWS))?.value).toBe('0')
  })

  it('falls back to a consumable when the equipment pool is fully owned', async () => {
    // Own every equipment so the forced-equipment roll has an empty pool.
    const now = Date.now()
    await db.equipment.bulkPut(
      EQUIPMENT_CATALOG.map((e) => ({
        equipmentId: e.equipmentId,
        rarity: e.rarity,
        obtainedAt: now,
        updatedAt: now,
      })),
    )
    await setDraws(1)
    const result = await drawDmnCard(forceEquip)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('consumable')
  })
})

describe('drawDmnCard — both pools complete', () => {
  it('returns null when all consumables AND all equipment are owned', async () => {
    const now = Date.now()
    await db.dmnCards.bulkPut(
      DMN_CARD_CATALOG.map((c) => ({
        cardId: c.cardId,
        rarity: c.rarity,
        eventKind: c.eventKind,
        artworkId: c.artworkId,
        displayName: c.displayName,
        obtainedAt: now,
      })),
    )
    await db.equipment.bulkPut(
      EQUIPMENT_CATALOG.map((e) => ({
        equipmentId: e.equipmentId,
        rarity: e.rarity,
        obtainedAt: now,
        updatedAt: now,
      })),
    )
    await setDraws(5)
    expect(await drawDmnCard(noEquip)).toBeNull()
  })
})
