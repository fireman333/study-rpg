/**
 * Expedition (出征) — the all-subject wrong-question drill ritual
 * (add-neurons-study-squad, Phase 1 of Collection 2.0).
 *
 * 出征 deploys the active squad against the player's CURRENTLY-UNMASTERED
 * questions across ALL subjects (questionHistory.lastResult === 'wrong'), drawn
 * through the existing QuizModal. The "歷史曾錯" (everWrong) archive stays on
 * /bookmarks — the drill targets what you still get wrong.
 *
 * Capability spec: openspec/specs/neurons-study-squad/spec.md
 */

import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../db'

/**
 * Build the cross-subject expedition pool: questions whose latest result is
 * wrong. Pure (testable) — intersects the content pool with the wrong-result
 * history rows. NOT year- or family-filtered: 出征 is your wrong set regardless
 * of subject or exam year.
 *
 * @param pool    - Source pool, typically `pack.questions`.
 * @param history - `questionHistory` rows (typically from `useQuestionHistory`).
 */
export function buildWrongQuestionPool(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
): Question[] {
  const wrongIds = new Set(
    history.filter((h) => h.lastResult === 'wrong').map((h) => h.questionId),
  )
  if (wrongIds.size === 0) return []
  return pool.filter((q) => wrongIds.has(q.id))
}

/**
 * Summary of a completed expedition session, handed to the reward seam.
 */
export interface ExpeditionSession {
  /** Questions presented in the session. */
  total: number
  /** How many were answered correctly this run. */
  correct: number
}

/**
 * Reward seam — invoked when an expedition session ends.
 *
 * ⚠️ PHASE 1: this is an intentional NO-OP. It grants nothing and returns
 * nothing. It exists so `add-neurons-expedition-rewards` (Phase 4) can attach
 * probabilistic supplement / glial-cell reward dispatch here WITHOUT reworking
 * the squad / QuizModal / homepage wiring. Do NOT add reward, probabilistic,
 * gacha, currency, or pull-rate logic in this phase.
 */
export function onExpeditionComplete(_session: ExpeditionSession): void {
  // No-op extension point. Phase 4 replaces this body.
}
