/**
 * Pure helpers for the shared /bookmarks filter bar (科目 family + 年份 year +
 * ✨/🤔 標記), applied across all three sub-tabs.
 *
 * Spec: openspec/specs/neurons-wrong-answer-list/spec.md
 *   "Exam year SHALL be derived from the question id prefix"
 *   "The three tabs SHALL share one filter bar"
 */

/**
 * Parse the 民國 exam year from a question id prefix:
 *   "106-1-醫學一-解剖學-Q1" → "106"
 * A non-numeric prefix falls into the "unknown" bucket.
 */
export function parseExamYear(questionId: string): string {
  const head = questionId.split('-')[0] ?? ''
  return /^\d+$/.test(head) ? head : 'unknown'
}

export interface WrongAnswerFilterState {
  /** Families the user has toggled ON (inclusion model, mirrors 題庫 chips). Empty = all families shown. */
  selectedFamilies: Set<string>
  /** Exam years toggled ON (inclusion model). Empty = all years shown. */
  selectedYears: Set<string>
  /** Show only questions flagged ✨ 太簡單. */
  easyOnly: boolean
  /** Show only questions flagged 🤔 我亂猜的. */
  guessedOnly: boolean
}

/**
 * Shared predicate for every /bookmarks tab. `family` is the row's family;
 * the exam year is derived from `questionId`. `flag` is the question's flag
 * state (undefined when the question has no flag row).
 */
export function matchesWrongAnswerFilter(
  item: { family: string; questionId: string },
  filter: WrongAnswerFilterState,
  flag: { easyMarked: boolean; guessedMarked: boolean } | undefined,
): boolean {
  if (filter.selectedFamilies.size > 0 && !filter.selectedFamilies.has(item.family)) return false
  if (filter.selectedYears.size > 0 && !filter.selectedYears.has(parseExamYear(item.questionId))) return false
  if (filter.easyOnly && !flag?.easyMarked) return false
  if (filter.guessedOnly && !flag?.guessedMarked) return false
  return true
}
