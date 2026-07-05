import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { Question } from '@study-rpg/core'
import { db, todayISO, type QuestionHistoryRow } from '../lib/db'
import {
  computeWrongTarget,
  computeBreadthTarget,
  ng0717Stage,
  blindSpotScore,
  selectBlindSpotFamily,
  recentAccuracyPct,
  buildPlan,
  deriveStatus,
  getOrCreateTodayPlan,
  recordPrescriptionAnswer,
  getCompletedDayCount,
  getPrescriptionStatus,
  isLightsOutToday,
  setLightsOutToday,
  clearLightsOutToday,
  daysUntilExam,
  NG0717_FULL_MATURITY,
  DAILY_TOTAL_CAP,
  type PrescriptionPlan,
  type BlindSpotCandidate,
} from '../lib/services/prescription'
import { ALL_YEARS, setYearFilter } from '../lib/services/year-filter'

// ── helpers ──────────────────────────────────────────────────────────────
const q = (id: string, subject: string, year?: number): Question =>
  ({
    id,
    subject,
    stem: '',
    options: [],
    answer: 0,
    explanation: '',
    ...(year != null ? { meta: { year } } : {}),
  }) as unknown as Question

/** buildPlan opts with all-years / no-flags defaults; override per test. */
const mkOpts = (
  over: Partial<Parameters<typeof buildPlan>[3]> = {},
): Parameters<typeof buildPlan>[3] => ({
  date: 'd',
  recentBlindSpotFamilyIds: [],
  localSeed: 's',
  now: 1,
  flagsByQuestion: new Map(),
  yearSet: new Set(ALL_YEARS),
  ...over,
})

const hist = (
  questionId: string,
  family: string,
  lastResult: 'correct' | 'wrong',
  lastAnsweredAt = 1,
): QuestionHistoryRow => ({
  questionId,
  family,
  lastResult,
  everWrong: lastResult === 'wrong',
  lastAnsweredAt,
  updatedAt: lastAnsweredAt,
})

const cand = (over: Partial<BlindSpotCandidate> & { familyId: string }): BlindSpotCandidate => ({
  familyLabel: over.familyId,
  unseenCount: 10,
  totalQuestions: 100,
  outstandingWrongCount: 0,
  uniqueAttempted: 10,
  unseenQuestionIds: [],
  ...over,
})

async function putPlan(p: Partial<PrescriptionPlan>): Promise<void> {
  const plan: PrescriptionPlan = {
    date: todayISO(),
    createdAt: 1,
    seed: 'seed',
    wrongTarget: 0,
    breadthTarget: 0,
    breadthFamilyId: null,
    breadthFamilyLabel: null,
    wrongEligibleQuestionIds: [],
    breadthEligibleQuestionIds: [],
    yearScope: null,
    ...p,
  }
  await db.meta.put({ key: `prescription:v1:plan:${todayISO()}`, value: JSON.stringify(plan) })
}

// ── pure: targets ──────────────────────────────────────────────────────────
describe('computeWrongTarget', () => {
  it('scales by wrong-pool size', () => {
    expect(computeWrongTarget(0, null)).toBe(0)
    expect(computeWrongTarget(2, null)).toBe(2)
    expect(computeWrongTarget(3, null)).toBe(3)
    expect(computeWrongTarget(10, null)).toBe(4)
    expect(computeWrongTarget(30, null)).toBe(5)
    expect(computeWrongTarget(120, null)).toBe(6)
  })
  it('lowers the cap on low recent accuracy', () => {
    expect(computeWrongTarget(120, 42)).toBe(3) // <50% caps to 3
    expect(computeWrongTarget(120, 60)).toBe(4) // 50–65% caps to 4
    expect(computeWrongTarget(120, 80)).toBe(6) // high accuracy: no cap
  })
})

describe('computeBreadthTarget keeps total ≤ 12', () => {
  it('is complementary to N', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6]) {
      expect(n + computeBreadthTarget(n)).toBeLessThanOrEqual(DAILY_TOTAL_CAP)
    }
    expect(computeBreadthTarget(0)).toBe(10)
    expect(computeBreadthTarget(4)).toBe(8)
    expect(computeBreadthTarget(5)).toBe(7)
    expect(computeBreadthTarget(6)).toBe(6)
  })
})

// ── pure: NG-0717 stage ──────────────────────────────────────────────────────
describe('ng0717Stage', () => {
  it('maps completed-day count to 4 stages', () => {
    expect(ng0717Stage(0)).toBe(0)
    expect(ng0717Stage(1)).toBe(1)
    expect(ng0717Stage(2)).toBe(1)
    expect(ng0717Stage(3)).toBe(2)
    expect(ng0717Stage(6)).toBe(3)
    expect(ng0717Stage(10)).toBe(4)
    expect(ng0717Stage(99)).toBe(4)
  })
})

describe('recentAccuracyPct', () => {
  it('returns null with no history', () => {
    expect(recentAccuracyPct([])).toBeNull()
  })
  it('uses latest N by lastAnsweredAt', () => {
    const h = [hist('a', 'x', 'wrong', 1), hist('b', 'x', 'correct', 2), hist('c', 'x', 'correct', 3)]
    expect(recentAccuracyPct(h, 2)).toBe(100) // two most-recent both correct
    expect(recentAccuracyPct(h, 3)).toBeCloseTo((2 / 3) * 100)
  })
})

// ── pure: blind-spot selection ───────────────────────────────────────────────
describe('selectBlindSpotFamily', () => {
  it('only considers families with unseen questions', () => {
    const c = [cand({ familyId: 'a', unseenCount: 0 }), cand({ familyId: 'b', unseenCount: 5 })]
    expect(selectBlindSpotFamily(c, [], '2026-07-04', 's')?.familyId).toBe('b')
  })
  it('returns null when nothing is eligible', () => {
    expect(selectBlindSpotFamily([cand({ familyId: 'a', unseenCount: 0 })], [], 'd', 's')).toBeNull()
  })
  it('picks the highest coverage-weighted score', () => {
    const c = [
      cand({ familyId: 'low', unseenCount: 5, totalQuestions: 100 }),
      cand({ familyId: 'high', unseenCount: 90, totalQuestions: 100 }),
    ]
    expect(selectBlindSpotFamily(c, [], 'd', 's')?.familyId).toBe('high')
  })
  it('skips a family chosen the previous 2 consecutive days when an alternative exists', () => {
    const c = [
      cand({ familyId: 'x', unseenCount: 90, totalQuestions: 100 }), // would win on score
      cand({ familyId: 'y', unseenCount: 40, totalQuestions: 100 }),
    ]
    expect(selectBlindSpotFamily(c, ['x', 'x'], 'd', 's')?.familyId).toBe('y')
  })
  it('is deterministic for the same date/seed on ties', () => {
    const c = [cand({ familyId: 'a', unseenCount: 10, totalQuestions: 100 }), cand({ familyId: 'b', unseenCount: 10, totalQuestions: 100 })]
    const a = selectBlindSpotFamily(c, [], '2026-07-04', 'seed')?.familyId
    const b = selectBlindSpotFamily(c, [], '2026-07-04', 'seed')?.familyId
    expect(a).toBe(b)
  })
})

describe('blindSpotScore', () => {
  it('rewards coverage gap', () => {
    expect(blindSpotScore(90, 100, 0, 10)).toBeGreaterThan(blindSpotScore(5, 100, 0, 10))
  })
})

// ── pure: buildPlan ──────────────────────────────────────────────────────────
describe('buildPlan', () => {
  const subjects = [
    { id: 'anat', displayName: '解剖' },
    { id: 'phys', displayName: '生理' },
  ]
  const pool = [
    ...Array.from({ length: 50 }, (_, i) => q(`anat-${i}`, 'anat')),
    ...Array.from({ length: 50 }, (_, i) => q(`phys-${i}`, 'phys')),
  ]

  it('snapshots wrong ids and keeps total ≤ 12', () => {
    const history = [hist('anat-0', 'anat', 'wrong'), hist('anat-1', 'anat', 'wrong')]
    const plan = buildPlan(pool, history, subjects, mkOpts({ date: '2026-07-04' }))
    expect(plan.wrongEligibleQuestionIds.sort()).toEqual(['anat-0', 'anat-1'])
    expect(plan.wrongTarget).toBe(2)
    expect(plan.wrongTarget + plan.breadthTarget).toBeLessThanOrEqual(DAILY_TOTAL_CAP)
    expect(plan.breadthFamilyId).toBeTruthy()
    expect(plan.breadthEligibleQuestionIds.length).toBeGreaterThan(0)
  })

  it('empty wrong-pool → N=0, M=10', () => {
    const plan = buildPlan(pool, [], subjects, mkOpts())
    expect(plan.wrongTarget).toBe(0)
    expect(plan.breadthTarget).toBe(10)
  })

  it('breadth snapshot captures ALL unseen ids of the chosen family (not a truncated subset)', () => {
    // Regression: the fresh quiz does not serve in snapshot order, so a truncated
    // snapshot leaves most served questions uncounted. The snapshot must be full.
    const plan = buildPlan(pool, [], subjects, mkOpts())
    const fam = plan.breadthFamilyId!
    const unseenInFam = pool.filter((x) => x.subject === fam).length
    expect(plan.breadthEligibleQuestionIds.length).toBe(unseenInFam)
  })
})

// ── pure: buildPlan repair-pool (wrong ∪ guessed − easy) + year-scope ─────────
describe('buildPlan repair pool & year-scope', () => {
  const subjects = [
    { id: 'anat', displayName: '解剖' },
    { id: 'phys', displayName: '生理' },
  ]
  const flags = (
    entries: Array<[string, { easyMarked?: boolean; guessedMarked?: boolean }]>,
  ) =>
    new Map(
      entries.map(([id, f]) => [
        id,
        { easyMarked: f.easyMarked ?? false, guessedMarked: f.guessedMarked ?? false },
      ]),
    )

  it('repair pool = (wrong ∪ guessed) − easy', () => {
    const pool = Array.from({ length: 40 }, (_, i) => q(`anat-${i}`, 'anat'))
    // wrong: a-0, a-1 ; guessed-correct: a-2 (hidden weakness) ; easy overrides a-1
    const history = [
      hist('anat-0', 'anat', 'wrong'),
      hist('anat-1', 'anat', 'wrong'),
      hist('anat-2', 'anat', 'correct'),
    ]
    const plan = buildPlan(
      pool,
      history,
      subjects,
      mkOpts({ flagsByQuestion: flags([['anat-2', { guessedMarked: true }], ['anat-1', { easyMarked: true }]]) }),
    )
    expect(plan.wrongEligibleQuestionIds.sort()).toEqual(['anat-0', 'anat-2'])
    expect(plan.wrongTarget).toBe(2) // pool size 2 → N=2
  })

  it('excludes easy-marked questions from the unseen (開發新連結) pool', () => {
    const pool = [q('anat-0', 'anat'), q('anat-1', 'anat')]
    const plan = buildPlan(
      pool,
      [],
      [{ id: 'anat', displayName: '解剖' }],
      mkOpts({ flagsByQuestion: flags([['anat-0', { easyMarked: true }]]) }),
    )
    // anat-0 is easy → only anat-1 is an unseen new connection
    expect(plan.breadthEligibleQuestionIds).toEqual(['anat-1'])
  })

  it('blind-spot unseen/total is computed only within the year scope', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => q(`anat-114-${i}`, 'anat', 114)),
      ...Array.from({ length: 90 }, (_, i) => q(`phys-108-${i}`, 'phys', 108)),
    ]
    // Scope to 114 only → phys (all 108) is out of scope, anat (114) is the only eligible family
    const plan = buildPlan(pool, [], subjects, mkOpts({ yearSet: new Set([114]) }))
    expect(plan.breadthFamilyId).toBe('anat')
    expect(plan.breadthEligibleQuestionIds).toHaveLength(10)
    expect(plan.yearScope).toEqual([114])
  })

  it('repair line is scoped-first, then falls back to all years when scoped-empty', () => {
    const pool = [q('anat-0', 'anat', 108), q('anat-1', 'anat', 114)]
    // Only the 108 question is wrong; scope to 114 → scoped repair empty → fallback to all-years
    const plan = buildPlan(
      pool,
      [hist('anat-0', 'anat', 'wrong')],
      subjects,
      mkOpts({ yearSet: new Set([114]) }),
    )
    // anat-0 is year 108 (out of the [114] scope) yet appears in the repair pool
    // → the scoped repair pool was empty and the line fell back to all years.
    expect(plan.wrongEligibleQuestionIds).toEqual(['anat-0'])
  })

  it('yearScope snapshot is null when all years are selected', () => {
    const pool = [q('anat-0', 'anat', 114)]
    const plan = buildPlan(pool, [], subjects, mkOpts())
    expect(plan.yearScope).toBeNull()
  })

  it('starvation: no eligible new-connection family in scope → breadthTarget 0', () => {
    // All in-scope questions already answered → no unseen family; breadth line satisfied.
    const pool = [q('anat-0', 'anat', 114)]
    const plan = buildPlan(
      pool,
      [hist('anat-0', 'anat', 'correct')],
      subjects,
      mkOpts({ yearSet: new Set([114]) }),
    )
    expect(plan.breadthFamilyId).toBeNull()
    expect(plan.breadthTarget).toBe(0)
  })
})

// ── pure: deriveStatus ───────────────────────────────────────────────────────
describe('deriveStatus', () => {
  const plan: PrescriptionPlan = {
    date: 'd', createdAt: 1, seed: 's', wrongTarget: 2, breadthTarget: 3,
    breadthFamilyId: 'anat', breadthFamilyLabel: '解剖', wrongEligibleQuestionIds: [], breadthEligibleQuestionIds: [],
    yearScope: null,
  }
  it('routes CTA to wrong first, then breadth, then null', () => {
    expect(deriveStatus(plan, 0, 0, 0).nextTarget).toBe('wrong')
    expect(deriveStatus(plan, 2, 0, 0).nextTarget).toBe('breadth')
    expect(deriveStatus(plan, 2, 3, 0).nextTarget).toBeNull()
    expect(deriveStatus(plan, 2, 3, 0).dayComplete).toBe(true)
  })
  it('auto-satisfies the wrong line when target is 0', () => {
    const p0 = { ...plan, wrongTarget: 0 }
    expect(deriveStatus(p0, 0, 0, 0).wrongComplete).toBe(true)
    expect(deriveStatus(p0, 0, 0, 0).nextTarget).toBe('breadth')
  })
  it('derives stage + keepsake from completedDayCount', () => {
    expect(deriveStatus(plan, 0, 0, 10).ng0717Stage).toBe(4)
    expect(deriveStatus(plan, 0, 0, 10).keepsakeUnlocked).toBe(true)
    expect(deriveStatus(plan, 0, 0, 9).keepsakeUnlocked).toBe(false)
  })
})

describe('daysUntilExam', () => {
  it('counts down to the exam date and goes negative after', () => {
    expect(daysUntilExam('2026-07-03')).toBe(14)
    expect(daysUntilExam('2026-07-17')).toBe(0)
    expect(daysUntilExam('2026-07-18')).toBe(-1)
  })
})

// ── impure: meta-backed counting / freeze / completion ───────────────────────
describe('prescription meta layer', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('getOrCreateTodayPlan builds N from Dexie history, then freezes it', async () => {
    const subjects = [{ id: 'anat', displayName: '解剖' }]
    const pool = Array.from({ length: 20 }, (_, i) => q(`anat-${i}`, 'anat'))
    // Seed authoritative history BEFORE the first call → plan must reflect it
    // (guards the async-load race: history is read from Dexie, not a prop).
    await db.questionHistory.bulkPut([hist('anat-0', 'anat', 'wrong'), hist('anat-1', 'anat', 'wrong')])
    const p1 = await getOrCreateTodayPlan({ questions: pool, subjects })
    expect(p1.wrongTarget).toBe(2)
    expect(p1.wrongEligibleQuestionIds.sort()).toEqual(['anat-0', 'anat-1'])
    // History changes AFTER the plan is frozen — must NOT re-plan.
    await db.questionHistory.put(hist('anat-2', 'anat', 'wrong'))
    const p2 = await getOrCreateTodayPlan({ questions: pool, subjects })
    expect(p2).toEqual(p1)
  })

  it('counts a snapshot-wrong question only when answered correctly, deduped', async () => {
    await putPlan({ wrongTarget: 2, breadthTarget: 99, wrongEligibleQuestionIds: ['w1', 'w2', 'w3'] })
    await recordPrescriptionAnswer('w1', 'anat', true)
    await recordPrescriptionAnswer('w1', 'anat', true) // dedup
    await recordPrescriptionAnswer('w2', 'anat', false) // wrong answer doesn't count
    let s = await getPrescriptionStatus()
    expect(s.wrongDone).toBe(1)
    await recordPrescriptionAnswer('nope', 'anat', true) // outside snapshot
    s = await getPrescriptionStatus()
    expect(s.wrongDone).toBe(1)
  })

  it('reports repair consolidation only on the first correct repair (for the 連結已固化 note)', async () => {
    await putPlan({ wrongTarget: 2, breadthTarget: 99, wrongEligibleQuestionIds: ['w1', 'w2'] })
    expect((await recordPrescriptionAnswer('w1', 'anat', true)).repairConsolidated).toBe(true)
    expect((await recordPrescriptionAnswer('w1', 'anat', true)).repairConsolidated).toBe(false) // dedup
    expect((await recordPrescriptionAnswer('w2', 'anat', false)).repairConsolidated).toBe(false) // wrong answer
    expect((await recordPrescriptionAnswer('out', 'anat', true)).repairConsolidated).toBe(false) // outside snapshot
  })

  it('getOrCreateTodayPlan applies the persisted year filter to the pool', async () => {
    const subjects = [{ id: 'anat', displayName: '解剖' }, { id: 'phys', displayName: '生理' }]
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => q(`anat-114-${i}`, 'anat', 114)),
      ...Array.from({ length: 5 }, (_, i) => q(`phys-108-${i}`, 'phys', 108)),
    ]
    await setYearFilter([114])
    const p = await getOrCreateTodayPlan({ questions: pool, subjects })
    expect(p.yearScope).toEqual([114])
    expect(p.breadthFamilyId).toBe('anat') // phys (108) is out of scope
    expect(p.breadthEligibleQuestionIds).toHaveLength(5)
  })

  it('counts a breadth question on first answer regardless of correctness, deduped', async () => {
    await putPlan({
      wrongTarget: 99,
      breadthTarget: 2,
      breadthFamilyId: 'phys',
      breadthEligibleQuestionIds: ['b1', 'b2', 'b3'],
    })
    await recordPrescriptionAnswer('b1', 'phys', false) // wrong still counts
    await recordPrescriptionAnswer('b1', 'phys', true) // dedup
    await recordPrescriptionAnswer('b2', 'anat', true) // wrong family: no count
    const s = await getPrescriptionStatus()
    expect(s.breadthDone).toBe(1)
  })

  it('marks the day complete + reward idempotently when both lines hit target', async () => {
    await putPlan({
      wrongTarget: 1,
      breadthTarget: 1,
      breadthFamilyId: 'phys',
      wrongEligibleQuestionIds: ['w1'],
      breadthEligibleQuestionIds: ['b1'],
    })
    await recordPrescriptionAnswer('w1', 'anat', true)
    expect(await getCompletedDayCount()).toBe(0) // breadth not yet done
    await recordPrescriptionAnswer('b1', 'phys', true)
    expect(await getCompletedDayCount()).toBe(1)
    // idempotent: further answers do not double-complete the same day
    await recordPrescriptionAnswer('b1', 'phys', true)
    expect(await getCompletedDayCount()).toBe(1)
    const s = await getPrescriptionStatus()
    expect(s.dayComplete).toBe(true)
    expect(s.ng0717Stage).toBe(1)
  })

  it('completedDayCount is monotonic across the keepsake threshold', async () => {
    for (let i = 0; i < NG0717_FULL_MATURITY; i++) {
      await db.meta.put({ key: `prescription:v1:completed:2026-07-${String(i + 1).padStart(2, '0')}`, value: '{}' })
    }
    expect(await getCompletedDayCount()).toBe(NG0717_FULL_MATURITY)
    const s = await getPrescriptionStatus()
    expect(s.keepsakeUnlocked).toBe(true)
    expect(s.ng0717Stage).toBe(4)
  })

  it('lights-out toggles on/off within the day', async () => {
    expect(await isLightsOutToday()).toBe(false)
    await setLightsOutToday()
    expect(await isLightsOutToday()).toBe(true)
    await setLightsOutToday() // idempotent
    expect(await isLightsOutToday()).toBe(true)
    await clearLightsOutToday()
    expect(await isLightsOutToday()).toBe(false)
  })
})
