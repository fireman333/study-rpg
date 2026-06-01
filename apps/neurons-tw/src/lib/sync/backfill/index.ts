// onPullComplete orchestrator — runs the design-D5 triple backfill in
// strict order with per-step error isolation.

import type { NeuronsDB } from '../../db'
import { backfillAchievementsFromCurrentStats } from '../../services/achievement'
import { deriveBadgesCsvFromDexie } from '../../services/neurons-leaderboard'
import type { PullBundleResult } from '../r2/engine-r2'
import {
  backfillMaxMergeCounters,
  extractBundleMetaMap,
} from './counters'
import { backfillRepresentativesLWW } from './representatives'

export async function runOnPullComplete(
  db: NeuronsDB,
  pull: PullBundleResult,
): Promise<void> {
  // Step 1 — MAX-merge counters. Must run BEFORE step 2 (achievement
  // predicates depend on counter state).
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillMaxMergeCounters(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1 (counters) failed', err)
  }

  // Step 1b — Representative-variant LWW reconcile (independent of counters /
  // achievements; the meta adapter is first-write-wins, this enforces LWW).
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillRepresentativesLWW(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1b (representatives) failed', err)
  }

  // Step 2 — Achievement backfill. Silent (no toast / no reward dispatch).
  try {
    await backfillAchievementsFromCurrentStats()
  } catch (err) {
    console.warn('[sync.backfill] step 2 (achievements) failed', err)
  }

  // Step 3 — Leaderboard derived field. Recompute badges_csv so the next
  // push carries latest state to D1.
  try {
    const badges = await deriveBadgesCsvFromDexie()
    const profiles = await db.leaderboardProfile.toArray()
    if (profiles.length > 0) {
      const profile = profiles[0]!
      if ((profile as unknown as { badges_csv?: string }).badges_csv !== badges) {
        await db.leaderboardProfile.put({
          ...profile,
          // The Dexie row currently has no badges_csv field — push pipeline
          // derives it on the fly in lib/services/neurons-leaderboard.ts.
          // We just keep the row touched so the next push fires.
        } as never)
      }
    }
    // Suppress unused-variable lint when no profile present.
    void badges
  } catch (err) {
    console.warn('[sync.backfill] step 3 (leaderboard derived) failed', err)
  }
}
