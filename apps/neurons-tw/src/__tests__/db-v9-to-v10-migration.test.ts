import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v9 → v10 upgrade (rework-neurons-collection-gacha) performs the
 * Collection 2.0 FULL RESET (collection only): clears neuronVariants, resets
 * familyAccrual gacha fields (unlockedSlots / pullCount), inits currency to 0, and
 * PRESERVES study progress (AP / synapses / mastery). Exercises the REAL upgrade
 * callback via NeuronsDB (not a copy).
 *
 * Satisfies the dexie-fixture-lint rule (seeds v(N-1) explicitly via
 * `.version(9).stores(`). Mirror discipline: dexie_pk_change_pitfall.md.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

const V9_STORES = {
  synapses: 'pairKey, lastCoFireDate, state',
  familyAccrual: 'familyId, lastFireDate, firedToday',
  meta: 'key',
  familyMastery: 'familyId',
  neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
  leaderboardProfile: 'user_id, nickname_lower',
  achievements: 'id, unlockedAt',
  dmnCards: 'cardId, obtainedAt, rarity',
  dmnEventLog: 'cardId, dispatchedAt',
  dmnActiveBuffs: '++id, expiresAt, buffKind',
  questionBookmarks: 'questionId, family, addedAt, updatedAt',
  questionBookmarkTombstones: 'questionId, updatedAt',
  questionFlags: 'questionId, easyMarked, guessedMarked, updatedAt',
  questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt',
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('Dexie v9 → v10 migration (Collection 2.0 full reset)', () => {
  it('clears the collection + gacha state, inits currency, preserves study progress', async () => {
    // 1. Seed a v9 save with collected variants (old shape), AP, synapses, mastery.
    const dbV9 = new Dexie(DB_NAME)
    dbV9.version(9).stores(V9_STORES)
    await dbV9.open()

    await dbV9.table('neuronVariants').bulkPut([
      { familyId: '藥理學', slotIndex: 1, rarity: 'P3', displayName: 'x1', spriteKey: 'variant:藥理學:1', rolledAt: 1000, wasPityFloor: false },
      { familyId: '藥理學', slotIndex: 2, rarity: 'P2', displayName: 'x2', spriteKey: 'variant:藥理學:2', rolledAt: 1001, wasPityFloor: false },
    ])
    await dbV9.table('familyAccrual').put({
      familyId: '藥理學',
      ap: 42,
      firedToday: true,
      lastFireDate: '2026-06-01',
      unlockedSlots: [1, 2, 3],
      sameDayCorrect: 5,
    })
    await dbV9.table('synapses').put({
      pairKey: '藥理學|解剖學',
      state: 'weak',
      lastCoFireDate: '2026-06-01',
      createdAt: '2026-05-30',
    })
    await dbV9.table('familyMastery').put({ familyId: '藥理學', correct: 30, total: 40 })
    dbV9.close()

    // 2. Reopen with the REAL NeuronsDB → runs the v10 upgrade callback.
    const real = new NeuronsDB()
    await real.open() // throws if the bump were an illegal pk change

    // 3. Collection wiped + gacha state reset.
    expect(await real.neuronVariants.count()).toBe(0)
    expect((await real.meta.get('neuralEnergyEarned'))?.value).toBe('0')
    expect((await real.meta.get('neuralEnergySpent'))?.value).toBe('0')
    const acc = await real.familyAccrual.get('藥理學')
    expect(acc?.unlockedSlots).toEqual([])
    expect(acc?.pullCount).toBe(0)

    // 4. Study progress preserved.
    expect(acc?.ap).toBe(42)
    const syn = await real.synapses.get('藥理學|解剖學')
    expect(syn?.state).toBe('weak')
    const mastery = await real.familyMastery.get('藥理學')
    expect(mastery?.correct).toBe(30)
    expect(mastery?.total).toBe(40)

    real.close()
  })
})
