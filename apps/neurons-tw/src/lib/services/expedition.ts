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
import { creditExpeditionDraws } from './dmn-trigger'

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
 * Reward seam — invoked when an expedition session ends
 * (add-neurons-expedition-rewards, Phase 4).
 *
 * Credits the DMN fate-card expedition axis: the session's `correct` count (in
 * the wrong-only expedition pool, equal to wrong→correct flips) against `total`
 * (the wrong pool the session opened against) drives the percentage-with-clamp
 * milestones (`DMN_EXPEDITION_MILESTONES`), granting up to 2 DMN draws/day.
 *
 * Best-effort: a reward failure MUST NOT throw out of the expedition close
 * flow. Fire-and-forget with a caught rejection.
 */
export function onExpeditionComplete(session: ExpeditionSession): void {
  void creditExpeditionDraws(session.total, session.correct).catch((err) => {
    console.error('[expedition-reward] DMN draw credit failed:', err)
  })
}
