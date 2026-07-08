import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow, QuestionFlagRow } from '../lib/db'
import type { ConceptTagMap } from '../lib/concept-tags'
import type { CramData } from '@study-rpg/content-neurons-tw'
import type { ConfidenceSignal } from '../lib/services/rescue/rescue-priority'
import {
  buildConceptYield,
  blitzSize,
  buildBlitzPool,
  buildWarMap,
  interleaveByBlock,
  buildQuickScanPool,
  buildConceptStatsToday,
  assembleRescueQueue,
} from '../lib/services/rescue/rescue-session'

const NOW = 1_700_000_000_000
const DAY = 86_400_000
const q = (id: string, extra: Partial<Question> = {}): Question =>
  ({ id, subject: '解剖學', ...extra }) as Question
const hist = (id: string, p: Partial<QuestionHistoryRow> = {}): QuestionHistoryRow => ({
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

describe('buildConceptYield', () => {
  it('prefers cram tier, falls back to corpus percentile', () => {
    const tags: ConceptTagMap = {
      a1: ['cA'],
      b1: ['cB'], b2: ['cB'],
      c1: ['cC'], c2: ['cC'], c3: ['cC'],
      t1: ['cTier'],
    }
    const qs = ['a1', 'b1', 'b2', 'c1', 'c2', 'c3', 't1'].map((id) => q(id))
    const map = buildConceptYield([pushItem('cTier', '常青必掃')], qs, tags)
    expect(map.get('cTier')).toBe('high') // tier override
    expect(map.get('cA')).toBe('low') // bottom tercile by frequency
    expect(map.get('cC')).toBe('high') // top tercile
  })
})

describe('blitzSize', () => {
  it('scales with remaining days', () => {
    expect(blitzSize(5)).toBe(25)
    expect(blitzSize(3)).toBe(25)
    expect(blitzSize(2)).toBe(15)
    expect(blitzSize(1)).toBe(10)
    expect(blitzSize(0)).toBe(10)
  })
})

describe('buildBlitzPool', () => {
  it('sizes to D and leads with unanswered / stale questions', () => {
    const qs = Array.from({ length: 30 }, (_, i) => q(`q${i}`))
    const tags: ConceptTagMap = Object.fromEntries(qs.map((x) => [x.id, ['c1']]))
    const yield_ = new Map([['c1', 'high' as const]])
    // q0 answered just now (freshest → least stale); q1 answered long ago; rest unanswered.
    const histById = new Map<string, QuestionHistoryRow>([
      ['q0', hist('q0', { lastAnsweredAt: NOW })],
      ['q1', hist('q1', { lastAnsweredAt: NOW - 30 * DAY })],
    ])
    const pool = buildBlitzPool(qs, histById, yield_, tags, 3, NOW)
    expect(pool).toHaveLength(25) // D>=3
    // The just-answered q0 is the least stale → should NOT lead; unanswered/stale lead.
    expect(pool[0]!.id).not.toBe('q0')
  })

  it('shrinks when the family already has thick history', () => {
    const qs = Array.from({ length: 20 }, (_, i) => q(`q${i}`))
    const tags: ConceptTagMap = Object.fromEntries(qs.map((x) => [x.id, ['c1']]))
    const yield_ = new Map([['c1', 'mid' as const]])
    // 90% answered → shrink 25 → 15
    const histById = new Map(qs.slice(0, 18).map((x) => [x.id, hist(x.id)] as const))
    const pool = buildBlitzPool(qs, histById, yield_, tags, 5, NOW)
    expect(pool.length).toBeLessThan(25)
  })
})

describe('buildWarMap', () => {
  it('bands concepts grey (undiagnosed) / red (hi-conf-wrong) / yellow', () => {
    const tags: ConceptTagMap = { qRed: ['cRed'], qYellow: ['cYellow'], qGrey: ['cGrey'] }
    const qs = [q('qRed'), q('qYellow'), q('qGrey')]
    const yield_ = new Map([
      ['cRed', 'mid' as const],
      ['cYellow', 'mid' as const],
      ['cGrey', 'mid' as const],
    ])
    // cRed: answered wrong with high-confidence tap → red; cYellow: answered correct recently → yellow;
    // cGrey: never answered → grey.
    const history: QuestionHistoryRow[] = [
      hist('qRed', { lastResult: 'wrong', lastAnsweredAt: NOW }),
      hist('qYellow', { lastResult: 'correct', everWrong: false, lastAnsweredAt: NOW }),
    ]
    const confidence = new Map<string, ConfidenceSignal>([['qRed', 'sure']])
    const map = buildWarMap(qs, history, yield_, tags, confidence, NOW)
    const byId = new Map(map.map((c) => [c.conceptId, c]))
    expect(byId.get('cRed')!.band).toBe('red')
    expect(byId.get('cRed')!.hiConfWrong).toBe(true)
    expect(byId.get('cGrey')!.band).toBe('grey')
    expect(byId.get('cYellow')!.band).toBe('yellow')
    // red sorts before grey.
    expect(map[0]!.band).toBe('red')
  })
})

describe('interleaveByBlock', () => {
  it('caps same-concept per block at 3 and interleaves', () => {
    // 5 of concept A, 1 of B in one block of 8 → block takes at most 3 A this block.
    const qs = [
      q('a1'), q('a2'), q('a3'), q('a4'), q('a5'), q('b1'),
    ]
    const tags: ConceptTagMap = {
      a1: ['A'], a2: ['A'], a3: ['A'], a4: ['A'], a5: ['A'], b1: ['B'],
    }
    const out = interleaveByBlock(qs, tags, 8, 3)
    expect(out).toHaveLength(6) // nothing dropped
    // First block (first 4 slots: 3×A + 1×B before A4/A5 are deferred) has ≤3 A.
    const firstBlock = out.slice(0, 4)
    const aInFirst = firstBlock.filter((x) => x.id.startsWith('a')).length
    expect(aInFirst).toBeLessThanOrEqual(3)
  })
})

describe('buildConceptStatsToday', () => {
  it('counts today attempts and today accuracy per concept', () => {
    const tags: ConceptTagMap = { t1: ['c'], t2: ['c'], old: ['c'] }
    const qs = [q('t1'), q('t2'), q('old')]
    const history: QuestionHistoryRow[] = [
      hist('t1', { lastResult: 'wrong', lastAnsweredAt: NOW - 1000 }),
      hist('t2', { lastResult: 'correct', lastAnsweredAt: NOW - 2000 }),
      hist('old', { lastResult: 'wrong', lastAnsweredAt: NOW - 3 * DAY }), // >24h → excluded
    ]
    const stats = buildConceptStatsToday(qs, history, tags, NOW)
    expect(stats.get('c')!.attemptsToday).toBe(2)
    expect(stats.get('c')!.recentAccuracy).toBeCloseTo(0.5)
  })
})

describe('buildQuickScanPool', () => {
  it('leads with corrected high-confidence-wrong then high-freq kernel, capped', () => {
    const qs = [q('hcw'), q('kernel'), q('filler')]
    const tags: ConceptTagMap = { hcw: ['cLow'], kernel: ['cHi'], filler: ['cLow'] }
    const yield_ = new Map([
      ['cHi', 'high' as const],
      ['cLow', 'low' as const],
    ])
    const histById = new Map<string, QuestionHistoryRow>([
      ['hcw', hist('hcw', { everWrong: true })],
    ])
    const confidence = new Map<string, ConfidenceSignal>([['hcw', 'sure']])
    const pool = buildQuickScanPool(qs, histById, confidence, yield_, tags)
    expect(pool[0]!.id).toBe('hcw') // high-confidence-wrong leads
    expect(pool.some((x) => x.id === 'kernel')).toBe(true) // hi-freq kernel included
    expect(pool.some((x) => x.id === 'filler')).toBe(false) // low-yield, never wrong → out
  })
})

describe('assembleRescueQueue', () => {
  it('returns a mixed day, concept-yield map, mean movability, and routes overrides to addon', () => {
    const qs = [q('core1'), q('core2'), q('ovr1')]
    const tags: ConceptTagMap = { core1: ['cA'], core2: ['cA'], ovr1: ['cO'] }
    const history: QuestionHistoryRow[] = [
      hist('core1', { lastResult: 'wrong' }),
      hist('core2', { lastResult: 'wrong' }),
      hist('ovr1', { lastResult: 'wrong' }),
    ]
    const out = assembleRescueQueue({
      subjectQuestions: qs,
      history,
      flagById: new Map<string, QuestionFlagRow>(),
      confidenceById: new Map<string, ConfidenceSignal>(),
      conceptTags: tags,
      push: [pushItem('cA', '常青必掃'), pushItem('cO', '常青必掃')],
      overrideConcepts: new Set(['cO']),
      dailyMinutes: 60,
      now: NOW,
    })
    expect(out.queue.addon.map((x) => x.id)).toEqual(['ovr1'])
    expect(out.queue.core.map((x) => x.id).sort()).toEqual(['core1', 'core2'])
    expect(out.conceptYield.get('cA')).toBe('high')
    expect(out.dayMeanMovability).toBeGreaterThan(0)
    expect(out.day.length).toBeGreaterThan(0)
  })
})
