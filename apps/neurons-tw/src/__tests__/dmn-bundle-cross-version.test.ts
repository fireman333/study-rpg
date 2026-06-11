import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  validateBundleMeta,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

/**
 * Spec Req: "v1 client reads v2 bundle without throwing" +
 *          "v2 client reads v1 bundle and uses defaults for missing dmn-* fields"
 *
 * Tests cover the validateBundleMeta tolerance + applyBundleSnapshot key
 * iteration (silently drops unknown adapter names).
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Bundle schema_version validation', () => {
  it('current SCHEMA_VERSION is 22', () => {
    expect(SCHEMA_VERSION).toBe(22)
  })

  it('schema_version < 1 throws invalid_schema_version', () => {
    const bad = { meta: { schema_version: 0, updated_at: '2026-05-27T00:00:00Z', client_id: 'c', app_version: '0.4.0' }, data: {} }
    expect(() => validateBundleMeta(bad)).toThrow('invalid_schema_version')
  })

  it('schema_version > SCHEMA_VERSION does NOT throw (forward-compat tolerance)', () => {
    const future = {
      meta: { schema_version: 99, updated_at: '2026-05-27T00:00:00Z', client_id: 'c', app_version: '0.4.0' },
      data: {},
    }
    expect(() => validateBundleMeta(future)).not.toThrow()
  })

  it('schema_version === SCHEMA_VERSION passes silently', () => {
    const current = {
      meta: { schema_version: SCHEMA_VERSION, updated_at: '2026-05-27T00:00:00Z', client_id: 'c', app_version: '0.4.0' },
      data: {},
    }
    expect(() => validateBundleMeta(current)).not.toThrow()
  })
})

describe('Cross-version round-trip', () => {
  it('v2 client reads v1 bundle (no dmn-* keys) → preserve-on-omission', async () => {
    // Simulate a v1 bundle: schema_version=1, only v1 adapter keys present.
    const v1Bundle: BundleSnapshot = {
      meta: {
        schema_version: 1,
        updated_at: '2026-05-25T00:00:00Z',
        client_id: 'v1-client',
        app_version: '0.3.0',
      },
      data: {
        synapses: [],
        familyAccrual: [
          {
            familyId: '藥理學',
            ap: 42,
            firedToday: false,
            lastFireDate: '2026-05-25',
            unlockedSlots: [1, 2],
            sameDayCorrect: 0,
          },
        ],
        familyMastery: [],
        neuronVariants: [],
        achievements: [],
        leaderboardProfile: [],
        meta: [],
        // dmnCards / dmnEventLog / dmnActiveBuffs intentionally absent
      },
    }
    expect(() => validateBundleMeta(v1Bundle)).not.toThrow()

    const result = await applyBundleSnapshot(db, v1Bundle)
    expect(result.applied).toBeGreaterThan(0)

    // v1 data applied
    const family = await db.familyAccrual.get('藥理學')
    expect(family?.ap).toBe(42)

    // dmn-* tables remain empty (preserve-on-omission)
    expect(await db.dmnCards.count()).toBe(0)
    expect(await db.dmnEventLog.count()).toBe(0)
    expect(await db.dmnActiveBuffs.count()).toBe(0)
  })

  it('v2 → v2 round-trip with dmn-* fields populated', async () => {
    // Seed local state with dmn-* fields, build bundle, clear, re-apply.
    await db.dmnCards.put({
      cardId: 'dmn-default-mode-awakening-p1',
      rarity: 'P1',
      eventKind: 'family-buff',
      artworkId: 'dmn:card:dmn-default-mode-awakening-p1',
      displayName: '預設模式覺醒',
      obtainedAt: 1_700_000_000_000,
    })
    await db.dmnEventLog.put({
      cardId: 'dmn-default-mode-awakening-p1',
      dispatchedAt: 1_700_000_000_000,
      deviceId: 'device-a',
    })
    // Note: dmnActiveBuffs filter drops expired rows — use future expiresAt
    await db.dmnActiveBuffs.add({
      buffKind: 'family-buff',
      familyId: '藥理學',
      expiresAt: Date.now() + 60 * 60 * 1000,
      payload: null,
      sourceCardId: 'dmn-default-mode-awakening-p1',
    })

    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(SCHEMA_VERSION)
    expect(bundle.data.dmnCards).toBeDefined()
    expect((bundle.data.dmnCards as unknown[]).length).toBe(1)
    expect((bundle.data.dmnEventLog as unknown[]).length).toBe(1)
    expect((bundle.data.dmnActiveBuffs as unknown[]).length).toBe(1)

    // Clear DB and re-apply — round-trip should restore the dmn-* state.
    await db.delete()
    await db.open()

    expect(await db.dmnCards.count()).toBe(0)
    await applyBundleSnapshot(db, bundle)
    expect(await db.dmnCards.count()).toBe(1)
    expect(await db.dmnEventLog.count()).toBe(1)
    expect(await db.dmnActiveBuffs.count()).toBe(1)
  })

  it('v1 client (simulated: bundle with extra unknown keys) → unknown keys silently dropped', async () => {
    // Build a future v3 bundle with extra mystery-future-adapter key
    const v3Bundle: BundleSnapshot = {
      meta: {
        schema_version: 99,
        updated_at: '2027-01-01T00:00:00Z',
        client_id: 'future-client',
        app_version: '99.0.0',
      },
      data: {
        synapses: [],
        familyAccrual: [],
        familyMastery: [],
        neuronVariants: [],
        achievements: [],
        leaderboardProfile: [],
        meta: [],
        dmnCards: [],
        dmnEventLog: [],
        dmnActiveBuffs: [],
        mysteryFutureFeature: [{ foo: 'bar' }], // unknown to current client
      },
    }
    // Must not throw — forward-compat tolerance + applyBundleSnapshot iterates
    // local adapters only (mysteryFutureFeature key is silently dropped).
    expect(() => validateBundleMeta(v3Bundle)).not.toThrow()
    await expect(applyBundleSnapshot(db, v3Bundle)).resolves.toBeDefined()
  })
})
