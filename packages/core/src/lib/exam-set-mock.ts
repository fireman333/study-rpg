import type { Question } from '../types'
import { examSetScore, type ExamSetScore, type ExamPaperKey } from './exam-set'

/**
 * 整回挑戰 模擬考試模式 — pure state + scoring logic, deliberately UI-agnostic
 * (no React / Dexie / fetch). Lifted from the 二階 reference so neurons (一階)
 * and 二階 share the same reducer + scoring. Kept in its own module, distinct
 * from the legacy `lib/mock-exam.ts` (一階 `scoreMock` / `applyMockPassReward`).
 *
 * Two run modes exist for an exam set:
 *   - 'immediate' (即時詳解): answer reveals per question, forward-only — the
 *     pre-existing behavior, scored/recorded inline in the modal.
 *   - 'mock'      (模擬考試): answers deferred, free navigation + editable, all
 *     explanations revealed only at 全部送出; this module owns its state.
 */
export type ExamMode = 'immediate' | 'mock'

export interface MockExamState {
  /** Current question position (0-based into the frozen pool). */
  index: number
  /** Selected option key per question, same length as the pool; null = 未作答. */
  answers: Array<string | null>
  /** Positions the player flagged for review (run-scoped, not 收藏). */
  flagged: Set<number>
  /** True once 全部送出 — answers become immutable, explanations reveal. */
  submitted: boolean
  /** When the run was submitted (epoch ms), for the review header. */
  submittedAt?: number
}

export type MockAction =
  | { type: 'answer'; index: number; key: string }
  | { type: 'toggleFlag'; index: number }
  | { type: 'goTo'; index: number }
  | { type: 'submit'; at: number }
  | { type: 'reset' }

/** Fresh state for a pool of `poolLength` questions. */
export function createInitialMockState(poolLength: number): MockExamState {
  return {
    index: 0,
    answers: Array.from({ length: poolLength }, () => null),
    flagged: new Set<number>(),
    submitted: false,
  }
}

/** Clamp a question position into `[0, length - 1]` (0 for an empty pool). */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (index < 0) return 0
  if (index > length - 1) return length - 1
  return index
}

/**
 * Pure reducer. After `submitted`, `answer` is a no-op (answers locked); `goTo`
 * still works so the player can navigate the review state.
 */
export function mockExamReducer(state: MockExamState, action: MockAction): MockExamState {
  switch (action.type) {
    case 'answer': {
      if (state.submitted) return state // locked after submit
      if (action.index < 0 || action.index >= state.answers.length) return state
      if (state.answers[action.index] === action.key) return state // no-op, keep ref
      const answers = state.answers.slice()
      answers[action.index] = action.key
      return { ...state, answers }
    }
    case 'toggleFlag': {
      if (action.index < 0 || action.index >= state.answers.length) return state
      const flagged = new Set(state.flagged)
      if (flagged.has(action.index)) flagged.delete(action.index)
      else flagged.add(action.index)
      return { ...state, flagged }
    }
    case 'goTo': {
      const index = clampIndex(action.index, state.answers.length)
      if (index === state.index) return state
      return { ...state, index }
    }
    case 'submit': {
      if (state.submitted) return state
      return { ...state, submitted: true, submittedAt: action.at }
    }
    case 'reset':
      // 再考一次 — fresh run over the same pool length.
      return createInitialMockState(state.answers.length)
    default:
      return state
  }
}

/**
 * Correctness, shared with QuizModal / mock runner: a 送分 (disputed) question
 * credits any pick (including 未作答); otherwise the pick must equal `answer`.
 * Deliberately does NOT consult `acceptedAnswers` — single source of truth for
 * "right" across the whole app is `disputed || key === answer`.
 */
export function isCorrectAnswer(question: Question, key: string | null): boolean {
  if (question.disputed === true) return true
  return key !== null && key === question.answer
}

export interface SubjectTally {
  correct: number
  total: number
}

export interface MockExamScore extends ExamSetScore {
  /** Questions credited correct (disputed always counts, incl. 未作答). */
  correctCount: number
  /** Questions with a selected option. */
  answeredCount: number
  /** Questions left blank. */
  unansweredCount: number
  /** Per-subject correct/total, keyed by `question.subject`. */
  bySubject: Record<string, SubjectTally>
}

/**
 * Score a (possibly partial) mock run. Disputed questions are credited correct
 * in every figure; unanswered non-disputed questions count as incorrect. The
 * national-equivalent score uses `pool.length` (never a hard-coded 80) so a
 * paper shrunk by option-image questions scores honestly.
 */
export function scoreMockExam(
  pool: readonly Question[],
  answers: ReadonlyArray<string | null>,
): MockExamScore {
  let correctCount = 0
  let answeredCount = 0
  const bySubject: Record<string, SubjectTally> = {}
  for (let i = 0; i < pool.length; i++) {
    const q = pool[i]
    const key = answers[i] ?? null
    const correct = isCorrectAnswer(q, key)
    if (key !== null) answeredCount += 1
    if (correct) correctCount += 1
    const tally = (bySubject[q.subject] ??= { correct: 0, total: 0 })
    tally.total += 1
    if (correct) tally.correct += 1
  }
  const { accuracyPct, examScore } = examSetScore(correctCount, pool.length)
  return {
    accuracyPct,
    examScore,
    correctCount,
    answeredCount,
    unansweredCount: pool.length - answeredCount,
    bySubject,
  }
}

/** Positions still blank, in order. */
export function unansweredIndexes(answers: ReadonlyArray<string | null>): number[] {
  const out: number[] = []
  for (let i = 0; i < answers.length; i++) if (answers[i] === null) out.push(i)
  return out
}

/** First blank position, or -1 if every question is answered. */
export function firstUnanswered(answers: ReadonlyArray<string | null>): number {
  for (let i = 0; i < answers.length; i++) if (answers[i] === null) return i
  return -1
}

/**
 * Positions to write to the 錯題本 at submit: non-disputed questions that are
 * wrong OR unanswered. Disputed questions are excluded (they're credited).
 */
export function wrongOrUnansweredIndexes(
  pool: readonly Question[],
  answers: ReadonlyArray<string | null>,
): number[] {
  const out: number[] = []
  for (let i = 0; i < pool.length; i++) {
    if (!isCorrectAnswer(pool[i], answers[i] ?? null)) out.push(i)
  }
  return out
}

/** Base per-cell state for the question-jump navigator while answering. */
export type CellState = 'current' | 'answered' | 'unanswered'
/** Base per-cell state in the post-submit review. */
export type ReviewCellState = 'current' | 'correct' | 'wrong' | 'unanswered' | 'disputed'

/**
 * Base navigator cell state for each position (the flagged state is rendered
 * separately as an overlay badge, so a flagged-and-answered cell keeps both
 * cues). While answering, `current` wins over answered/unanswered; in review,
 * `current` wins, then the per-question correctness class.
 */
export function navigatorCellStates(
  pool: readonly Question[],
  state: MockExamState,
): Array<CellState | ReviewCellState> {
  return pool.map((q, i) => {
    const isCurrent = i === state.index
    if (state.submitted) {
      if (isCurrent) return 'current'
      if (q.disputed === true) return 'disputed'
      const key = state.answers[i] ?? null
      if (key === null) return 'unanswered'
      return key === q.answer ? 'correct' : 'wrong'
    }
    if (isCurrent) return 'current'
    return state.answers[i] === null ? 'unanswered' : 'answered'
  })
}

// ---------------------------------------------------------------------------
// 模擬考試 draft — pure helpers (Dexie persistence stays per-app)
// ---------------------------------------------------------------------------

/**
 * Minimal row shape for one in-progress 模擬考試 draft (one per paper). Apps own
 * the Dexie table + ops; this type + the helpers below are the shared contract.
 */
export interface MockExamDraftRow {
  /** Composite primary key — `${year}-${sitting}-${book}`. */
  paperKeyHash: string
  year: number
  sitting: number
  book: string
  /** Frozen question-id order of the pool (used to detect corpus drift on restore). */
  questionIds: string[]
  answers: Array<string | null>
  flaggedIndexes: number[]
  index: number
  startedAt: number
  updatedAt: number
}

/** Composite primary key for the draft of one paper. */
export function paperKeyHash(key: ExamPaperKey): string {
  return `${key.year}-${key.sitting}-${key.book}`
}

/**
 * A draft is restorable only when its frozen question-id order still matches the
 * freshly rebuilt pool exactly (same length, same ids in the same positions) and
 * its answer array lines up. A corpus update (question added / removed / id
 * changed) makes the draft stale → the caller SHALL prompt to restart rather
 * than restore inconsistent state.
 */
export function isDraftFresh(
  draft: MockExamDraftRow,
  pool: ReadonlyArray<{ id: string }>,
): boolean {
  if (draft.questionIds.length !== pool.length) return false
  if (draft.answers.length !== pool.length) return false
  for (let i = 0; i < pool.length; i++) {
    if (draft.questionIds[i] !== pool[i].id) return false
  }
  return true
}
