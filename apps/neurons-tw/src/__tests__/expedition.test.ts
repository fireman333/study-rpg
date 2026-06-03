/**
 * Unit tests for the expedition pool builder (add-neurons-study-squad):
 * cross-subject `lastResult === 'wrong'` intersection, spans subjects, empty
 * when nothing is currently wrong.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { Question } from '@study-rpg/core'
import { db, todayISO, type QuestionHistoryRow } from '../lib/db'
import { buildWrongQuestionPool, onExpeditionComplete } from '../lib/services/expedition'
import { readDmnMeta } from '../lib/services/dmn-trigger'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

const q = (id: string, subject: string): Question =>
  ({
    id,
    subject,
    stem: 'stem',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    answer: 'A',
  }) as unknown as Question

const hist = (
  questionId: string,
  lastResult: 'correct' | 'wrong',
): QuestionHistoryRow => ({
  questionId,
  family: 'x',
  lastResult,
  everWrong: lastResult === 'wrong',
  lastAnsweredAt: 1,
  updatedAt: 1,
})

const pool: Question[] = [
  q('114-1-醫學一-藥理學-Q1', '藥理學'),
  q('114-1-醫學一-解剖學-Q2', '解剖學'),
  q('114-1-醫學一-生理學-Q3', '生理學'),
]

describe('buildWrongQuestionPool', () => {
  it('returns only questions whose latest result is wrong', () => {
    const history = [
      hist('114-1-醫學一-藥理學-Q1', 'wrong'),
      hist('114-1-醫學一-解剖學-Q2', 'correct'),
      hist('114-1-醫學一-生理學-Q3', 'wrong'),
    ]
    const result = buildWrongQuestionPool(pool, history)
    expect(result.map((r) => r.id)).toEqual([
      '114-1-醫學一-藥理學-Q1',
      '114-1-醫學一-生理學-Q3',
    ])
  })

  it('spans multiple subjects (no family restriction)', () => {
    const history = [
      hist('114-1-醫學一-藥理學-Q1', 'wrong'),
      hist('114-1-醫學一-生理學-Q3', 'wrong'),
    ]
    const subjects = new Set(buildWrongQuestionPool(pool, history).map((r) => r.subject))
    expect(subjects).toEqual(new Set(['藥理學', '生理學']))
  })

  it('is empty when nothing is currently wrong', () => {
    const history = [
      hist('114-1-醫學一-藥理學-Q1', 'correct'),
      hist('114-1-醫學一-解剖學-Q2', 'correct'),
    ]
    expect(buildWrongQuestionPool(pool, history)).toEqual([])
    expect(buildWrongQuestionPool(pool, [])).toEqual([])
  })

  it('ignores history rows with no matching question in the pool', () => {
    const history = [hist('not-in-pool', 'wrong')]
    expect(buildWrongQuestionPool(pool, history)).toEqual([])
  })
})

describe('onExpeditionComplete (Phase 4 reward seam → DMN expedition axis)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.meta.put({ key: 'dmnLastDailyResetDate', value: todayISO() })
  })

  it('returns void synchronously and never throws (best-effort, fire-and-forget)', () => {
    expect(onExpeditionComplete({ total: 40, correct: 12 })).toBeUndefined()
    expect(() => onExpeditionComplete({ total: 0, correct: 0 })).not.toThrow()
  })

  it('credits the DMN expedition axis with cleared count (pool=total, cleared=correct)', async () => {
    onExpeditionComplete({ total: 40, correct: 12 }) // 12 ≥ 25% milestone (10)
    await flush()
    const meta = await readDmnMeta()
    expect(meta.dmnDrawsAvailable).toBe(1)
    expect(meta.dmnTimeAxisMinutesAccrued).toBe(12) // cumulative clears recorded
  })

  it('zero clears grants no draw', async () => {
    onExpeditionComplete({ total: 40, correct: 0 })
    await flush()
    expect((await readDmnMeta()).dmnDrawsAvailable).toBe(0)
  })
})
