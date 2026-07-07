/**
 * Unit tests for the four-flag error-cause extension of question-flags
 * (add-neurons-weakness-radar-and-error-repair, tasks 4.2 + 4.4).
 *
 * Locks: (a) every setter PRESERVES the flags it does not own (toggling ✨ must
 * NOT wipe wrongAnswerMarked, etc.); (b) the R2 questionFlags adapter round-trips
 * all four booleans AND preserves a locally-set flag when an incoming row omits
 * it (preserve-on-omission), with no SCHEMA_VERSION bump.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  setEasy,
  setWrongAnswer,
  setInsight,
  toggleEasy,
  toggleWrongAnswer,
  toggleInsight,
} from '../lib/services/question-flags'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('question-flags — four-flag preservation', () => {
  it('toggling ✨ 太簡單 does NOT clear a set 👁 看錯 flag', async () => {
    await setWrongAnswer('q-1', true)
    await toggleEasy('q-1')
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(true)
    expect(row!.wrongAnswerMarked).toBe(true) // preserved
  })

  it('setting 💡 觀念洞 preserves easyMarked / guessedMarked / wrongAnswerMarked', async () => {
    await setEasy('q-1', true)
    await setWrongAnswer('q-1', true)
    await setInsight('q-1', true)
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(true)
    expect(row!.wrongAnswerMarked).toBe(true)
    expect(row!.insightMarked).toBe(true)
  })

  it('all four flags coexist and toggle independently', async () => {
    await setEasy('q-1', true)
    await setInsight('q-1', true)
    expect((await db.questionFlags.get('q-1'))!.insightMarked).toBe(true)
    const off = await toggleInsight('q-1')
    expect(off).toBe(false)
    const row = await db.questionFlags.get('q-1')
    expect(row!.insightMarked).toBe(false)
    expect(row!.easyMarked).toBe(true) // untouched
  })

  it('toggleWrongAnswer returns new state + persists without touching others', async () => {
    await setInsight('q-1', true)
    const on = await toggleWrongAnswer('q-1')
    expect(on).toBe(true)
    const row = await db.questionFlags.get('q-1')
    expect(row!.wrongAnswerMarked).toBe(true)
    expect(row!.insightMarked).toBe(true)
  })
})

describe('questionFlags R2 adapter — four-flag round-trip + preserve-on-omission', () => {
  async function getAdapter() {
    const { NEURONS_ADAPTERS } = await import('../lib/sync/tables')
    const a = NEURONS_ADAPTERS.find((x) => x.name === 'questionFlags')
    expect(a).toBeDefined()
    return a!
  }

  it('snapshot includes the two new booleans (toArray passthrough)', async () => {
    await setInsight('q-1', true)
    const a = await getAdapter()
    const snap = (await a.snapshot(db)) as Array<Record<string, unknown>>
    const r = snap.find((x) => x.questionId === 'q-1')!
    expect(r.insightMarked).toBe(true)
  })

  it('round-trips insightMarked through apply', async () => {
    const a = await getAdapter()
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: false, guessedMarked: false, insightMarked: true, wrongAnswerMarked: false, updatedAt: 500 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.insightMarked).toBe(true)
  })

  it('an incoming row that OMITS insightMarked does not clear the local value', async () => {
    // Local has insightMarked true at t=100.
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false, wrongAnswerMarked: false, insightMarked: true, updatedAt: 100,
    })
    const a = await getAdapter()
    // Newer incoming row (t=200) from an OLDER client that never knew insightMarked.
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: true, guessedMarked: false, updatedAt: 200 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(true) // newer field applied
    expect(row!.insightMarked).toBe(true) // preserve-on-omission
  })

  it('an explicitly-present false in a newer row DOES clear the flag', async () => {
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false, wrongAnswerMarked: true, insightMarked: false, updatedAt: 100,
    })
    const a = await getAdapter()
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: false, guessedMarked: false, wrongAnswerMarked: false, insightMarked: false, updatedAt: 200 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.wrongAnswerMarked).toBe(false) // explicit newer false wins
  })

  it('stale incoming row is skipped (LWW by updatedAt)', async () => {
    await db.questionFlags.put({
      questionId: 'q-1', easyMarked: false, guessedMarked: false, wrongAnswerMarked: true, insightMarked: false, updatedAt: 300,
    })
    const a = await getAdapter()
    await a.apply(db, [
      { questionId: 'q-1', easyMarked: true, guessedMarked: false, wrongAnswerMarked: false, insightMarked: false, updatedAt: 100 },
    ])
    const row = await db.questionFlags.get('q-1')
    expect(row!.wrongAnswerMarked).toBe(true) // local newer, untouched
    expect(row!.easyMarked).toBe(false)
  })
})
