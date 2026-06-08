import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../lib/db'
import {
  buildExamSetExpeditionPool,
  examSetCoverage,
  listExamPapersWithCoverage,
} from '../lib/services/expedition'

/**
 * Spec: neurons-exam-set-expedition (per split-neurons-expedition-exam-modes).
 * A 模考 paper = a single 冊 (醫學一 OR 醫學二) of a (year, session) sitting (~100 Q),
 * NOT both books combined. Pool = that 冊's questions NOT yet in questionHistory,
 * in qNumber order; coverage + paper list derive from history (no Dexie).
 */

function q(year: number, session: number, paper: string, qNumber: number): Question {
  const book = paper === 'medexam-1' ? '醫學一' : '醫學二'
  return {
    id: `${year}-${session}-${book}-科-Q${qNumber}`,
    subject: '科',
    meta: { year, session, paper, qNumber, book },
  } as unknown as Question
}

function answered(...ids: string[]): QuestionHistoryRow[] {
  return ids.map((questionId) => ({ questionId }) as unknown as QuestionHistoryRow)
}

// A small corpus: (114,1) with 2 in 醫學一 + 1 in 醫學二; (114,2) with 1 醫學一; (113,1) with 1 醫學一.
const POOL: Question[] = [
  q(114, 1, 'medexam-2', 2),
  q(114, 1, 'medexam-1', 2),
  q(114, 1, 'medexam-1', 1),
  q(114, 2, 'medexam-1', 1),
  q(113, 1, 'medexam-1', 1),
]

describe('buildExamSetExpeditionPool (per-book)', () => {
  it('filters to the chosen 冊 of the sitting, sorted by qNumber', () => {
    const pool = buildExamSetExpeditionPool(POOL, [], 114, 1, '醫學一')
    expect(pool.map((x) => x.id)).toEqual(['114-1-醫學一-科-Q1', '114-1-醫學一-科-Q2'])
  })

  it('does NOT leak the other book of the same sitting', () => {
    expect(buildExamSetExpeditionPool(POOL, [], 114, 1, '醫學二').map((x) => x.id)).toEqual([
      '114-1-醫學二-科-Q2',
    ])
  })

  it('excludes already-answered questions (any-mode coverage)', () => {
    const pool = buildExamSetExpeditionPool(POOL, answered('114-1-醫學一-科-Q1'), 114, 1, '醫學一')
    expect(pool.map((x) => x.id)).toEqual(['114-1-醫學一-科-Q2'])
  })

  it('returns empty when every question of the 冊 is answered (paper complete)', () => {
    const all = answered('114-1-醫學一-科-Q1', '114-1-醫學一-科-Q2')
    expect(buildExamSetExpeditionPool(POOL, all, 114, 1, '醫學一')).toEqual([])
  })

  it('does not leak other sittings', () => {
    expect(buildExamSetExpeditionPool(POOL, [], 114, 2, '醫學一').map((x) => x.id)).toEqual([
      '114-2-醫學一-科-Q1',
    ])
  })
})

describe('examSetCoverage (per-book)', () => {
  it('reports answered / total per 冊, never mixing the two books', () => {
    expect(examSetCoverage(POOL, [], 114, 1, '醫學一')).toEqual({ answered: 0, total: 2 })
    expect(examSetCoverage(POOL, [], 114, 1, '醫學二')).toEqual({ answered: 0, total: 1 })
    expect(examSetCoverage(POOL, answered('114-1-醫學一-科-Q1'), 114, 1, '醫學一')).toEqual({
      answered: 1,
      total: 2,
    })
  })
})

describe('listExamPapersWithCoverage (per-book)', () => {
  it('lists one row per (year, 次別, 冊別), years-desc / 次別-asc / 醫學一→醫學二', () => {
    const rows = listExamPapersWithCoverage(POOL, answered('114-2-醫學一-科-Q1'))
    expect(rows.map((r) => [r.year, r.session, r.book])).toEqual([
      [114, 1, '醫學一'],
      [114, 1, '醫學二'],
      [114, 2, '醫學一'],
      [113, 1, '醫學一'],
    ])
    const p1141a = rows.find((r) => r.year === 114 && r.session === 1 && r.book === '醫學一')!
    expect(p1141a).toMatchObject({ total: 2, answered: 0, complete: false })
    const p1142 = rows.find((r) => r.year === 114 && r.session === 2)!
    expect(p1142).toMatchObject({ total: 1, answered: 1, complete: true })
  })

  it('splits a sitting into two ~100Q papers, never one combined paper', () => {
    const rows = listExamPapersWithCoverage(POOL, [])
    const sitting1141 = rows.filter((r) => r.year === 114 && r.session === 1)
    expect(sitting1141.map((r) => r.book).sort()).toEqual(['醫學一', '醫學二'])
    // No combined (book-less) row exists for that sitting.
    expect(sitting1141.every((r) => r.book === '醫學一' || r.book === '醫學二')).toBe(true)
  })

  it('excludes questions lacking year/session/book', () => {
    const noMeta = [{ id: 'x', subject: '科', meta: {} } as unknown as Question, ...POOL]
    const rows = listExamPapersWithCoverage(noMeta, [])
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(POOL.length)
  })
})
