/**
 * Coverage-count derivation for the 考前收斂 calm view
 * (add-neurons-cram-calm-view). Counts distinct high-frequency 考點 (cram push
 * items) for which the player has answered ≥1 source question correctly.
 * Pure — derived live from cram.json push items ∩ consolidated question ids
 * (questionHistory `lastResult === 'correct'`). Zero schema, zero write path.
 *
 * Spec: openspec/specs/neurons-daily-prescription/spec.md (考前收斂 calm view)
 */
import type { CramBook } from '@study-rpg/content-neurons-tw'

/**
 * Number of distinct cram 考點 (push items) with ≥1 source question in
 * `consolidatedIds`. A concept counts once regardless of how many of its source
 * questions are consolidated (`.some`), and is never counted as a fraction or
 * against a total — this is a positive-only count, no denominator.
 */
export function countCoveredConcepts(
  books: readonly CramBook[],
  consolidatedIds: ReadonlySet<string>,
): number {
  if (consolidatedIds.size === 0) return 0
  let count = 0
  for (const book of books)
    for (const subj of book.subjects)
      for (const item of subj.push)
        if (item.sourceQuestionIds.some((id) => consolidatedIds.has(id))) count++
  return count
}
