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
// 3. `dmnDrawsAvailable` → simple MAX, regardless of date. Acknowledged
//    limitation (documented in spec): two concurrent consumes can collapse
//    into one (the loser's consume is lost — player-favoring refund, never
//    overdraft). An op-log upgrade (`dmnGrantsTotal` + `dmnConsumesTotal`
//    MAX projection) is permitted as a future enhancement; this pass takes
//    the simpler path.
//
// Hooked into `runOnPullComplete` as Step 1e after the
// counters / representatives / active-squad / first-pull passes.

import type { NeuronsDB } from '../../db'

const KEY_DATE = 'dmnLastDailyResetDate'
const KEY_DRAWS = 'dmnDrawsAvailable'
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

    // dmnDrawsAvailable: simple MAX, date-independent.
    const drawsLocalRow = await db.meta.get(KEY_DRAWS)
    const drawsLocal = parseNum(drawsLocalRow?.value)
    const drawsIncoming = parseNum(bundleMeta[KEY_DRAWS])
    const drawsMerged = Math.max(drawsLocal, drawsIncoming)
    const drawsMergedStr = String(drawsMerged)
    if (drawsLocalRow?.value === drawsMergedStr) {
      skipped++
    } else {
      await db.meta.put({ key: KEY_DRAWS, value: drawsMergedStr })
      updated++
    }
  })

  return { updated, skipped }
}
