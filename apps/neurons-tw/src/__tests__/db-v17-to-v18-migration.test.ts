import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { connectorPairKey, connectorFamilies } from '@study-rpg/content-neurons-tw'
import { NeuronsDB } from '../lib/db'

/**
 * Verify the Dexie v17 → v18 upgrade (add-neurons-connector-neuron-family) is an
 * ADDITIVE TABLE + RETROACTIVE BACKFILL: it adds the `connectorNeurons` store and
 * the upgrade callback unlocks a connector for every wire currently in the `strong`
 * state (INCLUDING legacy 早期連線), while leaving non-strong wires and all other
 * data untouched. No object-store / pk change on any existing table.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed v17
 * state explicitly via `.version(17).stores(`, then reopen at v18 via NeuronsDB.
 */

const DB_NAME = 'neurons-rpg' // NeuronsDB hardcodes this name

// v17 schema (identical indices to v16 — v17 was an economy-reset-only upgrade).
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

const STRONG_PAIR = connectorPairKey('生物化學', '藥理學') // recent strong → backfill
const LEGACY_STRONG_PAIR = connectorPairKey('解剖學', '生理學') // old-date strong → still backfill
const WEAK_PAIR = connectorPairKey('組織學', '病理學') // weak → no connector
const DORMANT_PAIR = connectorPairKey('免疫學', '微生物學') // dormant → no connector

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(DB_NAME)
})

describe('Dexie v17 → v18 migration (connector backfill)', () => {
  it('backfills connectors for strong wires only (incl. legacy), preserves data, no throw', async () => {
    // 1. Seed a v17 save: 2 strong wires (one recent, one legacy) + 1 weak + 1
    //    dormant, plus a collected variant to assert preservation.
    const dbV17 = new Dexie(DB_NAME)
    dbV17.version(17).stores(V17_STORES)
    await dbV17.open()
    await dbV17.table('synapses').bulkPut([
      { pairKey: STRONG_PAIR, state: 'strong', lastCoFireDate: '2026-06-05', createdAt: '2026-06-01' },
      { pairKey: LEGACY_STRONG_PAIR, state: 'strong', lastCoFireDate: '2026-05-20', createdAt: '2026-05-10' },
      { pairKey: WEAK_PAIR, state: 'weak', lastCoFireDate: '2026-06-05', createdAt: '2026-06-01' },
      { pairKey: DORMANT_PAIR, state: 'dormant', lastCoFireDate: '2026-06-05', createdAt: '2026-06-01' },
    ])
    await dbV17.table('neuronVariants').put({
      familyId: '藥理學',
      slotIndex: 1,
      rarity: 'P3',
      displayName: '多巴胺神經元',
      spriteKey: 'variant:藥理學:1',
      rolledAt: 1001,
      wasPityFloor: false,
      copies: 2,
    })
    dbV17.close()

    // 2. Reopen via the REAL NeuronsDB (declares the v18 chain) — throws here if
    //    the bump were an illegal pk change.
    const db = new NeuronsDB()
    await db.open()
    expect(db.verno).toBe(18)

    // 3. Exactly the 2 strong wires (recent + legacy) backfilled their connectors.
    expect(await db.connectorNeurons.count()).toBe(2)

    const strong = await db.connectorNeurons.get(STRONG_PAIR)
    expect(strong).toBeDefined()
    // Deterministic unlockedAt = the wire's lastCoFireDate parsed to ms.
    expect(strong?.unlockedAt).toBe(Date.parse('2026-06-05'))
    const [fa, fb] = connectorFamilies(STRONG_PAIR)
    expect(strong?.familyA).toBe(fa)
    expect(strong?.familyB).toBe(fb)

    // Legacy strong wire (old date) STILL unlocks — connectors are decoupled from
    // the validated-since-epoch narrative stat.
    const legacy = await db.connectorNeurons.get(LEGACY_STRONG_PAIR)
    expect(legacy).toBeDefined()
    expect(legacy?.unlockedAt).toBe(Date.parse('2026-05-20'))

    // 4. Non-strong wires did NOT unlock.
    expect(await db.connectorNeurons.get(WEAK_PAIR)).toBeUndefined()
    expect(await db.connectorNeurons.get(DORMANT_PAIR)).toBeUndefined()

    // 5. Existing data preserved (collection untouched).
    expect(await db.neuronVariants.count()).toBe(1)
    expect((await db.neuronVariants.get(['藥理學', 1]))?.copies).toBe(2)

    // 6. The new table is writable (live unlock path).
    await db.connectorNeurons.put({
      pairKey: WEAK_PAIR,
      familyA: connectorFamilies(WEAK_PAIR)[0],
      familyB: connectorFamilies(WEAK_PAIR)[1],
      unlockedAt: 2000,
      updatedAt: 2000,
    })
    expect((await db.connectorNeurons.get(WEAK_PAIR))?.unlockedAt).toBe(2000)

    db.close()
  })
})
