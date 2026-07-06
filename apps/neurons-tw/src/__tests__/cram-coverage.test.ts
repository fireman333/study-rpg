import { describe, it, expect } from 'vitest'
import type { CramBook, CramPushItem } from '@study-rpg/content-neurons-tw'
import { countCoveredConcepts } from '../lib/cram-coverage'
import {
  CALM_COVERAGE_PREFIX,
  CALM_COVERAGE_SUFFIX,
  CALM_CLOSING_LINE,
} from '../lib/calm-copy'

const item = (leafId: string, sourceQuestionIds: string[]): CramPushItem => ({
  subjectId: 's',
  leafId,
  zh: leafId,
  tier: '穩定考點',
  sittingBreadth: 1,
  sittingsTotal: 23,
  questionCount: 1,
  sourceQuestionIds,
})

const book = (name: '醫學一' | '醫學二', pushBySubject: CramPushItem[][]): CramBook => ({
  book: name,
  subjects: pushBySubject.map((push, i) => ({
    subjectId: `${name}-${i}`,
    book: name,
    name: `${name}-${i}`,
    blocks: [],
    push,
  })),
})

describe('countCoveredConcepts', () => {
  const books: CramBook[] = [
    book('醫學一', [[item('a', ['q1', 'q2']), item('b', ['q3'])]]),
    book('醫學二', [[item('c', ['q4', 'q5'])]]),
  ]

  it('counts concepts with ≥1 consolidated source question', () => {
    // q1 → concept a; q4 → concept c; b (q3) uncovered
    expect(countCoveredConcepts(books, new Set(['q1', 'q4']))).toBe(2)
  })

  it('counts a concept once even when several of its sources are consolidated', () => {
    // both q1 and q2 belong to concept a → still 1
    expect(countCoveredConcepts(books, new Set(['q1', 'q2']))).toBe(1)
  })

  it('returns 0 when nothing is consolidated', () => {
    expect(countCoveredConcepts(books, new Set())).toBe(0)
    expect(countCoveredConcepts(books, new Set(['nope']))).toBe(0)
  })

  it('counts concepts across both books', () => {
    expect(countCoveredConcepts(books, new Set(['q1', 'q3', 'q4']))).toBe(3)
  })

  it('handles empty books', () => {
    expect(countCoveredConcepts([], new Set(['q1']))).toBe(0)
  })
})

describe('calm-view copy guard (honesty)', () => {
  const banned = /連續|掌握|覆蓋|覆蓋率|%|還差|剩下|還沒讀|保證|必中|今年一定考|會派上用場/
  const literals = [CALM_COVERAGE_PREFIX, CALM_COVERAGE_SUFFIX, CALM_CLOSING_LINE]

  it('the two locked lines are exactly the approved wording', () => {
    expect(`${CALM_COVERAGE_PREFIX}{M}${CALM_COVERAGE_SUFFIX}`).toBe('你已答對過 {M} 個高頻考點的題目。')
    expect(CALM_CLOSING_LINE).toBe('今晚可以停在這裡，讓連結慢慢固化。')
  })

  it('no calm-view copy contains a banned token (no %/denominator/prediction)', () => {
    for (const s of literals) expect(banned.test(s), `banned token in: ${s}`).toBe(false)
  })
})
