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
 * Synaptic Conduction (rework-neurons-connectome-expedition-driven). REPLACES the
 * old invisible self-multiplying `synapseBonus`. A wired cross-subject pair, when
 * one subject earns a BATCH of energy (at expedition settlement / reading-session
 * end), sends a CAPPED, ADDITIVE, VISIBLE fraction of that batch to its wired
 * neighbor as conduction energy (a pulse). The visual IS the bonus. One-hop only
 * (no chaining), never strengthens wires, never counts as co-repair, additive-only
 * (an unwired family is never worse than baseline). All dogfood-tunable; the caps
 * are the runaway/mega-hub guard. Decisions: openspec/decisions/2026-06-08-connectome-conduction-roadmap.md
 */
/** Conduction rate by synapse state, applied to the source's post-multiplier batch energy. */
export const CONDUCTION_RATE_WEAK = 0.06
export const CONDUCTION_RATE_STRONG = 0.12
/** Per-wire / per-source-family / per-target-family daily conduction caps (energy). */
export const CONDUCTION_WIRE_CAP_WEAK = 8
export const CONDUCTION_WIRE_CAP_STRONG = 15
export const CONDUCTION_SOURCE_CAP_PER_DAY = 45
export const CONDUCTION_TARGET_CAP_PER_DAY = 30
/**
 * Conduction-rework ship epoch (local ISO date). A synapse whose `lastCoFireDate`
 * precedes this is a LEGACY same-day-co-fire wire: it renders as 早期連線, is excluded
 * from the「穩定連線數」stat, and does NOT conduct — until a new expedition co-repair
 * re-validates it (updates `lastCoFireDate` to ≥ this epoch). (design D12)
 */
export const CONNECTOME_CONDUCTION_EPOCH = '2026-06-08'
