/**
 * Hospital tier progression for the 二階 medexam2 content pack.
 *
 * Locked by `wire-clinic-level-up` change (2026-05-15) and recalibrated by
 * `redesign-hospital-economy` (2026-05-17): now four monotonic tiers with
 * dual-gate progression (reputation threshold AND diversification helper).
 *
 * Per-tier room rosters are cumulative supersets (deterministic ids) so tier
 * upgrades can `bulkPut(TIER_ROOMS[next])` idempotently without losing
 * assignments.
 */

import type { SubjectId } from '@study-rpg/core'
import type { Room } from './rooms'
import type { Rarity } from './recruitment'

export type HospitalTier = '診所' | '區域醫院' | '醫學中心' | '國家級教學醫院'

export const TIER_ORDER: HospitalTier[] = ['診所', '區域醫院', '醫學中心', '國家級教學醫院']

// TUNED 2026-05-18 — first dogfood pass; revisit after 1-2 weeks of telemetry.
// Recalibrated by `add-quiz-economy-redesign` to align with the 30-day endgame
// target under the new quiz-driven reward formula (see that change's design.md
// 1-month full-clear math model). Old values (48k / 192k / 2M) assumed reading
// session was the sole income source; quiz-first economy lowers the bar.
export const TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null> = {
  診所: 30_000,
  區域醫院: 80_000,
  醫學中心: 150_000,
  國家級教學醫院: null,
}

function room(id: string, type: Room['type'], slot: number): Room {
  return { id, type, baseRate: 10, roomFacility: 1.0, facilityLevel: 1, assignedDoctorId: null, slot }
}

export const TIER_ROOMS: Record<HospitalTier, Room[]> = {
  診所: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
  ],
  區域醫院: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
    room('outpatient-4', 'outpatient', 4),
    room('surgery-1', 'surgery', 1),
  ],
  醫學中心: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
    room('outpatient-4', 'outpatient', 4),
    room('surgery-1', 'surgery', 1),
    room('surgery-2', 'surgery', 2),
    room('ward-1', 'ward', 1),
  ],
  國家級教學醫院: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
    room('outpatient-4', 'outpatient', 4),
    room('outpatient-5', 'outpatient', 5),
    room('surgery-1', 'surgery', 1),
    room('surgery-2', 'surgery', 2),
    room('surgery-3', 'surgery', 3),
    room('ward-1', 'ward', 1),
    room('ward-2', 'ward', 2),
  ],
}

export function getNextTier(current: HospitalTier): HospitalTier | null {
  const idx = TIER_ORDER.indexOf(current)
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}

/**
 * Diversification gate requirements per current tier (for advancing to the
 * NEXT tier). The relaxation from spec draft's 12 → 10 P2+ subjects reflects
 * 二階 corpus having only 14 subjects total — 85% coverage at P2 was infeasible
 * within the 30-day endgame target.
 *
 * `requireP1`: at least one P1 doctor (any subject — duplicate-subject P1
 * counts; it's a "you need a top-tier doctor somewhere" gate, not subject
 * diversity).
 *
 * Terminal tier (國家級教學醫院) has no further upgrade, so no entry needed.
 */
export interface TierDiversificationRequirement {
  /** Minimum rarity that contributes to the count (P5 = any rarity). */
  minRarity: Rarity
  /** Number of distinct subjects required at `minRarity` or higher. */
  requiredCount: number
  /** If true, at least one P1 doctor (any subject) is also required. */
  requireP1?: boolean
}

export const TIER_DIVERSIFICATION_REQUIREMENTS: Record<
  Exclude<HospitalTier, '國家級教學醫院'>,
  TierDiversificationRequirement
> = {
  診所: { minRarity: 'P5', requiredCount: 5 },
  區域醫院: { minRarity: 'P3', requiredCount: 8 },
  醫學中心: { minRarity: 'P2', requiredCount: 10, requireP1: true },
}

/** Rarity ordering: P1 > P2 > P3 > P4 > P5. */
const RARITY_RANK: Record<Rarity, number> = { P1: 5, P2: 4, P3: 3, P4: 2, P5: 1 }

export function rarityIsAtLeast(rarity: Rarity, minRarity: Rarity): boolean {
  return RARITY_RANK[rarity] >= RARITY_RANK[minRarity]
}

/**
 * Count unique `subjectId` values across `doctors` where rarity ≥ `minRarity`.
 * Used by tier-upgrade dual-gate evaluation. Order-independent. P5 minRarity =
 * "any rarity, just count distinct subjects".
 */
export function countDistinctSubjectsAtRarity(
  doctors: ReadonlyArray<{ subjectId: SubjectId; rarity: Rarity }>,
  minRarity: Rarity,
): number {
  const seen = new Set<SubjectId>()
  for (const d of doctors) {
    if (rarityIsAtLeast(d.rarity, minRarity)) seen.add(d.subjectId)
  }
  return seen.size
}
