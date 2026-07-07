/**
 * Weakness-pressure — a pure, read-time diagnostic derived from questionHistory
 * (add-neurons-weakness-radar-and-error-repair, Feature 1).
 *
 * Scores each FAMILY and each CONCEPT tag on "how much does the player need to
 * review this now" — a FORWARD-looking signal, deliberately DISTINCT from the
 * existing `familyMastery` (backward-looking `correct/total` accuracy). It reads
 * `questionHistory` rows (family / lastResult / everWrong / easeFactor / nextDueAt)
 * joined with the content pack's per-question `conceptTags`, and writes NOTHING —
 * no Dexie table, no synced field, no schema/version bump. It also never reads,
 * writes, relabels, or overwrites `familyMastery`.
 *
 * Ordering property (the only thing the spec fixes): a family/concept with more
 * wrong / lower-ease / more-overdue questions ranks HIGHER weakness-pressure
 * (weaker). A family with NO answering history is `undiagnosed` — NOT maximally
 * weak (absence of data is not evidence of weakness).
 *
 * Spec: openspec/changes/add-neurons-weakness-radar-and-error-repair/specs/
 *       neurons-weakness-radar/spec.md
 */

import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../db'
import type { ConceptTagMap } from '../concept-tags'

/**
 * Per-question weakness weights. Linear combination — kept flat + in one place so
 * dogfood telemetry can retune without hunting the maths (Open Question in design.md).
 * DOGFOOD-TUNABLE. Higher = the dimension pushes a question toward "review me now".
 */
export const WEAKNESS_WEIGHTS = {
  /** Latest attempt is wrong (still unmastered). The strongest signal. */
  currentlyWrong: 3,
  /** Has ever been wrong (monotonic-OR), even if last attempt was correct. */
  everWrong: 1,
  /** Low SM-2 ease (< this threshold) — the card keeps slipping. */
  lowEase: 1.5,
  /** Overdue: nextDueAt already in the past. */
  overdue: 1.5,
} as const

/** Ease at/below which a question counts as "low ease" (SM-2 floor is 1.3). */
export const LOW_EASE_THRESHOLD = 2.0

/** A group's derived weakness-pressure. */
export interface WeaknessPressure {
  /** How many answered questions in this group. 0 ⇒ undiagnosed. */
  answered: number
  /** Summed per-question weakness score across answered questions. */
  score: number
  /**
   * Normalised pressure in [0, 1] — `score / (answered × maxPerQuestion)`. Drives
   * the colour scale (0 = strong/bright, 1 = weak/dim). Undefined when undiagnosed.
   */
  pressure: number | undefined
  /** True when the group has no answering history (neutral, not weakest). */
  undiagnosed: boolean
}

/** The full derived diagnostic: one entry per family + per concept tag. */
export interface WeaknessDiagnostic {
  byFamily: Map<string, WeaknessPressure>
  byConcept: Map<string, WeaknessPressure>
}

/** Max weakness a single question can contribute — used to normalise into [0, 1]. */
const MAX_PER_QUESTION =
  WEAKNESS_WEIGHTS.currentlyWrong +
  WEAKNESS_WEIGHTS.everWrong +
  WEAKNESS_WEIGHTS.lowEase +
  WEAKNESS_WEIGHTS.overdue

/** Per-question weakness contribution from a history row. Pure. */
export function questionWeakness(row: QuestionHistoryRow, now: number): number {
  let w = 0
  if (row.lastResult === 'wrong') w += WEAKNESS_WEIGHTS.currentlyWrong
  if (row.everWrong) w += WEAKNESS_WEIGHTS.everWrong
  if (typeof row.easeFactor === 'number' && row.easeFactor < LOW_EASE_THRESHOLD) {
    w += WEAKNESS_WEIGHTS.lowEase
  }
  if (typeof row.nextDueAt === 'number' && row.nextDueAt <= now) w += WEAKNESS_WEIGHTS.overdue
  return w
}

/** Finalise an accumulator into a `WeaknessPressure`. */
function finalise(acc: { answered: number; score: number }): WeaknessPressure {
  if (acc.answered === 0) {
    return { answered: 0, score: 0, pressure: undefined, undiagnosed: true }
  }
  return {
    answered: acc.answered,
    score: acc.score,
    pressure: acc.score / (acc.answered * MAX_PER_QUESTION),
    undiagnosed: false,
  }
}

/**
 * Compute per-family and per-concept weakness-pressure. Pure + O(history) — one
 * pass over the rows (at most ~4600). `familyIds` seeds every known family so a
 * family with no history still appears (as undiagnosed) rather than silently
 * absent. `conceptTags` maps questionId → leafId[] (the content sidecar).
 *
 * The history row's `family` field carries the question's subject id (see
 * `recordQuestionResult`), so family grouping needs no content-pack join.
 */
export function computeWeaknessPressure(
  history: readonly QuestionHistoryRow[],
  conceptTags: ConceptTagMap,
  familyIds: readonly string[] = [],
  now: number = Date.now(),
): WeaknessDiagnostic {
  const famAcc = new Map<string, { answered: number; score: number }>()
  // Seed every known family so undiagnosed families are represented.
  for (const id of familyIds) famAcc.set(id, { answered: 0, score: 0 })
  const conceptAcc = new Map<string, { answered: number; score: number }>()

  for (const row of history) {
    const w = questionWeakness(row, now)
    const fam = famAcc.get(row.family) ?? { answered: 0, score: 0 }
    fam.answered += 1
    fam.score += w
    famAcc.set(row.family, fam)

    const leaves = conceptTags[row.questionId]
    if (leaves) {
      for (const leaf of leaves) {
        const c = conceptAcc.get(leaf) ?? { answered: 0, score: 0 }
        c.answered += 1
        c.score += w
        conceptAcc.set(leaf, c)
      }
    }
  }

  const byFamily = new Map<string, WeaknessPressure>()
  for (const [id, acc] of famAcc) byFamily.set(id, finalise(acc))
  const byConcept = new Map<string, WeaknessPressure>()
  for (const [id, acc] of conceptAcc) byConcept.set(id, finalise(acc))
  return { byFamily, byConcept }
}

/**
 * Error-cause flag hints for a question, as they bear on review/出征 ordering
 * (add-neurons-weakness-radar-and-error-repair, task 4.3). 看錯 de-prioritises
 * (likely already known); 觀念洞 prioritises (a real gap).
 */
export interface FlagPriorityHint {
  wrongAnswerMarked?: boolean
  insightMarked?: boolean
}

/**
 * Rank a question for the targeted-drill / review ordering: HIGHER = more
 * urgent. Base = per-question weakness; 觀念洞 pushes it up, 看錯 pushes it down.
 * Pure — `flagOf` supplies the (already-loaded) flag hint for a question id.
 */
export function questionPriority(
  row: QuestionHistoryRow | undefined,
  flag: FlagPriorityHint | undefined,
  now: number,
): number {
  const base = row ? questionWeakness(row, now) : 0
  let p = base
  if (flag?.insightMarked) p += WEAKNESS_WEIGHTS.currentlyWrong // 觀念洞 → top
  if (flag?.wrongAnswerMarked) p -= WEAKNESS_WEIGHTS.currentlyWrong // 看錯 → sink
  return p
}

/**
 * The lookup shape shared by every review/expedition pool builder: questionId →
 * error-cause flag hint (or undefined). Backward-compatible — a builder that gets
 * no `flagOf` leaves its ordering exactly as before.
 */
export type FlagLookup = (questionId: string) => FlagPriorityHint | undefined

/**
 * Re-order an ALREADY-CORRECTLY-ORDERED question list by error-cause priority,
 * preserving relative order within each bucket (a STABLE 3-way partition):
 *   觀念洞 (insightMarked)  → front
 *   一般 (neither)          → middle
 *   看錯 (wrongAnswerMarked) → back
 * 觀念洞 wins if a question somehow carries both flags. This is the ONE shared
 * comparator the drill / due / wrong / quick-review paths all apply AFTER their
 * own base sort and BEFORE any slice/cap, so 觀念洞 is guaranteed into the kept
 * prefix and 看錯 is pushed toward the tail. Returns a new array; pure.
 */
export function orderByErrorCausePriority<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  flagOf: FlagLookup | undefined,
): T[] {
  if (!flagOf) return [...items]
  const insight: T[] = []
  const normal: T[] = []
  const wrong: T[] = []
  for (const item of items) {
    const f = flagOf(idOf(item))
    if (f?.insightMarked) insight.push(item)
    else if (f?.wrongAnswerMarked) wrong.push(item)
    else normal.push(item)
  }
  return [...insight, ...normal, ...wrong]
}

/**
 * Build a family/concept-scoped targeted drill of at most `limit` questions,
 * prioritising the high-weakness-pressure ones (wrong / low-ease / overdue),
 * with 觀念洞 promoted and 看錯 de-prioritised (task 2.3 + 4.3). Pure + testable.
 *
 * The caller pre-scopes `pool` to the family (or a concept's question set) and
 * passes the history + a flag lookup. Image-option questions are excluded
 * (mirrors the served quiz pools). Ties break by stable id order. The drill is a
 * scoped LAUNCHER — answers flow through the normal recording + SRS path.
 *
 * @param pool    - Questions already scoped to the target family/concept.
 * @param history - `questionHistory` rows.
 * @param flagOf  - questionId → error-cause flag hint (may be undefined).
 * @param limit   - Max questions (spec caps at 10).
 */
export function buildTargetedDrillPool(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
  flagOf: (questionId: string) => FlagPriorityHint | undefined,
  limit = 10,
  now: number = Date.now(),
): Question[] {
  const histById = new Map(history.map((h) => [h.questionId, h]))
  return pool
    .filter((q) => !q.hasOptionImages)
    .map((q) => ({
      q,
      p: questionPriority(histById.get(q.id), flagOf(q.id), now),
    }))
    // Only questions with any weakness signal are drill-worthy; a never-answered
    // or fully-strong question contributes 0 and is dropped so the drill stays
    // focused on what needs review.
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || (a.q.id < b.q.id ? -1 : a.q.id > b.q.id ? 1 : 0))
    .slice(0, Math.max(0, limit))
    .map((x) => x.q)
}
