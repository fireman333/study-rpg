/**
 * Neurons SRS scheduling + due-queue service (add-neurons-quiz-mode-chips-and-srs).
 *
 * Wires the @study-rpg/core binary SM-2 engine (`reviewCardBinary` family) into
 * neurons-tw. SRS state rides the existing `questionHistory` row (interval /
 * easeFactor / nextDueAt / attempts / correctCount) — no separate store.
 *
 * Two sides:
 *  - WRITE: `scheduleSrsForAnswer` runs on EVERY answer (any mode); the ✨/🤔
 *    modifier helpers recompute a just-answered question's schedule.
 *  - READ:  `buildDueReviewPool` (the 錯題 mode pool) + `computeFamilyModeCounts`
 *    (the per-family 🆕/🔄 chip badges).
 *
 * Mode (新題 / 錯題) only decides WHICH questions enter the pool. Scheduling
 * itself is unconditional — a question answered wrong in 新題 mode still gets a
 * card, so it later surfaces as due in 錯題 mode (二階 skipSrs semantics).
 *
 * NOTE: unlike 二階, the ✨「太簡單」modifier does NOT clear `everWrong` here —
 * neurons' questionHistory adapter merges `everWrong` via monotonic-OR (the
 * 永久錯題庫 invariant of neurons-wrong-answer-list), so a local clear would be
 * futile (re-set on next sync) and contradict that capability. ✨ only adjusts
 * the SRS schedule.
 */

import {
  reviewCardBinary,
  reviewCardBinaryEasy,
  reviewCardBinaryGuessed,
  reviewCardBinaryInsight,
  SRS_DAILY_CAP,
  type Question,
  type BinaryReviewPrev,
  type BinaryReviewResult,
} from '@study-rpg/core'
import { db, type QuestionHistoryRow } from '../db'
import { orderByErrorCausePriority, type FlagLookup } from './weakness-pressure'

/** Per-family quiz entry mode: 🆕 新題 (never-answered) vs 🔄 錯題 (SRS review). */
export type QuizMode = 'fresh' | 'review'

/** SM-2 default starting ease (mirror @study-rpg/core's non-exported DEFAULT_EASE). */
const DEFAULT_EASE = 2.5

/** The fresh / never-scheduled prev state. */
const FRESH_PREV: BinaryReviewPrev = { interval: 0, easeFactor: DEFAULT_EASE, nextDueAt: null }

/** Read the prev SRS triple off a history row (absent fields → fresh). */
function prevOf(row: QuestionHistoryRow | undefined): BinaryReviewPrev {
  if (!row) return { ...FRESH_PREV }
  return {
    interval: row.interval ?? 0,
    easeFactor: row.easeFactor ?? DEFAULT_EASE,
    nextDueAt: row.nextDueAt ?? null,
  }
}

/**
 * Update a question's SRS schedule for an answer. Runs on every answer regardless
 * of quiz mode. Returns the prev triple used + the resulting schedule so the
 * caller can wire the ✨/🤔 modifier restore-to-default behavior.
 *
 * The history row is normally created/updated by `recordQuestionResult` first;
 * if it is somehow absent (that write failed), this creates a minimal row so the
 * SRS card is never silently lost.
 */
export async function scheduleSrsForAnswer(
  questionId: string,
  family: string,
  isCorrect: boolean,
  now: number = Date.now(),
): Promise<{ prev: BinaryReviewPrev; result: BinaryReviewResult }> {
  let prev: BinaryReviewPrev = { ...FRESH_PREV }
  let result!: BinaryReviewResult
  await db.transaction('rw', db.questionHistory, async () => {
    const row = await db.questionHistory.get(questionId)
    prev = prevOf(row)
    result = reviewCardBinary({ correct: isCorrect, prev, now })
    if (row) {
      await db.questionHistory.update(questionId, {
        interval: result.interval,
        easeFactor: result.easeFactor,
        nextDueAt: result.nextDueAt,
        attempts: (row.attempts ?? 0) + 1,
        correctCount: (row.correctCount ?? 0) + (isCorrect ? 1 : 0),
        updatedAt: now,
      })
    } else {
      await db.questionHistory.put({
        questionId,
        family,
        lastResult: isCorrect ? 'correct' : 'wrong',
        everWrong: !isCorrect,
        lastAnsweredAt: now,
        updatedAt: now,
        interval: result.interval,
        easeFactor: result.easeFactor,
        nextDueAt: result.nextDueAt,
        attempts: 1,
        correctCount: isCorrect ? 1 : 0,
      })
    }
  })
  return { prev, result }
}

/**
 * ✨「太簡單」: recompute the schedule from the pre-answer `prev` via
 * `reviewCardBinaryEasy` (lengthen interval / raise ease). Does NOT touch
 * `everWrong` (see module note).
 */
export async function applyEasyModifier(
  questionId: string,
  prev: BinaryReviewPrev | null,
  now: number = Date.now(),
): Promise<void> {
  const r = reviewCardBinaryEasy({ prev: prev ?? { ...FRESH_PREV }, now })
  await db.questionHistory.update(questionId, {
    interval: r.interval,
    easeFactor: r.easeFactor,
    nextDueAt: r.nextDueAt,
    updatedAt: now,
  })
}

/**
 * 🤔「我亂猜的」: force the schedule to interval 1 via `reviewCardBinaryGuessed`.
 */
export async function applyGuessedModifier(
  questionId: string,
  prev: BinaryReviewPrev | null,
  now: number = Date.now(),
): Promise<void> {
  const r = reviewCardBinaryGuessed({ prev: prev ?? { ...FRESH_PREV }, now })
  await db.questionHistory.update(questionId, {
    interval: r.interval,
    easeFactor: r.easeFactor,
    nextDueAt: r.nextDueAt,
    updatedAt: now,
  })
}

/**
 * 💡「觀念洞」: a self-declared concept gap on a WRONG answer. Forces interval 1
 * AND decrements ease via `reviewCardBinaryInsight` (harsher than a plain wrong,
 * distinct from 我亂猜的 which preserves ease) so the gap re-graduates slower.
 * (add-neurons-insight-ease-penalty)
 */
export async function applyInsightModifier(
  questionId: string,
  prev: BinaryReviewPrev | null,
  now: number = Date.now(),
): Promise<void> {
  const r = reviewCardBinaryInsight({ prev: prev ?? { ...FRESH_PREV }, now })
  await db.questionHistory.update(questionId, {
    interval: r.interval,
    easeFactor: r.easeFactor,
    nextDueAt: r.nextDueAt,
    updatedAt: now,
  })
}

/**
 * Restore the default post-answer schedule (undo an ✨/🤔 modifier when the
 * player taps the active modifier off again).
 */
export async function restoreDefaultSrs(
  questionId: string,
  def: BinaryReviewResult,
  now: number = Date.now(),
): Promise<void> {
  await db.questionHistory.update(questionId, {
    interval: def.interval,
    easeFactor: def.easeFactor,
    nextDueAt: def.nextDueAt,
    updatedAt: now,
  })
}

/**
 * Build the 錯題 review pool for an (already family + year-scoped) question pool:
 * questions whose history row is due (`nextDueAt <= now`), oldest-due first,
 * excluding image-option questions, capped at `SRS_DAILY_CAP`.
 *
 * When `flagOf` is supplied (add-neurons-weakness-radar-and-error-repair), the
 * due list is re-ordered by error-cause priority (觀念洞 front / 看錯 back) while
 * preserving the oldest-due-first tie-break within each bucket — applied BEFORE
 * the cap so 觀念洞 is guaranteed into the kept prefix and 看錯 sinks. Omitting
 * `flagOf` keeps the pure oldest-due order (backward-compatible).
 */
export function buildDueReviewPool(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
  now: number = Date.now(),
  flagOf?: FlagLookup,
): Question[] {
  const dueAt = new Map<string, number>()
  for (const h of history) {
    if (typeof h.nextDueAt === 'number' && h.nextDueAt <= now) dueAt.set(h.questionId, h.nextDueAt)
  }
  const dueSorted = pool
    .filter((q) => !q.hasOptionImages && dueAt.has(q.id))
    .sort((a, b) => (dueAt.get(a.id) as number) - (dueAt.get(b.id) as number))
  // Re-order by error-cause priority (stable within the oldest-due tie-break) THEN cap.
  return orderByErrorCausePriority(dueSorted, (q) => q.id, flagOf).slice(0, SRS_DAILY_CAP)
}

export interface FamilyModeCounts {
  /** Never-answered questions in the family (under the active year filter). */
  fresh: number
  /** Currently-due review questions in the family (under the active year filter). */
  due: number
}

/**
 * Per-family 🆕 新題 (unseen) + 🔄 錯題 (due) counts for the FamilyPicker chip
 * badges. One pass over the corpus; respects the active year filter and skips
 * image-option questions for the due count (mirrors the served pool).
 *
 * @param inYear - predicate: is this question in the active year filter? Pass
 *                 `() => true` when no year filter is active.
 */
export function computeFamilyModeCounts(
  questions: readonly Question[],
  history: readonly QuestionHistoryRow[],
  inYear: (q: Question) => boolean,
  now: number = Date.now(),
): Map<string, FamilyModeCounts> {
  const answered = new Set<string>()
  const dueIds = new Set<string>()
  for (const h of history) {
    answered.add(h.questionId)
    if (typeof h.nextDueAt === 'number' && h.nextDueAt <= now) dueIds.add(h.questionId)
  }
  const counts = new Map<string, FamilyModeCounts>()
  for (const q of questions) {
    if (!inYear(q)) continue
    const c = counts.get(q.subject) ?? { fresh: 0, due: 0 }
    if (!answered.has(q.id)) c.fresh++
    if (!q.hasOptionImages && dueIds.has(q.id)) c.due++
    counts.set(q.subject, c)
  }
  return counts
}
