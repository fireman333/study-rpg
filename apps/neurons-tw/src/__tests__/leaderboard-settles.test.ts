import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { buildLeaderboardPayload } from '../lib/services/neurons-leaderboard'

/**
 * Spec Req (neurons-leaderboard → "Push leaderboard row ... total_settles
 * computed from the four maze settles meta keys at push time"):
 * buildLeaderboardPayload reads the four `maze:<branch>:settles` synced meta
 * keys and sums them into payload.total_settles, defensively coercing each via
 * `Number(...) || 0`.
 *
 * Capability: realign-neurons-leaderboard-to-maze (探索進度 axis).
 */

const SETTLES_KEYS = [
  'maze:da:settles',
  'maze:5ht:settles',
  'maze:gaba:settles',
  'maze:glu:settles',
]

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('buildLeaderboardPayload — total_settles wiring', () => {
  it('sums the four maze:<branch>:settles meta keys', async () => {
    await db.meta.put({ key: 'maze:da:settles', value: '5' })
    await db.meta.put({ key: 'maze:5ht:settles', value: '3' })
    await db.meta.put({ key: 'maze:gaba:settles', value: '2' })
    await db.meta.put({ key: 'maze:glu:settles', value: '10' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(20)
  })

  it('returns 0 when no settle keys exist (fresh / never-settled user)', async () => {
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(0)
  })

  it('treats a missing branch key as 0 (partial accrual)', async () => {
    // Only DA has settled; the other three branches are absent.
    await db.meta.put({ key: 'maze:da:settles', value: '7' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(7)
  })

  it('coerces malformed values to 0 (Number(...) || 0)', async () => {
    await db.meta.put({ key: 'maze:da:settles', value: 'not-a-number' })
    await db.meta.put({ key: 'maze:5ht:settles', value: '4' })
    await db.meta.put({ key: 'maze:gaba:settles', value: '' })
    await db.meta.put({ key: 'maze:glu:settles', value: '1' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(5)
  })

  it('reads the exact lowercase branch keys used by the maze economy', async () => {
    // Guard against a key-casing drift from economy.ts settlesKey().
    for (const k of SETTLES_KEYS) await db.meta.put({ key: k, value: '1' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_settles).toBe(SETTLES_KEYS.length)
  })
})
