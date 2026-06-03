import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/**
 * Verify Dexie v8 → v9 upgrade (add-neurons-wrong-questions-subtab) is purely
 * additive: existing tables retain data, the new `questionHistory` table is
 * created empty + accepts writes, no DatabaseClosedError.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md:
 * seed v(N-1) state explicitly, then reopen at v(N) to exercise the upgrade path.
 */

const TEST_DB_NAME = 'neurons-rpg-test-v8-to-v9-migration'

const V8_STORES = {
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
}

beforeEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

describe('Dexie v8 → v9 migration', () => {
  it('preserves v8 data + adds empty questionHistory table', async () => {
    // 1. Open at v8 explicitly (no questionHistory table) and seed rows
    const dbV8 = new Dexie(TEST_DB_NAME)
    dbV8.version(8).stores(V8_STORES)
    await dbV8.open()

    await dbV8.table('familyAccrual').put({
      familyId: '藥理學',
      ap: 23,
      firedToday: true,
      lastFireDate: '2026-05-31',
      unlockedSlots: [1, 2, 3],
      sameDayCorrect: 4,
    })
    await dbV8.table('questionBookmarks').put({
      questionId: '114-1-醫學一-解剖學-Q1',
      family: '解剖學',
      addedAt: 1717070400000,
      updatedAt: 1717070400000,
    })
    await dbV8.table('questionFlags').put({
      questionId: '114-1-醫學一-解剖學-Q1',
      easyMarked: true,
      guessedMarked: false,
      updatedAt: 1717070400000,
    })

    dbV8.close()

    // 2. Reopen with the v8 + v9 chain — additive upgrade runs
    const dbV9 = new Dexie(TEST_DB_NAME)
    dbV9.version(8).stores(V8_STORES)
    dbV9.version(9).stores({
      ...V8_STORES,
      questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt',
    })
    await dbV9.open() // throws if the bump were an illegal pk change

    // 3. Existing data preserved
    const familyRow = await dbV9.table('familyAccrual').get('藥理學')
    expect((familyRow as { ap: number }).ap).toBe(23)
    expect((familyRow as { unlockedSlots: number[] }).unlockedSlots).toEqual([1, 2, 3])
    const bookmark = await dbV9.table('questionBookmarks').get('114-1-醫學一-解剖學-Q1')
    expect((bookmark as { family: string }).family).toBe('解剖學')
    const flag = await dbV9.table('questionFlags').get('114-1-醫學一-解剖學-Q1')
    expect((flag as { easyMarked: boolean }).easyMarked).toBe(true)

    // 4. New table exists, empty, and accepts writes
    expect(await dbV9.table('questionHistory').count()).toBe(0)
    await dbV9.table('questionHistory').put({
      questionId: '114-1-醫學一-解剖學-Q1',
      family: '解剖學',
      lastResult: 'wrong',
      everWrong: true,
      lastAnsweredAt: 1717070500000,
      updatedAt: 1717070500000,
    })
    expect(await dbV9.table('questionHistory').count()).toBe(1)
    const hist = await dbV9.table('questionHistory').get('114-1-醫學一-解剖學-Q1')
    expect((hist as { everWrong: boolean }).everWrong).toBe(true)
    expect((hist as { lastResult: string }).lastResult).toBe('wrong')

    dbV9.close()
  })
})
