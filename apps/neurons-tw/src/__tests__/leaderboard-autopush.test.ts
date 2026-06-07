import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type LeaderboardProfileRow } from '../lib/db'
import { autoPushLeaderboardOnSync } from '../lib/services/neurons-leaderboard'

/**
 * Spec (neurons-leaderboard → "Automatic leaderboard upsert on successful sync
 * push", fix-neurons-leaderboard-autopush): after a successful push the engine's
 * onPushComplete calls autoPushLeaderboardOnSync, which upserts for opted-in
 * players, no-ops otherwise, and (loop-safety) writes NO synced Dexie table.
 */

const USER = 'user-abc'

function profile(over: Partial<LeaderboardProfileRow> = {}): LeaderboardProfileRow {
  return {
    user_id: USER,
    nickname: 'TestNick',
    nickname_lower: 'testnick',
    opted_in: true,
    is_public: true,
    dismissed_at: null,
    last_pushed_at: null,
    ...over,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await db.delete()
  await db.open()
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true }),
  })) as unknown as ReturnType<typeof vi.fn>
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('autoPushLeaderboardOnSync', () => {
  it('upserts when the player is opted in', async () => {
    await db.leaderboardProfile.put(profile())
    const res = await autoPushLeaderboardOnSync({
      userId: USER,
      getAccessToken: async () => 'jwt-token',
    })
    expect(res).toBe('pushed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/leaderboard/neurons/upsert')
    const init = fetchMock.mock.calls[0][1] as { method: string; headers: Record<string, string> }
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer jwt-token')
  })

  it('no-ops when the player has no profile', async () => {
    const res = await autoPushLeaderboardOnSync({
      userId: USER,
      getAccessToken: async () => 'jwt-token',
    })
    expect(res).toBe('skipped-not-opted-in')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no-ops when the player has a profile but opted_in is false', async () => {
    await db.leaderboardProfile.put(profile({ opted_in: false }))
    const res = await autoPushLeaderboardOnSync({
      userId: USER,
      getAccessToken: async () => 'jwt-token',
    })
    expect(res).toBe('skipped-not-opted-in')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no-ops when no access token is available', async () => {
    await db.leaderboardProfile.put(profile())
    const res = await autoPushLeaderboardOnSync({
      userId: USER,
      getAccessToken: async () => null,
    })
    expect(res).toBe('skipped-no-token')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('carries is_public=0 for an opted-in-but-private player', async () => {
    await db.leaderboardProfile.put(profile({ is_public: false }))
    await autoPushLeaderboardOnSync({ userId: USER, getAccessToken: async () => 'jwt-token' })
    const init = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(init.body).is_public).toBe(0)
  })

  it('LOOP-SAFETY: does not mutate the leaderboard profile (no last_pushed_at write)', async () => {
    await db.leaderboardProfile.put(profile({ last_pushed_at: null }))
    await autoPushLeaderboardOnSync({ userId: USER, getAccessToken: async () => 'jwt-token' })
    const after = await db.leaderboardProfile.get(USER)
    // The auto path must NOT write last_pushed_at — otherwise the synced-table
    // write would re-trigger schedulePush → infinite push loop.
    expect(after?.last_pushed_at).toBeNull()
  })
})
