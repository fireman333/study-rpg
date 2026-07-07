/**
 * 「置頂下次出征」pin queue — durable CROSS-DEVICE state on the R2-synced
 * `questionFlags.pinnedAt` (add-neurons-pin-queue-r2-sync; replaces the
 * transient device-local `localStorage` FIFO from
 * add-neurons-weakness-radar-and-error-repair / refold-neurons-quick-review-
 * into-expedition).
 *
 * Effective pin = `pinnedAt != null`; FIFO order = `pinnedAt` ascending, sorted
 * in-memory over the (few) flag rows — `pinnedAt` is deliberately NOT a Dexie
 * index (indexing would force a `.version()` bump + upgrade fixture). Dequeue
 * writes an EXPLICIT `pinnedAt = null` with a fresh `updatedAt`, so the removal
 * propagates cross-device under the existing questionFlags per-row LWW (no
 * tombstone). Reactivity is native Dexie `liveQuery` at the consumers — the old
 * `subscribe`/`prune`/`queueRev` localStorage-reactivity machinery is gone
 * (still-wrong is a read-time filter, replacing the eager prune).
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'
import { setPinnedAt } from './question-flags'

/**
 * Enqueue (置頂) a question — sets `pinnedAt = Date.now()` on its flag row.
 * Idempotent: re-pinning an already-pinned question is a no-op, keeping its
 * original FIFO position.
 */
export async function enqueueQuickReview(questionId: string): Promise<void> {
  const existing = await db.questionFlags.get(questionId)
  if (existing?.pinnedAt != null) return
  await setPinnedAt(questionId, Date.now())
}

/**
 * Dequeue served / cleared pins — writes an explicit `pinnedAt = null` (fresh
 * `updatedAt`) so the removal rides per-row LWW cross-device. Only touches rows
 * that are actually pinned, so passing the whole served pool is a safe
 * intersection (mirrors OverviewPage passing expeditionPool ids).
 */
export async function dequeueQuickReview(questionIds: readonly string[]): Promise<void> {
  for (const id of questionIds) {
    const existing = await db.questionFlags.get(id)
    if (existing?.pinnedAt != null) await setPinnedAt(id, null)
  }
}

/** True when this question is currently pinned (`pinnedAt != null`). */
export async function isQueuedForQuickReview(questionId: string): Promise<boolean> {
  const row = await db.questionFlags.get(questionId)
  return row?.pinnedAt != null
}

/**
 * The pinned ids that are STILL wrong, in `pinnedAt`-ascending (FIFO) order.
 * `isStillWrong` is supplied by the caller (typically a Set-membership test over
 * the current wrong-question set) so this module stays decoupled from question
 * types. One source for both the「已置頂 N 題」badge count and the expedition
 * lead ordering (refold-neurons-quick-review-into-expedition), so they cannot
 * disagree. React consumers derive the same join reactively via a `liveQuery`
 * over `questionFlags` (e.g. `useAllFlags` ⨝ the wrong set).
 */
export async function getPinnedStillWrongIds(
  isStillWrong: (id: string) => boolean,
): Promise<string[]> {
  const rows = await db.questionFlags.toArray()
  return rows
    .filter((r) => r.pinnedAt != null && isStillWrong(r.questionId))
    .sort((a, b) => (a.pinnedAt as number) - (b.pinnedAt as number))
    .map((r) => r.questionId)
}

/** Clear every pin (explicit nulls, so the clears propagate cross-device). */
export async function clearQuickReviewQueue(): Promise<void> {
  const rows = await db.questionFlags.toArray()
  await dequeueQuickReview(rows.filter((r) => r.pinnedAt != null).map((r) => r.questionId))
}

/**
 * Reactive React hook: is this question currently pinned? `liveQuery` over the
 * single flag row — recomputes natively on enqueue / dequeue / cross-device
 * pulls (the liveQuery-friendly read replacing subscribeQuickReviewQueue).
 */
export function useIsPinned(questionId: string): boolean {
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    if (!questionId) {
      setPinned(false)
      return
    }
    const sub = liveQuery(() => db.questionFlags.get(questionId)).subscribe({
      next: (row) => setPinned(row?.pinnedAt != null),
      error: () => setPinned(false),
    })
    return () => sub.unsubscribe()
  }, [questionId])
  return pinned
}
