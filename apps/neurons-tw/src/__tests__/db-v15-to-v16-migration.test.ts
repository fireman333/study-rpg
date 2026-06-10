import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v15 → v16 upgrade (add-neurons-acceleration-system) is
 * ADDITIVE: adds the `inventory` + `equipment` tables, changes NO primary key,
 * does not throw, preserves prior data, and starts the new tables empty
 * (grandfather — no backfill). Exercises the REAL upgrade via NeuronsDB.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed
 * v(N-1) state explicitly via `.version(15).stores(`, then reopen at v(N).
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

const V15_STORES = {
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
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('Dexie v15 → v16 migration (acceleration: inventory + equipment)', () => {
  it('adds the two tables additively, preserves prior data, no throw', async () => {
    // 1. Seed a v15 save with rows across existing tables.
    const dbV15 = new Dexie(DB_NAME)
    dbV15.version(15).stores(V15_STORES)
    await dbV15.open()
    await dbV15.table('dmnCards').put({
      cardId: 'dmn-default-mode-awakening-p1',
      obtainedAt: 1000,
      rarity: 'P1',
      eventKind: 'family-buff',
      artworkId: 'dmn:card:x',
      displayName: '預設模式覺醒',
    })
    // Canary preserved across the chain — use a key the later v17 upgrade does NOT
    // clear (v17 resets the per-branch maze economy keys like maze:da:settles).
    await dbV15.table('meta').put({ key: 'totalStudyMinutes', value: '7' })
    await dbV15.table('neuronVariants').put({
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P3',
      rolledAt: 1001,
    })
    dbV15.close()

    // 2. Reopen via the REAL NeuronsDB (declares the v16 chain) — throws here if
    //    the bump were an illegal pk change.
    const db = new NeuronsDB()
    await db.open()
    expect(db.verno).toBe(20) // NeuronsDB latest chain (v16 migration still ran)

    // 3. Existing rows retained
    expect(await db.dmnCards.get('dmn-default-mode-awakening-p1')).toBeTruthy()
    expect((await db.meta.get('totalStudyMinutes'))?.value).toBe('7')
    expect(await db.neuronVariants.count()).toBe(1)

    // 4. New tables exist + start empty
    expect(await db.inventory.count()).toBe(0)
    expect(await db.equipment.count()).toBe(0)

    // 5. New tables are writable with their declared keys
    await db.inventory.put({ kind: 'family-buff', count: 2, updatedAt: 2000 })
    await db.equipment.put({
      equipmentId: 'eq-oligodendrocyte-companion-p3',
      rarity: 'P3',
      obtainedAt: 2000,
      updatedAt: 2000,
    })
    expect((await db.inventory.get('family-buff'))?.count).toBe(2)
    expect((await db.equipment.get('eq-oligodendrocyte-companion-p3'))?.rarity).toBe('P3')

    db.close()
  })
})
