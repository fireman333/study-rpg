/**
 * Locks the error-cause priority ordering across ALL review/expedition pool
 * builders (add-neurons-weakness-radar-and-error-repair, Codex blocker):
 * 觀念洞 (insightMarked) sorts to the front, 看錯 (wrongAnswerMarked) sinks to the
 * back, with each builder's existing tie-break preserved WITHIN a bucket, and the
 * re-order applied BEFORE any slice/cap so 觀念洞 makes the kept prefix.
 *
 * Backward-compat: omitting `flagOf` must leave each builder's order unchanged.
 */

import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../lib/db'
import {
  orderByErrorCausePriority,
  type FlagPriorityHint,
} from '../lib/services/weakness-pressure'
import { buildDueReviewPool } from '../lib/services/srs-scheduler'
import { buildWrongQuestionPool, buildQuickReviewPool } from '../lib/services/expedition'

function q(id: string, subject = 'X', extra: Partial<Question> = {}): Question {
  return { id, subject, stem: '', options: {}, answer: 'A', ...extra } as Question
}
function hist(questionId: string, nextDueAt?: number): QuestionHistoryRow {
  return {
    questionId,
    family: 'X',
    lastResult: 'wrong',
    everWrong: true,
    lastAnsweredAt: 0,
    updatedAt: 0,
    nextDueAt,
  }
}

describe('orderByErrorCausePriority — stable 3-way partition', () => {
  it('觀念洞 front, 看錯 back, order preserved within each bucket', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const flags: Record<string, FlagPriorityHint> = {
      b: { insightMarked: true },
      d: { wrongAnswerMarked: true },
      e: { insightMarked: true },
    }
    const out = orderByErrorCausePriority(items, (x) => x, (id) => flags[id])
    // insight (b, e in original order) → normal (a, c) → wrong (d)
    expect(out).toEqual(['b', 'e', 'a', 'c', 'd'])
  })

  it('觀念洞 wins when a question carries both flags', () => {
    const flags: Record<string, FlagPriorityHint> = { a: { insightMarked: true, wrongAnswerMarked: true } }
    expect(orderByErrorCausePriority(['a', 'b'], (x) => x, (id) => flags[id])).toEqual(['a', 'b'])
  })

  it('no flagOf → order unchanged (backward-compatible)', () => {
    expect(orderByErrorCausePriority(['a', 'b', 'c'], (x) => x, undefined)).toEqual(['a', 'b', 'c'])
  })
})

describe('buildDueReviewPool — error-cause ordering within the same due time', () => {
  const now = 1_000_000
  // Three questions ALL due at the same nextDueAt so the base tie-break is corpus order.
  const pool = [q('D1'), q('D2'), q('D3')]
  const history = [hist('D1', now - 50), hist('D2', now - 50), hist('D3', now - 50)]

  it('觀念洞 sorts before 一般, 看錯 sorts last (same nextDueAt)', () => {
    const flags: Record<string, FlagPriorityHint> = {
      D1: { wrongAnswerMarked: true }, // 看錯 → last
      D3: { insightMarked: true }, // 觀念洞 → first
    }
    const out = buildDueReviewPool(pool, history, now, (id) => flags[id])
    expect(out.map((x) => x.id)).toEqual(['D3', 'D2', 'D1'])
  })

  it('no flagOf → pure oldest-due order (backward-compatible)', () => {
    const out = buildDueReviewPool(pool, history, now)
    expect(out.map((x) => x.id)).toEqual(['D1', 'D2', 'D3'])
  })
})

describe('buildQuickReviewPool — order BEFORE slice (觀念洞 into kept n, 看錯 pushed out)', () => {
  // 6 wrong questions, cap n = 3. Without ordering, the slice keeps [W1,W2,W3].
  const pool = [q('W1'), q('W2'), q('W3'), q('W4'), q('W5'), q('W6')]
  const history = pool.map((p) => hist(p.id))

  it('觀念洞 (on a would-be-cut question) makes the kept slice, 看錯 (early) is pushed out', () => {
    const flags: Record<string, FlagPriorityHint> = {
      W1: { wrongAnswerMarked: true }, // early but 看錯 → sinks out of the top 3
      W6: { insightMarked: true }, // last but 觀念洞 → promoted into the top 3
    }
    const out = buildQuickReviewPool(pool, history, 3, (id) => flags[id])
    const ids = out.map((x) => x.id)
    expect(ids.length).toBe(3)
    expect(ids[0]).toBe('W6') // 觀念洞 leads
    expect(ids).not.toContain('W1') // 看錯 pushed out of the kept 3
  })

  it('no flagOf → first-n corpus order (backward-compatible)', () => {
    expect(buildQuickReviewPool(pool, history, 3).map((x) => x.id)).toEqual(['W1', 'W2', 'W3'])
  })
})

describe('buildWrongQuestionPool — everWrong untouched + ordering', () => {
  const pool = [q('X1'), q('X2'), q('X3')]
  const history = [hist('X1'), hist('X2'), hist('X3')]

  it('觀念洞 front / 看錯 back; rows are not mutated (everWrong intact)', () => {
    const flags: Record<string, FlagPriorityHint> = {
      X1: { wrongAnswerMarked: true },
      X2: { insightMarked: true },
    }
    const out = buildWrongQuestionPool(pool, history, (id) => flags[id])
    expect(out.map((x) => x.id)).toEqual(['X2', 'X3', 'X1'])
    // The builder is pure over content — history rows keep everWrong true.
    expect(history.every((h) => h.everWrong === true)).toBe(true)
  })

  it('no flagOf → corpus order (backward-compatible)', () => {
    expect(buildWrongQuestionPool(pool, history).map((x) => x.id)).toEqual(['X1', 'X2', 'X3'])
  })
})
