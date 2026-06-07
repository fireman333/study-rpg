import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../lib/db'
import {
  buildExamSetExpeditionPool,
  examSetCoverage,
  listExamPapersWithCoverage,
} from '../lib/services/expedition'

/**
 * Spec: neurons-exam-set-expedition. Pool = (year, session) questions NOT yet in
 * questionHistory, sorted 醫學一→醫學二 by qNumber; coverage + paper list derive
 * from history (no Dexie). add-neurons-exam-set-expedition.
 */

function q(year: number, session: number, paper: string, qNumber: number): Question {
  return {
    id: `${year}-${session}-${paper === 'medexam-1' ? '醫學一' : '醫學二'}-科-Q${qNumber}`,
    subject: '科',
    meta: { year, session, paper, qNumber },
  } as unknown as Question
}

function answered(...ids: string[]): QuestionHistoryRow[] {
  return ids.map((questionId) => ({ questionId }) as unknown as QuestionHistoryRow)
}

// A small two-paper corpus: (114,1) with 2 in 醫學一 + 1 in 醫學二; (114,2) with 1; (113,1) with 1.
const POOL: Question[] = [
  q(114, 1, 'medexam-2', 2),
  q(114, 1, 'medexam-1', 2),
  q(114, 1, 'medexam-1', 1),
  q(114, 2, 'medexam-1', 1),
  q(113, 1, 'medexam-1', 1),
]

describe('buildExamSetExpeditionPool', () => {
  it('filters to the (year, session) sitting and sorts 醫學一→醫學二 by qNumber', () => {
    const pool = buildExamSetExpeditionPool(POOL, [], 114, 1)
    expect(pool.map((x) => x.id)).toEqual([
      '114-1-醫學一-科-Q1',
      '114-1-醫學一-科-Q2',
      '114-1-醫學二-科-Q2',
    ])
  })

  it('excludes already-answered questions (any-mode coverage)', () => {
    const pool = buildExamSetExpeditionPool(POOL, answered('114-1-醫學一-科-Q1'), 114, 1)
    expect(pool.map((x) => x.id)).toEqual(['114-1-醫學一-科-Q2', '114-1-醫學二-科-Q2'])
  })

  it('returns empty when every sitting question is answered (paper complete)', () => {
    const all = answered('114-1-醫學一-科-Q1', '114-1-醫學一-科-Q2', '114-1-醫學二-科-Q2')
    expect(buildExamSetExpeditionPool(POOL, all, 114, 1)).toEqual([])
  })

  it('does not leak other sittings', () => {
    expect(buildExamSetExpeditionPool(POOL, [], 114, 2).map((x) => x.id)).toEqual(['114-2-醫學一-科-Q1'])
  })
})

describe('examSetCoverage', () => {
  it('reports answered / total for a sitting', () => {
    expect(examSetCoverage(POOL, [], 114, 1)).toEqual({ answered: 0, total: 3 })
    expect(examSetCoverage(POOL, answered('114-1-醫學一-科-Q1', '114-1-醫學二-科-Q2'), 114, 1)).toEqual({
      answered: 2,
      total: 3,
    })
  })
})

describe('listExamPapersWithCoverage', () => {
  it('lists papers years-desc, 次別-asc, with coverage + complete flag', () => {
    const rows = listExamPapersWithCoverage(POOL, answered('114-2-醫學一-科-Q1'))
    expect(rows.map((r) => [r.year, r.session])).toEqual([
      [114, 1],
      [114, 2],
      [113, 1],
    ])
    const p1142 = rows.find((r) => r.year === 114 && r.session === 2)!
    expect(p1142).toMatchObject({ total: 1, answered: 1, complete: true })
    const p1141 = rows.find((r) => r.year === 114 && r.session === 1)!
    expect(p1141).toMatchObject({ total: 3, answered: 0, complete: false })
  })

  it('skips questions with no year/session (degrades gracefully)', () => {
    const noMeta = [{ id: 'x', subject: '科', meta: {} } as unknown as Question, ...POOL]
    const rows = listExamPapersWithCoverage(noMeta, [])
    // The metaless question contributes to no paper row.
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(POOL.length)
  })
})
