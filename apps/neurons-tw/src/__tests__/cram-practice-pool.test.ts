import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import { orderPracticePool } from '../lib/cram-practice-pool'

const q = (id: string): Question =>
  ({ id, subject: 's', stem: '', options: [], answer: 0, explanation: '' }) as unknown as Question

const ids = (pool: Question[]): string[] => pool.map((x) => x.id)

describe('orderPracticePool', () => {
  const pool = [q('a'), q('b'), q('c'), q('d'), q('e')]

  it('moves snapshot ids ahead of all non-snapshot ids', () => {
    const snapshot = new Set(['c', 'e'])
    const ordered = ids(orderPracticePool(pool, snapshot))
    const firstNonSnapshotIdx = ordered.findIndex((id) => !snapshot.has(id))
    const lastSnapshotIdx = ordered.reduce((acc, id, i) => (snapshot.has(id) ? i : acc), -1)
    // every snapshot id precedes every non-snapshot id
    expect(lastSnapshotIdx).toBeLessThan(firstNonSnapshotIdx)
    // exactly the snapshot ids are at the front
    expect(new Set(ordered.slice(0, 2))).toEqual(snapshot)
  })

  it('never drops or injects questions (same multiset)', () => {
    const ordered = ids(orderPracticePool(pool, new Set(['c'])))
    expect([...ordered].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('null snapshot = plain shuffle passthrough (same multiset, no prioritization)', () => {
    const ordered = ids(orderPracticePool(pool, null))
    expect([...ordered].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('empty snapshot behaves like null (no prioritization, contents preserved)', () => {
    const ordered = ids(orderPracticePool(pool, new Set<string>()))
    expect([...ordered].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('snapshot ids not present in the pool are simply ignored', () => {
    const ordered = ids(orderPracticePool(pool, new Set(['zzz'])))
    expect([...ordered].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
