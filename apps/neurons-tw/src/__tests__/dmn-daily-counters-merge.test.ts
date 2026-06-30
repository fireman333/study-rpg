import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { backfillDmnDailyCounters } from '../lib/sync/backfill/dmn-daily'

/**
 * Locks the cross-device merge for DMN daily-entitlement meta keys.
 * DO NOT relax to plain LWW (the meta adapter's missing-only insert fallback).
 *
 * Invariants:
 *   - dmnLastDailyResetDate: lexicographic MAX (YYYY-MM-DD sorts) — per
 *     `tighten-neurons-dmn-entitlement-semantics`.
 *   - Per-day counters reset to 0 if local date advanced; incoming counter
 *     from a stale date is ignored; same-date entries merge by MAX.
 *   - Entitlement pool is a DERIVED projection
 *     (fix-neurons-dmn-draw-entitlement-resurrection): dmnGrantsTotal and
 *     dmnLifetimeDrawsConsumed each MAX-merge, dmnDrawsAvailable is RE-DERIVED =
 *     clamp(grants − consumes, ≥0). A raw MAX of the bidirectional pool (the old
 *     code) resurrected spent draws — that regression must never return. A side
 *     that predates dmnGrantsTotal SEEDS it from available+consumes (never 0).
 *     Accepted limitation: two devices consuming from the same base collapse to
 *     one consume (player-favoring refund, never overdraft).
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

  it('a spent draw stays spent after a racing pull reads a stale-higher cloud value (the fix)', async () => {
    // Local already spent 1 of 11 (grants=11, consumes=1, derived=10).
    await seedMeta({
      dmnDrawsAvailable: '10',
      dmnGrantsTotal: '11',
      dmnLifetimeDrawsConsumed: '1',
    })
    // Incoming is the still-stale cloud bundle from BEFORE the spend (available=11).
    await backfillDmnDailyCounters(db, {
      dmnDrawsAvailable: '11',
      dmnGrantsTotal: '11',
      dmnLifetimeDrawsConsumed: '0',
    })
    // grants MAX(11,11)=11, consumes MAX(1,0)=1, derived = 10 — NOT resurrected to 11.
    expect(await readMeta('dmnGrantsTotal')).toBe('11')
    expect(await readMeta('dmnLifetimeDrawsConsumed')).toBe('1')
    expect(await readMeta('dmnDrawsAvailable')).toBe('10')
  })

  it('fresh device pulling a pre-23 bundle (no dmnGrantsTotal) seeds grants from available+consumes — tickets preserved', async () => {
    // Local empty (fresh device). Incoming v22 carries available=11, no grants.
    await backfillDmnDailyCounters(db, {
      dmnDrawsAvailable: '11',
      dmnLifetimeDrawsConsumed: '0',
      // dmnGrantsTotal intentionally ABSENT
    })
    // Incoming grants seeded = 11 + 0; derived = 11 (NOT wiped to 0).
    expect(await readMeta('dmnGrantsTotal')).toBe('11')
    expect(await readMeta('dmnDrawsAvailable')).toBe('11')
  })

  it('a v23 bundle whose consumes advanced beats a stale higher pre-migration local available', async () => {
    // Local pre-migration: shows available=11, no grants key (seeds grants=11, consumes=0).
    await seedMeta({
      dmnDrawsAvailable: '11',
      dmnLifetimeDrawsConsumed: '0',
    })
    // Incoming v23: the other device spent all 11.
    await backfillDmnDailyCounters(db, {
      dmnGrantsTotal: '11',
      dmnLifetimeDrawsConsumed: '11',
      dmnDrawsAvailable: '0',
    })
    // grants MAX(11,11)=11, consumes MAX(0,11)=11, derived = 0.
    expect(await readMeta('dmnGrantsTotal')).toBe('11')
    expect(await readMeta('dmnLifetimeDrawsConsumed')).toBe('11')
    expect(await readMeta('dmnDrawsAvailable')).toBe('0')
  })

  it('entitlement pool persists across days (derived projection is date-independent)', async () => {
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnDrawsAvailable: '4',
      dmnGrantsTotal: '4',
      dmnLifetimeDrawsConsumed: '0',
    })
    // Advanced date, same entitlement — preserved.
    await backfillDmnDailyCounters(db, {
      dmnLastDailyResetDate: '2026-06-09',
      dmnDrawsAvailable: '4',
      dmnGrantsTotal: '4',
      dmnLifetimeDrawsConsumed: '0',
    })
    expect(await readMeta('dmnDrawsAvailable')).toBe('4')
  })

  it('accepted limitation: two concurrent same-base spends collapse to one (player-favoring refund)', async () => {
    // Base both devices: grants=5, consumes=2, available=3. Each spends one.
    // Local = device A after its spend (consumes=3, available=2).
    await seedMeta({
      dmnGrantsTotal: '5',
      dmnLifetimeDrawsConsumed: '3',
      dmnDrawsAvailable: '2',
    })
    // Incoming = device B after its spend (consumes=3, available=2).
    await backfillDmnDailyCounters(db, {
      dmnGrantsTotal: '5',
      dmnLifetimeDrawsConsumed: '3',
      dmnDrawsAvailable: '2',
    })
    // consumes MAX(3,3)=3 — one of the two spends is refunded; derived = 2. Never an overdraft.
    expect(await readMeta('dmnLifetimeDrawsConsumed')).toBe('3')
    expect(await readMeta('dmnDrawsAvailable')).toBe('2')
  })

  it('idempotent re-application produces the same result', async () => {
    const incoming = {
      dmnLastDailyResetDate: '2026-06-09',
      dmnTimeAxisDrawsConsumedToday: '2',
      dmnBehaviorAxisDrawsConsumedToday: '3',
      dmnTimeAxisMinutesAccrued: '22',
      dmnDrawsAvailable: '4',
      dmnGrantsTotal: '6',
      dmnLifetimeDrawsConsumed: '2',
    }
    await seedMeta({
      dmnLastDailyResetDate: '2026-06-08',
      dmnTimeAxisDrawsConsumedToday: '0',
      dmnBehaviorAxisDrawsConsumedToday: '0',
      dmnTimeAxisMinutesAccrued: '0',
      dmnDrawsAvailable: '0',
      dmnGrantsTotal: '0',
      dmnLifetimeDrawsConsumed: '0',
    })
    const snapshot = async () => ({
      d: await readMeta('dmnLastDailyResetDate'),
      t: await readMeta('dmnTimeAxisDrawsConsumedToday'),
      b: await readMeta('dmnBehaviorAxisDrawsConsumedToday'),
      m: await readMeta('dmnTimeAxisMinutesAccrued'),
      a: await readMeta('dmnDrawsAvailable'),
      g: await readMeta('dmnGrantsTotal'),
      c: await readMeta('dmnLifetimeDrawsConsumed'),
    })
    await backfillDmnDailyCounters(db, incoming)
    const after1 = await snapshot()
    await backfillDmnDailyCounters(db, incoming)
    const after2 = await snapshot()
    expect(after2).toEqual(after1)
    // grants MAX(0,6)=6, consumes MAX(0,2)=2, derived = 4.
    expect(after1.g).toBe('6')
    expect(after1.c).toBe('2')
    expect(after1.a).toBe('4')
  })
})
