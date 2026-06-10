import { describe, it, expect } from 'vitest'
import type { Question } from '../../types'
import { examSetScore } from '../exam-set'
import {
  createInitialMockState,
  clampIndex,
  mockExamReducer,
  isCorrectAnswer,
  scoreMockExam,
  unansweredIndexes,
  firstUnanswered,
  wrongOrUnansweredIndexes,
  navigatorCellStates,
  paperKeyHash,
  isDraftFresh,
  type MockExamDraftRow,
} from '../exam-set-mock'

function mkQ(id: string, answer: string, extra: Partial<Question> = {}): Question {
  return {
    id,
    subject: '內科',
    stem: id,
    options: { A: '', B: '', C: '', D: '' },
    answer,
    explanation: '',
    meta: {},
    ...extra,
  }
}

/** A pool of `n` single-subject questions whose correct answer is always 'A'. */
function poolOf(n: number, subject = '內科'): Question[] {
  return Array.from({ length: n }, (_, i) => mkQ(`q${i}`, 'A', { subject }))
}

describe('examSetScore normalization', () => {
  it('80-question paper is identical to the legacy ×1.25', () => {
    const { examScore } = examSetScore(64, 80)
    expect(examScore).toBeCloseTo(64 * 1.25) // 80
    expect(examScore).toBeCloseTo(80)
  })

  it('100-question paper tops out at 100, never 125', () => {
    expect(examSetScore(100, 100).examScore).toBe(100)
    expect(examSetScore(80, 100).examScore).toBe(80)
  })

  it('shrunk paper scores against a 100-point ceiling over its actual length', () => {
    expect(examSetScore(75, 75).examScore).toBe(100)
  })

  it('empty total yields zero', () => {
    expect(examSetScore(0, 0)).toEqual({ accuracyPct: 0, examScore: 0 })
  })
})

describe('isCorrectAnswer + disputed credit', () => {
  it('credits a disputed question for any pick, including 未作答', () => {
    const q = mkQ('d', 'A', { disputed: true })
    expect(isCorrectAnswer(q, null)).toBe(true)
    expect(isCorrectAnswer(q, 'B')).toBe(true)
  })

  it('non-disputed needs an exact answer match', () => {
    const q = mkQ('n', 'C')
    expect(isCorrectAnswer(q, 'C')).toBe(true)
    expect(isCorrectAnswer(q, 'A')).toBe(false)
    expect(isCorrectAnswer(q, null)).toBe(false)
  })
})

describe('scoreMockExam', () => {
  it('counts correct/answered/unanswered and per-subject tally', () => {
    const pool = [
      mkQ('a', 'A', { subject: '內科' }),
      mkQ('b', 'A', { subject: '內科' }),
      mkQ('c', 'A', { subject: '外科' }),
    ]
    const score = scoreMockExam(pool, ['A', 'B', null])
    expect(score.correctCount).toBe(1)
    expect(score.answeredCount).toBe(2)
    expect(score.unansweredCount).toBe(1)
    expect(score.bySubject['內科']).toEqual({ correct: 1, total: 2 })
    expect(score.bySubject['外科']).toEqual({ correct: 0, total: 1 })
  })

  it('credits disputed in every figure', () => {
    const pool = [mkQ('a', 'A'), mkQ('d', 'A', { disputed: true })]
    const score = scoreMockExam(pool, ['B', null]) // both "wrong" by pick, but d is disputed
    expect(score.correctCount).toBe(1)
    expect(score.bySubject['內科']).toEqual({ correct: 1, total: 2 })
    expect(wrongOrUnansweredIndexes(pool, ['B', null])).toEqual([0]) // d excluded
  })
})

describe('mockExamReducer', () => {
  it('records an answer and locks it after submit', () => {
    let s = createInitialMockState(3)
    s = mockExamReducer(s, { type: 'answer', index: 0, key: 'A' })
    expect(s.answers[0]).toBe('A')
    s = mockExamReducer(s, { type: 'submit', at: 1000 })
    expect(s.submitted).toBe(true)
    expect(s.submittedAt).toBe(1000)
    const afterLock = mockExamReducer(s, { type: 'answer', index: 1, key: 'B' })
    expect(afterLock.answers[1]).toBeNull() // locked
  })

  it('still navigates via goTo after submit', () => {
    let s = createInitialMockState(5)
    s = mockExamReducer(s, { type: 'submit', at: 1 })
    s = mockExamReducer(s, { type: 'goTo', index: 3 })
    expect(s.index).toBe(3)
  })

  it('toggles flags and resets to a fresh run of the same length', () => {
    let s = createInitialMockState(4)
    s = mockExamReducer(s, { type: 'toggleFlag', index: 2 })
    expect(s.flagged.has(2)).toBe(true)
    s = mockExamReducer(s, { type: 'answer', index: 0, key: 'A' })
    s = mockExamReducer(s, { type: 'reset' })
    expect(s.answers).toEqual([null, null, null, null])
    expect(s.flagged.size).toBe(0)
    expect(s.submitted).toBe(false)
  })

  it('clampIndex bounds positions, including the empty pool', () => {
    expect(clampIndex(-3, 5)).toBe(0)
    expect(clampIndex(9, 5)).toBe(4)
    expect(clampIndex(2, 5)).toBe(2)
    expect(clampIndex(2, 0)).toBe(0)
  })
})

describe('navigator + unanswered helpers', () => {
  it('reports answered/unanswered/current while answering', () => {
    const pool = poolOf(3)
    let s = createInitialMockState(3)
    s = mockExamReducer(s, { type: 'answer', index: 0, key: 'A' })
    s = mockExamReducer(s, { type: 'goTo', index: 2 })
    expect(navigatorCellStates(pool, s)).toEqual(['answered', 'unanswered', 'current'])
    expect(unansweredIndexes(s.answers)).toEqual([1, 2])
    expect(firstUnanswered(s.answers)).toBe(1)
  })

  it('reports correct/wrong/unanswered/disputed in review', () => {
    const pool = [mkQ('a', 'A'), mkQ('b', 'A'), mkQ('c', 'A'), mkQ('d', 'A', { disputed: true })]
    let s = createInitialMockState(4)
    s = mockExamReducer(s, { type: 'answer', index: 0, key: 'A' }) // correct
    s = mockExamReducer(s, { type: 'answer', index: 1, key: 'B' }) // wrong
    // index 2 unanswered; index 3 disputed
    s = mockExamReducer(s, { type: 'submit', at: 1 })
    s = mockExamReducer(s, { type: 'goTo', index: 2 })
    expect(navigatorCellStates(pool, s)).toEqual(['correct', 'wrong', 'current', 'disputed'])
  })
})

describe('draft helpers', () => {
  it('paperKeyHash joins year-sitting-book', () => {
    expect(paperKeyHash({ year: 114, sitting: 1, book: '醫學一' })).toBe('114-1-醫學一')
  })

  it('isDraftFresh true only when ids line up exactly', () => {
    const draft: MockExamDraftRow = {
      paperKeyHash: '114-1-醫學一',
      year: 114,
      sitting: 1,
      book: '醫學一',
      questionIds: ['a', 'b', 'c'],
      answers: ['A', null, 'B'],
      flaggedIndexes: [],
      index: 0,
      startedAt: 1,
      updatedAt: 2,
    }
    expect(isDraftFresh(draft, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toBe(true)
    expect(isDraftFresh(draft, [{ id: 'a' }, { id: 'x' }, { id: 'c' }])).toBe(false) // id drift
    expect(isDraftFresh(draft, [{ id: 'a' }, { id: 'b' }])).toBe(false) // length drift
  })
})
