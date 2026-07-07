import { describe, it, expect } from 'vitest'
import { reclassifiedFamily } from '../lib/question-family'

/**
 * annotate-reclassified-question-family — reclassifiedFamily() surfaces the actual
 * science family only when the id-embedded 考選部 subject genuinely differs from it,
 * excluding the expected 微生物暨免疫學 → 微生物學 / 免疫學 split, and never throwing on
 * malformed ids.
 */
describe('reclassifiedFamily', () => {
  it('returns null when the id subject matches the family (no annotation)', () => {
    expect(reclassifiedFamily('114-2-醫學二-免疫學-Q26', '免疫學')).toBeNull()
    expect(reclassifiedFamily('104-1-醫學一-解剖學-Q5', '解剖學')).toBeNull()
  })

  it('does not annotate the expected 微生物暨免疫學 → 微生物學 / 免疫學 split', () => {
    expect(reclassifiedFamily('114-1-醫學二-微生物暨免疫學-Q10', '微生物學')).toBeNull()
    expect(reclassifiedFamily('114-1-醫學二-微生物暨免疫學-Q11', '免疫學')).toBeNull()
  })

  it('annotates 微生物暨免疫學 → 寄生蟲學 (genuine reclassification)', () => {
    expect(reclassifiedFamily('114-1-醫學二-微生物暨免疫學-Q31', '寄生蟲學')).toBe('寄生蟲學')
  })

  it('annotates 公共衛生學 → 免疫學 (genuine reclassification)', () => {
    expect(reclassifiedFamily('114-2-醫學二-公共衛生學-Q26', '免疫學')).toBe('免疫學')
  })

  it('never throws on malformed ids and returns null', () => {
    expect(reclassifiedFamily('', '免疫學')).toBeNull()
    expect(reclassifiedFamily('114-2-醫學二', '免疫學')).toBeNull()
    expect(reclassifiedFamily('no-hyphen-subject', '免疫學')).toBeNull()
    // 4 segments only → parts[3] exists but length < 5 guard still yields null
    expect(reclassifiedFamily('114-2-醫學二-公共衛生學', '免疫學')).toBeNull()
  })
})
