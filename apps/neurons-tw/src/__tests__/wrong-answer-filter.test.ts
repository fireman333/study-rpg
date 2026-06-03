import { describe, it, expect } from 'vitest'
import {
  parseExamYear,
  matchesWrongAnswerFilter,
  type WrongAnswerFilterState,
} from '../lib/wrong-answer-filter'

describe('parseExamYear', () => {
  it('extracts 民國 year from the id prefix', () => {
    expect(parseExamYear('106-1-醫學一-解剖學-Q1')).toBe('106')
    expect(parseExamYear('108-2-醫學二-生理學-Q14')).toBe('108')
  })
  it('falls back to "unknown" for a non-numeric prefix', () => {
    expect(parseExamYear('mock-paper-Q1')).toBe('unknown')
    expect(parseExamYear('')).toBe('unknown')
  })
})

const empty: WrongAnswerFilterState = {
  excludedFamilies: new Set(),
  excludedYears: new Set(),
  easyOnly: false,
  guessedOnly: false,
}

describe('matchesWrongAnswerFilter', () => {
  const item = { family: '解剖學', questionId: '106-1-醫學一-解剖學-Q1' }

  it('passes everything with an empty filter', () => {
    expect(matchesWrongAnswerFilter(item, empty, undefined)).toBe(true)
  })

  it('excludes by family', () => {
    expect(
      matchesWrongAnswerFilter(item, { ...empty, excludedFamilies: new Set(['解剖學']) }, undefined),
    ).toBe(false)
  })

  it('excludes by year', () => {
    expect(
      matchesWrongAnswerFilter(item, { ...empty, excludedYears: new Set(['106']) }, undefined),
    ).toBe(false)
    expect(
      matchesWrongAnswerFilter(item, { ...empty, excludedYears: new Set(['108']) }, undefined),
    ).toBe(true)
  })

  it('easyOnly requires the easy flag', () => {
    expect(matchesWrongAnswerFilter(item, { ...empty, easyOnly: true }, undefined)).toBe(false)
    expect(
      matchesWrongAnswerFilter(item, { ...empty, easyOnly: true }, { easyMarked: true, guessedMarked: false }),
    ).toBe(true)
  })

  it('guessedOnly requires the guessed flag', () => {
    expect(matchesWrongAnswerFilter(item, { ...empty, guessedOnly: true }, undefined)).toBe(false)
    expect(
      matchesWrongAnswerFilter(item, { ...empty, guessedOnly: true }, { easyMarked: false, guessedMarked: true }),
    ).toBe(true)
  })

  it('combines family + year + flag', () => {
    const f: WrongAnswerFilterState = {
      excludedFamilies: new Set(['生理學']),
      excludedYears: new Set(['107']),
      easyOnly: true,
      guessedOnly: false,
    }
    expect(matchesWrongAnswerFilter(item, f, { easyMarked: true, guessedMarked: false })).toBe(true)
  })
})
