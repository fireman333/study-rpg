/**
 * Finance constants and helpers for the 二階 medexam2 content pack.
 *
 * Locked by `redesign-hospital-economy` (2026-05-17). Three sinks consume
 * `gameCounters.revenue`:
 *
 * 1. **Salary** — proportional to `doctor.powerMultiplier`, applied to ALL
 *    owned doctors (assigned + bench). Tier 診所 is grace (0%); tiers 2-4
 *    apply 100%. Math invariant from design D5: default config in every tier
 *    is net positive → 0-floor clamp is defensive, not load-bearing.
 * 2. **Facility upgrade** — increments `room.roomFacility` (1.0 → 3.0 across
 *    5 levels). Costs scale geometrically.
 * 3. **Room extension** — additional rooms beyond the tier-default roster,
 *    unlocked at 區域醫院 tier and above.
 *
 * All numeric constants are LITERALS (not runtime-computed) so a dogfood tune
 * is a single-file diff. Helpers (`computeSalaryDrain`, `applySalaryClamp`)
 * are pure functions — caller threads them through the tick loop.
 */

import type { HospitalTier } from './clinic-tiers'
import type { RoomType } from './rooms'

/**
 * Salary base rate: revenue deducted per `powerMultiplier × minute` of doctor
 * ownership. Multiplied by the tier rate below.
 *
 * Derived rates (per minute, at 100% tier rate):
 *   P1 (×5.0) → 20    P2 (×3.5) → 14    P3 (×2.0) →  8
 *   P4 (×1.0) →  4    P5 (×0.5) →  2
 */
export const SALARY_BASE = 4

/**
 * Tier-staged salary activation. 診所 has 0% grace (onboarding); 區域醫院 and
 * above run full salary. Per design D5, the math at every tier in default
 * config yields net positive revenue — the salary is a payroll *pressure*
 * rewarding facility/extension investment, not a deadlock risk.
 */
export const TIER_SALARY_RATE: Record<HospitalTier, number> = {
  診所: 0,
  區域醫院: 1.0,
  醫學中心: 1.0,
  國家級教學醫院: 1.0,
}

/**
 * Facility upgrade cost ladder per room. Index = target level (1-indexed),
 * value = revenue cost to advance into that level. Level 1 is the seed value
 * so `FACILITY_UPGRADE_COSTS[1]` is unused (kept as 0 for symmetric indexing).
 * Level 5 is the cap; UI SHALL disable upgrade once `room.roomFacility = 3.0`.
 */
export const FACILITY_UPGRADE_COSTS: ReadonlyArray<number> = Object.freeze([
  0,        // index 0: unused
  0,        // level 1 (default)
  10_000,   // level 2 — roomFacility 1.5
  50_000,   // level 3 — roomFacility 2.0
  200_000,  // level 4 — roomFacility 2.5
  1_000_000,// level 5 — roomFacility 3.0 (max)
])

/** roomFacility value at each upgrade level (1-indexed; index 0 unused). */
export const FACILITY_LEVEL_TO_FACILITY: ReadonlyArray<number> = Object.freeze([
  0,    // unused
  1.0,  // level 1 default
  1.5,
  2.0,
  2.5,
  3.0,  // level 5 cap
])

/** Maximum facility level (after upgrades). */
export const FACILITY_MAX_LEVEL = 5

/** Per-room-type cost + max-extension cap (beyond tier default). */
export const ROOM_EXTENSION_COSTS: Readonly<Record<RoomType, { cost: number; maxExtras: number }>> = Object.freeze({
  outpatient: { cost: 20_000, maxExtras: 3 },
  surgery: { cost: 100_000, maxExtras: 2 },
  ward: { cost: 300_000, maxExtras: 2 },
})

/**
 * Tiers where room extension is permitted. 診所 is locked (must upgrade first
 * to access extension UI). All other tiers allow extension.
 */
export const ROOM_EXTENSION_UNLOCKED_TIERS: ReadonlyArray<HospitalTier> = Object.freeze([
  '區域醫院',
  '醫學中心',
  '國家級教學醫院',
])

/** Minimal doctor shape `computeSalaryDrain` reads. */
export interface SalaryDoctor {
  powerMultiplier: number
}

/**
 * Salary drain (revenue lost per minute) summed across ALL owned doctors,
 * scaled by the current tier's salary rate.
 *
 *   drain = Σ doctor.powerMultiplier × SALARY_BASE × TIER_SALARY_RATE[tier]
 *
 * Bench (unassigned) doctors are included — they still draw salary per spec
 * `hospital-finances` Req 1. Returns 0 at 診所 tier (grace period).
 */
export function computeSalaryDrain(
  allOwnedDoctors: ReadonlyArray<SalaryDoctor>,
  tier: HospitalTier,
): number {
  const rate = TIER_SALARY_RATE[tier]
  if (rate === 0) return 0
  let total = 0
  for (const d of allOwnedDoctors) {
    total += d.powerMultiplier * SALARY_BASE * rate
  }
  return total
}

/**
 * Defensive 0-floor clamp for the tick revenue update. Per design D5, default
 * config in every tier yields net positive revenue (gross > salary). This
 * helper exists for edge cases — manual save manipulation, future
 * misconfiguration, or unbalanced dogfood tuning. Caller passes the per-tick
 * deltas (already pro-rated to elapsed seconds); helper returns the next
 * revenue value, clamped at 0.
 */
export function applySalaryClamp(
  currentRevenue: number,
  gross: number,
  salary: number,
): number {
  const next = currentRevenue + gross - salary
  return next < 0 ? 0 : next
}
