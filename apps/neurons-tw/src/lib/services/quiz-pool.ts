/**
 * Quiz pool filter — supports the family-subject picker on Overview.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Overview SHALL surface a family subject picker that filters the active
 *   quiz pool"
 *
 * Pure filter mode: takes a pool of Questions + optional familyId; returns
 * the unrestricted pool when familyId is null/undefined (existing behavior),
 * otherwise restricts to questions whose `subject` resolves to that family.
 *
 * Downstream mechanics (rewards / SRS / DMN trigger / mastery accrual) operate
 * unchanged — they read `subject` from the served question itself.
 */

import type { Question } from '@study-rpg/core'

/** Minimal shape `filterPoolByNewOnly` needs from a question-history row. */
interface AnsweredRef {
  questionId: string
}

/**
 * Filter a question pool by family. Returns a new array (does not mutate input).
 *
 * @param pool - Source pool, typically `pack.questions`
 * @param familyId - Family identifier (from `pack.subjects[].id`). Pass null
 *                   or undefined to disable filtering and return the full pool.
 */
export function filterPoolByFamily(
  pool: readonly Question[],
  familyId: string | null | undefined,
): Question[] {
  if (familyId == null) return [...pool]
  return pool.filter((q) => q.subject === familyId)
}

/**
 * Filter a question pool by exam year. Keeps only questions whose `meta.year`
 * is in `yearSet`. Returns a new array. Callers should skip calling this when
 * the year filter spans all years (a no-op) to avoid scanning the full corpus.
 *
 * Used by the homepage year filter (per neurons-quiz-year-filter spec) for both
 * the quiz pool and the random-CTA count, so the predicate lives in one place.
 */
export function filterPoolByYear(
  pool: readonly Question[],
  yearSet: ReadonlySet<number>,
): Question[] {
  return pool.filter((q) => typeof q.meta?.year === 'number' && yearSet.has(q.meta.year))
}

/**
 * Filter a question pool down to NEVER-answered questions — the 🆕 新題 mode
 * (add-neurons-quiz-mode-chips-and-srs). A question is "new" iff it has no
 * `questionHistory` row. Returns a new array. Compose after `filterPoolByFamily`
 * / `filterPoolByYear`.
 *
 * @param pool - typically a family + year-scoped pool
 * @param history - the questionHistory rows (any object carrying `questionId`)
 */
export function filterPoolByNewOnly(
  pool: readonly Question[],
  history: readonly AnsweredRef[],
): Question[] {
  const answered = new Set(history.map((h) => h.questionId))
  return pool.filter((q) => !answered.has(q.id))
}
