/**
 * 整回挑戰 (full exam-set challenge) — paper addressing + single-paper scoring.
 *
 * Content-agnostic: pure functions over plain data, no React / Dexie / fetch.
 * Lifted from the 二階 reference implementation so neurons (一階) and 二階 share
 * one scoring source of truth. Paper *enumeration* (which papers exist, how to
 * build a pool) stays per-app because apps address papers differently — 二階
 * parses the `<year>-<sitting>-<book>-<subject>-Q<n>` id, neurons reads
 * `q.meta.{year, session, book}` — so this module ships only the corpus-agnostic
 * scoring + the paper-key shape used by the draft helpers.
 */

/** A paper = one year × sitting × book. (`sitting` is the 二階 term; neurons maps its `session` → `sitting` when hashing.) */
export interface ExamPaperKey {
  year: number
  sitting: number
  book: string
}

/**
 * Legacy per-question weight (80 questions × 1.25 = 100). Retained for reference
 * and for the `1.25 = 100/80` equivalence note; `examSetScore` no longer
 * multiplies by it — it normalizes over the actual pool length instead (so a
 * ~100-question neurons paper tops out at 100, not 125).
 */
export const POINTS_PER_QUESTION = 1.25

export interface ExamSetScore {
  /** Correct ÷ total, as a percentage. */
  accuracyPct: number
  /** National-equivalent score, normalized to a 100-point max over the actual total. */
  examScore: number
}

/**
 * 國考 single-paper scoring, normalized: both figures are `(correct / total) × 100`.
 * For a standard 80-question paper this equals the legacy `correct × 1.25`
 * (`1.25 = 100/80`); for a ~100-question paper the max is exactly 100, never 125.
 * `total` is the actual answerable pool length so an option-image-shrunk paper
 * still scores against a 100-point ceiling.
 */
export function examSetScore(correct: number, total: number): ExamSetScore {
  const pct = total > 0 ? (correct / total) * 100 : 0
  return {
    accuracyPct: pct,
    examScore: pct,
  }
}
