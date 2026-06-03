/**
 * Unit tests for question-flags service — easyMarked / guessedMarked
 * coexistence + upsert semantics + toggle helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  setEasy,
  setGuessed,
  toggleEasy,
  toggleGuessed,
  getFlag,
} from '../lib/services/question-flags'

beforeEach(async () => {
  await db.questionFlags.clear()
})

describe('question-flags service', () => {
  it('setEasy creates row with easyMarked=true + guessedMarked=false', async () => {
    await setEasy('q-1', true)
    const row = await db.questionFlags.get('q-1')
    expect(row).toBeDefined()
    expect(row!.easyMarked).toBe(true)
    expect(row!.guessedMarked).toBe(false)
    expect(row!.updatedAt).toBeGreaterThan(0)
  })

  it('setGuessed creates row with guessedMarked=true + easyMarked=false', async () => {
    await setGuessed('q-1', true)
    const row = await db.questionFlags.get('q-1')
    expect(row!.guessedMarked).toBe(true)
    expect(row!.easyMarked).toBe(false)
  })

  it('setEasy preserves existing guessedMarked', async () => {
    await setGuessed('q-1', true)
    await setEasy('q-1', true)
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(true)
    expect(row!.guessedMarked).toBe(true)
  })

  it('toggleEasy returns new state and persists', async () => {
    const r1 = await toggleEasy('q-1')
    expect(r1).toBe(true)
    const r2 = await toggleEasy('q-1')
    expect(r2).toBe(false)
    const row = await db.questionFlags.get('q-1')
    expect(row!.easyMarked).toBe(false)
  })

  it('toggleGuessed returns new state and persists', async () => {
    const r1 = await toggleGuessed('q-1')
    expect(r1).toBe(true)
    const r2 = await toggleGuessed('q-1')
    expect(r2).toBe(false)
  })

  it('getFlag returns null for nonexistent question', async () => {
    expect(await getFlag('q-nonexistent')).toBeNull()
  })

  it('both flags can be true simultaneously', async () => {
    await setEasy('q-1', true)
    await setGuessed('q-1', true)
    const row = await getFlag('q-1')
    expect(row!.easyMarked).toBe(true)
    expect(row!.guessedMarked).toBe(true)
  })
})
