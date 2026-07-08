import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow, QuestionFlagRow } from '../lib/db'
import type { ConceptTagMap } from '../lib/concept-tags'
import type { CramData } from '@study-rpg/content-neurons-tw'
import type { ConfidenceSignal } from '../lib/services/rescue/rescue-priority'
import type { StopLossAction } from '../lib/services/rescue/rescue-stoploss'
import {
  buildYieldResolver,
  buildRescueQueue,
  dailyCapacity,
  partitionDayMix,
  classifyForDayMix,
} from '../lib/services/rescue/rescue-queue'

const NOW = 1_700_000_000_000
const DAY = 86_400_000
const q = (id: string, extra: Partial<Question> = {}): Question =>
  ({ id, subject: '解剖學', ...extra }) as Question
const hist = (id: string, p: Partial<QuestionHistoryRow>): QuestionHistoryRow => ({
  questionId: id,
  family: '解剖學',
  lastResult: 'wrong',
  everWrong: true,
  lastAnsweredAt: NOW - DAY,
  updatedAt: NOW - DAY,
  ...p,
})

type Push = CramData['books'][number]['subjects'][number]['push']
const pushItem = (leafId: string, tier: string): Push[number] =>
  ({ subjectId: '解剖學', leafId, zh: leafId, tier, sittingBreadth: 1, sittingsTotal: 1, questionCount: 1, sourceQuestionIds: [] })

describe('buildYieldResolver', () => {
  it('resolves cram tier ordinally', () => {
    const tags: ConceptTagMap = { qH: ['c-high'], qL: ['c-low'] }
    const resolve = buildYieldResolver(
      [pushItem('c-high', '常青必掃'), pushItem('c-low', '經典但降溫')],
      [q('qH'), q('qL')],
      tags,
    )
    expect(resolve('qH')).toBe('high')
    expect(resolve('qL')).toBe('low')
  })

  it('falls back to corpus appearance-frequency terciles when no push tier', () => {
    // cA in 1 q, cB in 2, cC in 3 → terciles low / mid / high
    const tags: ConceptTagMap = {
      a1: ['cA'],
      b1: ['cB'], b2: ['cB'],
      c1: ['cC'], c2: ['cC'], c3: ['cC'],
    }
    const qs = ['a1', 'b1', 'b2', 'c1', 'c2', 'c3'].map((id) => q(id))
    const resolve = buildYieldResolver([], qs, tags)
    expect(resolve('a1')).toBe('low')
    expect(resolve('b1')).toBe('mid')
    expect(resolve('c1')).toBe('high')
  })
})

describe('dailyCapacity', () => {
  it('is floor(minutes*60 / estTime), min 1', () => {
    expect(dailyCapacity(2, 60)).toBe(2)
    expect(dailyCapacity(48, 96)).toBe(30)
    expect(dailyCapacity(0.1, 96)).toBe(1)
  })
})

describe('buildRescueQueue', () => {
  const base = (over: Partial<Parameters<typeof buildRescueQueue>[0]> = {}) =>
    buildRescueQueue({
      questions: [],
      histById: new Map(),
      flagById: new Map<string, QuestionFlagRow>(),
      confidenceById: new Map<string, ConfidenceSignal>(),
      yieldOf: () => 'high',
      conceptStrengthOf: () => 0.5,
      stopLossActionOf: () => 'none' as StopLossAction,
      stopLossedOnceOf: () => false,
      overrideQids: new Set<string>(),
      dailyMinutes: 60,
      estTimeSec: 60,
      now: NOW,
      ...over,
    })

  it('triage-drops mastered questions (counted, not queued)', () => {
    const mastered = q('m1')
    const learn = q('l1')
    const r = base({
      questions: [mastered, learn],
      histById: new Map([
        ['m1', hist('m1', { lastResult: 'correct', interval: 7, nextDueAt: NOW + 5 * DAY })],
        ['l1', hist('l1', { lastResult: 'wrong' })],
      ]),
    })
    expect(r.core.map((x) => x.id)).toEqual(['l1'])
    expect(r.dropped).toBe(1)
  })

  it('ranks higher-yield above lower-yield', () => {
    const r = base({
      questions: [q('lowY'), q('highY')],
      histById: new Map([
        ['lowY', hist('lowY', { lastResult: 'wrong' })],
        ['highY', hist('highY', { lastResult: 'wrong' })],
      ]),
      yieldOf: (id) => (id === 'highY' ? 'high' : 'low'),
    })
    expect(r.core.map((x) => x.id)).toEqual(['highY', 'lowY'])
  })

  it('caps the core queue at daily capacity', () => {
    const qs = ['a', 'b', 'c', 'd'].map((id) => q(id))
    const histById = new Map(qs.map((x) => [x.id, hist(x.id, { lastResult: 'wrong' })]))
    const r = base({ questions: qs, histById, dailyMinutes: 2, estTimeSec: 60 }) // cap 2
    expect(r.core).toHaveLength(2)
  })

  it('routes override-concept questions to the 加練 addon quota, not core', () => {
    const r = base({
      questions: [q('core1'), q('ovr1')],
      histById: new Map([
        ['core1', hist('core1', { lastResult: 'wrong' })],
        ['ovr1', hist('ovr1', { lastResult: 'wrong' })],
      ]),
      overrideQids: new Set(['ovr1']),
    })
    expect(r.core.map((x) => x.id)).toEqual(['core1'])
    expect(r.addon.map((x) => x.id)).toEqual(['ovr1'])
  })

  it('stop-loss demotion pushes a demoted question down the ranking', () => {
    const r = base({
      questions: [q('demoted'), q('normal')],
      histById: new Map([
        ['demoted', hist('demoted', { lastResult: 'wrong' })],
        ['normal', hist('normal', { lastResult: 'wrong' })],
      ]),
      stopLossActionOf: (id) => (id === 'demoted' ? 'demote' : 'none'),
    })
    expect(r.core.map((x) => x.id)).toEqual(['normal', 'demoted'])
  })

  it('excludes image-option questions', () => {
    const r = base({
      questions: [q('img', { hasOptionImages: true }), q('ok')],
      histById: new Map([
        ['img', hist('img', { lastResult: 'wrong' })],
        ['ok', hist('ok', { lastResult: 'wrong' })],
      ]),
    })
    expect(r.core.map((x) => x.id)).toEqual(['ok'])
  })
})

describe('partitionDayMix', () => {
  it('classifies by history', () => {
    expect(classifyForDayMix(undefined)).toBe('new')
    expect(classifyForDayMix(hist('x', { lastResult: 'wrong' }))).toBe('recovery')
    expect(classifyForDayMix(hist('x', { lastResult: 'correct', everWrong: false }))).toBe('mixed')
  })

  it('honours ratios and fills to capacity', () => {
    // 10 questions: 5 recovery, 3 new, 2 mixed; capacity 10 → all fit
    const rec = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => q(id))
    const neu = ['n1', 'n2', 'n3'].map((id) => q(id))
    const mix = ['m1', 'm2'].map((id) => q(id))
    const ranked = [...rec, ...neu, ...mix]
    const histById = new Map<string, QuestionHistoryRow>([
      ...rec.map((x) => [x.id, hist(x.id, { lastResult: 'wrong' })] as const),
      ...mix.map((x) => [x.id, hist(x.id, { lastResult: 'correct', everWrong: false })] as const),
    ])
    const out = partitionDayMix(ranked, histById, 10)
    expect(out).toHaveLength(10) // fills to capacity
    const smaller = partitionDayMix(ranked, histById, 4)
    expect(smaller.length).toBe(4) // capacity respected
  })
})
