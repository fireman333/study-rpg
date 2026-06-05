/**
 * Flat-grid maze economy constants — the single source of truth for the
 * per-family neural-energy faucet + settle pacing (redesign-neurons-maze-rotjs-grid).
 *
 * Recalibrated from the prior 4-branch pools (PACING_BASE 24) for 11 fragmented
 * per-family pools: each pool now fills from ONE subject's answers only, so the
 * base cost drops and reading energy rises. All values are dogfood-telemetry-
 * tunable game-loop numbers (NOT OpenEvidence-anchored — those are the neuro
 * metaphors, not the balance constants). The caps are the explicit guard against
 * the `collection × streak × mastery × energyAccel × synapse` positive-feedback
 * runaway (design D5).
 */

/** Energy per correct answer, accrued into the answered subject's own family pool. */
export const CORRECT_ANSWER_ENERGY = 3

/** Energy per accrued reading minute, split across the player's active families. */
export const READING_MINUTE_ENERGY = 3

/**
 * Front-loaded linear pacing base: `cost(N) = round(PACING_BASE × (1 + PACING_K·N))`
 * for the N-th cumulative settle within a family (0-indexed, uncapped into 二週目).
 * Recalibrated 24 → 14 for per-family fragmentation (cheaper onboarding per pool).
 */
export const PACING_BASE = 14
export const PACING_K = 0.1

/** Per-collected-variant team-speed buff; capped so an over-collected team can't trivialize. */
export const SPEED_BUFF_PER_VARIANT = 0.04
export const SPEED_BUFF_CAP = 1.0 // max +100% → 2× base

/**
 * Synapse cross-family LTP bonus (design D6). Each STRONG synapse a family
 * participates in adds `SYNAPSE_BONUS_PER` to its energy-accrual multiplier,
 * summed across its strong synapses and clamped to `SYNAPSE_BONUS_CAP` (LTP only,
 * no LTD/decay penalty). First-cut +6%/synapse, total ≤ +30%.
 */
export const SYNAPSE_BONUS_PER = 0.06
export const SYNAPSE_BONUS_CAP = 0.3 // max +30% over base
