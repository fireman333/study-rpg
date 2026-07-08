/**
 * Single-subject rescue — stop-loss intervention switch + override semantics (pure).
 *
 * When a concept stays stuck (≥6 attempts today, recent accuracy <40%), the engine
 * switches intervention by Yield: a HIGH-frequency stuck concept gets a forced
 * re-read then re-test (retrieval is useless on never-encoded material); a
 * LOW-frequency stuck concept is demoted (×0.15) to free time for recoverable work.
 * A player override ("我就是要繼續練這塊") is a device-local, BOUNDED exception that
 * auto-re-evaluates after 24h or 6 more attempts and is served from a separate 加練
 * quota (it never displaces the core queue, and never counts as algorithm success).
 *
 * Spec: neurons-single-subject-rescue "Stop-loss SHALL switch intervention...".
 */

import type { YieldBand } from './rescue-priority'

export const STOP_LOSS_MIN_ATTEMPTS = 6 // DOGFOOD-TUNABLE
export const STOP_LOSS_MAX_ACCURACY = 0.4 // DOGFOOD-TUNABLE
export const STOP_LOSS_DEMOTE_MULT = 0.15
export const OVERRIDE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h
export const OVERRIDE_MAX_ATTEMPTS = 6

export type StopLossAction = 'none' | 'reread' | 'demote'

export interface ConceptStats {
  attemptsToday: number
  /** Recent accuracy in [0,1]. */
  recentAccuracy: number
}

/** Is the concept stuck enough to trip stop-loss? Pure. */
export function isStuck(stats: ConceptStats): boolean {
  return stats.attemptsToday >= STOP_LOSS_MIN_ATTEMPTS && stats.recentAccuracy < STOP_LOSS_MAX_ACCURACY
}

/**
 * The intervention for a stuck concept, switched by Yield:
 *   high/mid frequency → 're-read' (inject kernel card, re-test later)
 *   low frequency      → 'demote'  (×0.15, give the time to recoverable work)
 * A not-stuck concept → 'none'. Pure.
 */
export function stopLossAction(stats: ConceptStats, yieldBand: YieldBand): StopLossAction {
  if (!isStuck(stats)) return 'none'
  return yieldBand === 'low' ? 'demote' : 'reread'
}

/** Priority multiplier from a stop-loss action (only 'demote' lowers priority). Pure. */
export function stopLossDemotion(action: StopLossAction): number {
  return action === 'demote' ? STOP_LOSS_DEMOTE_MULT : 1
}

export interface OverrideState {
  /** epoch ms the override was set. */
  setAt: number
  /** attempts recorded on this concept at the moment of override. */
  attemptsAtOverride: number
}

/**
 * A player override auto-expires (re-evaluates) after 24h OR 6 more attempts. Pure —
 * caller supplies `now` and the concept's current attempt count.
 */
export function isOverrideExpired(
  override: OverrideState,
  now: number,
  currentAttempts: number,
): boolean {
  if (now - override.setAt >= OVERRIDE_MAX_AGE_MS) return true
  if (currentAttempts - override.attemptsAtOverride >= OVERRIDE_MAX_ATTEMPTS) return true
  return false
}
