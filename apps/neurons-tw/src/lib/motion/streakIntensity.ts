/**
 * Streak-scaled correct-answer feedback intensity (continuous).
 *
 * Maps the player's current correct-answer streak to a feedback-intensity
 * multiplier consumed by the correct-answer spike-train burst, so the most
 * frequent positive feedback in the core loop escalates with sustained correct
 * answers. The scaling is CONTINUOUS (no discrete tiers) and HARD-CAPPED — both
 * constants are dogfood-tunable.
 *
 * Pure / stateless: callers read the already-persisted streak at call time and
 * pass it in. Adds NO new persisted state and NO sync-surface change. Existing
 * motion timing tokens are unaffected — intensity scales visual magnitude only.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Correct-answer feedback intensity SHALL scale continuously with the
 *    current answer streak"
 */

/** Per-streak intensity increment (dogfood-tunable). */
export const STREAK_INTENSITY_STEP = 0.12

/** Hard intensity cap so escalation cannot grow unbounded (dogfood-tunable). */
export const STREAK_INTENSITY_MAX = 2.2

/**
 * Continuous intensity multiplier for a given correct-answer streak.
 * streak 0 → 1.0 (baseline); grows linearly by `STREAK_INTENSITY_STEP` per
 * streak; clamped to `[1, STREAK_INTENSITY_MAX]`.
 */
export function streakFeedbackIntensity(streak: number): number {
  const s = Number.isFinite(streak) && streak > 0 ? streak : 0
  return Math.min(STREAK_INTENSITY_MAX, 1 + s * STREAK_INTENSITY_STEP)
}
