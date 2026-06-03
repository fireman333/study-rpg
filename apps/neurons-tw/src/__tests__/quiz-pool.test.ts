import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import { filterPoolByFamily } from '../lib/services/quiz-pool'

/**
 * Spec Req (neurons-mode → "Overview SHALL surface a family subject picker ..."):
 * filter returns subset when familyId given; unrestricted when null/undefined.
 */

function makeQuestion(id: string, subject: string): Question {
  return {
    id,
    subject,
    stem: `stem ${id}`,
    options: { A: 'opt A', B: 'opt B', C: 'opt C', D: 'opt D' },
    answer: 'A',
    explanation: '',
  }
}

describe('filterPoolByFamily', () => {
  const pool: Question[] = [
    makeQuestion('q1', '藥理學'),
    makeQuestion('q2', '藥理學'),
    makeQuestion('q3', '生理學'),
    makeQuestion('q4', '病理學'),
    makeQuestion('q5', '藥理學'),
  ]

  it('restricts to matching family when familyId is given', () => {
    const filtered = filterPoolByFamily(pool, '藥理學')
    expect(filtered.length).toBe(3)
    expect(filtered.every((q) => q.subject === '藥理學')).toBe(true)
  })

  it('returns unrestricted pool when familyId is null', () => {
    const filtered = filterPoolByFamily(pool, null)
    expect(filtered.length).toBe(pool.length)
    expect(filtered).toEqual(pool)
  })

  it('returns unrestricted pool when familyId is undefined', () => {
    const filtered = filterPoolByFamily(pool, undefined)
    expect(filtered.length).toBe(pool.length)
  })

  it('returns empty array when familyId matches no questions', () => {
    const filtered = filterPoolByFamily(pool, 'nonexistent-family')
    expect(filtered.length).toBe(0)
  })

  it('does not mutate input pool', () => {
    const originalLength = pool.length
    filterPoolByFamily(pool, '藥理學')
    expect(pool.length).toBe(originalLength)
  })

  it('returns a new array (caller can mutate without affecting source)', () => {
    const filtered = filterPoolByFamily(pool, null)
    expect(filtered).not.toBe(pool)
    filtered.push(makeQuestion('extra', 'x'))
    expect(pool.length).toBe(5)
  })
})
