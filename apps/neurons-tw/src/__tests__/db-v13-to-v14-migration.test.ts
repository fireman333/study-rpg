import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/**
 * Verify Dexie v13 → v14 upgrade (add-neurons-instance-rename) is ADDITIVE: it
 * adds a single new `instanceNicknames` store, changes no existing store's PK,
 * does not throw (no DatabaseClosedError / pk change), and preserves prior data.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed v(N-1)
 * state explicitly, then reopen at v(N) to exercise the upgrade path.
 */

const TEST_DB_NAME = 'neurons-rpg-test-v13-to-v14-migration'

const V13_STORES = {
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
}

const V14_STORES = {
  ...V13_STORES,
  instanceNicknames: 'instanceId, updatedAt',
}

beforeEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

describe('Dexie v13 → v14 migration (instance nicknames)', () => {
  it('adds instanceNicknames additively, no throw, prior data intact', async () => {
    // 1. Open at v13 explicitly (no instanceNicknames) and seed rows
    const dbV13 = new Dexie(TEST_DB_NAME)
    dbV13.version(13).stores(V13_STORES)
    await dbV13.open()

    await dbV13.table('neuronInstances').put({
      instanceId: 'GABA-pv:3:1717070400000:m0',
      familyId: 'GABA-pv',
      slotIndex: 3,
      rarity: 'P2',
      spriteKey: 'variant:GABA-pv:3',
      rolledAt: 1717070400000,
      consumedAt: null,
    })
    await dbV13.table('meta').put({ key: 'promoteCount', value: '4' })
    await dbV13.table('neuronVariants').put({
      familyId: 'GABA-pv',
      slotIndex: 3,
      rarity: 'P2',
      displayName: 'X · 共振核心',
      spriteKey: 'variant:GABA-pv:3',
      rolledAt: 1717070400000,
      wasPityFloor: false,
      copies: 1,
    })
    dbV13.close()

    // 2. Reopen with v13 + v14 chain — additive upgrade runs (no callback needed)
    const dbV14 = new Dexie(TEST_DB_NAME)
    dbV14.version(13).stores(V13_STORES)
    dbV14.version(14).stores(V14_STORES)
    await dbV14.open() // throws if the bump were an illegal pk change

    // 3. New instanceNicknames store exists, starts empty, and is writable
    expect(await dbV14.table('instanceNicknames').count()).toBe(0)
    await dbV14.table('instanceNicknames').put({
      instanceId: 'GABA-pv:3:1717070400000:m0',
      nickname: '小藍',
      updatedAt: 1717080000000,
    })
    const nick = await dbV14.table('instanceNicknames').get('GABA-pv:3:1717070400000:m0')
    expect((nick as { nickname: string }).nickname).toBe('小藍')

    // 4. Prior data intact (instance + meta + variant slot)
    const inst = await dbV14.table('neuronInstances').get('GABA-pv:3:1717070400000:m0')
    expect((inst as { consumedAt: number | null }).consumedAt).toBe(null)
    expect((await dbV14.table('meta').get('promoteCount'))?.value).toBe('4')
    const slot = await dbV14.table('neuronVariants').get(['GABA-pv', 3])
    expect((slot as { copies: number }).copies).toBe(1)

    dbV14.close()
  })
})
