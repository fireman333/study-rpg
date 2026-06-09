import { describe, it, expect } from 'vitest'
import type { Question } from '../../types'
import { isContinuationQuestion, resolvePrecedingChain } from '../continuation'

function mkQ(id: string, stem: string, extra: Partial<Question> = {}): Question {
  return {
    id,
    subject: '內科',
    stem,
    options: { A: '', B: '', C: '', D: '' },
    answer: 'A',
    explanation: '',
    meta: { year: 106 },
    ...extra,
  }
}

function corpus(...qs: Question[]): ReadonlyMap<string, Question> {
  return new Map(qs.map((q) => [q.id, q]))
}

const P = '106-1-醫學三-內科'

describe('isContinuationQuestion', () => {
  it('detects stem starting with 承上題', () => {
    expect(isContinuationQuestion(mkQ(`${P}-Q65`, '承上題，下列何者最為適當？'))).toBe(true)
  })

  it('ordinary stem is not a continuation', () => {
    expect(isContinuationQuestion(mkQ(`${P}-Q64`, '一名 70 歲男性因發燒就診…'))).toBe(false)
  })

  it('does not throw on empty / whitespace stem', () => {
    expect(isContinuationQuestion(mkQ(`${P}-Q1`, ''))).toBe(false)
    expect(isContinuationQuestion(mkQ(`${P}-Q1`, '   '))).toBe(false)
  })
})

describe('resolvePrecedingChain', () => {
  it('returns [] for a non-continuation question', () => {
    const root = mkQ(`${P}-Q64`, '情境根題')
    expect(resolvePrecedingChain(root, corpus(root))).toEqual([])
  })

  it('resolves a single preceding scenario question', () => {
    const root = mkQ(`${P}-Q64`, '一名男性…（情境）')
    const cont = mkQ(`${P}-Q65`, '承上題，下列何者最為適當？')
    const chain = resolvePrecedingChain(cont, corpus(root, cont))
    expect(chain.map((q) => q.id)).toEqual([`${P}-Q64`])
  })

  it('walks a chained continuation back to the root, ordered root-first', () => {
    const root = mkQ(`${P}-Q63`, '一名男性…（情境根）')
    const c1 = mkQ(`${P}-Q64`, '承上題，第一追問？')
    const c2 = mkQ(`${P}-Q65`, '承上題，第二追問？')
    const chain = resolvePrecedingChain(c2, corpus(root, c1, c2))
    expect(chain.map((q) => q.id)).toEqual([`${P}-Q63`, `${P}-Q64`])
  })

  it('stops best-effort when a predecessor is missing from the pool', () => {
    // Q64 is absent; walking back from Q65 finds nothing → empty chain.
    const cont = mkQ(`${P}-Q65`, '承上題，下列何者最為適當？')
    expect(resolvePrecedingChain(cont, corpus(cont))).toEqual([])
  })

  it('does not cross into another paper', () => {
    // A Q1 continuation cannot reach Q0; a same-number question in another
    // paper has a different prefix and is never looked up.
    const otherPaper = mkQ('106-2-醫學三-內科-Q80', '別卷題目')
    const cont = mkQ(`${P}-Q1`, '承上題，理論上不該有前文')
    expect(resolvePrecedingChain(cont, corpus(otherPaper, cont))).toEqual([])
  })

  it('returns [] for an unparseable id', () => {
    const weird = mkQ('not-an-id', '承上題，無法解析')
    expect(resolvePrecedingChain(weird, corpus(weird))).toEqual([])
  })
})
