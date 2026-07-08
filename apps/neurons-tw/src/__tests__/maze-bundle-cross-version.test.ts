import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  validateBundleMeta,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

/**
 * redesign-neurons-maze-rotjs-grid — R2 bundle v16↔v17 cross-version round-trip
 * for the new per-FAMILY maze energy meta keys (`maze:<familyId>:earned` +
 * `maze:<familyId>:settles`), replacing the 8 retired per-branch keys.
 *
 * The keys ride the existing `meta` adapter (no new store / adapter), so the
 * cross-version contract is:
 *   - v17 → v17: per-family keys snapshot into bundle.data.meta and restore.
 *   - v17 reads v16 (no per-family keys; maybe stale branch keys): per-family
 *     local progress preserved (preserve-on-omission); stale branch keys in the
 *     incoming bundle are dropped (not in the allowlist) → fresh per-family maze.
 *   - schema_version > local: forward-compat tolerance (no throw).
 */

const FAM = FAMILY_IDS[0]
const FAM2 = FAMILY_IDS[7]
const PER_FAMILY_KEYS = FAMILY_IDS.flatMap((f) => [`maze:${f}:earned`, `maze:${f}:settles`])

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Maze per-family energy bundle cross-version (v16↔v17)', () => {
  it('current SCHEMA_VERSION is 27', () => {
    expect(SCHEMA_VERSION).toBe(27)
  })

  it('v17 round-trip: per-family earned/settles snapshot into the bundle and restore on apply', async () => {
    await db.meta.put({ key: `maze:${FAM}:earned`, value: '137' })
    await db.meta.put({ key: `maze:${FAM}:settles`, value: '3' })
    await db.meta.put({ key: `maze:${FAM2}:earned`, value: '54' })

    const bundle = await buildBundleSnapshot(db)
    expect(bundle.meta.schema_version).toBe(27)

    const metaRows = (bundle.data.meta as Array<{ key: string; value: string }>) ?? []
    const byKey = new Map(metaRows.map((r) => [r.key, r.value]))
    expect(byKey.get(`maze:${FAM}:earned`)).toBe('137')
    expect(byKey.get(`maze:${FAM}:settles`)).toBe('3')
    expect(byKey.get(`maze:${FAM2}:earned`)).toBe('54')

    await db.delete()
    await db.open()
    expect(await db.meta.get(`maze:${FAM}:earned`)).toBeUndefined()
    await applyBundleSnapshot(db, bundle)
    expect((await db.meta.get(`maze:${FAM}:earned`))?.value).toBe('137')
    expect((await db.meta.get(`maze:${FAM}:settles`))?.value).toBe('3')
    expect((await db.meta.get(`maze:${FAM2}:earned`))?.value).toBe('54')
  })

  it('v17 reads a v16 bundle (no per-family keys, stale branch keys) → local preserved, branch keys dropped', async () => {
    // Local v17 client already has per-family maze progress.
    await db.meta.put({ key: `maze:${FAM}:earned`, value: '500' })
    await db.meta.put({ key: `maze:${FAM}:settles`, value: '5' })

    // A v16 bundle: schema_version 16, a synced meta row + retired branch keys.
    const v16Bundle: BundleSnapshot = {
      meta: {
        schema_version: 16,
        updated_at: '2026-06-04T00:00:00Z',
        client_id: 'v16-client',
        app_version: '0.4.0',
      },
      data: {
        meta: [
          { key: 'totalStudyMinutes', value: '20' },
          { key: 'maze:da:earned', value: '999' }, // retired branch key
          { key: 'maze:da:settles', value: '9' },
        ],
      },
    }
    expect(() => validateBundleMeta(v16Bundle)).not.toThrow()
    await applyBundleSnapshot(db, v16Bundle)

    // The v16 non-maze key applied (local was missing)…
    expect((await db.meta.get('totalStudyMinutes'))?.value).toBe('20')
    // …the local per-family progress is untouched (preserve-on-omission)…
    expect((await db.meta.get(`maze:${FAM}:earned`))?.value).toBe('500')
    expect((await db.meta.get(`maze:${FAM}:settles`))?.value).toBe('5')
    // …and the stale branch keys are NOT written (dropped — not in the allowlist).
    expect(await db.meta.get('maze:da:earned')).toBeUndefined()
    expect(await db.meta.get('maze:da:settles')).toBeUndefined()
  })

  it('all 22 per-family keys are in the synced snapshot allowlist', async () => {
    for (const k of PER_FAMILY_KEYS) await db.meta.put({ key: k, value: '1' })
    const bundle = await buildBundleSnapshot(db)
    const keys = new Set((bundle.data.meta as Array<{ key: string }>).map((r) => r.key))
    for (const k of PER_FAMILY_KEYS) expect(keys.has(k)).toBe(true)
    expect(PER_FAMILY_KEYS).toHaveLength(22)
  })
})
