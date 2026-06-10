import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { isDraftFresh } from '@study-rpg/core'
import { db } from '../lib/db'
import {
  saveMockDraft,
  loadMockDraft,
  deleteMockDraft,
  type NeuronsPaperKey,
} from '../lib/services/mock-exam-draft'

/**
 * Draft service round-trip (add-neurons-exam-set-mock-mode). Verifies the neurons
 * Dexie ops + the `session → sitting` key mapping; `isDraftFresh` itself is unit-
 * tested in core, exercised here against a saved row.
 */

const KEY: NeuronsPaperKey = { year: 114, session: 1, book: '醫學一' }

beforeEach(async () => {
  await Dexie.delete('neurons-rpg')
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete('neurons-rpg')
})

describe('mock-exam draft service', () => {
  it('saves and loads a draft, hashing session → sitting', async () => {
    await saveMockDraft({
      key: KEY,
      questionIds: ['a', 'b', 'c'],
      answers: ['A', null, 'C'],
      flaggedIndexes: [2],
      index: 1,
      startedAt: 1000,
      now: 2000,
    })
    const draft = await loadMockDraft(KEY)
    expect(draft?.paperKeyHash).toBe('114-1-醫學一') // session 1 → sitting 1
    expect(draft?.sitting).toBe(1)
    expect(draft?.answers).toEqual(['A', null, 'C'])
    expect(draft?.flaggedIndexes).toEqual([2])
    expect(draft?.updatedAt).toBe(2000)
  })

  it('upserts (one draft per paper)', async () => {
    const base = { key: KEY, flaggedIndexes: [], index: 0, startedAt: 1 }
    await saveMockDraft({ ...base, questionIds: ['a'], answers: [null], now: 1 })
    await saveMockDraft({ ...base, questionIds: ['a'], answers: ['A'], now: 2 })
    expect(await db.mockExamDrafts.count()).toBe(1)
    expect((await loadMockDraft(KEY))?.answers).toEqual(['A'])
  })

  it('deletes a draft (全部送出 / 重新開始)', async () => {
    await saveMockDraft({ key: KEY, questionIds: ['a'], answers: [null], flaggedIndexes: [], index: 0, startedAt: 1, now: 1 })
    await deleteMockDraft(KEY)
    expect(await loadMockDraft(KEY)).toBeUndefined()
  })

  it('a saved draft is fresh against its pool, stale after corpus drift', async () => {
    await saveMockDraft({
      key: KEY,
      questionIds: ['a', 'b', 'c'],
      answers: [null, null, null],
      flaggedIndexes: [],
      index: 0,
      startedAt: 1,
      now: 1,
    })
    const draft = (await loadMockDraft(KEY))!
    expect(isDraftFresh(draft, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toBe(true)
    expect(isDraftFresh(draft, [{ id: 'a' }, { id: 'x' }, { id: 'c' }])).toBe(false)
  })
})
