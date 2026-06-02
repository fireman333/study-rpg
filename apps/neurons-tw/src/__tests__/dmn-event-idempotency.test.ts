import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { dispatchDmnEvent } from '../lib/services/dmn-event-dispatcher'
import type { DmnCardRow } from '@study-rpg/content-neurons-tw'

/**
 * Verify dispatcher idempotency + sync adapter monotonic-union semantics for
 * dmnEventLog (spec Req "DMN event log SHALL be idempotent and use
 * monotonic-union merge for cross-device sync").
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
  // Seed families so family-buff dispatch has something to pick.
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

const cardA: DmnCardRow = {
  cardId: 'dmn-pcc-pulse-p2',
  rarity: 'P2',
  eventKind: 'streak-shield',
  artworkId: 'dmn:card:dmn-pcc-pulse-p2',
  displayName: '後扣帶皮層脈動',
  obtainedAt: 1_700_000_000_000,
}

describe('dispatchDmnEvent idempotency', () => {
  it('streak-shield: dispatch flips meta to true', async () => {
    await dispatchDmnEvent(cardA)
    const meta = await db.meta.get('dmnStreakShieldAvailable')
    expect(meta?.value).toBe('true')
  })

  it('duplicate dispatch (after log row exists with earlier timestamp) is no-op', async () => {
    // Simulate sync round-trip: log row arrived first via bundle apply
    await db.dmnEventLog.put({
      cardId: cardA.cardId,
      dispatchedAt: cardA.obtainedAt - 1000,
      deviceId: 'remote-device',
    })
    // Now the dispatcher is called with the same cardId (e.g., sync re-applied)
    await dispatchDmnEvent(cardA)
    // Streak shield should NOT be set — dispatcher saw the prior log row
    // with earlier dispatchedAt and short-circuited.
    const meta = await db.meta.get('dmnStreakShieldAvailable')
    expect(meta).toBeUndefined()
  })

  it('family-buff: inserts active buff row with random familyId', async () => {
    const card: DmnCardRow = { ...cardA, cardId: 'dmn-mpfc-reverberation-p2', eventKind: 'family-buff' }
    await dispatchDmnEvent(card)
    const buffs = await db.dmnActiveBuffs.toArray()
    expect(buffs.length).toBe(1)
    expect(buffs[0]!.buffKind).toBe('family-buff')
    expect(buffs[0]!.familyId).toBe('藥理學')
    expect(buffs[0]!.expiresAt).toBeGreaterThan(Date.now())
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
