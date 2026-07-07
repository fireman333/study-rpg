/**
 * Per-question binary modifier flags service — four coexisting flags:
 * easyMarked / guessedMarked (post-correct) + wrongAnswerMarked / insightMarked
 * (post-wrong error-cause, add-neurons-weakness-radar-and-error-repair).
 *
 * Persists flags in Dexie v8 `questionFlags` table. All four flags coexist on a
 * single row per question. Future `add-neurons-srs-pipeline` will consume
 * these as SRS scheduling inputs; today they power BookmarksPage filter +
 * QuizModal visual feedback + review/出征 priority.
 *
 * CRITICAL (add-neurons-weakness-radar-and-error-repair D3): every setter reads
 * the existing row and preserves the flags it does NOT own. A `put` that omits a
 * field would silently clear a flag another writer set — so all setters carry
 * every field through, changing only their own. This includes the 置頂 pin
 * `pinnedAt` (add-neurons-pin-queue-r2-sync): toggling ✨/🤔/👁/💡 never drops it.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Neurons-tw SHALL persist per-question binary modifier flags with cross-device sync"
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, type QuestionFlagRow } from '../db'

/**
 * Read the current flag state. Returns null when no row exists (i.e. the
 * question has never been flagged).
 */
export async function getFlag(questionId: string): Promise<QuestionFlagRow | null> {
  const row = await db.questionFlags.get(questionId)
  return row ?? null
}

/**
 * Upsert one field while preserving the rest. Single write path for all
 * setters — reads the existing row first so no flag (or pin) is ever dropped.
 */
async function putFlag(
  questionId: string,
  patch: Partial<
    Pick<QuestionFlagRow, 'easyMarked' | 'guessedMarked' | 'wrongAnswerMarked' | 'insightMarked' | 'pinnedAt'>
  >,
): Promise<void> {
  await db.transaction('rw', db.questionFlags, async () => {
    const existing = await db.questionFlags.get(questionId)
    await db.questionFlags.put({
      questionId,
      easyMarked: patch.easyMarked ?? existing?.easyMarked ?? false,
      guessedMarked: patch.guessedMarked ?? existing?.guessedMarked ?? false,
      wrongAnswerMarked: patch.wrongAnswerMarked ?? existing?.wrongAnswerMarked ?? false,
      insightMarked: patch.insightMarked ?? existing?.insightMarked ?? false,
      // 置頂 pin carry-through (add-neurons-pin-queue-r2-sync): `undefined` =
      // don't touch (carry the existing value so the four boolean setters never
      // drop a pin); `number` = enqueue; explicit `null` = dequeue — null is
      // distinct from undefined so a dequeue persists (and later serializes as
      // `"pinnedAt": null`, propagating the removal under per-row LWW).
      pinnedAt: patch.pinnedAt !== undefined ? patch.pinnedAt : existing?.pinnedAt,
      updatedAt: Date.now(),
    })
  })
}

/**
 * Set (`Date.now()` = enqueue) or clear (`null` = dequeue) the 置頂下次出征 pin.
 * The single write path for the pin — see quick-review-queue.ts for the
 * queue-level API (add-neurons-pin-queue-r2-sync).
 */
export async function setPinnedAt(questionId: string, value: number | null): Promise<void> {
  await putFlag(questionId, { pinnedAt: value })
}

// The four boolean setters below all route through putFlag, so each preserves
// the other three flags AND the 置頂 pin `pinnedAt` (carry-through above).

/** Upsert easyMarked while preserving the other three flags. Refreshes updatedAt. */
export async function setEasy(questionId: string, value: boolean): Promise<void> {
  await putFlag(questionId, { easyMarked: value })
}

/** Upsert guessedMarked while preserving the other three flags. */
export async function setGuessed(questionId: string, value: boolean): Promise<void> {
  await putFlag(questionId, { guessedMarked: value })
}

/** Upsert wrongAnswerMarked (👁 看錯) while preserving the other three flags. */
export async function setWrongAnswer(questionId: string, value: boolean): Promise<void> {
  await putFlag(questionId, { wrongAnswerMarked: value })
}

/** Upsert insightMarked (💡 觀念洞) while preserving the other three flags. */
export async function setInsight(questionId: string, value: boolean): Promise<void> {
  await putFlag(questionId, { insightMarked: value })
}

/** Toggle easy flag — returns new state. */
export async function toggleEasy(questionId: string): Promise<boolean> {
  const existing = await db.questionFlags.get(questionId)
  const next = !(existing?.easyMarked ?? false)
  await setEasy(questionId, next)
  return next
}

/** Toggle guessed flag — returns new state. */
export async function toggleGuessed(questionId: string): Promise<boolean> {
  const existing = await db.questionFlags.get(questionId)
  const next = !(existing?.guessedMarked ?? false)
  await setGuessed(questionId, next)
  return next
}

/** Toggle wrongAnswer (👁 看錯) flag — returns new state. */
export async function toggleWrongAnswer(questionId: string): Promise<boolean> {
  const existing = await db.questionFlags.get(questionId)
  const next = !(existing?.wrongAnswerMarked ?? false)
  await setWrongAnswer(questionId, next)
  return next
}

/** Toggle insight (💡 觀念洞) flag — returns new state. */
export async function toggleInsight(questionId: string): Promise<boolean> {
  const existing = await db.questionFlags.get(questionId)
  const next = !(existing?.insightMarked ?? false)
  await setInsight(questionId, next)
  return next
}

/** The four coexisting per-question flags, all defaulting false. */
export interface FlagState {
  easyMarked: boolean
  guessedMarked: boolean
  wrongAnswerMarked: boolean
  insightMarked: boolean
}

const EMPTY_FLAGS: FlagState = {
  easyMarked: false,
  guessedMarked: false,
  wrongAnswerMarked: false,
  insightMarked: false,
}

/**
 * Reactive React hook returning current flag state for a single question.
 * Returns all four flags false while loading OR if no row exists.
 */
export function useFlag(questionId: string): FlagState {
  const [state, setState] = useState<FlagState>(EMPTY_FLAGS)
  useEffect(() => {
    if (!questionId) {
      setState(EMPTY_FLAGS)
      return
    }
    const sub = liveQuery(() => db.questionFlags.get(questionId)).subscribe({
      next: (row) =>
        setState({
          easyMarked: row?.easyMarked ?? false,
          guessedMarked: row?.guessedMarked ?? false,
          wrongAnswerMarked: row?.wrongAnswerMarked ?? false,
          insightMarked: row?.insightMarked ?? false,
        }),
      error: () => setState(EMPTY_FLAGS),
    })
    return () => sub.unsubscribe()
  }, [questionId])
  return state
}

/** Reactive React hook returning all flag rows. */
export function useAllFlags(): QuestionFlagRow[] {
  const [rows, setRows] = useState<QuestionFlagRow[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.questionFlags.toArray()).subscribe({
      next: (val) => setRows(val),
      error: () => setRows([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}
