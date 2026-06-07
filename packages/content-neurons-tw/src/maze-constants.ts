/**
 * Flat-grid maze economy constants — the single source of truth for the
 * per-family neural-energy faucet + settle pacing (redesign-neurons-maze-rotjs-grid).
 *
 * Recalibrated from the prior 4-branch pools (PACING_BASE 24) for 11 fragmented
 * per-family pools: each pool now fills from ONE subject's answers only, so the
 * base cost drops and reading energy rises. Rebalanced again (PACING_BASE 14 → 11
 * + a RAMP_CAP_N ceiling) per `rebalance-neurons-maze-economy`: a snappier early
 * settle to hook players, and a capped ramp so the completionist tail (settles
 * past the cap) costs a flat amount instead of escalating without bound. All
 * values are dogfood-telemetry-tunable game-loop numbers (NOT OpenEvidence-
 * anchored — those are the neuro metaphors, not the balance constants). The caps
 * are the explicit guard against the `collection × streak × mastery × energyAccel
 * × synapse` positive-feedback runaway (design D5).
 */

/** Energy per correct answer, accrued into the answered subject's own family pool. */
export const CORRECT_ANSWER_ENERGY = 3

/** Energy per accrued reading minute, split across the player's active families. */
export const READING_MINUTE_ENERGY = 3

/**
 * Front-loaded linear pacing base: `cost(N) = round(PACING_BASE × (1 + PACING_K·min(N, RAMP_CAP_N)))`
 * for the N-th cumulative settle within a family (0-indexed). The ramp climbs for
 * the first RAMP_CAP_N settles, then flattens to a constant so the completionist
 * tail (settles past the cap) stays affordable. The settle INDEX itself is still
 * uncapped (二週目 + dupes continue) — only the per-settle cost function is capped.
 * Recalibrated 24 → 14 → 11 for per-family fragmentation + a snappier onboarding.
 */
export const PACING_BASE = 11
export const PACING_K = 0.1

/**
 * Cumulative-settle index at which the front-loaded `cost(N)` ramp flattens.
 * Past this index every settle costs `round(PACING_BASE × (1 + PACING_K·RAMP_CAP_N))`
 * (with the defaults: `round(11 × 3) = 33`). Chosen at the per-family node total
 * (route-1 10 + route-2 10 = 20) so the cap engages exactly where intended
 * progression ends and the completionist tail begins.
 */
export const RAMP_CAP_N = 20

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
