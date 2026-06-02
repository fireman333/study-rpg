import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v10 → v11 upgrade (rework-neurons-variant-pyramid) performs the
 * pyramid slot-model FULL RESET (collection only): clears neuronVariants, resets
 * familyAccrual gacha fields (unlockedSlots / pullCount → P0 pity restarts), and —
 * UNLIKE the v9 → v10 reset — PRESERVES the neural-energy balance (study-earned
 * progress) plus AP / synapses / mastery. Exercises the REAL upgrade callback via
 * NeuronsDB (not a copy).
 *
 * Satisfies the dexie-fixture-lint rule (seeds v(N-1) explicitly via
 * `.version(10).stores(`). Mirror discipline: dexie_pk_change_pitfall.md.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

const V10_STORES = {
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

describe('Dexie v10 → v11 migration (pyramid full reset)', () => {
  it('clears collection + resets pity, PRESERVES energy balance + study progress', async () => {
    // 1. Seed a v10 save: collected variants, non-zero pullCount, NON-ZERO energy
    //    balance, AP, synapses, mastery.
    const dbV10 = new Dexie(DB_NAME)
    dbV10.version(10).stores(V10_STORES)
    await dbV10.open()

    await dbV10.table('neuronVariants').bulkPut([
      { familyId: '藥理學', slotIndex: 0, rarity: 'P0', displayName: 'p0', spriteKey: 'variant:藥理學:0', rolledAt: 1000, wasPityFloor: false, copies: 1 },
      { familyId: '藥理學', slotIndex: 1, rarity: 'P5', displayName: 'x1', spriteKey: 'variant:藥理學:1', rolledAt: 1001, wasPityFloor: false, copies: 3 },
    ])
    await dbV10.table('familyAccrual').put({
      familyId: '藥理學',
      ap: 42,
      firedToday: true,
      lastFireDate: '2026-06-02',
      unlockedSlots: [1, 2],
      sameDayCorrect: 5,
      pullCount: 17,
    })
    // Study-earned currency — MUST survive the v11 reset (unlike v10).
    await dbV10.table('meta').put({ key: 'neuralEnergyEarned', value: '240' })
    await dbV10.table('meta').put({ key: 'neuralEnergySpent', value: '60' })
    await dbV10.table('synapses').put({
      pairKey: '藥理學|解剖學',
      state: 'strong',
      lastCoFireDate: '2026-06-02',
      createdAt: '2026-05-30',
    })
    await dbV10.table('familyMastery').put({ familyId: '藥理學', correct: 30, total: 40 })
    dbV10.close()

    // 2. Reopen with the REAL NeuronsDB → runs ONLY the v11 upgrade callback.
    const real = new NeuronsDB()
    await real.open() // throws if the bump were an illegal pk change

    // 3. Collection wiped + P0 pity reset.
    expect(await real.neuronVariants.count()).toBe(0)
    const acc = await real.familyAccrual.get('藥理學')
    expect(acc?.unlockedSlots).toEqual([])
    expect(acc?.pullCount).toBe(0)

    // 4. Energy balance PRESERVED (the key difference from the v10 reset).
    expect((await real.meta.get('neuralEnergyEarned'))?.value).toBe('240')
    expect((await real.meta.get('neuralEnergySpent'))?.value).toBe('60')

    // 5. Other study progress preserved.
    expect(acc?.ap).toBe(42)
    const syn = await real.synapses.get('藥理學|解剖學')
    expect(syn?.state).toBe('strong')
    const mastery = await real.familyMastery.get('藥理學')
    expect(mastery?.correct).toBe(30)

    real.close()
  })
})
