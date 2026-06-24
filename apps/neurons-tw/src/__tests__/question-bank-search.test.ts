/**
 * 題庫搜尋 matching logic (neurons port of 二階's add-question-bank-search).
 *
 * Covers the pure matching helpers used by QuestionBankPage's search box:
 * haystack construction (題號 + 題幹 + 選項 + 詳解, NFKC-lowercased) and query
 * tokenization (whitespace AND, NFKC width folding). The IME/debounce/UI wiring
 * is exercised via live smoke, not here.
 */
import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import { buildHaystack, tokenizeSearchQuery } from '../routes/QuestionBankPage'

function q(overrides: Partial<Question> = {}): Question {
  return {
    id: '113-1-醫學二-藥理學-Q57',
    subject: '藥理學',
    stem: '下列何者基因突變會導致 ALS（amyotrophic lateral sclerosis）？',
    options: { A: 'SOD1', B: 'APP', C: 'LRRK2', D: 'parkin' },
    answer: 'A',
    explanation: 'SOD1 是第一個被發現與 ALS 相關的致病基因。',
    ...overrides,
  } as Question
}

const matches = (question: Question, query: string): boolean => {
  const hay = buildHaystack(question)
  return tokenizeSearchQuery(query).every((t) => hay.includes(t))
}

describe('buildHaystack', () => {
  it('includes id, stem, options and explanation, lowercased', () => {
    const hay = buildHaystack(q())
    expect(hay).toContain('113-1-醫學二-藥理學-q57') // id, lowercased
    expect(hay).toContain('als')
    expect(hay).toContain('sod1') // option text, lowercased
    expect(hay).toContain('致病基因') // explanation
  })

  it('tolerates a missing explanation', () => {
    expect(() => buildHaystack(q({ explanation: undefined }))).not.toThrow()
  })
})

describe('tokenizeSearchQuery', () => {
  it('splits on whitespace and drops empties', () => {
    expect(tokenizeSearchQuery('  心包  奇脈 ')).toEqual(['心包', '奇脈'])
    expect(tokenizeSearchQuery('')).toEqual([])
    expect(tokenizeSearchQuery('   ')).toEqual([])
  })

  it('NFKC-folds full-width Latin to half-width lowercase', () => {
    expect(tokenizeSearchQuery('ＳＯＤ１')).toEqual(['sod1'])
  })
})

describe('search matching (haystack × tokens)', () => {
  it('matches a CJK substring of the stem', () => {
    expect(matches(q(), '基因突變')).toBe(true)
  })

  it('matches an option drug name case-insensitively', () => {
    expect(matches(q(), 'sod1')).toBe(true)
    expect(matches(q(), 'PARKIN')).toBe(true)
  })

  it('matches the question id', () => {
    expect(matches(q(), 'Q57')).toBe(true)
  })

  it('AND-combines space-separated tokens (all must be present)', () => {
    expect(matches(q(), 'ALS SOD1')).toBe(true)
    expect(matches(q(), 'ALS 心肌梗塞')).toBe(false) // second token absent
  })

  it('a full-width query finds half-width content via NFKC', () => {
    expect(matches(q(), 'ＳＯＤ１')).toBe(true)
  })
})
