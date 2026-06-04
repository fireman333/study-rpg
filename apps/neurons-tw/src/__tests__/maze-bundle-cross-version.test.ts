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
 * promote-maze-to-home Phase 6.2 — R2 bundle v11↔v12 cross-version round-trip
 * for the new per-branch maze energy meta keys (`maze:<branch>:earned` +
 * `maze:<branch>:settles`).
 *
 * The keys ride the existing `meta` adapter (no new store / adapter), so the
 * cross-version contract is:
 *   - v12 → v12: keys snapshot into bundle.data.meta and restore on apply.
 *   - v12 reads v11 (no maze keys): preserve-on-omission — local maze energy
 *     keys are NOT clobbered (the meta adapter only touches incoming rows).
 *   - schema_version > local: forward-compat tolerance (no throw).
 */

const MAZE_KEYS = [
  'maze:da:earned',
  'maze:5ht:earned',
  'maze:gaba:earned',
  'maze:glu:earned',
  'maze:da:settles',
  'maze:5ht:settles',
  'maze:gaba:settles',
  'maze:glu:settles',
]

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Maze per-branch energy bundle cross-version (v11↔v12)', () => {
  it('current SCHEMA_VERSION is 15', () => {
    expect(SCHEMA_VERSION).toBe(15)
  })

  it('v12 round-trip: per-branch earned/settles snapshot into the bundle and restore on apply', async () => {
    await db.meta.put({ key: 'maze:da:earned', value: '137' })
    await db.meta.put({ key: 'maze:da:settles', value: '3' })
    await db.meta.put({ key: 'maze:glu:earned', value: '54' })

    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(15)

    const metaRows = (bundle.data.meta as Array<{ key: string; value: string }>) ?? []
    const byKey = new Map(metaRows.map((r) => [r.key, r.value]))
    expect(byKey.get('maze:da:earned')).toBe('137')
    expect(byKey.get('maze:da:settles')).toBe('3')
    expect(byKey.get('maze:glu:earned')).toBe('54')

    // Clear + re-apply → keys restored (local missing → written).
    await db.delete()
    await db.open()
    expect(await db.meta.get('maze:da:earned')).toBeUndefined()
    await applyBundleSnapshot(db, bundle)
    expect((await db.meta.get('maze:da:earned'))?.value).toBe('137')
    expect((await db.meta.get('maze:da:settles'))?.value).toBe('3')
    expect((await db.meta.get('maze:glu:earned'))?.value).toBe('54')
  })

  it('v12 reads a v11 bundle (no maze energy keys) → local per-branch progress preserved', async () => {
    // Local v12 client already has per-branch maze progress.
    await db.meta.put({ key: 'maze:da:earned', value: '500' })
    await db.meta.put({ key: 'maze:da:settles', value: '5' })

    // A v11 bundle: schema_version 11, a synced meta row but NO maze energy keys.
    const v11Bundle: BundleSnapshot = {
      meta: {
        schema_version: 11,
        updated_at: '2026-06-03T00:00:00Z',
        client_id: 'v11-client',
        app_version: '0.4.0',
      },
      data: {
        meta: [{ key: 'totalStudyMinutes', value: '20' }],
      },
    }
    expect(() => validateBundleMeta(v11Bundle)).not.toThrow()
    await applyBundleSnapshot(db, v11Bundle)

    // The v11 non-maze key applied (local was missing)…
    expect((await db.meta.get('totalStudyMinutes'))?.value).toBe('20')
    // …and the local maze energy progress is untouched (preserve-on-omission).
    expect((await db.meta.get('maze:da:earned'))?.value).toBe('500')
    expect((await db.meta.get('maze:da:settles'))?.value).toBe('5')
  })

  it('all eight per-branch keys are in the synced snapshot allowlist', async () => {
    for (const k of MAZE_KEYS) await db.meta.put({ key: k, value: '1' })
    const bundle = await buildBundleSnapshot(db)
    const keys = new Set((bundle.data.meta as Array<{ key: string }>).map((r) => r.key))
    for (const k of MAZE_KEYS) expect(keys.has(k)).toBe(true)
  })
})
