import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  depositConsumable,
  getStock,
  activateConsumable,
  pruneExpiredBuffs,
} from '../lib/services/inventory'

/**
 * add-neurons-acceleration-system §8.3 — backpack deposit (no auto-fire),
 * manual activation (decrement → apply effect), zero-stock no-op, expiry prune.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Seed a family so family-buff activation can pick one.
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

describe('depositConsumable / getStock', () => {
  it('increments stock without firing any effect', async () => {
    await depositConsumable('bolus')
    await depositConsumable('bolus')
    expect(await getStock('bolus')).toBe(2)
    expect(await db.dmnActiveBuffs.count()).toBe(0) // deposit never fires
  })

  it('getStock is 0 for an empty kind', async () => {
    expect(await getStock('surge')).toBe(0)
  })
})

describe('activateConsumable', () => {
  it('spends one unit and applies the effect (bolus → active buff)', async () => {
    await depositConsumable('bolus')
    const res = await activateConsumable('bolus')
    expect(res.ok).toBe(true)
    expect(await getStock('bolus')).toBe(0)
    const buffs = await db.dmnActiveBuffs.toArray()
    expect(buffs.length).toBe(1)
    expect(buffs[0]!.buffKind).toBe('bolus')
  })

  it('family-buff activation inserts a family-scoped buff', async () => {
    await depositConsumable('family-buff')
    const res = await activateConsumable('family-buff')
    expect(res.ok).toBe(true)
    const buff = (await db.dmnActiveBuffs.toArray())[0]
    expect(buff?.buffKind).toBe('family-buff')
    expect(buff?.familyId).toBe('藥理學')
  })

  it('no-op with zero stock (no decrement below 0, no effect)', async () => {
    const res = await activateConsumable('surge')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('no-stock')
    expect(await getStock('surge')).toBe(0)
    expect(await db.dmnActiveBuffs.count()).toBe(0)
  })

  it('keeps the stock row at 0 (not deleted) for LWW continuity', async () => {
    await depositConsumable('surge')
    await activateConsumable('surge')
    const row = await db.inventory.get('surge')
    expect(row).toBeTruthy()
    expect(row?.count).toBe(0)
  })
})

describe('pruneExpiredBuffs', () => {
  it('removes expired buffs but keeps active + the variant-rate-up sentinel', async () => {
    const now = Date.now()
    await db.dmnActiveBuffs.add({ buffKind: 'bolus', familyId: null, expiresAt: now - 1000, payload: null, sourceCardId: 'a' })
    await db.dmnActiveBuffs.add({ buffKind: 'surge', familyId: null, expiresAt: now + 60_000, payload: null, sourceCardId: 'b' })
    await db.dmnActiveBuffs.add({ buffKind: 'variant-rate-up', familyId: null, expiresAt: 32503680000000, payload: null, sourceCardId: 'c' })
    const removed = await pruneExpiredBuffs()
    expect(removed).toBe(1)
    const kinds = (await db.dmnActiveBuffs.toArray()).map((b) => b.buffKind).sort()
    expect(kinds).toEqual(['surge', 'variant-rate-up'])
  })
})
