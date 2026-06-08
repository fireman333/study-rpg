import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { backfillDmnDailyCounters } from '../lib/sync/backfill/dmn-daily'

/**
 * Locks the date-gated MAX merge for DMN daily-entitlement meta keys per
 * `tighten-neurons-dmn-entitlement-semantics`. DO NOT relax to plain LWW
 * (the meta adapter's missing-only insert fallback) — that's the silent
 * race this pass neutralizes.
 *
 * Invariants:
 *   - dmnLastDailyResetDate: lexicographic MAX (YYYY-MM-DD sorts).
 *   - Per-day counters reset to 0 if local date advanced; incoming counter
 *     from a stale date is ignored; same-date entries merge by MAX.
 *   - dmnDrawsAvailable: simple MAX. Documented limitation — two concurrent
 *     consumes can collapse into one (player-favoring refund, never overdraft).
 */

const PER_DAY = [
  'dmnTimeAxisDrawsConsumedToday',
  'dmnBehaviorAxisDrawsConsumedToday',
  'dmnTimeAxisMinutesAccrued',
] as const

async function seedMeta(rows: Record<string, string>): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    for (const [key, value] of Object.entries(rows)) {
      await db.meta.put({ key, value })
    }
  })
}

async function readMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('backfillDmnDailyCounters — date-gated MAX semantics', () => {
  it('lexicographic MAX picks the later YYYY-MM-DD as merged reset date', async () => {
    await seedMeta({ dmnLastDailyResetDate: '2026-06-08' })
    await backfillDmnDailyCounters(db, { dmnLastDailyResetDate: '2026-06-09' })
    expect(await readMeta('dmnLastDailyResetDate')).toBe('2026-06-09')
  })

  it('older incoming date does not regress local date', async () => {
    await seedMeta({ dmnLastDailyResetDate: '2026-06-09' })
    await backfillDmnDailyCounters(db, { dmnLastDailyResetDate: '2026-06-07' })
    expect(await readMeta('dmnLastDailyResetDate')).toBe('2026-06-09')
  })

  it('cross-midnight race: device A advanced + zeroed, device B has stale day-old counters → merged is the advanced state', async () => {
    // Local = device B (still on 6-08 with consumed=2)
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnTimeAxisDrawsConsumedToday: '2',
      dmnBehaviorAxisDrawsConsumedToday: '3',
      dmnTimeAxisMinutesAccrued: '22',
    })
    // Incoming = device A (advanced to 6-09, zeroed)
    await backfillDmnDailyCounters(db, {
      dmnLastDailyResetDate: '2026-06-09',
      dmnTimeAxisDrawsConsumedToday: '0',
      dmnBehaviorAxisDrawsConsumedToday: '0',
      dmnTimeAxisMinutesAccrued: '0',
    })

    expect(await readMeta('dmnLastDailyResetDate')).toBe('2026-06-09')
    // Local counters were zeroed because the date advanced; incoming is fresh (matches 6-09) so MAX(0,0)=0.
    for (const key of PER_DAY) {
      expect(await readMeta(key)).toBe('0')
    }
  })

  it('same-date counters merge by MAX', async () => {
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnTimeAxisDrawsConsumedToday: '1',
      dmnBehaviorAxisDrawsConsumedToday: '2',
      dmnTimeAxisMinutesAccrued: '10',
    })
    await backfillDmnDailyCounters(db, {
      dmnLastDailyResetDate: '2026-06-08',
      dmnTimeAxisDrawsConsumedToday: '2',
      dmnBehaviorAxisDrawsConsumedToday: '1',
      dmnTimeAxisMinutesAccrued: '15',
    })
    expect(await readMeta('dmnTimeAxisDrawsConsumedToday')).toBe('2')
    expect(await readMeta('dmnBehaviorAxisDrawsConsumedToday')).toBe('2')
    expect(await readMeta('dmnTimeAxisMinutesAccrued')).toBe('15')
  })

  it('incoming counters from stale (older) date are ignored', async () => {
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-09',
      dmnTimeAxisDrawsConsumedToday: '1',
    })
    await backfillDmnDailyCounters(db, {
      dmnLastDailyResetDate: '2026-06-07',
      dmnTimeAxisDrawsConsumedToday: '99', // stale; do not fold
    })
    expect(await readMeta('dmnLastDailyResetDate')).toBe('2026-06-09')
    expect(await readMeta('dmnTimeAxisDrawsConsumedToday')).toBe('1')
  })

  it('dmnDrawsAvailable simple MAX merge', async () => {
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnDrawsAvailable: '3',
    })
    await backfillDmnDailyCounters(db, {
      dmnLastDailyResetDate: '2026-06-08',
      dmnDrawsAvailable: '5',
    })
    expect(await readMeta('dmnDrawsAvailable')).toBe('5')
  })

  it('dmnDrawsAvailable MAX is date-independent (entitlement persists across days)', async () => {
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnDrawsAvailable: '4',
    })
    // Incoming has advanced date with same draws — entitlement preserved.
    await backfillDmnDailyCounters(db, {
      dmnLastDailyResetDate: '2026-06-09',
      dmnDrawsAvailable: '4',
    })
    expect(await readMeta('dmnDrawsAvailable')).toBe('4')
  })

  it('documented limitation: two concurrent consumes can collapse to one', async () => {
    // Both devices saw 3, each consumed locally to 2.
    await seedMeta({ dmnDrawsAvailable: '2' })
    await backfillDmnDailyCounters(db, { dmnDrawsAvailable: '2' })
    // MAX(2,2)=2. The two consumes collapse — one consume's effect is lost.
    // This is the documented limitation (player-favoring refund).
    expect(await readMeta('dmnDrawsAvailable')).toBe('2')
  })

  it('idempotent re-application produces the same result', async () => {
    const incoming = {
      dmnLastDailyResetDate: '2026-06-09',
      dmnTimeAxisDrawsConsumedToday: '2',
      dmnBehaviorAxisDrawsConsumedToday: '3',
      dmnTimeAxisMinutesAccrued: '22',
      dmnDrawsAvailable: '4',
    }
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnTimeAxisDrawsConsumedToday: '0',
      dmnBehaviorAxisDrawsConsumedToday: '0',
      dmnTimeAxisMinutesAccrued: '0',
      dmnDrawsAvailable: '0',
    })
    await backfillDmnDailyCounters(db, incoming)
    const after1 = {
      d: await readMeta('dmnLastDailyResetDate'),
      t: await readMeta('dmnTimeAxisDrawsConsumedToday'),
      b: await readMeta('dmnBehaviorAxisDrawsConsumedToday'),
      m: await readMeta('dmnTimeAxisMinutesAccrued'),
      a: await readMeta('dmnDrawsAvailable'),
    }
    await backfillDmnDailyCounters(db, incoming)
    const after2 = {
      d: await readMeta('dmnLastDailyResetDate'),
      t: await readMeta('dmnTimeAxisDrawsConsumedToday'),
      b: await readMeta('dmnBehaviorAxisDrawsConsumedToday'),
      m: await readMeta('dmnTimeAxisMinutesAccrued'),
      a: await readMeta('dmnDrawsAvailable'),
    }
    expect(after2).toEqual(after1)
  })
})
