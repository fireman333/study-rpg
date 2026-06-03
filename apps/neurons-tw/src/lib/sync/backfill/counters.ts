// MAX-merge monotonic counter backfill — step 1 of the onPullComplete
// triple-backfill hook per design D5.
//
// Counter keys live in Dexie `meta` table as string values. We parse to
// number, take max(local, incoming), write back. The basic LWW write that
// happens in tables.ts metaAdapter may have already placed `incoming` on
// disk if `local` was missing — this pass enforces the max-merge invariant.

import type { NeuronsDB } from '../../db'

/**
 * Meta keys treated as monotonic (max-merge) counters across devices.
 * `currentQuizCorrectStreak` is NOT included — it's a per-event counter that
 * can legitimately drop on wrong answer.
 */
const MAX_MERGE_KEYS: ReadonlyArray<string> = [
  'maxQuizCorrectStreak',
  'totalStudyMinutes',
  // Neural-energy pull currency (Collection 2.0). RETIRED by promote-maze-to-home
  // (manual pull removed); kept for reader tolerance / rollback safety.
  'neuralEnergyEarned',
  'neuralEnergySpent',
  // Maze per-branch energy economy (promote-maze-to-home / Model A). Per-branch
  // monotonic earned (faucet) + settles (pull count). MAX-merge converges
  // cross-device (both only ever increase).
  'maze:da:earned',
  'maze:5ht:earned',
  'maze:gaba:earned',
  'maze:glu:earned',
  'maze:da:settles',
  'maze:5ht:settles',
  'maze:gaba:settles',
  'maze:glu:settles',
]

/**
 * For each tracked counter key, read current Dexie value + the value
 * present in the bundle (if any) and write back max(local, incoming).
 *
 * Idempotent: running twice in a row writes the same final value (max is
 * commutative and absorbing).
 */
export async function backfillMaxMergeCounters(
  db: NeuronsDB,
  bundleMeta: Record<string, unknown>,
): Promise<{ updated: number; skipped: number }> {
  let updated = 0
  let skipped = 0
  await db.transaction('rw', db.meta, async () => {
    for (const key of MAX_MERGE_KEYS) {
      const localRow = await db.meta.get(key)
      const localValue = parseCounter(localRow?.value)
      const incomingRaw = bundleMeta[key]
      const incomingValue =
        typeof incomingRaw === 'string'
          ? parseCounter(incomingRaw)
          : typeof incomingRaw === 'number'
            ? incomingRaw
            : null

      // If neither side has a value, skip.
      if (localValue === null && incomingValue === null) {
        skipped++
        continue
      }
      const final = Math.max(localValue ?? 0, incomingValue ?? 0)
      const finalStr = String(final)
      if (localRow?.value === finalStr) {
        skipped++
        continue
      }
      await db.meta.put({ key, value: finalStr })
      updated++
    }
  })
  return { updated, skipped }
}

function parseCounter(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Extract the meta key/value entries from a parsed bundle snapshot. The
 * bundle's `meta` adapter ships an array of `{ key, value }` rows; this
 * folds them into a plain map for `backfillMaxMergeCounters`.
 */
export function extractBundleMetaMap(
  bundleData: Record<string, unknown[]> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!bundleData) return out
  const rows = bundleData['meta'] ?? []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (typeof r.key === 'string' && 'value' in r) {
      out[r.key] = r.value
    }
  }
  return out
}
