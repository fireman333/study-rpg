/**
 * Adapter-level tests for HOSPITAL_STATE blob LWW (fix-medexam2-ticket-cloud-clobber).
 *
 * The collapsed `hospital_state` blob is pushed with updated_at = max(rows.updated_at)
 * but historically applied by comparing ONLY local gameCounters._updatedAt — so a
 * tickets-only write (daily refresh / banner-unlock bonus, which don't touch
 * gameCounters) was reverted by an older cloud blob. The fix compares against the
 * MAX _updatedAt across all five contributing tables. These tests pin that behavior
 * plus the force-overwrite path used by account-switch.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { HOSPITAL_STATE } from '../lib/sync/tables'
import { getHospitalDB } from '../db/schema'
import type { CloudRow } from '../lib/sync/types'

const T0 = Date.parse('2026-05-30T00:00:00.000Z') // gameCounters local write
const T1 = Date.parse('2026-05-30T06:00:00.000Z') // cloud blob (after gameCounters, before tickets)
const T2 = Date.parse('2026-05-30T12:00:00.000Z') // tickets-only local write (newest local)
const T3 = Date.parse('2026-05-31T00:00:00.000Z') // cloud blob genuinely newer than all local

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function minimalGameCounters(updatedAt: number): any {
  return {
    id: 'singleton',
    revenue: 1000,
    reputation: 50,
    lastTickAt: 0,
    tier: '診所',
    hasUsedStarterPull: true,
    currentSessionStartedAt: null,
    lastSessionEndedAt: null,
    tutorial: { completedSteps: {}, firstVisit: {}, firedTips: {} },
    _updatedAt: updatedAt,
  }
}

function cloudBlobRow(ticketsAvailable: number, updatedAtMs: number): CloudRow {
  return {
    user_id: 'u1',
    updated_at: new Date(updatedAtMs).toISOString(),
    app_version: null,
    data: {
      gameCounters: minimalGameCounters(updatedAtMs),
      gachaStats: null,
      tickets: { id: 'global', available: ticketsAvailable, lastRefreshDay: 20000 },
      rooms: [],
      affinity: [],
    },
  } as unknown as CloudRow
}

async function seedLocal(ticketsAvailable: number, ticketsUpdatedAt: number, gcUpdatedAt: number) {
  const db = getHospitalDB()
  await db.gameCounters.put(minimalGameCounters(gcUpdatedAt))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.tickets.put({
    id: 'global',
    available: ticketsAvailable,
    lastRefreshDay: 19999,
    _updatedAt: ticketsUpdatedAt,
  } as any)
}

describe('HOSPITAL_STATE blob LWW — max contributing-table timestamp', () => {
  it('tickets-only local write survives a stale cloud blob pull', async () => {
    const db = getHospitalDB()
    // Local: gameCounters at T0, but a later tickets-only grant at T2 (> T0).
    await seedLocal(/*available*/ 1, /*tickets _updatedAt*/ T2, /*gc _updatedAt*/ T0)

    // Cloud blob: updated_at = T1 (T0 < T1 < T2), tickets.available = 0 (stale).
    const wrote = await HOSPITAL_STATE.applyToLocal(db, cloudBlobRow(0, T1), undefined)

    // localMax = T2 (from tickets) > T1 → cloud is NOT newer → skipped.
    expect(wrote).toBe(false)
    const t = await db.tickets.get('global')
    expect(t?.available).toBe(1)
  })

  it('genuinely newer cloud blob still wins', async () => {
    const db = getHospitalDB()
    await seedLocal(1, T2, T0)

    // Cloud blob updated_at = T3 > localMax (T2) → cloud wins.
    const wrote = await HOSPITAL_STATE.applyToLocal(db, cloudBlobRow(0, T3), undefined)

    expect(wrote).toBe(true)
    const t = await db.tickets.get('global')
    expect(t?.available).toBe(0)
  })

  it('force apply overwrites unconditionally even when local is newer', async () => {
    const db = getHospitalDB()
    // Local tickets newest of all (T3), cloud older (T1) — LWW would keep local,
    // but force bypasses the comparison.
    await seedLocal(5, T3, T3)

    const wrote = await HOSPITAL_STATE.applyToLocal(db, cloudBlobRow(7, T1), { force: true })

    expect(wrote).toBe(true)
    const t = await db.tickets.get('global')
    expect(t?.available).toBe(7)
  })

  it('force apply writes cloud onto empty local (account-switch wipe)', async () => {
    const db = getHospitalDB()
    // No local rows at all → no _updatedAt anywhere.
    const wrote = await HOSPITAL_STATE.applyToLocal(db, cloudBlobRow(7, T1), { force: true })

    expect(wrote).toBe(true)
    const t = await db.tickets.get('global')
    expect(t?.available).toBe(7)
  })
})
