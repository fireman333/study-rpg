import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { Question } from '@study-rpg/core'
import { SRS_DAILY_CAP } from '@study-rpg/core'
import { db, type QuestionHistoryRow } from '../lib/db'
import { filterPoolByNewOnly } from '../lib/services/quiz-pool'
import {
  scheduleSrsForAnswer,
  applyEasyModifier,
  applyGuessedModifier,
  restoreDefaultSrs,
  buildDueReviewPool,
  computeFamilyModeCounts,
} from '../lib/services/srs-scheduler'

/** Minimal Question stub — the helpers only read id / subject / hasOptionImages / meta.year. */
function q(id: string, subject: string, extra: Partial<Question> = {}): Question {
  return { id, subject, stem: '', options: {}, answer: 'A', ...extra } as Question
}
function hist(questionId: string, nextDueAt: number | null): QuestionHistoryRow {
  return { questionId, family: 'X', lastResult: 'wrong', everWrong: true, lastAnsweredAt: 0, updatedAt: 0, nextDueAt: nextDueAt ?? undefined }
}

const DAY = 86_400_000

describe('filterPoolByNewOnly (新題 mode)', () => {
  it('keeps only questions with no history row', () => {
    const pool = [q('A1', '解剖學'), q('A2', '解剖學'), q('A3', '解剖學')]
    const history = [{ questionId: 'A2' }]
    const fresh = filterPoolByNewOnly(pool, history)
    expect(fresh.map((x) => x.id)).toEqual(['A1', 'A3'])
  })
  it('empty history → all new', () => {
    const pool = [q('A1', '解剖學'), q('A2', '解剖學')]
    expect(filterPoolByNewOnly(pool, []).length).toBe(2)
  })
})

describe('buildDueReviewPool (錯題 mode)', () => {
  it('serves only due, oldest-due first, skips image-option', () => {
    const now = 1_000_000
    const pool = [q('D1', 'X'), q('D2', 'X'), q('D3', 'X', { hasOptionImages: true }), q('N1', 'X')]
    const history = [
      hist('D1', now - 100), // due, oldest
      hist('D2', now - 10), // due, newer
      hist('D3', now - 999), // due but image-option → excluded
      hist('N1', now + DAY), // not due
    ]
    const out = buildDueReviewPool(pool, history, now)
    expect(out.map((x) => x.id)).toEqual(['D1', 'D2'])
  })
  it('caps at SRS_DAILY_CAP', () => {
    const now = 1_000_000
    const pool = Array.from({ length: SRS_DAILY_CAP + 5 }, (_, i) => q(`Q${i}`, 'X'))
    const history = pool.map((p, i) => hist(p.id, now - i))
    expect(buildDueReviewPool(pool, history, now).length).toBe(SRS_DAILY_CAP)
  })
})

describe('computeFamilyModeCounts (chip badges)', () => {
  it('counts unseen + due per family, respects year predicate', () => {
    const now = 1_000_000
    const questions = [
      q('A1', '解剖學', { meta: { year: 113 } }),
      q('A2', '解剖學', { meta: { year: 113 } }),
      q('A3', '解剖學', { meta: { year: 100 } }), // filtered out by year
      q('P1', '藥理學', { meta: { year: 113 } }),
    ]
    const history = [hist('A2', now - 50)] // A2 answered + due
    const counts = computeFamilyModeCounts(questions, history, (x) => x.meta?.year === 113, now)
    // 解剖學 in-year: A1 (new) + A2 (answered, due). A3 excluded by year.
    expect(counts.get('解剖學')).toEqual({ fresh: 1, due: 1 })
    // 藥理學: P1 new, none due.
    expect(counts.get('藥理學')).toEqual({ fresh: 1, due: 0 })
  })
})

describe('scheduleSrsForAnswer + modifiers (DB singleton)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('wrong fresh answer schedules ~1 day out; correct schedules ~3 days out', async () => {
    const now = 5_000_000
    const wrong = await scheduleSrsForAnswer('W', '解剖學', false, now)
    expect(wrong.result.nextDueAt).toBe(now + 1 * DAY)
    const rowW = await db.questionHistory.get('W')
    expect(rowW?.interval).toBe(1)
    expect(rowW?.attempts).toBe(1)

    const correct = await scheduleSrsForAnswer('C', '生理學', true, now)
    expect(correct.result.nextDueAt).toBe(now + 3 * DAY) // STANDARD_INITIAL_INTERVALS[0]
    expect((await db.questionHistory.get('C'))?.correctCount).toBe(1)
  })

  it('✨ lengthens interval, restore returns to default, everWrong untouched', async () => {
    const now = 5_000_000
    // Seed a row that was wrong (everWrong true) then answered correct.
    await scheduleSrsForAnswer('M', '解剖學', false, now) // everWrong true
    const { prev, result } = await scheduleSrsForAnswer('M', '解剖學', true, now)
    const beforeEasy = await db.questionHistory.get('M')
    expect(beforeEasy?.everWrong).toBe(true)

    await applyEasyModifier('M', prev, now) // prev = pre-correct snapshot
    const eased = await db.questionHistory.get('M')
    expect((eased?.interval ?? 0)).toBeGreaterThan(result.interval) // lengthened
    expect(eased?.everWrong).toBe(true) // NOT cleared (neurons divergence from 二階)

    await restoreDefaultSrs('M', result, now)
    expect((await db.questionHistory.get('M'))?.interval).toBe(result.interval)
  })

  it('🤔 guessed resets interval to 1', async () => {
    const now = 5_000_000
    const { prev } = await scheduleSrsForAnswer('G', '生理學', true, now)
    await applyGuessedModifier('G', prev, now)
    expect((await db.questionHistory.get('G'))?.interval).toBe(1)
  })
})

describe('questionHistory R2 adapter — SRS field cross-version tolerance', () => {
  async function adapter() {
    const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
    return NEURONS_ADAPTERS.find((a) => a.name === 'questionHistory')!
  }
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('adopts SRS fields from a v15 incoming row (first seen)', async () => {
    const a = await adapter()
    await a.apply(db, [
      { questionId: 'Q', family: '解剖學', lastResult: 'wrong', everWrong: true, lastAnsweredAt: 100, updatedAt: 100, interval: 7, easeFactor: 2.5, nextDueAt: 999, attempts: 2, correctCount: 1 },
    ])
    const row = await db.questionHistory.get('Q')
    expect(row?.interval).toBe(7)
    expect(row?.nextDueAt).toBe(999)
  })

  it('a newer pre-v15 incoming (no SRS fields) does NOT wipe local schedule', async () => {
    await db.questionHistory.put({
      questionId: 'Q', family: '解剖學', lastResult: 'wrong', everWrong: true,
      lastAnsweredAt: 100, updatedAt: 100, interval: 10, easeFactor: 2.5, nextDueAt: 555, attempts: 3, correctCount: 1,
    })
    const a = await adapter()
    await a.apply(db, [
      // v13 client: newer answer, but no SRS fields in the row JSON.
      { questionId: 'Q', family: '解剖學', lastResult: 'correct', everWrong: false, lastAnsweredAt: 300, updatedAt: 300 },
    ])
    const row = await db.questionHistory.get('Q')
    expect(row?.lastResult).toBe('correct') // incoming newer wins for LWW fields
    expect(row?.everWrong).toBe(true) // monotonic-OR
    expect(row?.interval).toBe(10) // local SRS preserved (preserve-on-omission)
    expect(row?.nextDueAt).toBe(555)
  })
})
