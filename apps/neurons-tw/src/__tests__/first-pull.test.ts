import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type NeuronVariantRow } from '../lib/db'
import {
  grantFirstPullIfNeeded,
  firstPulledFamilies,
  recordFirstPull,
  unionFirstPullFamilies,
  FIRST_PULL_FAMILIES_KEY,
} from '../lib/services/first-pull'
import { pickWalkerVariant } from '../lib/maze/useMaze'
import { backfillFirstPullFamiliesUnion } from '../lib/sync/backfill/first-pull'
import { getRepresentativesRaw } from '../lib/services/representatives'
import { validateBundleMeta, SCHEMA_VERSION } from '../lib/sync/r2/bundles'

const resolve = (id: string): string => id

function seedFamily(familyId: string): Promise<unknown> {
  return db.familyAccrual.put({
    familyId,
    ap: 5,
    firedToday: false,
    lastFireDate: null,
    unlockedSlots: [],
    sameDayCorrect: 0,
    pullCount: 0,
  })
}

const variant = (familyId: string, slotIndex: number, rarity: NeuronVariantRow['rarity'], rolledAt = 1000): NeuronVariantRow => ({
  familyId,
  slotIndex,
  rarity,
  displayName: `${familyId}#${slotIndex}`,
  spriteKey: `variant:${familyId}:${slotIndex}`,
  rolledAt,
  wasPityFloor: false,
  copies: 1,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('per-family first-pull grant (5.1)', () => {
  it('first call grants one guaranteed-P5 + sets representative + records the family', async () => {
    await seedFamily('藥理學')
    const granted = await grantFirstPullIfNeeded('藥理學', resolve)
    expect(granted).toBe(true)

    const rows = await db.neuronVariants.where('familyId').equals('藥理學').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].rarity).toBe('P5')
    expect(rows[0].provenance?.firstPull).toBe(true)

    // Representative set to the minted P5 slot.
    const reps = await getRepresentativesRaw()
    expect(reps['藥理學']).toBe(rows[0].slotIndex)

    // Family recorded in the first-pull set.
    expect((await firstPulledFamilies()).has('藥理學')).toBe(true)
  })

  it('is idempotent — a second answer does not re-grant', async () => {
    await seedFamily('藥理學')
    expect(await grantFirstPullIfNeeded('藥理學', resolve)).toBe(true)
    expect(await grantFirstPullIfNeeded('藥理學', resolve)).toBe(false)
    expect(await db.neuronVariants.where('familyId').equals('藥理學').count()).toBe(1)
  })

  it('already-recorded family is skipped even with no minted variant (fresh-device guard)', async () => {
    await seedFamily('藥理學')
    await recordFirstPull('藥理學') // simulate a synced record with no local mint
    const granted = await grantFirstPullIfNeeded('藥理學', resolve)
    expect(granted).toBe(false)
    expect(await db.neuronVariants.where('familyId').equals('藥理學').count()).toBe(0)
  })
})

describe('pickWalkerVariant representative preference (5.2)', () => {
  it('returns the representative when set and owned', () => {
    const rows = [variant('藥理學', 1, 'P5'), variant('藥理學', 0, 'P0')]
    expect(pickWalkerVariant(rows, 1)?.slotIndex).toBe(1)
  })

  it('falls back to the rarest when no representative is set', () => {
    const rows = [variant('藥理學', 5, 'P5'), variant('藥理學', 0, 'P0')]
    expect(pickWalkerVariant(rows)?.slotIndex).toBe(0) // P0 rarest
  })

  it('falls back to the rarest when the representative slot is not owned', () => {
    const rows = [variant('藥理學', 5, 'P5'), variant('藥理學', 2, 'P2')]
    expect(pickWalkerVariant(rows, 99)?.slotIndex).toBe(2) // P2 rarer than P5
  })

  it('returns null when the family has zero collected variants (→ silhouette)', () => {
    expect(pickWalkerVariant([])).toBeNull()
    expect(pickWalkerVariant([], 1)).toBeNull()
  })
})

describe('firstPullFamilies merge — monotonic union (5.3)', () => {
  it('unions two stored sets (pure helper)', () => {
    const out = unionFirstPullFamilies('["藥理學"]', '["解剖學","生理學"]')
    expect(out).not.toBeNull()
    expect(new Set(JSON.parse(out as string))).toEqual(new Set(['藥理學', '解剖學', '生理學']))
  })

  it('returns null (no write) when incoming adds nothing', () => {
    expect(unionFirstPullFamilies('["藥理學","解剖學"]', '["藥理學"]')).toBeNull()
    expect(unionFirstPullFamilies('["藥理學"]', undefined)).toBeNull()
  })

  it('backfill merges incoming union into local (a fresh device adopts, never re-grants)', async () => {
    await db.meta.put({ key: FIRST_PULL_FAMILIES_KEY, value: '["藥理學"]' })
    const res = await backfillFirstPullFamiliesUnion(db, { [FIRST_PULL_FAMILIES_KEY]: '["解剖學"]' })
    expect(res.updated).toBe(true)
    expect(await firstPulledFamilies()).toEqual(new Set(['藥理學', '解剖學']))
  })
})

describe('bundle cross-version tolerance (5.4)', () => {
  it('v18-reading-v17 preserves local first-pull set (no firstPullFamilies in bundle)', async () => {
    await db.meta.put({ key: FIRST_PULL_FAMILIES_KEY, value: '["藥理學"]' })
    const res = await backfillFirstPullFamiliesUnion(db, {}) // v17 bundle omits the key
    expect(res.updated).toBe(false)
    expect(await firstPulledFamilies()).toEqual(new Set(['藥理學']))
  })

  it('validateBundleMeta tolerates a newer schema_version (forward-compat)', () => {
    expect(() =>
      validateBundleMeta({
        meta: {
          schema_version: SCHEMA_VERSION + 1,
          updated_at: new Date().toISOString(),
          client_id: 'x',
          app_version: '0.4.0',
        },
        data: {},
      }),
    ).not.toThrow()
  })
})
