/**
 * Account-reset tests — ack helpers, reset-propagation pull gate, envelope
 * carry-forward, reset snapshot shape, validateBundleMeta tolerance, and the
 * reset-flow ordering discipline (push-failure aborts / leaderboard-failure
 * continues).
 *
 * Spec: openspec/changes/add-neurons-account-reset/specs/neurons-cloud-sync/spec.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  honorResetMarker,
  readAckResetAt,
  writeAckResetAt,
  writeLastSyncedUserId,
} from '../lib/sync/account-guard'
import {
  buildBundleSnapshot,
  buildResetSnapshot,
  validateBundleMeta,
  SCHEMA_VERSION,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

// ---- mocks for the reset-flow orchestration test ---------------------------

const pushBundleMock = vi.fn()
vi.mock('../lib/sync/r2/engine-r2', () => ({
  pushBundle: (...args: unknown[]) => pushBundleMock(...args),
}))

const getSessionMock = vi.fn()
vi.mock('../lib/auth/client', () => ({
  getSupabase: () => ({ auth: { getSession: getSessionMock } }),
}))

const deleteLeaderboardRowMock = vi.fn()
const getLeaderboardProfileMock = vi.fn()
vi.mock('../lib/services/neurons-leaderboard', () => ({
  deleteLeaderboardRow: (...args: unknown[]) => deleteLeaderboardRowMock(...args),
  getLeaderboardProfile: (...args: unknown[]) => getLeaderboardProfileMock(...args),
}))

// resetNeuronsAccountData must be imported AFTER the vi.mock declarations.
import { resetNeuronsAccountData } from '../lib/services/account-reset'

// ---- localStorage mock (node env) -------------------------------------------

function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

const USER_A = 'user-a'

beforeEach(async () => {
  installLocalStorageMock()
  vi.clearAllMocks()
  await db.questionHistory.clear()
  await db.familyMastery.clear()
  await db.meta.clear()
  getSessionMock.mockResolvedValue({
    data: { session: { user: { id: USER_A }, access_token: 'tok' } },
  })
  getLeaderboardProfileMock.mockResolvedValue(undefined)
  pushBundleMock.mockResolvedValue({ etag: 'e', bytes: 1, attempts: 1 })
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage
})

async function seedSomeData(): Promise<void> {
  await db.questionHistory.put({
    questionId: 'q-1',
    family: '解剖學',
    lastResult: 'wrong',
    everWrong: true,
    lastAnsweredAt: 1,
    updatedAt: 1,
  })
  await db.familyMastery.put({ familyId: '解剖學', correct: 1, total: 2 })
  await db.meta.put({ key: 'totalStudyMinutes', value: 42 } as never)
}

// ---- ack helpers -------------------------------------------------------------

describe('reset acknowledgement helpers', () => {
  it('round-trips per user and defaults to 0', () => {
    expect(readAckResetAt(USER_A)).toBe(0)
    writeAckResetAt(USER_A, 1234)
    expect(readAckResetAt(USER_A)).toBe(1234)
    expect(readAckResetAt('user-b')).toBe(0) // per-user isolation
  })

  it('fails open without localStorage and ignores null user', () => {
    delete (globalThis as Record<string, unknown>).localStorage
    expect(readAckResetAt(USER_A)).toBe(0)
    expect(() => writeAckResetAt(USER_A, 1)).not.toThrow()
    installLocalStorageMock()
    writeAckResetAt(null, 99)
    expect(readAckResetAt(null)).toBe(0)
  })
})

// ---- pull-side propagation gate ----------------------------------------------

describe('honorResetMarker (pull gate)', () => {
  it('wipes local data and acks when reset_at exceeds the ack', async () => {
    writeLastSyncedUserId(USER_A)
    await seedSomeData()

    const wiped = await honorResetMarker(db, 5000)

    expect(wiped).toBe(true)
    expect(await db.questionHistory.count()).toBe(0)
    expect(await db.familyMastery.count()).toBe(0)
    expect(await db.meta.get('totalStudyMinutes')).toBeUndefined()
    expect(readAckResetAt(USER_A)).toBe(5000)
  })

  it('does nothing when reset_at is already acked', async () => {
    writeLastSyncedUserId(USER_A)
    writeAckResetAt(USER_A, 5000)
    await seedSomeData()

    expect(await honorResetMarker(db, 5000)).toBe(false)
    expect(await db.questionHistory.count()).toBe(1)
  })

  it('does nothing for absent or non-numeric reset_at', async () => {
    writeLastSyncedUserId(USER_A)
    await seedSomeData()

    expect(await honorResetMarker(db, undefined)).toBe(false)
    expect(await honorResetMarker(db, 'bogus')).toBe(false)
    expect(await honorResetMarker(db, 0)).toBe(false)
    expect(await db.questionHistory.count()).toBe(1)
  })
})

// ---- envelope: carry-forward + reset snapshot + tolerance --------------------

describe('bundle envelope reset_at', () => {
  it('buildBundleSnapshot carries the acked reset_at forward', async () => {
    writeLastSyncedUserId(USER_A)
    writeAckResetAt(USER_A, 7777)
    const snap = await buildBundleSnapshot(db)
    expect(snap.meta.reset_at).toBe(7777)
    expect(snap.meta.schema_version).toBe(SCHEMA_VERSION)
  })

  it('buildBundleSnapshot omits reset_at when never reset', async () => {
    writeLastSyncedUserId(USER_A)
    const snap = await buildBundleSnapshot(db)
    expect('reset_at' in snap.meta).toBe(false)
  })

  it('buildResetSnapshot is empty data + reset_at at current SCHEMA_VERSION', () => {
    const snap = buildResetSnapshot(9999)
    expect(snap.data).toEqual({})
    expect(snap.meta.reset_at).toBe(9999)
    expect(snap.meta.schema_version).toBe(SCHEMA_VERSION)
  })

  it('validateBundleMeta tolerates absent / numeric / bogus reset_at', () => {
    const base = (resetAt?: unknown): unknown => ({
      meta: {
        schema_version: SCHEMA_VERSION,
        updated_at: new Date(0).toISOString(),
        client_id: 'c',
        app_version: 'x',
        ...(resetAt !== undefined ? { reset_at: resetAt } : {}),
      },
      data: {},
    })
    expect(() => validateBundleMeta(base() as BundleSnapshot)).not.toThrow()
    expect(() => validateBundleMeta(base(123) as BundleSnapshot)).not.toThrow()
    expect(() => validateBundleMeta(base('bogus') as BundleSnapshot)).not.toThrow()
  })
})

// ---- reset flow ordering ------------------------------------------------------

describe('resetNeuronsAccountData', () => {
  it('happy path: pushes reset bundle, acks, wipes local, stays signed in', async () => {
    writeLastSyncedUserId(USER_A)
    await seedSomeData()

    await resetNeuronsAccountData()

    expect(pushBundleMock).toHaveBeenCalledTimes(1)
    const opts = pushBundleMock.mock.calls[0][2] as { snapshotOverride: () => BundleSnapshot }
    const pushed = opts.snapshotOverride()
    expect(pushed.data).toEqual({})
    expect(typeof pushed.meta.reset_at).toBe('number')

    expect(readAckResetAt(USER_A)).toBe(pushed.meta.reset_at)
    expect(await db.questionHistory.count()).toBe(0)
    expect(await db.familyMastery.count()).toBe(0)
  })

  it('push failure aborts BEFORE any local damage', async () => {
    writeLastSyncedUserId(USER_A)
    await seedSomeData()
    pushBundleMock.mockRejectedValue(new Error('r2_push_exhausted'))

    await expect(resetNeuronsAccountData()).rejects.toThrow('r2_push_exhausted')

    expect(await db.questionHistory.count()).toBe(1)
    expect(readAckResetAt(USER_A)).toBe(0)
  })

  it('leaderboard failure does not block the reset', async () => {
    writeLastSyncedUserId(USER_A)
    await seedSomeData()
    getLeaderboardProfileMock.mockResolvedValue({ user_id: USER_A })
    deleteLeaderboardRowMock.mockRejectedValue(new Error('worker down'))

    await resetNeuronsAccountData()

    expect(deleteLeaderboardRowMock).toHaveBeenCalledTimes(1)
    expect(pushBundleMock).toHaveBeenCalledTimes(1)
    expect(await db.questionHistory.count()).toBe(0)
  })

  it('skips the leaderboard round-trip for never-opted-in players', async () => {
    writeLastSyncedUserId(USER_A)
    await resetNeuronsAccountData()
    expect(deleteLeaderboardRowMock).not.toHaveBeenCalled()
  })

  it('throws when not signed in', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    await expect(resetNeuronsAccountData()).rejects.toThrow('未登入')
    expect(pushBundleMock).not.toHaveBeenCalled()
  })
})
