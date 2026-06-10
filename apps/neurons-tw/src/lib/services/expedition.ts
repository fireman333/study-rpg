/**
 * Expedition (出征) — the all-subject wrong-question drill ritual
 * (add-neurons-study-squad, Phase 1 of Collection 2.0).
 *
 * 出征 deploys the active squad against the player's CURRENTLY-UNMASTERED
 * questions across ALL subjects (questionHistory.lastResult === 'wrong'), drawn
 * through the existing QuizModal. The "歷史曾錯" (everWrong) archive stays on
 * /bookmarks — the drill targets what you still get wrong.
 *
 * Capability spec: openspec/specs/neurons-study-squad/spec.md
 */

import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../db'
import { creditExpeditionDraws } from './dmn-trigger'

/**
 * Build the cross-subject expedition pool: questions whose latest result is
 * wrong. Pure (testable) — intersects the content pool with the wrong-result
 * history rows. NOT year- or family-filtered: 出征 is your wrong set regardless
 * of subject or exam year.
 *
 * @param pool    - Source pool, typically `pack.questions`.
 * @param history - `questionHistory` rows (typically from `useQuestionHistory`).
 */
export function buildWrongQuestionPool(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
): Question[] {
  const wrongIds = new Set(
    history.filter((h) => h.lastResult === 'wrong').map((h) => h.questionId),
  )
  if (wrongIds.size === 0) return []
  return pool.filter((q) => wrongIds.has(q.id))
}

/**
 * Quick-review mini-batch (realign-dmn-event-rewards-to-maze): a capped slice of
 * the wrong-question pool, opened by the DMN `quick-review-batch` event. Pure +
 * testable. Returns at most `n` currently-wrong questions (fewer if fewer exist,
 * empty if none). Clears flow through the same `onExpeditionComplete` path.
 */
export function buildQuickReviewPool(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
  n = 5,
): Question[] {
  return buildWrongQuestionPool(pool, history).slice(0, Math.max(0, n))
}

/**
 * Summary of a completed expedition session, handed to the reward seam.
 */
export interface ExpeditionSession {
  /** Questions presented in the session. */
  total: number
  /** How many were answered correctly this run. */
  correct: number
}

/**
 * Reward seam — invoked when an expedition session ends
 * (add-neurons-expedition-rewards, Phase 4).
 *
 * Credits the DMN fate-card expedition axis: the session's `correct` count (in
 * the wrong-only expedition pool, equal to wrong→correct flips) against `total`
 * (the wrong pool the session opened against) drives the percentage-with-clamp
 * milestones (`DMN_EXPEDITION_MILESTONES`), granting up to 2 DMN draws/day.
 *
 * Best-effort: a reward failure MUST NOT throw out of the expedition close
 * flow. Fire-and-forget with a caught rejection.
 */
export function onExpeditionComplete(session: ExpeditionSession): void {
  void creditExpeditionDraws(session.total, session.correct).catch((err) => {
    console.error('[expedition-reward] DMN draw credit failed:', err)
  })
}

// ---------------------------------------------------------------------------
// 模考 — per-book exam-paper expedition
// (add-neurons-exam-set-expedition; split per split-neurons-expedition-exam-modes).
// A "paper" = a single 冊 of a (year, session) sitting — 醫學一 OR 醫學二 (~100 Q),
// NOT both combined. Player-facing label is 模考; the mechanic id stays exam-set.
// Progress derives entirely from questionHistory (a question is "covered" once it
// has any history row, any mode) — NO new Dexie table / version bump / sync change.
// Reward reuses onExpeditionComplete above (DMN axis only; no connectome credit).
// Capability spec: openspec/specs/neurons-exam-set-expedition/spec.md
// ---------------------------------------------------------------------------

interface ExamMeta {
  year?: number
  session?: number
  qNumber?: number
  paper?: string
  book?: string
}

/** Defensive read of the exam-specific meta fields (meta is Record<string,unknown>). */
function examMeta(q: Question): ExamMeta {
  const m = (q.meta ?? {}) as Record<string, unknown>
  return {
    year: typeof m.year === 'number' ? m.year : undefined,
    session: typeof m.session === 'number' ? m.session : undefined,
    qNumber: typeof m.qNumber === 'number' ? m.qNumber : undefined,
    paper: typeof m.paper === 'string' ? m.paper : undefined,
    book: typeof m.book === 'string' ? m.book : undefined,
  }
}

/** Order 醫學一 before 醫學二 in the picker. Only two books exist in the corpus;
 *  an explicit rank keeps ordering deterministic (codepoint compare is unsafe for
 *  Chinese numerals ≥ 三, though those never appear here). */
function bookRank(book: string): number {
  if (book === '醫學一') return 1
  if (book === '醫學二') return 2
  return 99
}

/** Question order within a sitting: by paper (醫學一 `medexam-1` < 醫學二 `medexam-2`),
 *  then qNumber, then id as a stable fallback. */
function examOrderCompare(a: Question, b: Question): number {
  const ma = examMeta(a)
  const mb = examMeta(b)
  const pa = ma.paper ?? ''
  const pb = mb.paper ?? ''
  if (pa !== pb) return pa < pb ? -1 : 1
  const qa = ma.qNumber ?? Number.MAX_SAFE_INTEGER
  const qb = mb.qNumber ?? Number.MAX_SAFE_INTEGER
  if (qa !== qb) return qa - qb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Per-session pool for a (year, 次別, 冊別) paper: every question in that 冊 NOT
 * yet answered (no `questionHistory` row), in question order. Restricted to the
 * chosen `book` (`meta.book`) — never the other book of the same sitting. Empty ⇒
 * the paper is fully covered. Pure + testable.
 */
export function buildExamSetExpeditionPool(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
  year: number,
  session: number,
  book: string,
): Question[] {
  const answered = new Set(history.map((h) => h.questionId))
  return pool
    .filter((q) => {
      const m = examMeta(q)
      return m.year === year && m.session === session && m.book === book && !answered.has(q.id)
    })
    .sort(examOrderCompare)
}

/**
 * Full single-paper pool for a (year, 次別, 冊別) paper — every question in that 冊
 * in question order, **including ones already answered elsewhere**. This is the
 * 模擬考試 (mock-exam) pool: you sit the whole paper closed-book, unlike
 * `buildExamSetExpeditionPool` which serves only the unanswered remainder for the
 * 即時詳解 coverage grind. Restricted to the chosen `book` (`meta.book`) — never the
 * other book of the same sitting. Pure + testable.
 */
export function buildExamSetPaper(
  pool: readonly Question[],
  year: number,
  session: number,
  book: string,
): Question[] {
  return pool
    .filter((q) => {
      const m = examMeta(q)
      return m.year === year && m.session === session && m.book === book
    })
    .sort(examOrderCompare)
}

/** Answered / total coverage for one (year, 次別, 冊別) paper, derived from history. */
export function examSetCoverage(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
  year: number,
  session: number,
  book: string,
): { answered: number; total: number } {
  const answeredIds = new Set(history.map((h) => h.questionId))
  let answered = 0
  let total = 0
  for (const q of pool) {
    const m = examMeta(q)
    if (m.year === year && m.session === session && m.book === book) {
      total += 1
      if (answeredIds.has(q.id)) answered += 1
    }
  }
  return { answered, total }
}

/** One row per (year, 次別, 冊別) paper with coverage, for the picker. Years
 *  descending, 次別 ascending, 冊別 (醫學一 before 醫學二). `complete` ⇔
 *  answered === total (and total > 0). */
export interface ExamPaperCoverage {
  year: number
  session: number
  book: string
  total: number
  answered: number
  complete: boolean
}

export function listExamPapersWithCoverage(
  pool: readonly Question[],
  history: readonly QuestionHistoryRow[],
): ExamPaperCoverage[] {
  const answeredIds = new Set(history.map((h) => h.questionId))
  const byKey = new Map<
    string,
    { year: number; session: number; book: string; total: number; answered: number }
  >()
  for (const q of pool) {
    const m = examMeta(q)
    // A 模考 paper is addressed per 冊; a question lacking any of year/session/book
    // is excluded (the current corpus populates all three for every exam question).
    if (m.year === undefined || m.session === undefined || m.book === undefined) continue
    const key = `${m.year}:${m.session}:${m.book}`
    let row = byKey.get(key)
    if (!row) {
      row = { year: m.year, session: m.session, book: m.book, total: 0, answered: 0 }
      byKey.set(key, row)
    }
    row.total += 1
    if (answeredIds.has(q.id)) row.answered += 1
  }
  return [...byKey.values()]
    .map((r) => ({ ...r, complete: r.total > 0 && r.answered === r.total }))
    .sort((a, b) => b.year - a.year || a.session - b.session || bookRank(a.book) - bookRank(b.book))
}
