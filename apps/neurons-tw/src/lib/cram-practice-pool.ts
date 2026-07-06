/**
 * Cram practice-pool ordering (add-neurons-cram-coverage-and-practice-priority).
 *
 * When a practice pool is opened from /cram, prioritize questions that are in
 * today's 今日處方箋 (daily prescription) snapshot so answering the first few
 * reliably credits the prescription and surfaces the existing 「🩹 連結已固化 /
 * 🔍 新連結已開發」 payoff. Pure — no I/O; the caller supplies the snapshot ids.
 *
 * Spec: openspec/specs/neurons-cram-tab/spec.md (on-ramp requirement)
 */
import type { Question } from '@study-rpg/core'

/** Fisher-Yates shuffle (returns a new array; does not mutate input). */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Order a cram practice pool snapshot-first. Shuffles for variety, then
 * stable-partitions today's prescription-snapshot ids to the front (ES2019
 * `Array.prototype.sort` is stable, so relative order within each partition is
 * the shuffled order). `snapshotIds === null` or empty (no plan today) → plain
 * shuffle, no prioritization. Never injects or drops questions.
 */
export function orderPracticePool(
  pool: readonly Question[],
  snapshotIds: ReadonlySet<string> | null,
): Question[] {
  const shuffled = shuffle(pool)
  if (!snapshotIds || snapshotIds.size === 0) return shuffled
  return shuffled.sort((a, b) => Number(snapshotIds.has(b.id)) - Number(snapshotIds.has(a.id)))
}
