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
  selectedFamilies: new Set(),
  selectedYears: new Set(),
  easyOnly: false,
  guessedOnly: false,
}

describe('matchesWrongAnswerFilter', () => {
  const item = { family: '解剖學', questionId: '106-1-醫學一-解剖學-Q1' }

  it('passes everything with an empty filter (全部)', () => {
    expect(matchesWrongAnswerFilter(item, empty, undefined)).toBe(true)
  })

  it('includes only selected families', () => {
    expect(
      matchesWrongAnswerFilter(item, { ...empty, selectedFamilies: new Set(['解剖學']) }, undefined),
    ).toBe(true)
    expect(
      matchesWrongAnswerFilter(item, { ...empty, selectedFamilies: new Set(['生理學']) }, undefined),
    ).toBe(false)
  })

  it('includes only selected years', () => {
    expect(
      matchesWrongAnswerFilter(item, { ...empty, selectedYears: new Set(['106']) }, undefined),
    ).toBe(true)
    expect(
      matchesWrongAnswerFilter(item, { ...empty, selectedYears: new Set(['108']) }, undefined),
    ).toBe(false)
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
      selectedFamilies: new Set(['解剖學']),
      selectedYears: new Set(['106']),
      easyOnly: true,
      guessedOnly: false,
    }
    expect(matchesWrongAnswerFilter(item, f, { easyMarked: true, guessedMarked: false })).toBe(true)
    // Same item but selecting a different family → excluded.
    expect(
      matchesWrongAnswerFilter(item, { ...f, selectedFamilies: new Set(['生理學']) }, { easyMarked: true, guessedMarked: false }),
    ).toBe(false)
  })
})
