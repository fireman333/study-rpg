import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { DMN_CARD_CATALOG, EQUIPMENT_CATALOG } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { drawDmnCard } from '../lib/services/dmn-fate-card'
import {
  creditExpeditionDraws,
  migrateDmnGrantsTotal,
  readDmnMeta,
} from '../lib/services/dmn-trigger'
import { SCHEMA_VERSION } from '../lib/sync/r2/bundles'
import { SYNCED_META_KEYS } from '../lib/sync/tables'

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

  it('all-pools-owned null draw does NOT increment dmnLifetimeDrawsConsumed', async () => {
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
    await db.meta.put({ key: 'dmnLifetimeDrawsConsumed', value: '7' })
    await setDraws(5)
    expect(await drawDmnCard(noEquip)).toBeNull()
    expect((await db.meta.get('dmnLifetimeDrawsConsumed'))?.value).toBe('7') // unchanged
  })
})

describe('grants/consumes entitlement projection (fix-neurons-dmn-draw-entitlement-resurrection)', () => {
  it('a consumable consume materializes dmnGrantsTotal (seeded) + increments consumes + re-derives the pool', async () => {
    await setDraws(3) // available=3, no grants/consumes yet
    await drawDmnCard(noEquip)
    // grants seeded = 3 + 0 and materialized; consumes 0→1; derived = 3 − 1 = 2.
    expect((await db.meta.get('dmnGrantsTotal'))?.value).toBe('3')
    expect((await db.meta.get('dmnLifetimeDrawsConsumed'))?.value).toBe('1')
    expect((await db.meta.get('dmnDrawsAvailable'))?.value).toBe('2')
  })

  it('an equipment consume also materializes grants + re-derives the pool', async () => {
    await setDraws(2)
    const r = await drawDmnCard(forceEquip)
    expect(r!.kind).toBe('equipment')
    expect((await db.meta.get('dmnGrantsTotal'))?.value).toBe('2')
    expect((await db.meta.get('dmnLifetimeDrawsConsumed'))?.value).toBe('1')
    expect((await db.meta.get('dmnDrawsAvailable'))?.value).toBe('1')
  })

  it('creditExpeditionDraws increments dmnGrantsTotal and raises the derived pool', async () => {
    const granted = await creditExpeditionDraws(10, 10) // big clear → milestone grant(s)
    expect(granted).toBeGreaterThan(0)
    const meta = await readDmnMeta()
    expect(meta.dmnGrantsTotal).toBe(granted)
    expect(meta.dmnLifetimeDrawsConsumed).toBe(0)
    expect(meta.dmnDrawsAvailable).toBe(granted) // derive(granted, 0)
  })

  it('migrateDmnGrantsTotal seeds grants from available+consumed, leaves the pool unchanged, is idempotent', async () => {
    await db.meta.put({ key: 'dmnDrawsAvailable', value: '11' })
    await db.meta.put({ key: 'dmnLifetimeDrawsConsumed', value: '4' })
    // no dmnGrantsTotal yet
    await migrateDmnGrantsTotal()
    expect((await db.meta.get('dmnGrantsTotal'))?.value).toBe('15') // 11 + 4
    expect((await db.meta.get('dmnDrawsAvailable'))?.value).toBe('11') // unchanged
    // Idempotent: a second run is a no-op even if consumes changed afterward.
    await db.meta.put({ key: 'dmnLifetimeDrawsConsumed', value: '9' })
    await migrateDmnGrantsTotal()
    expect((await db.meta.get('dmnGrantsTotal'))?.value).toBe('15') // not re-seeded
  })
})

describe('schema / synced-key allowlist', () => {
  it('R2 SCHEMA_VERSION is 23 and the allowlist carries both projection counters', () => {
    expect(SCHEMA_VERSION).toBe(23)
    expect(SYNCED_META_KEYS.has('dmnGrantsTotal')).toBe(true)
    expect(SYNCED_META_KEYS.has('dmnLifetimeDrawsConsumed')).toBe(true)
    expect(SYNCED_META_KEYS.has('dmnDrawsAvailable')).toBe(true)
  })
})
