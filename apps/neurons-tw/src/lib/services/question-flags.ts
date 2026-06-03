/**
 * Per-question binary modifier flags service — easyMarked / guessedMarked.
 *
 * Persists flags in Dexie v8 `questionFlags` table. Both flags coexist on a
 * single row per question. Future `add-neurons-srs-pipeline` will consume
 * these as SRS scheduling inputs; today they power BookmarksPage filter +
 * QuizModal visual feedback.
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

/** Upsert easyMarked while preserving guessedMarked. Refreshes updatedAt. */
export async function setEasy(questionId: string, value: boolean): Promise<void> {
  await db.transaction('rw', db.questionFlags, async () => {
    const existing = await db.questionFlags.get(questionId)
    await db.questionFlags.put({
      questionId,
      easyMarked: value,
      guessedMarked: existing?.guessedMarked ?? false,
      updatedAt: Date.now(),
    })
  })
}

/** Upsert guessedMarked while preserving easyMarked. */
export async function setGuessed(questionId: string, value: boolean): Promise<void> {
  await db.transaction('rw', db.questionFlags, async () => {
    const existing = await db.questionFlags.get(questionId)
    await db.questionFlags.put({
      questionId,
      easyMarked: existing?.easyMarked ?? false,
      guessedMarked: value,
      updatedAt: Date.now(),
    })
  })
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

/**
 * Reactive React hook returning current flag state for a single question.
 * Returns `{ easyMarked: false, guessedMarked: false }` while loading OR
 * if no row exists.
 */
export function useFlag(questionId: string): { easyMarked: boolean; guessedMarked: boolean } {
  const [state, setState] = useState<{ easyMarked: boolean; guessedMarked: boolean }>({
    easyMarked: false,
    guessedMarked: false,
  })
  useEffect(() => {
    if (!questionId) {
      setState({ easyMarked: false, guessedMarked: false })
      return
    }
    const sub = liveQuery(() => db.questionFlags.get(questionId)).subscribe({
      next: (row) =>
        setState({
          easyMarked: row?.easyMarked ?? false,
          guessedMarked: row?.guessedMarked ?? false,
        }),
      error: () => setState({ easyMarked: false, guessedMarked: false }),
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
