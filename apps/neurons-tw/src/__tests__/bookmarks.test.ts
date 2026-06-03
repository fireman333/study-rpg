/**
 * Unit tests for bookmarks service — addBookmark / removeBookmark /
 * toggleBookmark / isBookmarked behavior + tombstone semantics.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  addBookmark,
  removeBookmark,
  toggleBookmark,
  isBookmarked,
} from '../lib/services/bookmarks'

const fakeQuestion = (id: string, subject = '藥理學') => ({
  id,
  subject,
  stem: 'test stem',
  options: { A: 'opt A', B: 'opt B', C: 'opt C', D: 'opt D' },
  answer: 'A',
})

beforeEach(async () => {
  await db.questionBookmarks.clear()
  await db.questionBookmarkTombstones.clear()
})

describe('bookmarks service', () => {
  it('addBookmark writes a row with addedAt + updatedAt', async () => {
    await addBookmark('q-1', '藥理學')
    const row = await db.questionBookmarks.get('q-1')
    expect(row).toBeDefined()
    expect(row!.questionId).toBe('q-1')
    expect(row!.family).toBe('藥理學')
    expect(row!.addedAt).toBeGreaterThan(0)
    expect(row!.updatedAt).toBeGreaterThan(0)
  })

  it('addBookmark is idempotent — re-add preserves original addedAt', async () => {
    await addBookmark('q-1', '藥理學')
    const first = await db.questionBookmarks.get('q-1')
    await new Promise((r) => setTimeout(r, 10))
    await addBookmark('q-1', '藥理學')
    const second = await db.questionBookmarks.get('q-1')
    expect(second!.addedAt).toBe(first!.addedAt)
  })

  it('removeBookmark deletes the row AND writes a tombstone', async () => {
    await addBookmark('q-1', '藥理學')
    await removeBookmark('q-1')
    const row = await db.questionBookmarks.get('q-1')
    expect(row).toBeUndefined()
    const tomb = await db.questionBookmarkTombstones.get('q-1')
    expect(tomb).toBeDefined()
    expect(tomb!.updatedAt).toBeGreaterThan(0)
  })

  it('toggleBookmark off→on returns true; on→off returns false', async () => {
    const q = fakeQuestion('q-1')
    const result1 = await toggleBookmark(q as never)
    expect(result1).toBe(true)
    const result2 = await toggleBookmark(q as never)
    expect(result2).toBe(false)
  })

  it('isBookmarked reflects current state', async () => {
    expect(await isBookmarked('q-1')).toBe(false)
    await addBookmark('q-1', '藥理學')
    expect(await isBookmarked('q-1')).toBe(true)
    await removeBookmark('q-1')
    expect(await isBookmarked('q-1')).toBe(false)
  })

  it('re-add after remove clears stale tombstone', async () => {
    await addBookmark('q-1', '藥理學')
    await removeBookmark('q-1')
    expect(await db.questionBookmarkTombstones.get('q-1')).toBeDefined()
    await addBookmark('q-1', '藥理學')
    expect(await db.questionBookmarkTombstones.get('q-1')).toBeUndefined()
    expect(await isBookmarked('q-1')).toBe(true)
  })
})
