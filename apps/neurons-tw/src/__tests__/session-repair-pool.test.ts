/**
 * Unit tests for buildSessionRepairPool (add-neurons-weakness-radar-and-error-repair,
 * Feature 4): the「當場回鍋」pass takes ONLY this session's wrong questions, each at
 * most once, and is distinct from the historical-pool quick-review batch.
 */

import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../lib/db'
import { buildSessionRepairPool } from '../lib/services/expedition'

const q = (id: string, subject = 'A'): Question =>
  ({ id, subject, stem: 's', options: { A: 'a', B: 'b' }, answer: 'A' }) as unknown as Question

const hist = (questionId: string): QuestionHistoryRow => ({
  questionId,
  family: 'A',
  lastResult: 'wrong',
  everWrong: true,
  lastAnsweredAt: 1,
  updatedAt: 1,
})

const pool = [q('q1'), q('q2'), q('q3'), q('q4')]
const history = [hist('q1'), hist('q2'), hist('q3'), hist('q4')]

describe('buildSessionRepairPool', () => {
  it('returns only this session\'s wrong questions', () => {
    const out = buildSessionRepairPool(pool, history, ['q1', 'q3'])
    expect(out.map((x) => x.id)).toEqual(['q1', 'q3'])
  })

  it('presents each wrong question at most once (dedupes repeated ids)', () => {
    const out = buildSessionRepairPool(pool, history, ['q2', 'q2', 'q2'])
    expect(out.map((x) => x.id)).toEqual(['q2'])
  })

  it('is empty when the session missed nothing', () => {
    expect(buildSessionRepairPool(pool, history, [])).toEqual([])
  })

  it('ignores ids that have no answer record (defensive)', () => {
    const out = buildSessionRepairPool(pool, history, ['q1', 'ghost'])
    expect(out.map((x) => x.id)).toEqual(['q1'])
  })

  it('ignores wrong ids with no matching question in the pool', () => {
    const out = buildSessionRepairPool([q('q1')], [hist('q1'), hist('q2')], ['q1', 'q2'])
    expect(out.map((x) => x.id)).toEqual(['q1'])
  })
})
