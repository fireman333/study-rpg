import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { applyConsumableEffect } from '../lib/services/dmn-event-dispatcher'

/**
 * Verify the consumable effect applier (activation path) + the dmnEventLog sync
 * adapter monotonic-union semantics (spec Req "DMN event log SHALL use
 * monotonic-union merge for cross-device sync"). The applier itself is NOT
 * idempotent by cardId — activation is gated by the backpack stock decrement
 * (add-neurons-acceleration-system); each activation deliberately spawns its
 * effect.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Seed families so family-buff activation has something to pick.
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

describe('applyConsumableEffect', () => {
  it('bolus: inserts a timed active buff row', async () => {
    await applyConsumableEffect('bolus', 'activate:bolus:1')
    const buffs = await db.dmnActiveBuffs.toArray()
    expect(buffs.length).toBe(1)
    expect(buffs[0]!.buffKind).toBe('bolus')
    expect(buffs[0]!.expiresAt).toBeGreaterThan(Date.now())
  })

  it('family-buff: inserts active buff row with a random familyId', async () => {
    await applyConsumableEffect('family-buff', 'activate:family-buff:1')
    const buffs = await db.dmnActiveBuffs.toArray()
    expect(buffs.length).toBe(1)
    expect(buffs[0]!.buffKind).toBe('family-buff')
    expect(buffs[0]!.familyId).toBe('藥理學')
    expect(buffs[0]!.expiresAt).toBeGreaterThan(Date.now())
  })

  it('is NOT cardId-idempotent — two activations spawn two buffs', async () => {
    await applyConsumableEffect('bolus', 'activate:bolus:1')
    await applyConsumableEffect('bolus', 'activate:bolus:2')
    expect(await db.dmnActiveBuffs.count()).toBe(2)
  })
})

describe('dmnEventLog monotonic-union sync semantics', () => {
  it('Adapter merge preserves entries from both devices (union)', async () => {
    const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
    const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'dmnEventLog')!
    expect(adapter).toBeDefined()

    // Local has X, Y; remote bundle has Y, Z. After apply both devices should
    // converge to {X, Y, Z}.
    await db.dmnEventLog.bulkPut([
      { cardId: 'X', dispatchedAt: 1000, deviceId: 'local' },
      { cardId: 'Y', dispatchedAt: 1500, deviceId: 'local' },
    ])
    const incoming = [
      { cardId: 'Y', dispatchedAt: 2000, deviceId: 'remote' },
      { cardId: 'Z', dispatchedAt: 2500, deviceId: 'remote' },
    ]
    const result = await adapter.apply(db, incoming)
    expect(result.applied + result.skipped).toBe(2)

    const final = await db.dmnEventLog.toArray()
    const ids = new Set(final.map((r) => r.cardId))
    expect(ids).toEqual(new Set(['X', 'Y', 'Z']))

    // Y should keep its EARLIER dispatchedAt (local's 1500 < remote's 2000)
    const y = await db.dmnEventLog.get('Y')
    expect(y?.dispatchedAt).toBe(1500)
  })

  it('Y dispatchedAt updates to earlier when remote earlier wins', async () => {
    const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
    const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'dmnEventLog')!
    await db.dmnEventLog.put({ cardId: 'Y', dispatchedAt: 5000, deviceId: 'local' })
    await adapter.apply(db, [{ cardId: 'Y', dispatchedAt: 1000, deviceId: 'remote' }])
    const y = await db.dmnEventLog.get('Y')
    expect(y?.dispatchedAt).toBe(1000)
  })
})
