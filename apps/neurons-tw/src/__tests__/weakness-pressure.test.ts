/**
 * Unit tests for weakness-pressure (add-neurons-weakness-radar-and-error-repair,
 * Feature 1). Locks the spec's ordering property: weaker (more wrong / lower-ease /
 * more-overdue) families rank higher pressure; a family with NO history is
 * undiagnosed (NOT maximally weak); the score legitimately diverges from raw
 * accuracy. Plus the targeted-drill ranking (看錯 de-prioritise / 觀念洞 prioritise).
 */

import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../lib/db'
import type { ConceptTagMap } from '../lib/concept-tags'
import {
  computeWeaknessPressure,
  buildTargetedDrillPool,
  questionWeakness,
  type FlagPriorityHint,
} from '../lib/services/weakness-pressure'

const NOW = 1_000_000_000_000

function row(
  questionId: string,
  family: string,
  opts: Partial<QuestionHistoryRow> = {},
): QuestionHistoryRow {
  return {
    questionId,
    family,
    lastResult: 'correct',
    everWrong: false,
    lastAnsweredAt: NOW,
    updatedAt: NOW,
    ...opts,
  }
}

const q = (id: string, subject: string, extra: Partial<Question> = {}): Question =>
  ({ id, subject, stem: 's', options: { A: 'a', B: 'b' }, answer: 'A', ...extra }) as unknown as Question

describe('computeWeaknessPressure — ordering + undiagnosed', () => {
  it('a weaker family ranks higher weakness-pressure than a stronger one', () => {
    const history = [
      // Family A: currently wrong, ever wrong, low ease, overdue → max pressure.
      row('a1', 'A', { lastResult: 'wrong', everWrong: true, easeFactor: 1.4, nextDueAt: NOW - 1 }),
      // Family B: correct, never wrong, healthy ease, not due → min pressure.
      row('b1', 'B', { lastResult: 'correct', everWrong: false, easeFactor: 2.6, nextDueAt: NOW + 999999 }),
    ]
    const { byFamily } = computeWeaknessPressure(history, {}, ['A', 'B'], NOW)
    const a = byFamily.get('A')!
    const b = byFamily.get('B')!
    expect(a.undiagnosed).toBe(false)
    expect(b.undiagnosed).toBe(false)
    expect(a.pressure!).toBeGreaterThan(b.pressure!)
  })

  it('a family with no answered questions is undiagnosed, not weakest', () => {
    const history = [row('a1', 'A', { lastResult: 'wrong', everWrong: true })]
    const { byFamily } = computeWeaknessPressure(history, {}, ['A', 'Z'], NOW)
    const z = byFamily.get('Z')!
    expect(z.undiagnosed).toBe(true)
    expect(z.pressure).toBeUndefined()
    // The undiagnosed family must NOT out-rank the genuinely weak one.
    const a = byFamily.get('A')!
    expect(a.pressure).toBeDefined()
    expect(a.undiagnosed).toBe(false)
  })

  it('diverges from raw accuracy: equal correct/total but more overdue+everWrong ranks weaker', () => {
    // Both families: 1 correct / 1 answered (identical accuracy). A adds review pressure.
    const history = [
      row('a1', 'A', { lastResult: 'correct', everWrong: true, easeFactor: 1.5, nextDueAt: NOW - 1 }),
      row('b1', 'B', { lastResult: 'correct', everWrong: false, easeFactor: 2.6, nextDueAt: NOW + 999999 }),
    ]
    const { byFamily } = computeWeaknessPressure(history, {}, ['A', 'B'], NOW)
    expect(byFamily.get('A')!.pressure!).toBeGreaterThan(byFamily.get('B')!.pressure!)
  })

  it('per-concept pressure aggregates across the tagged questions', () => {
    const history = [
      row('q1', 'A', { lastResult: 'wrong', everWrong: true }),
      row('q2', 'A', { lastResult: 'correct', everWrong: false }),
    ]
    const tags: ConceptTagMap = { q1: ['concept-x'], q2: ['concept-x', 'concept-y'] }
    const { byConcept } = computeWeaknessPressure(history, tags, ['A'], NOW)
    expect(byConcept.get('concept-x')!.answered).toBe(2)
    expect(byConcept.get('concept-y')!.answered).toBe(1)
    // concept-x carries the wrong q1 → higher pressure than concept-y (only correct q2).
    expect(byConcept.get('concept-x')!.pressure!).toBeGreaterThan(byConcept.get('concept-y')!.pressure!)
  })

  it('questionWeakness scores each dimension additively', () => {
    const strong = questionWeakness(row('s', 'A', { lastResult: 'correct', everWrong: false, easeFactor: 2.6, nextDueAt: NOW + 1 }), NOW)
    const weak = questionWeakness(row('w', 'A', { lastResult: 'wrong', everWrong: true, easeFactor: 1.4, nextDueAt: NOW - 1 }), NOW)
    expect(strong).toBe(0)
    expect(weak).toBeGreaterThan(strong)
  })
})

describe('buildTargetedDrillPool — priority + 看錯/觀念洞 ordering', () => {
  const pool = [q('w1', 'A'), q('w2', 'A'), q('w3', 'A'), q('img', 'A', { hasOptionImages: true })]
  const history = [
    row('w1', 'A', { lastResult: 'wrong', everWrong: true }),
    row('w2', 'A', { lastResult: 'wrong', everWrong: true }),
    row('w3', 'A', { lastResult: 'wrong', everWrong: true }),
    row('img', 'A', { lastResult: 'wrong', everWrong: true }),
  ]

  it('excludes image-option questions and caps at the limit', () => {
    const out = buildTargetedDrillPool(pool, history, () => undefined, 2, NOW)
    expect(out.length).toBe(2)
    expect(out.some((x) => x.id === 'img')).toBe(false)
  })

  it('觀念洞 sorts to the top, 看錯 sinks to the bottom', () => {
    const flags: Record<string, FlagPriorityHint> = {
      w1: { wrongAnswerMarked: true }, // 看錯 → sink
      w3: { insightMarked: true }, // 觀念洞 → top
    }
    const out = buildTargetedDrillPool(pool, history, (id) => flags[id], 10, NOW)
    const ids = out.map((x) => x.id)
    expect(ids[0]).toBe('w3') // 觀念洞 prioritised
    expect(ids[ids.length - 1]).toBe('w1') // 看錯 de-prioritised
  })

  it('drops questions with no weakness signal', () => {
    const freshPool = [q('new', 'A')]
    // 'new' has no history row → priority 0 → excluded.
    const out = buildTargetedDrillPool(freshPool, [], () => undefined, 10, NOW)
    expect(out).toEqual([])
  })
})
