import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v18 → v19 upgrade (add-neurons-exam-set-mock-mode) is PURELY
 * ADDITIVE: it adds the `mockExamDrafts` store (one in-progress 模擬考試 draft per
 * paper) with NO upgrade callback and NO object-store / pk change on any existing
 * table. Existing data survives; the new table is writable.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed v18
 * state explicitly via `.version(18).stores(`, then reopen at v19 via NeuronsDB.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

// v18 schema (v17 indices + the connectorNeurons table from add-neurons-connector-neuron-family).
const V18_STORES = {
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
  questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt, nextDueAt',
  neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
  instanceNicknames: 'instanceId, updatedAt',
  inventory: 'kind, updatedAt',
  equipment: 'equipmentId, rarity, obtainedAt, updatedAt',
  connectorNeurons: 'pairKey, unlockedAt, updatedAt',
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('Dexie v18 → v19 migration (mockExamDrafts additive table)', () => {
  it('adds mockExamDrafts, preserves existing data, no throw', async () => {
    // 1. Seed a v18 save with data across a few existing tables.
    const dbV18 = new Dexie(DB_NAME)
    dbV18.version(18).stores(V18_STORES)
    await dbV18.open()
    await dbV18.table('neuronVariants').put({
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P3',
      displayName: '多巴胺神經元',
      spriteKey: 'variant:藥理學:1',
      rolledAt: 1001,
      wasPityFloor: false,
      copies: 2,
    })
    await dbV18.table('questionHistory').put({
      questionId: '114-1-醫學一-生理學-Q5',
      family: '生理學',
      lastResult: 'wrong',
      everWrong: true,
      lastAnsweredAt: 5000,
      updatedAt: 5000,
    })
    dbV18.close()

    // 2. Reopen via the REAL NeuronsDB (declares the v19 chain) — throws here if
    //    the bump were an illegal pk change.
    const db = new NeuronsDB()
    await db.open()
    expect(db.verno).toBe(20)

    // 3. Existing data preserved untouched.
    expect(await db.neuronVariants.count()).toBe(1)
    expect((await db.neuronVariants.get(['藥理學', 1]))?.copies).toBe(2)
    expect((await db.questionHistory.get('114-1-醫學一-生理學-Q5'))?.everWrong).toBe(true)

    // 4. The new mockExamDrafts table starts empty and is writable.
    expect(await db.mockExamDrafts.count()).toBe(0)
    await db.mockExamDrafts.put({
      paperKeyHash: '114-1-醫學一',
      year: 114,
      sitting: 1,
      book: '醫學一',
      questionIds: ['a', 'b', 'c'],
      answers: ['A', null, 'B'],
      flaggedIndexes: [1],
      index: 2,
      startedAt: 1000,
      updatedAt: 2000,
    })
    const draft = await db.mockExamDrafts.get('114-1-醫學一')
    expect(draft?.index).toBe(2)
    expect(draft?.answers).toEqual(['A', null, 'B'])

    db.close()
  })
})
