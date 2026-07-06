import { describe, it, expect } from 'vitest'
import type { CramBook, CramPushItem } from '@study-rpg/content-neurons-tw'
import { countCoveredConcepts } from '../lib/cram-coverage'
import {
  CALM_COVERAGE_PREFIX,
  CALM_COVERAGE_SUFFIX,
  CALM_CLOSING_LINE,
  DAY_COMPLETE_LINE,
  CRAM_RESCUE_INVITE,
  CRAM_RESCUE_DONE,
  CRAM_RESCUE_FLAVOR,
  NG0717_OPEN_HINT,
  NG0717_KEEPSAKE_LINE,
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

describe('prescription-card copy guard (honesty + anti-anxiety)', () => {
  const banned =
    /連續|掌握|覆蓋|覆蓋率|%|還差|剩下|還沒讀|保證|必中|今年一定考|會派上用場|繼續完成|下一步|未完成|第.*天完全體/
  const literals = [
    CALM_COVERAGE_PREFIX,
    CALM_COVERAGE_SUFFIX,
    CALM_CLOSING_LINE,
    DAY_COMPLETE_LINE,
    CRAM_RESCUE_INVITE,
    CRAM_RESCUE_DONE,
    CRAM_RESCUE_FLAVOR,
    NG0717_OPEN_HINT,
    NG0717_KEEPSAKE_LINE,
  ]

  it('the calm-view lines are exactly the approved wording', () => {
    expect(`${CALM_COVERAGE_PREFIX}{M}${CALM_COVERAGE_SUFFIX}`).toBe('你已答對過 {M} 個高頻考點的題目。')
    expect(CALM_CLOSING_LINE).toBe('今晚可以停在這裡，讓連結慢慢固化。')
  })

  it('the NG-0717 hint no longer carries the 「第 N 天完全體」 countdown', () => {
    expect(NG0717_OPEN_HINT).not.toMatch(/第.*天完全體|還差|\d+\s*天完全體/)
  })

  it('no card copy contains a banned token (no %/denominator/countdown/prediction/deficit)', () => {
    for (const s of literals) expect(banned.test(s), `banned token in: ${s}`).toBe(false)
  })
})
