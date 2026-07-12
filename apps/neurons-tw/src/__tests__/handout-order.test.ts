/**
 * Unit coverage for the 考前講義 subject-picker ordering (reorder-handout-subjects-by-exam-paper).
 *
 * orderSubjectsByExamPaper sorts by EXAM_PAPER_ORDER (醫學一 then 醫學二), the single source of truth
 * shared with FamilyPicker / CollectionPage — NOT the build-time SUBJECT_META order. Pure, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { orderSubjectsByExamPaper } from '../lib/handout'

describe('orderSubjectsByExamPaper', () => {
  it('sorts the 11 subjects by exam-paper sequence (醫學一 block then 醫學二 block)', () => {
    // Deliberately seeded in the OLD interleaved SUBJECT_META order to prove it gets re-sorted.
    const interleaved = [
      '解剖學', '組織學', '胚胎學', '生理學', '藥理學', '病理學',
      '寄生蟲學', '微生物學', '生物化學', '公共衛生學', '免疫學',
    ].map((subjectId) => ({ subjectId }))
    expect(orderSubjectsByExamPaper(interleaved).map((s) => s.subjectId)).toEqual([
      '解剖學', '胚胎學', '組織學', '生理學', '生物化學', // 醫學一
      '微生物學', '免疫學', '寄生蟲學', '公共衛生學', '藥理學', '病理學', // 醫學二
    ])
  })

  it('appends subjects not listed in EXAM_PAPER_ORDER after the listed ones (never drops them)', () => {
    const withExtra = [{ subjectId: '未知科' }, { subjectId: '生理學' }, { subjectId: '解剖學' }]
    expect(orderSubjectsByExamPaper(withExtra).map((s) => s.subjectId)).toEqual(['解剖學', '生理學', '未知科'])
  })

  it('does not mutate the input array', () => {
    const input = [{ subjectId: '生理學' }, { subjectId: '解剖學' }]
    const before = input.map((s) => s.subjectId)
    orderSubjectsByExamPaper(input)
    expect(input.map((s) => s.subjectId)).toEqual(before)
  })
})
