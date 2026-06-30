// Date-gated MAX merge for DMN daily-entitlement meta keys.
//
// Per `tighten-neurons-dmn-entitlement-semantics` capability spec:
// the 5 keys (`dmnDrawsAvailable`, `dmnLastDailyResetDate`,
// `dmnTimeAxisDrawsConsumedToday`, `dmnBehaviorAxisDrawsConsumedToday`,
// `dmnTimeAxisMinutesAccrued`) need explicit cross-device merge semantics
// because plain LWW (the meta adapter's missing-only insert fallback) would
// let two-device races silently swallow entitlement or duplicate-grant.
//
// Algorithm:
// 1. `dmnLastDailyResetDate` → lexicographic MAX (YYYY-MM-DD `en-CA` format
//    sorts correctly).
// 2. The 3 per-day counters (`*ConsumedToday`, `MinutesAccrued`) are tallied
//    against `dmnLastDailyResetDate`. When the merged date advances, the
//    local counters reset to 0 first (one-shot lazy reset). An incoming
//    counter from an older date is treated as 0 (stale, ignored). Same-date
//    incoming and local merge by MAX.
// 3. The entitlement pool is now a DERIVED projection of two monotonic-MAX
//    counters (fix-neurons-dmn-draw-entitlement-resurrection):
//      dmnGrantsTotal   (lifetime granted)  → MAX
//      dmnConsumesTotal (= dmnLifetimeDrawsConsumed, lifetime spent) → MAX
//      dmnDrawsAvailable = clamp(grants − consumes, ≥ 0)  → re-derived, NOT merged
//    A raw MAX of the bidirectional `dmnDrawsAvailable` (the old code) could not
//    represent the consume direction, so a spent draw was resurrected whenever a
//    pull read a stale-higher cloud value. Reader-tolerance: a side that predates
//    `dmnGrantsTotal` seeds it from `available + consumes` (NEVER 0). Accepted
//    limitation: two devices consuming from the same base collapse to one consume
//    (player-favoring refund, never overdraft).
//
// Hooked into `runOnPullComplete` as Step 1e after the
// counters / representatives / active-squad / first-pull passes.

import type { NeuronsDB } from '../../db'
import { deriveDrawsAvailable, seedGrantsTotal } from '../../services/dmn-entitlement'

const KEY_DATE = 'dmnLastDailyResetDate'
const KEY_DRAWS = 'dmnDrawsAvailable'
const KEY_GRANTS = 'dmnGrantsTotal'
const KEY_CONSUMES = 'dmnLifetimeDrawsConsumed'
const PER_DAY_KEYS: ReadonlyArray<string> = [
  'dmnTimeAxisDrawsConsumedToday',
  'dmnBehaviorAxisDrawsConsumedToday',
  'dmnTimeAxisMinutesAccrued',
]

function parseNum(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function parseDate(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

export async function backfillDmnDailyCounters(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: number; skipped: number }> {
  let updated = 0
  let skipped = 0

  await db.transaction('rw', db.meta, async () => {
    const localDateRow = await db.meta.get(KEY_DATE)
    const prevLocalDate = parseDate(localDateRow?.value)
    const incomingDate = parseDate(bundleMeta[KEY_DATE])
    const mergedDate = prevLocalDate > incomingDate ? prevLocalDate : incomingDate

    if (mergedDate !== prevLocalDate) {
      await db.meta.put({ key: KEY_DATE, value: mergedDate })
      updated++
    } else {
      skipped++
    }

    // Per-day counters: zero local if date advanced; only fold incoming when
    // incoming's date matches the merged date.
    const localAdvanced = mergedDate > prevLocalDate
    const incomingFresh = incomingDate === mergedDate

    for (const key of PER_DAY_KEYS) {
      const localRow = await db.meta.get(key)
      const localValue = localAdvanced ? 0 : parseNum(localRow?.value)
      const incomingValue = incomingFresh ? parseNum(bundleMeta[key]) : 0
      const merged = Math.max(localValue, incomingValue)
      const mergedStr = String(merged)
      if (localRow?.value === mergedStr) {
        skipped++
        continue
      }
      await db.meta.put({ key, value: mergedStr })
      updated++
    }

    // Entitlement projection: merge grants/consumes by monotonic MAX (seeding
    // grants from available+consumes on any side that predates the counter),
    // then RE-DERIVE dmnDrawsAvailable. Never raw-MAX the bidirectional pool.
    const localAvailRow = await db.meta.get(KEY_DRAWS)
    const localAvail = parseNum(localAvailRow?.value)
    const localConsumesRow = await db.meta.get(KEY_CONSUMES)
    const localConsumes = parseNum(localConsumesRow?.value)
    const localGrantsRow = await db.meta.get(KEY_GRANTS)
    const localGrants = seedGrantsTotal({
      grantsTotal: localGrantsRow ? parseNum(localGrantsRow.value) : null,
      drawsAvailable: localAvail,
      consumesTotal: localConsumes,
    })

    const incomingAvail = parseNum(bundleMeta[KEY_DRAWS])
    const incomingConsumes = parseNum(bundleMeta[KEY_CONSUMES])
    const incomingGrantsRaw = bundleMeta[KEY_GRANTS]
    const incomingGrants = seedGrantsTotal({
      grantsTotal: incomingGrantsRaw == null ? null : parseNum(incomingGrantsRaw),
      drawsAvailable: incomingAvail,
      consumesTotal: incomingConsumes,
    })

    const mergedGrants = Math.max(localGrants, incomingGrants)
    const mergedConsumes = Math.max(localConsumes, incomingConsumes)
    const mergedAvail = deriveDrawsAvailable(mergedGrants, mergedConsumes)

    for (const [key, row, value] of [
      [KEY_GRANTS, localGrantsRow, mergedGrants],
      [KEY_CONSUMES, localConsumesRow, mergedConsumes],
      [KEY_DRAWS, localAvailRow, mergedAvail],
    ] as const) {
      const valueStr = String(value)
      if (row?.value === valueStr) {
        skipped++
      } else {
        await db.meta.put({ key, value: valueStr })
        updated++
      }
    }
  })

  return { updated, skipped }
}
