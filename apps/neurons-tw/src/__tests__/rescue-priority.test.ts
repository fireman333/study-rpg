import { describe, it, expect, vi } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow, QuestionFlagRow } from '../lib/db'
import {
  typeCoefficient,
  rescueSeams,
  tierToYieldBand,
  percentileToYieldBand,
  movabilityBandOf,
  movabilityValue,
  confidenceMultiplier,
  priorityOf,
  isTriageDropped,
  type RescueScoreInputs,
  type ConfidenceSignal,
  type YieldBand,
} from '../lib/services/rescue/rescue-priority'

const NOW = 1_700_000_000_000
const q = (id = 'q1'): Question => ({ id, subject: '解剖學' }) as Question

function hist(p: Partial<QuestionHistoryRow>): QuestionHistoryRow {
  return {
    questionId: 'q1',
    family: '解剖學',
    lastResult: 'wrong',
    everWrong: true,
    lastAnsweredAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...p,
  }
}

function inputs(p: Partial<RescueScoreInputs>): RescueScoreInputs {
  return {
    history: undefined,
    flag: undefined,
    confidence: undefined,
    conceptMasteryStrength: 0.5,
    stopLossedOnce: false,
    yieldBand: 'high',
    estTimeSec: 60,
    ...p,
  }
}

describe('typeCoefficient seam', () => {
  it('returns 1.0 in this release', () => {
    expect(typeCoefficient(q())).toBe(1.0)
  })

  it('CONTRACT: is invoked inside priorityOf (seam cannot be dead-code-eliminated)', () => {
    const spy = vi.spyOn(rescueSeams, 'typeCoefficient')
    priorityOf(q(), inputs({ history: hist({ lastResult: 'wrong' }) }), NOW)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveReturnedWith(1.0)
    spy.mockRestore()
  })
})

describe('Yield tier mapping', () => {
  it('maps the three real cram tiers ordinally', () => {
    expect(tierToYieldBand('常青必掃')).toBe<YieldBand>('high')
    expect(tierToYieldBand('穩定考點')).toBe<YieldBand>('mid')
    expect(tierToYieldBand('經典但降溫')).toBe<YieldBand>('low')
  })
  it('returns undefined for unknown/absent tier (→ caller uses corpus fallback)', () => {
    expect(tierToYieldBand('近年新寵')).toBeUndefined()
    expect(tierToYieldBand(undefined)).toBeUndefined()
    expect(tierToYieldBand('')).toBeUndefined()
  })
  it('bands corpus percentile by tercile', () => {
    expect(percentileToYieldBand(0.9)).toBe('high')
    expect(percentileToYieldBand(0.5)).toBe('mid')
    expect(percentileToYieldBand(0.1)).toBe('low')
  })
})

describe('Movability bands', () => {
  it('unanswered → concept-mastery prior (weak concept high, strong low)', () => {
    const weak = inputs({ history: undefined, conceptMasteryStrength: 0 })
    const strong = inputs({ history: undefined, conceptMasteryStrength: 1 })
    expect(movabilityBandOf(weak, NOW)).toBe('unanswered')
    expect(movabilityValue('unanswered', weak)).toBeCloseTo(1.0, 5)
    expect(movabilityValue('unanswered', strong)).toBeCloseTo(0.2, 5)
  })

  it('wrong + learnable → 1.0', () => {
    const inp = inputs({ history: hist({ lastResult: 'wrong', attempts: 1, correctCount: 0 }) })
    expect(movabilityBandOf(inp, NOW)).toBe('wrong-learnable')
    expect(movabilityValue('wrong-learnable', inp)).toBe(1.0)
  })

  it('correct but not mastered → correct-unsure 0.5', () => {
    const inp = inputs({
      history: hist({ lastResult: 'correct', correctCount: 1, interval: 3, nextDueAt: NOW - 1 }),
    })
    expect(movabilityBandOf(inp, NOW)).toBe('correct-unsure')
    expect(movabilityValue('correct-unsure', inp)).toBe(0.5)
  })

  it('unrecoverable requires wrong ≥3 AND stop-lossed once (behavior only)', () => {
    const notYet = inputs({
      history: hist({ lastResult: 'wrong', attempts: 4, correctCount: 0 }),
      stopLossedOnce: false,
    })
    expect(movabilityBandOf(notYet, NOW)).toBe('wrong-learnable') // no stop-loss yet
    const unrec = inputs({
      history: hist({ lastResult: 'wrong', attempts: 4, correctCount: 0 }),
      stopLossedOnce: true,
      yieldBand: 'mid',
    })
    expect(movabilityBandOf(unrec, NOW)).toBe('unrecoverable')
    expect(movabilityValue('unrecoverable', unrec)).toBe(0.2)
    const unrecLow = inputs({ ...unrec, yieldBand: 'low' })
    expect(movabilityValue('unrecoverable', unrecLow)).toBe(0.05)
  })

  it('already-mastered → 0 via SRS interval≥7 & not due (no opt-in flag needed)', () => {
    const inp = inputs({
      history: hist({ lastResult: 'correct', interval: 7, nextDueAt: NOW + 5 * 86_400_000 }),
    })
    expect(movabilityBandOf(inp, NOW)).toBe('mastered')
    expect(movabilityValue('mastered', inp)).toBe(0)
  })

  it('already-mastered fallback: ≥2 cumulative corrects & not due, without any flag', () => {
    const inp = inputs({
      history: hist({ lastResult: 'correct', correctCount: 3, nextDueAt: NOW + 86_400_000 }),
      flag: undefined,
    })
    expect(movabilityBandOf(inp, NOW)).toBe('mastered')
  })
})

describe('Band precedence: high-confidence-wrong escapes unrecoverable + triage (L1)', () => {
  // Shape that WOULD classify as unrecoverable low-yield (wrong≥3 + stop-lossed + low band).
  const unrecoverableShape = (p: Partial<RescueScoreInputs> = {}): RescueScoreInputs =>
    inputs({
      history: hist({ lastResult: 'wrong', attempts: 4, correctCount: 0 }),
      stopLossedOnce: true,
      yieldBand: 'low',
      ...p,
    })

  it('an explicit "sure" tap keeps a wrong≥3 + stop-lossed low-yield question learnable, not unrecoverable', () => {
    const inp = unrecoverableShape({ confidence: 'sure' })
    expect(movabilityBandOf(inp, NOW)).toBe('wrong-learnable')
    expect(movabilityValue(movabilityBandOf(inp, NOW), inp)).toBe(1.0)
  })

  it('is NOT triage-dropped, so the ×1.5 hypercorrection can actually apply (spec: extra review)', () => {
    const inp = unrecoverableShape({ confidence: 'sure' })
    expect(isTriageDropped(inp, NOW)).toBe(false)
    expect(confidenceMultiplier(inp)).toBe(1.5)
    expect(priorityOf(q(), inp, NOW)).toBeGreaterThan(0)
  })

  it('the easyMarked flag prior (no live tap) also rescues it from unrecoverable', () => {
    const flag = { easyMarked: true, guessedMarked: false, updatedAt: NOW } as QuestionFlagRow
    const inp = unrecoverableShape({ confidence: undefined, flag })
    expect(movabilityBandOf(inp, NOW)).toBe('wrong-learnable')
  })

  it('REGRESSION: low-confidence ("guess" / none) wrong≥3 + stop-lossed is STILL unrecoverable (escape is hi-conf only)', () => {
    expect(movabilityBandOf(unrecoverableShape({ confidence: 'guess' }), NOW)).toBe('unrecoverable')
    const none = unrecoverableShape({ confidence: undefined })
    expect(movabilityBandOf(none, NOW)).toBe('unrecoverable')
    expect(isTriageDropped(none, NOW)).toBe(true) // low-yield unrecoverable still dropped
  })
})

describe('Confidence multiplier (single source of the ×1.5)', () => {
  it('high-confidence-wrong → ×1.5 (hypercorrection)', () => {
    const inp = inputs({ history: hist({ lastResult: 'wrong' }), confidence: 'sure' as ConfidenceSignal })
    expect(confidenceMultiplier(inp)).toBe(1.5)
  })
  it('low-confidence-correct → ×1.1', () => {
    const inp = inputs({
      history: hist({ lastResult: 'correct', interval: 1, nextDueAt: NOW - 1 }),
      confidence: 'guess',
    })
    expect(confidenceMultiplier(inp)).toBe(1.1)
  })
  it('wrong+guess and correct+sure → ×1.0', () => {
    expect(confidenceMultiplier(inputs({ history: hist({ lastResult: 'wrong' }), confidence: 'guess' }))).toBe(1.0)
    expect(
      confidenceMultiplier(
        inputs({ history: hist({ lastResult: 'correct', interval: 1, nextDueAt: NOW - 1 }), confidence: 'sure' }),
      ),
    ).toBe(1.0)
  })
  it('falls back to existing flags only when no pre-reveal tap', () => {
    const flag = { easyMarked: true, guessedMarked: false, updatedAt: NOW } as QuestionFlagRow
    expect(confidenceMultiplier(inputs({ history: hist({ lastResult: 'wrong' }), confidence: undefined, flag }))).toBe(1.5)
  })
  it('is NOT double-counted in Movability (wrong-learnable stays 1.0 regardless of confidence)', () => {
    const sure = inputs({ history: hist({ lastResult: 'wrong' }), confidence: 'sure' })
    expect(movabilityValue('wrong-learnable', sure)).toBe(1.0)
  })
})

describe('Triage drop', () => {
  it('drops already-mastered (Movability == 0)', () => {
    const inp = inputs({ history: hist({ lastResult: 'correct', interval: 7, nextDueAt: NOW + 86_400_000 }) })
    expect(isTriageDropped(inp, NOW)).toBe(true)
  })
  it('drops unrecoverable low-yield (≤0.05 AND yield<mid)', () => {
    const inp = inputs({
      history: hist({ lastResult: 'wrong', attempts: 4, correctCount: 0 }),
      stopLossedOnce: true,
      yieldBand: 'low',
    })
    expect(isTriageDropped(inp, NOW)).toBe(true)
  })
  it('keeps unrecoverable mid/high-yield (0.2, not dropped)', () => {
    const inp = inputs({
      history: hist({ lastResult: 'wrong', attempts: 4, correctCount: 0 }),
      stopLossedOnce: true,
      yieldBand: 'mid',
    })
    expect(isTriageDropped(inp, NOW)).toBe(false)
  })
  it('keeps a strong-concept unanswered question (0.2, not dropped) and wrong-learnable', () => {
    expect(isTriageDropped(inputs({ history: undefined, conceptMasteryStrength: 1 }), NOW)).toBe(false)
    expect(isTriageDropped(inputs({ history: hist({ lastResult: 'wrong' }) }), NOW)).toBe(false)
  })
})

describe('priority ordering property', () => {
  it('a high-yield wrong-learnable outranks a mastered (dropped-to-zero) question', () => {
    const learnable = priorityOf(q(), inputs({ history: hist({ lastResult: 'wrong' }), yieldBand: 'high' }), NOW)
    const mastered = priorityOf(
      q(),
      inputs({ history: hist({ lastResult: 'correct', interval: 7, nextDueAt: NOW + 86_400_000 }), yieldBand: 'high' }),
      NOW,
    )
    expect(learnable).toBeGreaterThan(mastered)
    expect(mastered).toBe(0)
  })

  it('high-confidence-wrong outranks the same question with no confidence tap', () => {
    const withSure = priorityOf(q(), inputs({ history: hist({ lastResult: 'wrong' }), confidence: 'sure' }), NOW)
    const plain = priorityOf(q(), inputs({ history: hist({ lastResult: 'wrong' }), confidence: undefined }), NOW)
    expect(withSure).toBeGreaterThan(plain)
    expect(withSure / plain).toBeCloseTo(1.5, 5)
  })

  it('higher Yield outranks lower Yield at equal movability/confidence/time', () => {
    const high = priorityOf(q(), inputs({ history: hist({ lastResult: 'wrong' }), yieldBand: 'high' }), NOW)
    const low = priorityOf(q(), inputs({ history: hist({ lastResult: 'wrong' }), yieldBand: 'low' }), NOW)
    expect(high).toBeGreaterThan(low)
  })
})
