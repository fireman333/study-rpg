import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v19 → v20 upgrade (add-neurons-exam-set-mock-variants) is
 * PURELY ADDITIVE: it adds the `mockExamVariants` store (mock-exam collection,
 * PK = catalog variantId) with NO upgrade callback and NO object-store / pk change
 * on any existing table. Existing data survives; the new table is writable.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed v19
 * state explicitly via `.version(19).stores(`, then reopen at v20 via NeuronsDB.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

// v19 schema (v18 indices + the mockExamDrafts table from add-neurons-exam-set-mock-mode).
const V19_STORES = {
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
  mockExamDrafts: '&paperKeyHash, updatedAt',
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('Dexie v19 → v20 migration (mockExamVariants additive table)', () => {
  it('adds mockExamVariants, preserves existing data, no throw', async () => {
    // 1. Seed a v19 save with data across a few existing tables.
    const dbV19 = new Dexie(DB_NAME)
    dbV19.version(19).stores(V19_STORES)
    await dbV19.open()
    await dbV19.table('neuronVariants').put({
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P3',
      displayName: '多巴胺神經元',
      spriteKey: 'variant:藥理學:1',
      rolledAt: 1001,
      wasPityFloor: false,
      copies: 2,
    })
    await dbV19.table('mockExamDrafts').put({
      paperKeyHash: '114-1-醫學一',
      year: 114,
      sitting: 1,
      book: '醫學一',
      questionIds: ['a', 'b'],
      answers: ['A', null],
      flaggedIndexes: [],
      index: 0,
      startedAt: 1000,
      updatedAt: 2000,
    })
    dbV19.close()

    // 2. Reopen via the REAL NeuronsDB (declares the v20 chain) — throws here if
    //    the bump were an illegal pk change.
    const db = new NeuronsDB()
    await db.open()
    expect(db.verno).toBe(20)

    // 3. Existing data preserved untouched.
    expect(await db.neuronVariants.count()).toBe(1)
    expect((await db.neuronVariants.get(['藥理學', 1]))?.copies).toBe(2)
    expect((await db.mockExamDrafts.get('114-1-醫學一'))?.index).toBe(0)

    // 4. The new mockExamVariants table starts empty and is writable.
    expect(await db.mockExamVariants.count()).toBe(0)
    await db.mockExamVariants.put({
      variantId: 'vta-dopamine',
      rarity: 'P2',
      displayName: '腹側被蓋區多巴胺神經元',
      spriteKey: 'mock-variant:vta-dopamine',
      copies: 1,
      firstRolledAt: 5000,
      lastRolledAt: 5000,
    })
    const row = await db.mockExamVariants.get('vta-dopamine')
    expect(row?.rarity).toBe('P2')
    expect(row?.copies).toBe(1)

    db.close()
  })
})
