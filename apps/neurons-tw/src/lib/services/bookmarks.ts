/**
 * Per-question bookmark service.
 *
 * Persists bookmarks in Dexie v7 `questionBookmarks` table; removes write
 * tombstones to `questionBookmarkTombstones` so R2 LWW sync can propagate
 * deletes across devices.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Neurons-tw SHALL persist per-question bookmarks with cross-device sync"
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import type { Question } from '@study-rpg/core'
import { db, type QuestionBookmarkRow } from '../db'

/**
 * Idempotent add. If the question is already bookmarked, no-op (preserves
 * the original `addedAt`). Also clears any matching tombstone so re-add
 * after a sync-propagated delete works cleanly.
 */
export async function addBookmark(questionId: string, family: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.questionBookmarks, db.questionBookmarkTombstones, async () => {
    const existing = await db.questionBookmarks.get(questionId)
    if (existing) return
    await db.questionBookmarks.put({
      questionId,
      family,
      addedAt: now,
      updatedAt: now,
    })
    // Clear any stale tombstone so a re-add doesn't get out-raced by an old
    // delete signal on next sync.
    await db.questionBookmarkTombstones.delete(questionId)
  })
}

/**
 * Remove + write tombstone. The tombstone carries cross-device propagation:
 * Device B sees the tombstone with `updatedAt > Device B's local bookmark
 * updatedAt` and deletes its local copy.
 */
export async function removeBookmark(questionId: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.questionBookmarks, db.questionBookmarkTombstones, async () => {
    await db.questionBookmarks.delete(questionId)
    await db.questionBookmarkTombstones.put({
      questionId,
      updatedAt: now,
    })
  })
}

/**
 * Convenience toggle. Returns the new bookmarked state (`true` = now
 * bookmarked, `false` = removed).
 */
export async function toggleBookmark(question: Question): Promise<boolean> {
  const existing = await db.questionBookmarks.get(question.id)
  if (existing) {
    await removeBookmark(question.id)
    return false
  }
  await addBookmark(question.id, question.subject)
  return true
}

export async function isBookmarked(questionId: string): Promise<boolean> {
  const row = await db.questionBookmarks.get(questionId)
  return !!row
}

/**
 * Reactive React hook — returns `true` / `false` per the current Dexie
 * state. Returns `false` while loading (avoids `undefined` in JSX boolean
 * contexts).
 */
export function useIsBookmarked(questionId: string): boolean {
  const [bookmarked, setBookmarked] = useState<boolean>(false)
  useEffect(() => {
    if (!questionId) {
      setBookmarked(false)
      return
    }
    const sub = liveQuery(() => db.questionBookmarks.get(questionId)).subscribe({
      next: (row) => setBookmarked(!!row),
      error: () => setBookmarked(false),
    })
    return () => sub.unsubscribe()
  }, [questionId])
  return bookmarked
}

/**
 * Reactive React hook — returns all bookmarks ordered by `addedAt` desc.
 */
export function useAllBookmarks(): QuestionBookmarkRow[] {
  const [rows, setRows] = useState<QuestionBookmarkRow[]>([])
  useEffect(() => {
    const sub = liveQuery(() =>
      db.questionBookmarks.orderBy('addedAt').reverse().toArray(),
    ).subscribe({
      next: (val) => setRows(val),
      error: () => setRows([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}
