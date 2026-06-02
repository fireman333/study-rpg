/**
 * Daily ticket refresh idempotency (fix-medexam2-ticket-cloud-clobber).
 *
 * `refreshDailyTickets` is re-run in the sync engine's onPullComplete to recover
 * the daily +1 that the cold-start force-pull rolls back. These tests pin that it
 * re-grants when lastRefreshDay is behind today and no-ops once granted for the day.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getHospitalDB, refreshDailyTickets } from '../db/schema'

const EPOCH_DAY_MS = 86_400_000
// Matches the impl's currentEpochDay() = Math.floor(Date.now() / 86400000).
const today = Math.floor(Date.now() / EPOCH_DAY_MS)

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
})

describe('refreshDailyTickets idempotency', () => {
  it('re-grants +1 when lastRefreshDay is yesterday', async () => {
    const db = getHospitalDB()
    await db.tickets.put({ id: 'global', available: 0, lastRefreshDay: today - 1 })

    await refreshDailyTickets()

    const t = await db.tickets.get('global')
    expect(t?.available).toBe(1)
    expect(t?.lastRefreshDay).toBe(today)
  })

  it('no-ops (no grant, no lastRefreshDay change) when already granted today', async () => {
    const db = getHospitalDB()
    await db.tickets.put({ id: 'global', available: 3, lastRefreshDay: today })

    await refreshDailyTickets()

    const t = await db.tickets.get('global')
    expect(t?.available).toBe(3)
    expect(t?.lastRefreshDay).toBe(today)
  })

  it('post-rollback re-grant: cold-start clobber rolls lastRefreshDay back, re-run restores +1', async () => {
    const db = getHospitalDB()
    // Boot granted today.
    await db.tickets.put({ id: 'global', available: 1, lastRefreshDay: today })
    // Cold-start force-pull overwrites local with stale cloud snapshot.
    await db.tickets.put({ id: 'global', available: 0, lastRefreshDay: today - 1 })

    // onPullComplete re-runs refreshDailyTickets.
    await refreshDailyTickets()

    const t = await db.tickets.get('global')
    expect(t?.available).toBe(1)
    expect(t?.lastRefreshDay).toBe(today)
  })

  it('grants min(daysDelta, cap-available) across multiple elapsed days', async () => {
    const db = getHospitalDB()
    await db.tickets.put({ id: 'global', available: 7, lastRefreshDay: today - 3 })

    await refreshDailyTickets()

    const t = await db.tickets.get('global')
    expect(t?.available).toBe(10) // 7 + 3 elapsed days
    expect(t?.lastRefreshDay).toBe(today)
  })
})
