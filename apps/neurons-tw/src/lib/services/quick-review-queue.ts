/**
 * Transient device-local quick-review queue
 * (add-neurons-weakness-radar-and-error-repair, Feature 2 / D6).
 *
 * The「加入快速複習」CTA on a wrong-answer reveal enqueues the just-missed
 * question here. The next quick-review mini-batch drains this queue FIRST. This
 * is a convenience buffer — NOT durable cross-device state: it lives in
 * `localStorage` only, so there is NO new synced Dexie table and NO schema bump.
 *
 * Kept small + string-only so it survives a JSON round-trip. Order is
 * enqueue-order (FIFO); re-enqueuing a present id is a no-op (idempotent).
 */

const STORAGE_KEY = 'neurons.quickReviewQueue'

function read(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Corrupt / unavailable storage → behave as empty; never break the answer flow.
    return []
  }
}

function write(ids: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Best-effort — private-mode / quota errors are non-fatal for a convenience buffer.
  }
}

/** All queued question ids, in enqueue order. */
export function getQuickReviewQueue(): string[] {
  return read()
}

/** True when the queue already holds this question id. */
export function isQueuedForQuickReview(questionId: string): boolean {
  return read().includes(questionId)
}

/** Enqueue a question id (idempotent). Returns the resulting queue length. */
export function enqueueQuickReview(questionId: string): number {
  const ids = read()
  if (!ids.includes(questionId)) {
    ids.push(questionId)
    write(ids)
  }
  return ids.length
}

/** Remove specific ids from the queue (called after a quick-review batch drains them). */
export function dequeueQuickReview(questionIds: readonly string[]): void {
  const drop = new Set(questionIds)
  write(read().filter((id) => !drop.has(id)))
}

/** Clear the whole queue. */
export function clearQuickReviewQueue(): void {
  write([])
}
