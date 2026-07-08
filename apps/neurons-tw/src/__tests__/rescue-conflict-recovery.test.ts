/**
 * B2 regression lock (add-neurons-rescue-r2-sync review): a push that 412s runs
 * a recovery pull — that pull MUST also run the onPullComplete backfill
 * (threaded in as `onRecoveryPull`) so the deferred re-push carries the MERGED
 * state. The meta transport default is first-write-wins-skip, so without the
 * hook a device holding a stale LWW value (e.g. an ACTIVE rescue plan whose run
 * was abandoned on another device → newer `plan: null` in the cloud) would keep
 * its stale local row and the re-push would clobber the newer cloud value
 * straight back (dropped abandon / split-brain). Applies to every LWW backfill
 * family (rescue / prescription plan / representatives / active-squad / …).
 *
 * Fidelity: real bundles (gzip round-trip), real applyBundleSnapshot, real
 * runOnPullComplete backfill, real fake-indexeddb Dexie — only the network
 * (presign/fetch) and the push-lock / etag primitives are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/sync/r2/push-lock', () => ({
  withPushLock: vi.fn(async (_u: string, fn: () => Promise<unknown>) => fn()),
}))
vi.mock('../lib/sync/r2/etag', () => ({
  // A stale-but-present etag → PUT sends `If-Match` and the mocked R2 answers 412.
  getEtag: vi.fn(() => '"stale-etag"'),
  setEtag: vi.fn(),
  clearEtag: vi.fn(),
  refreshEtagFromStore: vi.fn(),
}))
vi.mock('../lib/sync/r2/client', () => ({
  requestPresign: vi.fn(async (_sb: unknown, op: string) => ({
    url: `https://r2.example/${op}`,
    requiredHeaders: {},
  })),
}))

import { pushBundle } from '../lib/sync/r2/engine-r2'
import {
  gzipBundle,
  buildBundleSnapshot,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'
import { runOnPullComplete } from '../lib/sync/backfill'
import { db } from '../lib/db'
import { RESCUE_PLAN_KEY, type RescuePlan } from '../lib/services/rescue/rescue-sync-keys'

const fakeSupabase = {} as never

const T1 = Date.now() - 60_000 // stale local action
const T2 = Date.now() - 1_000 // newer cloud action (the abandon)

const stalePlan: RescuePlan = {
  familyId: '藥理學',
  examDate: '2026-07-12',
  dailyMinutes: 30,
  createdAt: T1 - 3_600_000,
  lastStudiedAt: T1,
}
const staleActiveEnv = JSON.stringify({ plan: stalePlan, updatedAt: T1 })
const newerClearedEnv = JSON.stringify({ plan: null, updatedAt: T2 })

function cloudBundle(): BundleSnapshot {
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      updated_at: new Date(T2).toISOString(),
      client_id: 'cloud-writer',
      app_version: '0.4.0',
    },
    data: {
      meta: [{ key: RESCUE_PLAN_KEY, value: newerClearedEnv }],
    },
  }
}

/** PUT → 412 (concurrent writer); GET → 200 with the real gzipped cloud bundle. */
async function installFetch(): Promise<{ counts: { put: number; get: number } }> {
  const gz = await gzipBundle(cloudBundle())
  const counts = { put: 0, get: 0 }
  ;(globalThis as Record<string, unknown>).fetch = vi.fn(
    async (_url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET'
      if (method === 'PUT') {
        counts.put += 1
        return {
          ok: false,
          status: 412,
          headers: { get: () => null },
          text: async () => '',
        } as unknown as Response
      }
      counts.get += 1
      return new Response(gz, { status: 200, headers: { ETag: '"cloud-e2"' } })
    },
  )
  return { counts }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  // This device still holds the stale ACTIVE plan the other device abandoned.
  await db.meta.put({ key: RESCUE_PLAN_KEY, value: staleActiveEnv })
})

describe('push 412 → recovery pull runs the LWW backfill (onRecoveryPull)', () => {
  it('the newer cloud plan:null wins locally and the deferred re-push carries it', async () => {
    const { counts } = await installFetch()

    const result = await pushBundle(fakeSupabase, db, 'u1', {
      deferOnConflict: true,
      // Exactly what SyncEngine.pushNow threads in (its onPullComplete).
      onRecoveryPull: async (pull) => {
        await runOnPullComplete(db, pull)
      },
    })

    expect(result).toEqual({ status: 'deferred', reason: 'concurrent-writer', attempts: 1 })
    expect(counts.put).toBe(1)
    expect(counts.get).toBe(1)

    // The LWW backfill ran on the recovery snapshot: the newer explicit
    // `plan: null` replaced the stale active envelope (the transport-default
    // first-write-wins apply alone would have skipped it).
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(newerClearedEnv)

    // …so the NEXT push snapshot (the deferred retry) carries the null — the
    // stale active plan can no longer clobber the cloud abandon.
    const next = await buildBundleSnapshot(db)
    const metaRows = next.data.meta as Array<{ key: string; value: string }>
    expect(metaRows.find((r) => r.key === RESCUE_PLAN_KEY)?.value).toBe(newerClearedEnv)
  })

  it('control: WITHOUT the hook the recovery pull keeps the stale plan (the hazard the hook closes)', async () => {
    await installFetch()

    const result = await pushBundle(fakeSupabase, db, 'u1', { deferOnConflict: true })

    expect(result).toMatchObject({ status: 'deferred' })
    // Transport default (first-write-wins-skip) left the stale ACTIVE envelope
    // in place — this is the pre-fix behaviour whose re-push resurrects it.
    expect((await db.meta.get(RESCUE_PLAN_KEY))?.value).toBe(staleActiveEnv)
  })

  it('a throwing hook never breaks the push path (error-isolated)', async () => {
    await installFetch()

    const result = await pushBundle(fakeSupabase, db, 'u1', {
      deferOnConflict: true,
      onRecoveryPull: async () => {
        throw new Error('backfill exploded')
      },
    })

    // Still a clean deferred outcome — the hook failure is contained.
    expect(result).toEqual({ status: 'deferred', reason: 'concurrent-writer', attempts: 1 })
  })
})
