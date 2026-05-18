import { SRS_DAILY_CAP } from '@study-rpg/core'
import type { SubjectId } from '@study-rpg/core'
import { getHospitalDB, type QuestionHistoryRow } from '../db/schema'
import { loadQuestionsByIdMap } from './quiz'

/**
 * Dogfood A/B switch. Visiting `?srs=off` (e.g. `/hospital/?srs=off#/`)
 * forces the scheduler to return empty queues, effectively disabling the
 * banner due badge and the due-first picker. Useful for comparing with/without
 * SRS surface without redeploying.
 */
function isSrsDisabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('srs') === 'off'
}

/**
 * Reads all due `questionHistory` rows, groups by subjectId, sorts each group
 * by overdue days descending (oldest overdue first). Subjects without any due
 * card are omitted.
 */
export async function getDueQueueAllSubjects(
  now: number = Date.now(),
): Promise<Map<SubjectId, QuestionHistoryRow[]>> {
  if (isSrsDisabled()) return new Map()
  const db = getHospitalDB()
  const [all, byId] = await Promise.all([db.questionHistory.toArray(), loadQuestionsByIdMap()])
  const grouped = new Map<SubjectId, QuestionHistoryRow[]>()
  for (const row of all) {
    if (row.nextDueAt === null) continue
    if (row.nextDueAt > now) continue
    // Suppress option-image questions at the surface. Row stays on disk so
    // historical mastery/affinity state is preserved; it just doesn't surface
    // in the「🔴 N due」chip or the due-first picker. Orphan rows (questionId
    // not in current pack at all) keep the pass-through behavior they had
    // before this filter.
    const q = byId.get(row.questionId)
    if (q && q.hasOptionImages === true) continue
    const list = grouped.get(row.subjectId) ?? []
    list.push(row)
    grouped.set(row.subjectId, list)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.nextDueAt as number) - (b.nextDueAt as number))
  }
  return grouped
}

/**
 * Round-robin cap allocation. One pop per subject per round until `cap` slots
 * are filled or every queue is empty. Within-subject ordering is preserved
 * (caller sorts before passing in).
 *
 * Returns a new Map containing only the cap-allowed slice for each subject;
 * subjects whose entire queue was carried forward are omitted.
 */
export function allocateDailyCap(
  grouped: Map<SubjectId, QuestionHistoryRow[]>,
  cap: number = SRS_DAILY_CAP,
): Map<SubjectId, QuestionHistoryRow[]> {
  const allocated = new Map<SubjectId, QuestionHistoryRow[]>()
  if (cap <= 0 || grouped.size === 0) return allocated

  // Sort subject ids for deterministic round-robin order.
  const subjects = Array.from(grouped.keys()).sort()
  const cursors = new Map<SubjectId, number>(subjects.map((s) => [s, 0]))

  let filled = 0
  let progressedThisRound = true
  while (filled < cap && progressedThisRound) {
    progressedThisRound = false
    for (const subjectId of subjects) {
      if (filled >= cap) break
      const queue = grouped.get(subjectId)
      const cursor = cursors.get(subjectId) ?? 0
      if (!queue || cursor >= queue.length) continue
      const row = queue[cursor]
      const bucket = allocated.get(subjectId) ?? []
      bucket.push(row)
      allocated.set(subjectId, bucket)
      cursors.set(subjectId, cursor + 1)
      filled += 1
      progressedThisRound = true
    }
  }
  return allocated
}

/**
 * Picks the first cap-allocated due card for a subject that isn't already in
 * `consumedIds`. Returns null when the subject has no remaining due card.
 *
 * `consumedIds` should be session-scoped (tracked inside QuizModal) so the same
 * due card doesn't re-appear if the user advances "next" without answering.
 */
export async function getNextDueCardForSubject(
  subjectId: SubjectId,
  consumedIds: ReadonlySet<string>,
  now: number = Date.now(),
): Promise<QuestionHistoryRow | null> {
  const grouped = await getDueQueueAllSubjects(now)
  const allocated = allocateDailyCap(grouped)
  const queue = allocated.get(subjectId) ?? []
  for (const row of queue) {
    if (!consumedIds.has(row.questionId)) return row
  }
  return null
}
