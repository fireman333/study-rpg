import { describe, it, expect } from 'vitest'
import type { QuestionHistoryRow } from '../lib/db'
import type { ConceptTagMap } from '../lib/concept-tags'
import type { YieldBand } from '../lib/services/rescue/rescue-priority'
import {
  computeConceptMastery,
  computeRescueScore,
  returnTier,
  meanMovability,
  DEFAULT_TAU_DAYS,
} from '../lib/services/rescue/rescue-score'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

function h(questionId: string, lastResult: 'correct' | 'wrong', daysAgo: number): QuestionHistoryRow {
  return {
    questionId,
    family: '解剖學',
    lastResult,
    everWrong: lastResult === 'wrong',
    lastAnsweredAt: NOW - daysAgo * DAY,
    updatedAt: NOW - daysAgo * DAY,
  }
}

describe('computeConceptMastery (recency-decayed)', () => {
  const tags: ConceptTagMap = { qA1: ['c1'], qA2: ['c1'], qB1: ['c2'] }

  it('undiagnosed concept → undefined', () => {
    const m = computeConceptMastery([], tags, DEFAULT_TAU_DAYS, NOW)
    expect(m.get('c1')).toBeUndefined()
  })

  it('all-correct concept → strength 1, all-wrong → 0', () => {
    const m = computeConceptMastery(
      [h('qA1', 'correct', 1), h('qA2', 'correct', 2), h('qB1', 'wrong', 1)],
      tags,
      DEFAULT_TAU_DAYS,
      NOW,
    )
    expect(m.get('c1')).toBeCloseTo(1, 5)
    expect(m.get('c2')).toBeCloseTo(0, 5)
  })

  it('recent answers dominate: a recent wrong outweighs an old correct', () => {
    const recentWrongOldCorrect = computeConceptMastery(
      [h('qA1', 'correct', 60), h('qA2', 'wrong', 0)],
      tags,
      DEFAULT_TAU_DAYS,
      NOW,
    )
    // recent wrong (weight≈1) vs old correct (weight≈e^-6) ⇒ strength well below 0.5
    expect(recentWrongOldCorrect.get('c1')!).toBeLessThan(0.1)
  })
})

describe('computeRescueScore', () => {
  it('weights high-yield concepts more; undiagnosed counts as 0', () => {
    const mastery = new Map<string, number | undefined>([
      ['c1', 1], // strong, high-yield
      ['c2', 0], // weak, low-yield
      ['c3', undefined], // undiagnosed → treated as 0
    ])
    const yieldMap = new Map<string, YieldBand>([
      ['c1', 'high'],
      ['c2', 'low'],
      ['c3', 'mid'],
    ])
    // num = 1.0*1 + 0.3*0 + 0.6*0 = 1.0 ; den = 1.0+0.3+0.6 = 1.9 ⇒ 53
    expect(computeRescueScore(mastery, yieldMap)).toBe(53)
  })

  it('all-mastered high-yield → 100, all-unheld → 0', () => {
    const y = new Map<string, YieldBand>([['c1', 'high'], ['c2', 'mid']])
    expect(computeRescueScore(new Map([['c1', 1], ['c2', 1]]), y)).toBe(100)
    expect(computeRescueScore(new Map([['c1', 0], ['c2', 0]]), y)).toBe(0)
  })

  it('empty subject → 0 (no divide-by-zero)', () => {
    expect(computeRescueScore(new Map(), new Map())).toBe(0)
  })
})

describe('returnTier (qualitative, no fake point gain)', () => {
  it('buckets expected marginal movability into 夯 / 普通 / 低迷', () => {
    expect(returnTier(0.8)).toBe('夯')
    expect(returnTier(0.4)).toBe('普通')
    expect(returnTier(0.1)).toBe('低迷')
  })
  it('meanMovability averages, empty → 0', () => {
    expect(meanMovability([1, 0.5, 0])).toBeCloseTo(0.5, 5)
    expect(meanMovability([])).toBe(0)
  })
})
