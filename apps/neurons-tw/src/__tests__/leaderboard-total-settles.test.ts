import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { buildLeaderboardPayload } from '../lib/services/neurons-leaderboard'

/**
 * Regression guard for `total_settles` (fix-leaderboard-total-settles-to-per-family-keys):
 * the leaderboard payload SHALL aggregate the 11 per-family `maze:<familyId>:settles`
 * keys, NOT the retired 4-branch `maze:<da|5ht|gaba|glu>:settles` keys (which
 * `decouple-neurons-subjects-from-nt-branches` superseded 2026-06-06). Reading the
 * branch keys would silently push `total_settles = 0` for every player.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('buildLeaderboardPayload — total_settles per-family aggregation', () => {
  it('sums the per-family maze settle keys', async () => {
    await db.meta.bulkPut([
      { key: 'maze:藥理學:settles', value: '40' },
      { key: 'maze:解剖學:settles', value: '25' },
      { key: 'maze:組織學:settles', value: '18' },
    ])
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(83) // 40 + 25 + 18, other 8 families absent → 0
  })

  it('ignores retired 4-branch legacy settle keys', async () => {
    await db.meta.bulkPut([
      { key: 'maze:藥理學:settles', value: '40' },
      { key: 'maze:解剖學:settles', value: '25' },
      { key: 'maze:組織學:settles', value: '18' },
      // legacy pre-decouple keys physically present — MUST NOT be summed
      { key: 'maze:da:settles', value: '99' },
      { key: 'maze:gaba:settles', value: '77' },
    ])
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(83) // NOT 83 + 99 + 77 = 259
  })

  it('treats a missing per-family key as 0 (defensive read, no throw)', async () => {
    await db.meta.put({ key: 'maze:藥理學:settles', value: '12' })
    // all other 10 family keys absent
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(12)
  })

  it('a fresh save with no settle keys pushes total_settles = 0', async () => {
    const payload = await buildLeaderboardPayload('TestNick', false)
    expect(payload.total_settles).toBe(0)
  })
})
