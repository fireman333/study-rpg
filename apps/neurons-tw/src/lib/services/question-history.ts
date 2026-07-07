/**
 * Per-question answer-result history service.
 *
 * Records one result row per question on every QuizModal answer. `everWrong`
 * follows monotonic-OR semantics — a later correct answer NEVER clears it
 * (永久錯題庫). `lastResult` + timestamps are LWW (most recent attempt wins).
 * Backs the 「目前未答對」(lastResult==='wrong') + 「歷史曾錯」(everWrong===true)
 * sub-tabs on /bookmarks.
 *
 * Spec: openspec/specs/neurons-wrong-answer-list/spec.md
 *   "Per-question results SHALL be recorded ... on every QuizModal answer"
 *   "The `everWrong` flag SHALL be monotonic"
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type QuestionHistoryRow } from '../db'

/**
 * Upsert the per-question result. `everWrong = (prev?.everWrong ?? false) ||
 * !isCorrect` — once wrong, stays true forever. `lastResult` /
 * `lastAnsweredAt` / `updatedAt` reflect the current attempt (LWW).
 *
 * PRESERVES the SM-2 schedule fields (`interval` / `easeFactor` / `nextDueAt` /
 * `attempts` / `correctCount`) — the full-row `put` would otherwise DROP them.
 * In the normal QuizModal answer flow this is immediately corrected by the
 * following `scheduleSrsForAnswer` call, so it went unnoticed. But TWO callers
 * record a result WITHOUT the scheduler and rely on this preservation:
 *   1. session-repair「當場回鍋」(add-neurons-weakness-radar-and-error-repair,
 *      Feature 4) — intentional `srsEffect: none`.
 *   2. `MockExamRunner.doSubmit` (MockExamRunner.tsx) — batch-writes wrong/unanswered
 *      questions on submit; the pre-preservation full-row `put` silently reset those
 *      questions' SM-2 schedule to undefined, polluting `buildDueReviewPool` (a
 *      scheduled-and-due card would drop out of the 錯題 queue). This preserve fixes
 *      that latent bug too.
 * Locked by src/__tests__/session-repair-srs-inert.test.ts.
 */
export async function recordQuestionResult(
  questionId: string,
  family: string,
  isCorrect: boolean,
): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.questionHistory, async () => {
    const prev = await db.questionHistory.get(questionId)
    await db.questionHistory.put({
      questionId,
      family,
      lastResult: isCorrect ? 'correct' : 'wrong',
      everWrong: (prev?.everWrong ?? false) || !isCorrect,
      lastAnsweredAt: now,
      updatedAt: now,
      // Carry the SM-2 schedule through unchanged (undefined when never scheduled).
      interval: prev?.interval,
      easeFactor: prev?.easeFactor,
      nextDueAt: prev?.nextDueAt,
      attempts: prev?.attempts,
      correctCount: prev?.correctCount,
    })
  })
}

/**
 * Reactive hook — the full question-history table ordered by `lastAnsweredAt`
 * desc. Both 錯題 sub-tabs derive from this single subscription (目前未答對 =
 * `lastResult === 'wrong'`, 歷史曾錯 = `everWrong === true`); the split is a
 * cheap JS filter, so one subscription serves both. `everWrong` is not a Dexie
 * index (IndexedDB cannot index booleans) — hence the full `toArray()`.
 */
export function useQuestionHistory(): QuestionHistoryRow[] {
  const [rows, setRows] = useState<QuestionHistoryRow[]>([])
  useEffect(() => {
    const sub = liveQuery(() =>
      db.questionHistory.orderBy('lastAnsweredAt').reverse().toArray(),
    ).subscribe({
      next: (val) => setRows(val),
      error: () => setRows([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}
