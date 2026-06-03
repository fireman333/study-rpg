import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/**
 * Verify Dexie v12 → v13 upgrade (add-neurons-dupe-fusion) EXPANDS each owned
 * slot's `copies` into individual `neuronInstances` rows, preserves study progress
 * + energy, and does not throw (no DatabaseClosedError / pk change).
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md: seed v(N-1)
 * state explicitly, then reopen at v(N) to exercise the upgrade path. The v13
 * upgrade callback is replicated inline here (the same deterministic expansion as
 * apps/neurons-tw/src/lib/db.ts) so the fixture exercises the real migration shape.
 */

const TEST_DB_NAME = 'neurons-rpg-test-v12-to-v13-migration'

const V12_STORES = {
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
}

const V13_STORES = {
  ...V12_STORES,
  neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
}

interface VariantRow {
  familyId: string
  slotIndex: number
  rarity: string
  spriteKey: string
  rolledAt: number
  copies?: number
  provenance?: unknown
}

beforeEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

describe('Dexie v12 → v13 migration (dupe-fusion individuals)', () => {
  it('expands copies into individuals, first inherits provenance, rest 元老', async () => {
    // 1. Open at v12 explicitly (no neuronInstances) and seed rows
    const dbV12 = new Dexie(TEST_DB_NAME)
    dbV12.version(12).stores(V12_STORES)
    await dbV12.open()

    await dbV12.table('neuronVariants').put({
      familyId: '藥理學',
      slotIndex: 2,
      rarity: 'P4',
      displayName: 'X',
      spriteKey: 'variant:藥理學:2',
      rolledAt: 1717070400000,
      wasPityFloor: false,
      copies: 3,
      provenance: {
        bornAtISO: '2026-05-31',
        apAtUnlock: 12,
        wasRedemption: false,
        streakAtMint: 5,
      },
    })
    await dbV12.table('neuronVariants').put({
      familyId: '解剖學',
      slotIndex: 0,
      rarity: 'P0',
      displayName: 'Y',
      spriteKey: 'variant:解剖學:0',
      rolledAt: 1717080400000,
      wasPityFloor: true,
      copies: 1,
    })
    await dbV12.table('meta').put({ key: 'neuralEnergyEarned', value: '140' })
    await dbV12.table('meta').put({ key: 'neuralEnergySpent', value: '60' })
    await dbV12.table('familyAccrual').put({
      familyId: '藥理學',
      ap: 23,
      firedToday: true,
      lastFireDate: '2026-05-31',
      unlockedSlots: [],
      sameDayCorrect: 4,
      pullCount: 7,
    })
    dbV12.close()

    // 2. Reopen with v12 + v13 chain — the expansion upgrade runs
    const dbV13 = new Dexie(TEST_DB_NAME)
    dbV13.version(12).stores(V12_STORES)
    dbV13
      .version(13)
      .stores(V13_STORES)
      .upgrade(async (tx) => {
        const variants = (await tx.table('neuronVariants').toArray()) as VariantRow[]
        const instances: unknown[] = []
        for (const v of variants) {
          const n = Math.max(1, v.copies ?? 1)
          for (let i = 0; i < n; i++) {
            instances.push({
              instanceId: `${v.familyId}:${v.slotIndex}:${v.rolledAt}:m${i}`,
              familyId: v.familyId,
              slotIndex: v.slotIndex,
              rarity: v.rarity,
              spriteKey: v.spriteKey,
              rolledAt: v.rolledAt,
              provenance: i === 0 ? v.provenance : undefined,
              consumedAt: null,
            })
          }
        }
        if (instances.length > 0) await tx.table('neuronInstances').bulkAdd(instances)
      })
    await dbV13.open() // throws if the bump were an illegal pk change

    // 3. copies=3 slot expanded into 3 individuals, only the first has provenance
    const pharm = await dbV13
      .table('neuronInstances')
      .where('familyId')
      .equals('藥理學')
      .toArray()
    expect(pharm).toHaveLength(3)
    expect(pharm.every((r) => (r as { consumedAt: number | null }).consumedAt === null)).toBe(true)
    const withProv = pharm.filter((r) => (r as { provenance?: unknown }).provenance != null)
    expect(withProv).toHaveLength(1)

    // 4. copies=1 slot → exactly 1 individual
    const anat = await dbV13
      .table('neuronInstances')
      .where('familyId')
      .equals('解剖學')
      .toArray()
    expect(anat).toHaveLength(1)

    // 5. Study progress + energy preserved
    expect((await dbV13.table('meta').get('neuralEnergyEarned'))?.value).toBe('140')
    expect((await dbV13.table('meta').get('neuralEnergySpent'))?.value).toBe('60')
    const fam = await dbV13.table('familyAccrual').get('藥理學')
    expect((fam as { ap: number }).ap).toBe(23)
    expect((fam as { pullCount: number }).pullCount).toBe(7)

    // 6. neuronVariants slot rows untouched (copies retained as lifetime count)
    const slotRow = await dbV13.table('neuronVariants').get(['藥理學', 2])
    expect((slotRow as { copies: number }).copies).toBe(3)

    dbV13.close()
  })
})
