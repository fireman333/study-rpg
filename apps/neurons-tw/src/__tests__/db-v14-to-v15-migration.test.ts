import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/**
 * Verify Dexie v14 → v15 upgrade (add-neurons-quiz-mode-chips-and-srs) is
 * ADDITIVE: questionHistory gains SRS schedule fields + a `nextDueAt` index,
 * changes no PK, does not throw, preserves prior data, AND the upgrade callback
 * backfills currently-wrong rows as immediately-due (correct rows stay
 * unscheduled).
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed
 * v(N-1) state explicitly, then reopen at v(N) to exercise the upgrade path.
 */

const TEST_DB_NAME = 'neurons-rpg-test-v14-to-v15-migration'

const V14_STORES = {
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
  neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
  instanceNicknames: 'instanceId, updatedAt',
}

const V15_STORES = {
  ...V14_STORES,
  questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt, nextDueAt',
}

beforeEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

describe('Dexie v14 → v15 migration (SRS schedule on questionHistory)', () => {
  it('adds SRS fields additively, backfills wrong rows as due, no throw', async () => {
    // 1. Open at v14 explicitly (no SRS fields) and seed a wrong + a correct row
    const dbV14 = new Dexie(TEST_DB_NAME)
    dbV14.version(14).stores(V14_STORES)
    await dbV14.open()
    await dbV14.table('questionHistory').bulkPut([
      { questionId: 'W1', family: '解剖學', lastResult: 'wrong', everWrong: true, lastAnsweredAt: 1000, updatedAt: 1000 },
      { questionId: 'C1', family: '生理學', lastResult: 'correct', everWrong: false, lastAnsweredAt: 1000, updatedAt: 1000 },
    ])
    dbV14.close()

    // 2. Reopen with v14 + v15 chain, replicating the real v15 backfill callback.
    const dbV15 = new Dexie(TEST_DB_NAME)
    dbV15.version(14).stores(V14_STORES)
    dbV15
      .version(15)
      .stores(V15_STORES)
      .upgrade(async (tx) => {
        const now = Date.now()
        await tx
          .table('questionHistory')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.lastResult === 'wrong' && row.nextDueAt == null) {
              row.interval = 3
              row.easeFactor = 2.5
              row.nextDueAt = now
              if (typeof row.attempts !== 'number') row.attempts = 1
              if (typeof row.correctCount !== 'number') row.correctCount = 0
            }
          })
      })
    await dbV15.open() // throws if the bump were an illegal pk change

    // 3. Wrong row backfilled to immediately-due; correct row left unscheduled
    const w = (await dbV15.table('questionHistory').get('W1')) as Record<string, unknown>
    expect(typeof w.nextDueAt).toBe('number')
    expect(w.nextDueAt as number).toBeLessThanOrEqual(Date.now())
    expect(w.interval).toBe(3)
    expect(w.easeFactor).toBe(2.5)
    expect(w.everWrong).toBe(true) // untouched

    const c = (await dbV15.table('questionHistory').get('C1')) as Record<string, unknown>
    expect(c.nextDueAt == null).toBe(true)
    expect(c.lastResult).toBe('correct')

    // 4. New SRS-bearing row is writable + the nextDueAt index queries
    await dbV15.table('questionHistory').put({
      questionId: 'W2', family: '藥理學', lastResult: 'wrong', everWrong: true,
      lastAnsweredAt: 2000, updatedAt: 2000, interval: 1, easeFactor: 2.5, nextDueAt: 5, attempts: 1, correctCount: 0,
    })
    const due = await dbV15.table('questionHistory').where('nextDueAt').belowOrEqual(10).toArray()
    expect(due.map((r) => (r as { questionId: string }).questionId)).toContain('W2')

    dbV15.close()
  })
})
