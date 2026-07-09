import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, todayISO } from '../lib/db'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'
import { isSyncedMetaKey, IMPRINT_SYNC_PREFIX } from '../lib/sync/tables'
import { clearLocalSyncedData } from '../lib/sync/account-guard'

/**
 * add-neurons-imprint-keepsake-sync — NG-0717 lineage imprints become a cross-device
 * keepsake. Write-once presence keys `prescription:v1:ng0717:imprint:<subj>:<date>` join
 * the synced meta set via a PREFIX (not the enumerated allowlist), merged first-write-wins
 * (= UNION over write-once keys). Additive SCHEMA_VERSION bump (23 → 24), reader-tolerant.
 *
 * UPDATED by add-neurons-prescription-tiers-and-sync (v26): the sibling prescription
 * daily-quest keys now SYNC too, via the date-windowed `isSyncedPrescriptionKey`
 * matcher — `completed:` / `reward:` for ALL dates, `wrong:` etc. within today ±1 —
 * while `lightsOut:` / `localSeed` stay local-only. The old assertions that
 * `completed:` / `wrong:` never sync flipped red BY DESIGN and are updated to the
 * new contract here.
 */

const IMP = (subj: string, date: string) => `${IMPRINT_SYNC_PREFIX}${subj}:${date}`

// vitest runs in node — clearLocalSyncedData touches localStorage (etag/presign cache).
function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

beforeEach(async () => {
  installLocalStorageMock()
  await db.delete()
  await db.open()
})
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage
})

describe('NG-0717 imprint keepsake sync (v24)', () => {
  it('SCHEMA_VERSION is 28 (additive bumps: v24 imprints, v25 pinnedAt, v26 prescription daily-quest, v27 rescue sync, v28 multi-subject rescue)', () => {
    expect(SCHEMA_VERSION).toBe(28)
  })

  it('the synced prefix is the single-sourced imprint key prefix (no drift)', () => {
    // IMPRINT_SYNC_PREFIX is re-exported from the prescription service's IMPRINT_PREFIX,
    // so the sync filter and the key mint share one source. Pin the literal so a rename
    // is a deliberate, visible test change.
    expect(IMPRINT_SYNC_PREFIX).toBe('prescription:v1:ng0717:imprint:')
  })

  it('isSyncedMetaKey: imprint keys sync; daily-quest siblings sync per their matcher; localSeed never', () => {
    expect(isSyncedMetaKey(IMP('藥理學', '2026-07-05'))).toBe(true)
    expect(isSyncedMetaKey(IMP('公共衛生學', '2026-07-01'))).toBe(true)
    // sibling daily-quest keys now SYNC (add-neurons-prescription-tiers-and-sync):
    // completed: for ALL dates; wrong: within today ±1 local day.
    expect(isSyncedMetaKey('prescription:v1:completed:2026-07-05')).toBe(true)
    expect(isSyncedMetaKey(`prescription:v1:wrong:${todayISO()}:q1`)).toBe(true)
    // local-only ritual keys still never sync
    expect(isSyncedMetaKey('prescription:v1:localSeed')).toBe(false)
    expect(isSyncedMetaKey(`prescription:v1:lightsOut:${todayISO()}`)).toBe(false)
    // the enumerated allowlist still works
    expect(isSyncedMetaKey('totalStudyMinutes')).toBe(true)
  })

  it('snapshot includes imprint + allowlist + daily-quest keys, excludes local-only ritual keys', async () => {
    await db.meta.put({ key: IMP('藥理學', '2026-07-05'), value: '1' })
    await db.meta.put({ key: IMP('生理學', '2026-07-01'), value: '1' })
    await db.meta.put({ key: 'totalStudyMinutes', value: '30' })
    await db.meta.put({ key: 'prescription:v1:completed:2026-07-05', value: '{}' }) // all-dates family → syncs
    await db.meta.put({ key: 'prescription:v1:localSeed', value: 'seed' }) // local-only
    const bundle = await buildBundleSnapshot(db)
    const keys = new Set((bundle.data.meta as Array<{ key: string }>).map((r) => r.key))
    expect(keys.has(IMP('藥理學', '2026-07-05'))).toBe(true)
    expect(keys.has(IMP('生理學', '2026-07-01'))).toBe(true)
    expect(keys.has('totalStudyMinutes')).toBe(true)
    expect(keys.has('prescription:v1:completed:2026-07-05')).toBe(true)
    expect(keys.has('prescription:v1:localSeed')).toBe(false)
  })

  it('apply is a first-write-wins UNION: adds missing buds + daily-quest keys, drops non-synced', async () => {
    await db.meta.put({ key: IMP('藥理學', '2026-07-05'), value: '1' }) // local already has this bud
    const incoming: BundleSnapshot = {
      meta: { schema_version: 24, updated_at: 'x', client_id: 'c', app_version: '0.4.0' },
      data: {
        meta: [
          { key: IMP('藥理學', '2026-07-05'), value: '1' }, // already local → kept
          { key: IMP('微生物學', '2026-07-06'), value: '1' }, // new → unioned in
          { key: 'prescription:v1:completed:2026-07-05', value: '{}' }, // all-dates family → accepted
          { key: 'prescription:v1:localSeed', value: 'other-seed' }, // local-only → dropped
        ],
      },
    }
    await applyBundleSnapshot(db, incoming)
    expect((await db.meta.get(IMP('藥理學', '2026-07-05')))?.value).toBe('1')
    expect((await db.meta.get(IMP('微生物學', '2026-07-06')))?.value).toBe('1')
    expect((await db.meta.get('prescription:v1:completed:2026-07-05'))?.value).toBe('{}')
    expect(await db.meta.get('prescription:v1:localSeed')).toBeUndefined()
  })

  it('reader tolerance: a v23 bundle with no imprint keys preserves local imprints', async () => {
    await db.meta.put({ key: IMP('藥理學', '2026-07-05'), value: '1' })
    const oldBundle: BundleSnapshot = {
      meta: { schema_version: 23, updated_at: 'x', client_id: 'c', app_version: '0.4.0' },
      data: { meta: [{ key: 'totalStudyMinutes', value: '10' }] },
    }
    await applyBundleSnapshot(db, oldBundle)
    // first-write-wins never deletes local keys absent from the incoming bundle
    expect((await db.meta.get(IMP('藥理學', '2026-07-05')))?.value).toBe('1')
    expect((await db.meta.get('totalStudyMinutes'))?.value).toBe('10')
  })

  it('account-switch wipe clears imprint + synced keys but preserves device-local keys', async () => {
    await db.meta.put({ key: IMP('藥理學', '2026-07-05'), value: '1' }) // synced keepsake
    await db.meta.put({ key: IMP('生理學', '2026-07-01'), value: '1' })
    await db.meta.put({ key: 'totalStudyMinutes', value: '30' }) // synced allowlist
    await db.meta.put({ key: 'prescription:homeCollapsed', value: '1' }) // device-local
    await clearLocalSyncedData(db)
    expect(await db.meta.get(IMP('藥理學', '2026-07-05'))).toBeUndefined()
    expect(await db.meta.get(IMP('生理學', '2026-07-01'))).toBeUndefined()
    expect(await db.meta.get('totalStudyMinutes')).toBeUndefined()
    expect((await db.meta.get('prescription:homeCollapsed'))?.value).toBe('1')
  })
})
