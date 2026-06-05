import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import { buildLeaderboardPayload } from '../lib/services/neurons-leaderboard'

/**
 * Spec Req (neurons-leaderboard → "total_settles computed from the maze settles
 * meta keys at push time"): buildLeaderboardPayload reads the per-FAMILY
 * `maze:<familyId>:settles` synced meta keys (redesign-neurons-maze-rotjs-grid —
 * replacing the 4 retired per-branch keys) and sums them into
 * payload.total_settles, defensively coercing each via `Number(...) || 0`.
 *
 * Capability: 探索進度 axis (realign-neurons-leaderboard-to-maze), re-pointed to
 * per-family keys by the flat-grid redesign.
 */

const settlesKey = (f: string) => `maze:${f}:settles`
const F0 = FAMILY_IDS[0]
const F1 = FAMILY_IDS[1]
const F2 = FAMILY_IDS[2]
const F3 = FAMILY_IDS[3]

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('buildLeaderboardPayload — total_settles wiring (per family)', () => {
  it('sums the per-family maze:<familyId>:settles meta keys', async () => {
    await db.meta.put({ key: settlesKey(F0), value: '5' })
    await db.meta.put({ key: settlesKey(F1), value: '3' })
    await db.meta.put({ key: settlesKey(F2), value: '2' })
    await db.meta.put({ key: settlesKey(F3), value: '10' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(20)
  })

  it('returns 0 when no settle keys exist (fresh / never-settled user)', async () => {
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(0)
  })

  it('treats a missing family key as 0 (partial accrual)', async () => {
    await db.meta.put({ key: settlesKey(F0), value: '7' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(7)
  })

  it('coerces malformed values to 0 (Number(...) || 0)', async () => {
    await db.meta.put({ key: settlesKey(F0), value: 'not-a-number' })
    await db.meta.put({ key: settlesKey(F1), value: '4' })
    await db.meta.put({ key: settlesKey(F2), value: '' })
    await db.meta.put({ key: settlesKey(F3), value: '1' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(5)
  })

  it('ignores the retired per-branch settles keys (only per-family counts)', async () => {
    // Stale four-branch keys must NOT contribute (they are cleared on v17 upgrade).
    await db.meta.put({ key: 'maze:da:settles', value: '99' })
    await db.meta.put({ key: settlesKey(F0), value: '2' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(2)
  })
})
