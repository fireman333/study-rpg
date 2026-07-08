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
import { backfillActiveSquadLWW } from './active-squad'
import { backfillFirstPullFamiliesUnion } from './first-pull'
import { backfillDmnDailyCounters } from './dmn-daily'
import { backfillPrescriptionPlanMinLWW } from './prescription-plan'
import { backfillRescueLWW } from './rescue'

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

  // Step 1c — Active-squad LWW reconcile (independent of counters / achievements;
  // the meta adapter is first-write-wins, this enforces LWW). Per
  // add-neurons-study-squad.
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillActiveSquadLWW(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1c (active-squad) failed', err)
  }

  // Step 1d — Per-family first-pull UNION reconcile (monotonic set; the meta
  // adapter is first-write-wins, this enforces union). Per
  // add-neurons-first-pull-path-rep.
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillFirstPullFamiliesUnion(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1d (first-pull) failed', err)
  }

  // Step 1e — DMN daily-entitlement keys: date-gated MAX for the 3 per-day
  // counters + lexicographic MAX for the reset-date + simple MAX for the
  // entitlement pool. Per tighten-neurons-dmn-entitlement-semantics.
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillDmnDailyCounters(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1e (dmn-daily) failed', err)
  }

  // Step 1f — Prescription plan earliest-createdAt-wins MIN-LWW (per-(account,
  // date) daily-quest plan; the meta adapter is first-write-wins, this enforces
  // the earliest-wins merge). Per add-neurons-prescription-tiers-and-sync.
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillPrescriptionPlanMinLWW(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1f (prescription-plan) failed', err)
  }

  // Step 1g — Single-subject rescue LWW reconcile: plan-envelope
  // latest-action-wins (explicit-null clears), per-key confidence / override
  // LWW. The meta adapter is first-write-wins; this enforces the family's real
  // merge. Per add-neurons-rescue-r2-sync. No cross-step dependency.
  try {
    const incomingMeta = pull.snapshot
      ? extractBundleMetaMap(pull.snapshot.data)
      : {}
    await backfillRescueLWW(db, incomingMeta)
  } catch (err) {
    console.warn('[sync.backfill] step 1g (rescue) failed', err)
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
