import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { recordQuestionResult } from '../lib/services/question-history'

/**
 * Locks the monotonic-OR `everWrong` contract for both the local recording
 * path and the R2 sync adapter (spec Req "The `everWrong` flag SHALL be
 * monotonic"). DO NOT relax these to plain LWW — that is the 二階
 * wrong-answer-list race this discipline neutralizes.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('recordQuestionResult — local monotonic everWrong', () => {
  it('wrong then correct keeps everWrong true, lastResult flips to correct', async () => {
    await recordQuestionResult('Q1', '解剖學', false)
    let row = await db.questionHistory.get('Q1')
    expect(row?.everWrong).toBe(true)
    expect(row?.lastResult).toBe('wrong')

    await recordQuestionResult('Q1', '解剖學', true)
    row = await db.questionHistory.get('Q1')
    expect(row?.lastResult).toBe('correct')
    expect(row?.everWrong).toBe(true) // never cleared
  })

  it('correct-first leaves everWrong false', async () => {
    await recordQuestionResult('Q2', '生理學', true)
    const row = await db.questionHistory.get('Q2')
    expect(row?.everWrong).toBe(false)
    expect(row?.lastResult).toBe('correct')
  })
})

describe('questionHistory adapter — monotonic-OR everWrong + LWW', () => {
  async function getAdapter() {
    const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
    const a = NEURONS_ADAPTERS.find((x) => x.name === 'questionHistory')
    expect(a).toBeDefined()
    return a!
  }

  it('stale incoming correct row does NOT clear local everWrong', async () => {
    await db.questionHistory.put({
      questionId: 'Q', family: '解剖學', lastResult: 'wrong',
      everWrong: true, lastAnsweredAt: 200, updatedAt: 200,
    })
    const a = await getAdapter()
    await a.apply(db, [{
      questionId: 'Q', family: '解剖學', lastResult: 'correct',
      everWrong: false, lastAnsweredAt: 100, updatedAt: 100,
    }])
    const row = await db.questionHistory.get('Q')
    expect(row?.everWrong).toBe(true) // monotonic-OR preserved
    expect(row?.lastResult).toBe('wrong') // local newer (200 > 100)
  })

  it('newer incoming correct adopts lastResult but keeps everWrong', async () => {
    await db.questionHistory.put({
      questionId: 'Q', family: '解剖學', lastResult: 'wrong',
      everWrong: true, lastAnsweredAt: 100, updatedAt: 100,
    })
    const a = await getAdapter()
    await a.apply(db, [{
      questionId: 'Q', family: '解剖學', lastResult: 'correct',
      everWrong: false, lastAnsweredAt: 300, updatedAt: 300,
    }])
    const row = await db.questionHistory.get('Q')
    expect(row?.lastResult).toBe('correct') // incoming newer
    expect(row?.everWrong).toBe(true) // monotonic-OR
  })

  it('incoming everWrong=true unions onto a local false row', async () => {
    await db.questionHistory.put({
      questionId: 'Q', family: '解剖學', lastResult: 'correct',
      everWrong: false, lastAnsweredAt: 100, updatedAt: 100,
    })
    const a = await getAdapter()
    await a.apply(db, [{
      questionId: 'Q', family: '解剖學', lastResult: 'wrong',
      everWrong: true, lastAnsweredAt: 50, updatedAt: 50,
    }])
    const row = await db.questionHistory.get('Q')
    expect(row?.everWrong).toBe(true) // union adopts remote true
    expect(row?.lastResult).toBe('correct') // local newer (100 > 50)
  })

  it('first-seen incoming row is adopted wholesale', async () => {
    const a = await getAdapter()
    await a.apply(db, [{
      questionId: 'Qnew', family: '藥理學', lastResult: 'wrong',
      everWrong: true, lastAnsweredAt: 500, updatedAt: 500,
    }])
    const row = await db.questionHistory.get('Qnew')
    expect(row?.everWrong).toBe(true)
    expect(row?.family).toBe('藥理學')
    expect(row?.lastResult).toBe('wrong')
  })
})
