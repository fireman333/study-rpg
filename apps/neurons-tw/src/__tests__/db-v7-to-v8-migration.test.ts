import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/**
 * Verify Dexie v7 → v8 upgrade (add-neurons-srs-binary-modifiers) is purely
 * additive: existing tables retain data, the new `questionFlags` table is
 * created empty + accepts writes, no DatabaseClosedError.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md:
 * seed v(N-1) state explicitly, then reopen at v(N) to exercise the upgrade path.
 */

const TEST_DB_NAME = 'neurons-rpg-test-v7-to-v8-migration'

const V7_STORES = {
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
}

beforeEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

describe('Dexie v7 → v8 migration', () => {
  it('preserves v7 data + adds empty questionFlags table', async () => {
    // 1. Open at v7 explicitly (no questionFlags table) and seed rows
    const dbV7 = new Dexie(TEST_DB_NAME)
    dbV7.version(7).stores(V7_STORES)
    await dbV7.open()

    await dbV7.table('familyAccrual').put({
      familyId: '藥理學',
      ap: 23,
      firedToday: true,
      lastFireDate: '2026-05-29',
      unlockedSlots: [1, 2, 3],
      sameDayCorrect: 4,
    })
    await dbV7.table('meta').put({ key: 'saveCreatedDate', value: '2026-05-20' })
    await dbV7.table('questionBookmarks').put({
      questionId: '114-1-醫學一-解剖學-Q1',
      family: '解剖學',
      addedAt: 1717070400000,
      updatedAt: 1717070400000,
    })

    dbV7.close()

    // 2. Reopen with the v7 + v8 chain — additive upgrade runs
    const dbV8 = new Dexie(TEST_DB_NAME)
    dbV8.version(7).stores(V7_STORES)
    dbV8.version(8).stores({
      ...V7_STORES,
      questionFlags: 'questionId, easyMarked, guessedMarked, updatedAt',
    })
    await dbV8.open() // throws if the bump were an illegal pk change

    // 3. Existing data preserved
    const familyRow = await dbV8.table('familyAccrual').get('藥理學')
    expect((familyRow as { ap: number }).ap).toBe(23)
    expect((familyRow as { unlockedSlots: number[] }).unlockedSlots).toEqual([1, 2, 3])
    const bookmark = await dbV8.table('questionBookmarks').get('114-1-醫學一-解剖學-Q1')
    expect((bookmark as { family: string }).family).toBe('解剖學')

    // 4. New table exists, empty, and accepts writes
    expect(await dbV8.table('questionFlags').count()).toBe(0)
    await dbV8.table('questionFlags').put({
      questionId: '114-1-醫學一-解剖學-Q1',
      easyMarked: true,
      guessedMarked: false,
      updatedAt: 1717070500000,
    })
    expect(await dbV8.table('questionFlags').count()).toBe(1)
    const flag = await dbV8.table('questionFlags').get('114-1-醫學一-解剖學-Q1')
    expect((flag as { easyMarked: boolean }).easyMarked).toBe(true)

    dbV8.close()
  })
})
