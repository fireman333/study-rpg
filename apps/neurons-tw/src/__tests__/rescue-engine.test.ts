import { describe, it, expect } from 'vitest'
import type { CramData } from '@study-rpg/content-neurons-tw'
import {
  isStuck,
  stopLossAction,
  stopLossDemotion,
  isOverrideExpired,
  STOP_LOSS_DEMOTE_MULT,
  OVERRIDE_MAX_AGE_MS,
} from '../lib/services/rescue/rescue-stoploss'
import {
  findCramSubject,
  subjectKernelItems,
  resolveConceptRereadCard,
} from '../lib/services/rescue/rescue-reread'
import {
  computeRescueD,
  shouldArchiveRescue,
  rescuePhase,
} from '../lib/services/rescue/rescue-lifecycle'

// ─── stop-loss ────────────────────────────────────────────────────────────────
describe('stop-loss switch', () => {
  it('trips only at ≥6 attempts AND <40% accuracy', () => {
    expect(isStuck({ attemptsToday: 6, recentAccuracy: 0.3 })).toBe(true)
    expect(isStuck({ attemptsToday: 5, recentAccuracy: 0.0 })).toBe(false)
    expect(isStuck({ attemptsToday: 8, recentAccuracy: 0.5 })).toBe(false)
  })

  it('high/mid-frequency stuck → re-read; low-frequency stuck → demote', () => {
    const stuck = { attemptsToday: 6, recentAccuracy: 0.2 }
    expect(stopLossAction(stuck, 'high')).toBe('reread')
    expect(stopLossAction(stuck, 'mid')).toBe('reread')
    expect(stopLossAction(stuck, 'low')).toBe('demote')
    expect(stopLossAction({ attemptsToday: 1, recentAccuracy: 0 }, 'low')).toBe('none')
  })

  it('only demote lowers priority (×0.15)', () => {
    expect(stopLossDemotion('demote')).toBe(STOP_LOSS_DEMOTE_MULT)
    expect(stopLossDemotion('reread')).toBe(1)
    expect(stopLossDemotion('none')).toBe(1)
  })

  it('override expires after 24h OR 6 more attempts', () => {
    const o = { setAt: 1000, attemptsAtOverride: 2 }
    expect(isOverrideExpired(o, 1000 + OVERRIDE_MAX_AGE_MS, 2)).toBe(true) // time
    expect(isOverrideExpired(o, 2000, 8)).toBe(true) // attempts (2→8 = 6)
    expect(isOverrideExpired(o, 2000, 5)).toBe(false) // neither
  })
})

// ─── concept re-read resolver ────────────────────────────────────────────────
const cram: CramData = {
  version: 1,
  statUpTo: '115-1',
  builtAt: '2026-01-01',
  books: [
    {
      book: '醫學一',
      subjects: [
        {
          subjectId: '解剖學',
          book: '醫學一',
          name: '解剖學',
          blocks: [{ kind: 'kernel', heading: '高頻考古', items: [{ html: '<p>brachial plexus</p>' }] }],
          push: [
            {
              subjectId: '解剖學',
              leafId: 'c-brachial',
              zh: '臂神經叢',
              tier: '常青必掃',
              sittingBreadth: 3,
              sittingsTotal: 9,
              questionCount: 12,
              sourceQuestionIds: ['q1', 'q2'],
            },
          ],
        },
      ],
    },
  ],
} as CramData

describe('concept re-read resolver', () => {
  it('finds the subject and its kernel items', () => {
    const s = findCramSubject(cram, '解剖學')
    expect(s?.subjectId).toBe('解剖學')
    expect(subjectKernelItems(s)).toHaveLength(1)
    expect(findCramSubject(cram, '生理學')).toBeUndefined()
    expect(findCramSubject(null, '解剖學')).toBeUndefined()
  })

  it('resolves concept-precise card from a push item', () => {
    const card = resolveConceptRereadCard(findCramSubject(cram, '解剖學'), 'c-brachial')
    expect(card.source).toBe('concept')
    expect(card.conceptZh).toBe('臂神經叢')
    expect(card.sourceQuestionIds).toEqual(['q1', 'q2'])
    expect(card.kernelItems).toHaveLength(1)
  })

  it('falls back to subject-level kernel when no concept push item', () => {
    const card = resolveConceptRereadCard(findCramSubject(cram, '解剖學'), 'c-unknown')
    expect(card.source).toBe('subject-fallback')
    expect(card.sourceQuestionIds).toEqual([])
    expect(card.kernelItems).toHaveLength(1)
  })
})

// ─── lifecycle ────────────────────────────────────────────────────────────────
describe('rescue lifecycle date semantics', () => {
  it('D = examDate − today in calendar days (D0 = exam day, D1 = day before)', () => {
    expect(computeRescueD('2026-07-10', '2026-07-10')).toBe(0)
    expect(computeRescueD('2026-07-10', '2026-07-09')).toBe(1)
    expect(computeRescueD('2026-07-10', '2026-07-05')).toBe(5)
    expect(computeRescueD('2026-07-10', '2026-07-11')).toBe(-1)
  })

  it('auto-archives at examDate + 1 day (not on the exam day itself)', () => {
    expect(shouldArchiveRescue('2026-07-10', '2026-07-10')).toBe(false) // exam day
    expect(shouldArchiveRescue('2026-07-10', '2026-07-11')).toBe(true) // day after
  })

  it('phases: active / exam-eve (D1) / exam-morning (D0) / archived', () => {
    expect(rescuePhase('2026-07-10', '2026-07-05')).toBe('active')
    expect(rescuePhase('2026-07-10', '2026-07-09')).toBe('exam-eve')
    expect(rescuePhase('2026-07-10', '2026-07-10')).toBe('exam-morning')
    expect(rescuePhase('2026-07-10', '2026-07-12')).toBe('archived')
  })
})
