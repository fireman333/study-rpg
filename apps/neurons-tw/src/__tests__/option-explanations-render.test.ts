import { describe, expect, it } from 'vitest'
import { buildOptionRows } from '../components/Explanation'

const base = {
  options: { A: 'a', B: 'b', C: 'c', D: 'd' },
  answer: 'C',
}

describe('buildOptionRows (per-option 簡答)', () => {
  it('returns null when there is no 簡答', () => {
    expect(buildOptionRows({ ...base })).toBeNull()
    expect(buildOptionRows({ ...base, optionExplanations: {} })).toBeNull()
  })

  it('renders one row per option in option order, only keys with a 簡答', () => {
    const rows = buildOptionRows({
      ...base,
      optionExplanations: { A: 'why A', B: 'why B', C: 'why C', D: 'why D' },
    })
    expect(rows?.map((r) => r.key)).toEqual(['A', 'B', 'C', 'D'])
    expect(rows?.map((r) => r.text)).toEqual(['why A', 'why B', 'why C', 'why D'])
  })

  it('marks only the correct option (answer)', () => {
    const rows = buildOptionRows({
      ...base,
      optionExplanations: { A: 'x', B: 'x', C: 'x', D: 'x' },
    })
    expect(rows?.filter((r) => r.isCorrect).map((r) => r.key)).toEqual(['C'])
  })

  it('marks every accepted answer for a multi-answer question', () => {
    const rows = buildOptionRows({
      ...base,
      answer: 'A',
      acceptedAnswers: ['A', 'C'],
      optionExplanations: { A: 'x', B: 'x', C: 'x', D: 'x' },
    })
    expect(rows?.filter((r) => r.isCorrect).map((r) => r.key).sort()).toEqual(['A', 'C'])
  })

  it('marks every option for a 送分 (disputed) question', () => {
    const rows = buildOptionRows({
      ...base,
      disputed: true,
      optionExplanations: { A: 'x', B: 'x', C: 'x', D: 'x' },
    })
    expect(rows?.every((r) => r.isCorrect)).toBe(true)
  })

  it('skips option keys that have no 簡答 entry', () => {
    const rows = buildOptionRows({
      ...base,
      optionExplanations: { A: 'x', C: 'x' },
    })
    expect(rows?.map((r) => r.key)).toEqual(['A', 'C'])
  })
})
