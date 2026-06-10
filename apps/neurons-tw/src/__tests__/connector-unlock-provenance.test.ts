import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { connectorPairKey, connectorFamilies } from '@study-rpg/content-neurons-tw'
import { NeuronsDB, db } from '../lib/db'
import { unlockConnector } from '../lib/services/connector'
import { NEURONS_ADAPTERS } from '../lib/sync/tables'

/**
 * Locks the connector `unlockSource` provenance contract
 * (clarify-connector-backfill-legacy-semantics): forward unlocks + post-epoch
 * backfills stamp `'validated'`; pre-epoch 早期連線 backfills stamp
 * `'legacy-backfill'`; a re-strengthen never overwrites an existing provenance;
 * a pre-change row with no `unlockSource` is tolerated as `unknown` on read + sync.
 *
 * Epoch = CONNECTOME_CONDUCTION_EPOCH ('2026-06-08'); legacy = lastCoFireDate < epoch.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

const V17_STORES = {
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

const LEGACY_PAIR = connectorPairKey('解剖學', '生理學') // pre-epoch → legacy-backfill
const POST_EPOCH_PAIR = connectorPairKey('生物化學', '藥理學') // post-epoch → validated
const FWD_PAIR = connectorPairKey('組織學', '病理學')

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})
afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('connector unlock provenance — forward path', () => {
  it('unlockConnector stamps unlockSource = validated', async () => {
    await db.open()
    const fresh = await unlockConnector(FWD_PAIR)
    expect(fresh).toBe(true)
    expect((await db.connectorNeurons.get(FWD_PAIR))?.unlockSource).toBe('validated')
    db.close()
  })

  it('re-strengthen does NOT overwrite an existing legacy-backfill provenance', async () => {
    await db.open()
    const [familyA, familyB] = connectorFamilies(FWD_PAIR)
    await db.connectorNeurons.put({
      pairKey: FWD_PAIR, familyA, familyB,
      unlockedAt: 1000, updatedAt: 1000, unlockSource: 'legacy-backfill',
    })
    const fresh = await unlockConnector(FWD_PAIR) // idempotent no-op
    expect(fresh).toBe(false)
    const row = await db.connectorNeurons.get(FWD_PAIR)
    expect(row?.unlockSource).toBe('legacy-backfill') // NOT overwritten to 'validated'
    expect(row?.unlockedAt).toBe(1000) // original instant preserved
    db.close()
  })
})

describe('connector unlock provenance — backfill (v17 → v18)', () => {
  it('pre-epoch strong wire stamps legacy-backfill; post-epoch stamps validated', async () => {
    const dbV17 = new Dexie(DB_NAME)
    dbV17.version(17).stores(V17_STORES)
    await dbV17.open()
    await dbV17.table('synapses').bulkPut([
      { pairKey: LEGACY_PAIR, state: 'strong', lastCoFireDate: '2026-05-20', createdAt: '2026-05-10' },
      { pairKey: POST_EPOCH_PAIR, state: 'strong', lastCoFireDate: '2026-06-10', createdAt: '2026-06-09' },
    ])
    dbV17.close()

    const migrated = new NeuronsDB()
    await migrated.open()
    expect(migrated.verno).toBe(19)

    expect((await migrated.connectorNeurons.get(LEGACY_PAIR))?.unlockSource).toBe('legacy-backfill')
    expect((await migrated.connectorNeurons.get(POST_EPOCH_PAIR))?.unlockSource).toBe('validated')
    migrated.close()
  })
})

describe('connector unlock provenance — pre-change row tolerance', () => {
  it('a row with no unlockSource is preserved on read and sync round-trip', async () => {
    await db.open()
    const adapter = NEURONS_ADAPTERS.find((a) => a.name === 'connectorNeurons')!
    const [familyA, familyB] = connectorFamilies(LEGACY_PAIR)
    // Incoming bundle row from a pre-change client: no unlockSource field.
    await adapter.apply(db, [{ pairKey: LEGACY_PAIR, familyA, familyB, unlockedAt: 500, updatedAt: 500 }])
    const row = await db.connectorNeurons.get(LEGACY_PAIR)
    expect(row).toBeDefined()
    expect(row?.unlockSource).toBeUndefined() // tolerated as unknown, not crashed / backfilled
    expect(row?.unlockedAt).toBe(500)
    db.close()
  })
})
