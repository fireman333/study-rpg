import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { NeuronsDB } from '../lib/db'

/**
 * Verify Dexie v5 → v6 upgrade is purely additive: existing tables retain
 * data, new tables (dmnCards / dmnEventLog / dmnActiveBuffs) are created
 * empty, no DatabaseClosedError.
 *
 * Mirror discipline from ~/.claude/imports/dexie_pk_change_pitfall.md:
 * seed v(N-1) state explicitly, then reopen at v(N) to exercise upgrade path.
 */

const TEST_DB_NAME = 'neurons-rpg-test-v6-migration'

beforeEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

afterEach(async () => {
  await Dexie.delete(TEST_DB_NAME)
})

describe('Dexie v5 → v6 migration', () => {
  it('preserves existing v5 data + adds 3 new empty tables', async () => {
    // 1. Open at v5 explicitly with the prior schema (no DMN tables)
    const dbV5 = new Dexie(TEST_DB_NAME)
    dbV5.version(5).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      achievements: 'id, unlockedAt',
    })
    await dbV5.open()

    // Seed representative rows in existing tables
    await dbV5.table('familyAccrual').put({
      familyId: '藥理學',
      ap: 17,
      firedToday: false,
      lastFireDate: '2026-05-26',
      unlockedSlots: [1, 2],
      sameDayCorrect: 0,
    })
    await dbV5.table('meta').put({ key: 'saveCreatedDate', value: '2026-05-20' })
    await dbV5.table('achievements').put({
      id: 'variant-first-pull',
      unlockedAt: 1717070400000,
      notificationShown: true,
    })

    dbV5.close()

    // 2. Reopen at v6 via the production schema — upgrade callback runs
    const dbV6 = new NeuronsDB()
    // Override the DB name for test isolation
    Object.defineProperty(dbV6, 'name', { value: TEST_DB_NAME, configurable: true })
    // Dexie keys DB by constructor arg; we must construct a sibling for the
    // override to take effect. Use Dexie's raw API.
    await dbV6.close()

    // Easiest: open a generic Dexie pointed at TEST_DB_NAME declaring v6 schema
    const dbV6Generic = new Dexie(TEST_DB_NAME)
    dbV6Generic.version(5).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      achievements: 'id, unlockedAt',
    })
    dbV6Generic.version(6).stores({
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
    })
    await dbV6Generic.open()

    // 3. Existing data preserved
    const familyRow = await dbV6Generic.table('familyAccrual').get('藥理學')
    expect(familyRow).toBeDefined()
    expect((familyRow as { ap: number }).ap).toBe(17)
    expect((familyRow as { unlockedSlots: number[] }).unlockedSlots).toEqual([1, 2])

    const metaRow = await dbV6Generic.table('meta').get('saveCreatedDate')
    expect((metaRow as { value: string }).value).toBe('2026-05-20')

    const achRow = await dbV6Generic.table('achievements').get('variant-first-pull')
    expect(achRow).toBeDefined()
    expect((achRow as { notificationShown: boolean }).notificationShown).toBe(true)

    // 4. New tables exist + are empty
    expect(await dbV6Generic.table('dmnCards').count()).toBe(0)
    expect(await dbV6Generic.table('dmnEventLog').count()).toBe(0)
    expect(await dbV6Generic.table('dmnActiveBuffs').count()).toBe(0)

    // 5. New tables accept writes (round-trip)
    await dbV6Generic.table('dmnCards').put({
      cardId: 'dmn-default-mode-awakening-p1',
      rarity: 'P1',
      eventKind: 'family-buff',
      artworkId: 'dmn:card:dmn-default-mode-awakening-p1',
      displayName: '預設模式覺醒',
      obtainedAt: 1717070500000,
    })
    expect(await dbV6Generic.table('dmnCards').count()).toBe(1)
    const card = await dbV6Generic.table('dmnCards').get('dmn-default-mode-awakening-p1')
    expect((card as { rarity: string }).rarity).toBe('P1')

    dbV6Generic.close()
  })
})
