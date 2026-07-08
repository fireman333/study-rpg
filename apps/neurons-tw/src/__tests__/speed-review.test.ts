import { describe, it, expect } from 'vitest'
import type { CramData, CramBlock } from '@study-rpg/content-neurons-tw'
import type { FamilyMasteryRow } from '../lib/db'
import {
  buildSpeedReviewCards,
  SPEED_REVIEW_MAX_PER_FAMILY,
} from '../lib/speed-review'

function kernel(n: number): CramBlock {
  return {
    kind: 'kernel',
    heading: '高頻考古',
    items: Array.from({ length: n }, (_, i) => ({ html: `<b>fact ${i}</b>`, cite: '反覆考' })),
  }
}

function cram(
  subjects: { subjectId: string; book: '醫學一' | '醫學二'; blocks: CramBlock[] }[],
): CramData {
  const books: CramData['books'] = []
  for (const s of subjects) {
    let bk = books.find((b) => b.book === s.book)
    if (!bk) {
      bk = { book: s.book, subjects: [] }
      books.push(bk)
    }
    bk.subjects.push({ subjectId: s.subjectId, book: s.book, name: s.subjectId, blocks: s.blocks, push: [] })
  }
  return { version: 1, statUpTo: '115-1', builtAt: 'test', books }
}

const m = (familyId: string, correct: number, total: number): FamilyMasteryRow => ({ familyId, correct, total })

describe('buildSpeedReviewCards', () => {
  it('caps each family at 5 essence lines', () => {
    const cards = buildSpeedReviewCards(cram([{ subjectId: '藥理學', book: '醫學二', blocks: [kernel(8)] }]), [])
    expect(cards[0].items).toHaveLength(SPEED_REVIEW_MAX_PER_FAMILY)
  })

  it('orders diagnosed families weakest-first', () => {
    const data = cram([
      { subjectId: '藥理學', book: '醫學二', blocks: [kernel(3)] }, // strong
      { subjectId: '病理學', book: '醫學二', blocks: [kernel(3)] }, // weak
    ])
    const cards = buildSpeedReviewCards(data, [m('藥理學', 9, 10), m('病理學', 3, 10)])
    expect(cards.map((c) => c.familyId)).toEqual(['病理學', '藥理學'])
  })

  it('flags a diagnosed low-accuracy family and not a strong one', () => {
    const data = cram([
      { subjectId: '藥理學', book: '醫學二', blocks: [kernel(2)] },
      { subjectId: '病理學', book: '醫學二', blocks: [kernel(2)] },
    ])
    const cards = buildSpeedReviewCards(data, [m('藥理學', 9, 10), m('病理學', 3, 10)])
    const byId = Object.fromEntries(cards.map((c) => [c.familyId, c]))
    expect(byId['病理學'].weak).toBe(true)
    expect(byId['藥理學'].weak).toBe(false)
  })

  it('does not flag or float undiagnosed families (too few attempts)', () => {
    const data = cram([
      { subjectId: '病理學', book: '醫學二', blocks: [kernel(2)] }, // diagnosed weak
      { subjectId: '微生物學', book: '醫學二', blocks: [kernel(2)] }, // undiagnosed (2 attempts)
    ])
    const cards = buildSpeedReviewCards(data, [m('病理學', 3, 10), m('微生物學', 0, 2)])
    const byId = Object.fromEntries(cards.map((c) => [c.familyId, c]))
    expect(byId['微生物學'].weak).toBe(false) // absence of data ≠ weakness
    // diagnosed-weak (score 0.3) sorts before undiagnosed (score 0.99)
    expect(cards[0].familyId).toBe('病理學')
  })

  it('omits families with no kernel block', () => {
    const data = cram([
      { subjectId: '藥理學', book: '醫學二', blocks: [kernel(3)] },
      { subjectId: '病理學', book: '醫學二', blocks: [{ kind: 'kw', heading: 'x', rows: [] }] }, // no kernel
    ])
    const cards = buildSpeedReviewCards(data, [])
    expect(cards.map((c) => c.familyId)).toEqual(['藥理學'])
  })

  it('resolves a real per-family accent color', () => {
    const cards = buildSpeedReviewCards(cram([{ subjectId: '藥理學', book: '醫學二', blocks: [kernel(1)] }]), [])
    expect(cards[0].color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
