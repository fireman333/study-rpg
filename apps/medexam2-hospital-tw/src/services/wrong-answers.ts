/**
 * Wrong-answers — derived live view of `hospital_question_history` filtered to
 * rows whose `lastResult === 'wrong'`.
 *
 * Per add-wrong-answer-list-medexam2 design.md Decision 2:
 *   - No separate Dexie store, no Supabase mirror — questionHistory IS the source of truth
 *   - Existing `recordWrongAnswer` / `recordCorrectAnswer` (lib/mastery.ts) flips
 *     `lastResult` and that's the sole driver
 *   - Cross-device "answer-right-removes-wrong" works for free via history sync
 *   - Compound index `[lastResult+lastAnsweredAt]` (Dexie v11) avoids full scan
 */

import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { getHospitalDB, type QuestionHistoryRow } from '../db/schema'

/**
 * Live-query the derived wrong-answer list: every questionHistory row whose
 * `lastResult === 'wrong'`, sorted by `lastAnsweredAt` descending (newest first).
 *
 * Returns `undefined` while the query is in flight (Dexie convention), or the
 * sorted array (possibly empty) once resolved.
 */
export function useWrongAnswers(): QuestionHistoryRow[] | undefined {
  return useLiveQuery(() =>
    getHospitalDB()
      .questionHistory
      .where('[lastResult+lastAnsweredAt]')
      .between(['wrong', Dexie.minKey], ['wrong', Dexie.maxKey])
      .reverse()
      .toArray(),
  )
}
