import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v16 → v17 upgrade (redesign-neurons-maze-rotjs-grid) is an
 * ECONOMY RESET ONLY: the upgrade callback clears the 8 retired four-branch maze
 * pool keys (`maze:{da,5ht,gaba,glu}:{earned,settles}`) while PRESERVING all
 * collected variants. No object-store / pk change; the new per-family keys start
 * absent (fresh frontier).
 *
 * (The 4-branch first-pull `starterFamily` keys are retired by
 * add-neurons-first-pull-path-rep — no longer synced or read — so they are not
 * asserted here.)
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed v16
 * state explicitly via `.version(16).stores(`, then reopen at v17 via NeuronsDB.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

const V16_STORES = {
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
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('Dexie v16 → v17 migration (flat-grid maze: per-branch economy reset)', () => {
  it('clears the 8 branch economy keys, preserves collection, no throw', async () => {
    // 1. Seed a v16 save: per-branch maze economy + a collected variant.
    const dbV16 = new Dexie(DB_NAME)
    dbV16.version(16).stores(V16_STORES)
    await dbV16.open()
    for (const b of ['da', '5ht', 'gaba', 'glu']) {
      await dbV16.table('meta').put({ key: `maze:${b}:earned`, value: '120' })
      await dbV16.table('meta').put({ key: `maze:${b}:settles`, value: '5' })
    }
    await dbV16.table('neuronVariants').put({
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P3',
      displayName: '多巴胺神經元',
      spriteKey: 'variant:藥理學:1',
      rolledAt: 1001,
      wasPityFloor: false,
      copies: 2,
    })
    dbV16.close()

    // 2. Reopen via the REAL NeuronsDB (declares the v17 chain) — throws here if
    //    the bump were an illegal pk change.
    const db = new NeuronsDB()
    await db.open()
    expect(db.verno).toBe(20) // NeuronsDB latest chain (the v17 economy-reset still ran)

    // 3. The 8 retired branch economy keys are CLEARED.
    for (const b of ['da', '5ht', 'gaba', 'glu']) {
      expect(await db.meta.get(`maze:${b}:earned`)).toBeUndefined()
      expect(await db.meta.get(`maze:${b}:settles`)).toBeUndefined()
    }

    // 4. Collected variants are PRESERVED.
    expect(await db.neuronVariants.count()).toBe(1)
    const v = await db.neuronVariants.get(['藥理學', 1])
    expect(v?.copies).toBe(2)

    // 6. New per-family keys start absent (fresh per-family frontier).
    expect(await db.meta.get('maze:藥理學:earned')).toBeUndefined()
    expect(await db.meta.get('maze:藥理學:settles')).toBeUndefined()

    // 7. New per-family keys are writable.
    await db.meta.put({ key: 'maze:藥理學:earned', value: '14' })
    expect((await db.meta.get('maze:藥理學:earned'))?.value).toBe('14')

    db.close()
  })
})
