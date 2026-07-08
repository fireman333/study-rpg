/**
 * add-neurons-rescue-anon-authed-claim (Codex pre-ship finding 1): the anonymous →
 * authed cloud-wins flag in useSync is bounded to the startup force-pull. That relies
 * on `beginStartupForcePull` resolving with the pull RESULT — non-null when the pull
 * DEFINITIVELY read cloud state (applied / notModified / blobMissing) vs null when it
 * errored. useSync clears the flag iff the result is non-null, so the flag can never
 * leak past a blobMissing (genuinely-new-account) startup, yet survives an errored
 * startup so a later recovery/visibility pull can still protect an existing cloud plan.
 * These tests lock that contract at the engine boundary.
 *
 * engine-r2 is module-mocked so we drive pullBundle's outcome directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pullBundle = vi.fn()

vi.mock('../lib/sync/r2/engine-r2', () => ({
  pushBundleSerialized: vi.fn(),
  pullBundle: (...args: unknown[]) => pullBundle(...args),
}))

import { createSyncEngine, type SyncEngine } from '../lib/sync/engine'

const fakeSupabase = {} as never
const fakeDb = {} as never
const fakeUser = { id: 'u1' } as never

function makeEngine(onPullComplete?: (r: unknown) => void | Promise<void>): SyncEngine {
  return createSyncEngine({ supabase: fakeSupabase, db: fakeDb, user: fakeUser, onPullComplete })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('beginStartupForcePull resolution contract (anon→authed cloud-wins boundary)', () => {
  it('blobMissing startup (new account): resolves NON-NULL and does NOT fire onPullComplete → flag clears', async () => {
    const onPullComplete = vi.fn()
    pullBundle.mockResolvedValue({ applied: null, notModified: false, blobMissing: true })
    const res = await makeEngine(onPullComplete).beginStartupForcePull()
    expect(res).not.toBeNull()
    expect(res?.blobMissing).toBe(true)
    expect(onPullComplete).not.toHaveBeenCalled() // flag would leak without the non-null clear
  })

  it('applied startup: resolves NON-NULL and FIRES onPullComplete (flag consumed there)', async () => {
    const onPullComplete = vi.fn()
    pullBundle.mockResolvedValue({
      applied: { m1: {} },
      notModified: false,
      blobMissing: false,
      snapshot: { data: {} },
    })
    const res = await makeEngine(onPullComplete).beginStartupForcePull()
    expect(res).not.toBeNull()
    expect(onPullComplete).toHaveBeenCalledTimes(1)
  })

  it('notModified startup: resolves NON-NULL and does NOT fire onPullComplete → flag clears', async () => {
    const onPullComplete = vi.fn()
    pullBundle.mockResolvedValue({ applied: null, notModified: true, blobMissing: false })
    const res = await makeEngine(onPullComplete).beginStartupForcePull()
    expect(res).not.toBeNull()
    expect(onPullComplete).not.toHaveBeenCalled()
  })

  it('errored startup: resolves NULL and does NOT fire onPullComplete → flag PERSISTS for a later protecting pull', async () => {
    const onPullComplete = vi.fn()
    pullBundle.mockRejectedValue(new Error('network'))
    const res = await makeEngine(onPullComplete).beginStartupForcePull()
    expect(res).toBeNull()
    expect(onPullComplete).not.toHaveBeenCalled()
  })
})
