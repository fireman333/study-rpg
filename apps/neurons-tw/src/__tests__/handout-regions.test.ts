/**
 * Unit coverage for the 考前講義 nav-label logic (enhance-neurons-anatomy-handout).
 *
 * stripLeadingEmoji is the risky bit — the leading-emoji regex must strip every authored region
 * heading's icon (incl. variation-selector / ZWJ tails) yet keep in-string emoji and plain text.
 * deriveToc is the pure region→label mapping. deriveRegions (DOMParser split) is DOM-dependent and
 * is exercised by the browser e2e pass instead (vitest runs under the `node` environment here).
 */
import { describe, it, expect } from 'vitest'
import { stripLeadingEmoji, deriveToc, type HandoutRegion } from '../lib/handout-regions'

describe('stripLeadingEmoji', () => {
  it('strips the leading emoji from every authored 解剖學 region heading', () => {
    const cases: [string, string][] = [
      ['🗺️ 一週攻略地圖：解剖學怎麼唸', '一週攻略地圖：解剖學怎麼唸'],
      ['🧠 神經解剖學 ①：脊髓徑路・大腦皮質', '神經解剖學 ①：脊髓徑路・大腦皮質'],
      ['👁️ 頭頸部', '頭頸部'],
      ['🫀 胸腔：心・肺・縱膈・胸壁', '胸腔：心・肺・縱膈・胸壁'],
      ['🍽️ 腹腔：消化・血管・腹壁', '腹腔：消化・血管・腹壁'],
      ['♀️ 骨盆・會陰・生殖泌尿・脊柱', '骨盆・會陰・生殖泌尿・脊柱'],
      ['🦴 四肢與背：上肢・下肢・背與枕下', '四肢與背：上肢・下肢・背與枕下'],
    ]
    for (const [input, expected] of cases) {
      expect(stripLeadingEmoji(input)).toBe(expected)
    }
  })

  it('leaves plain-text headings untouched', () => {
    expect(stripLeadingEmoji('純文字標題')).toBe('純文字標題')
    expect(stripLeadingEmoji('神經解剖學 ①')).toBe('神經解剖學 ①') // ① is not an emoji
  })

  it('keeps emoji that appear mid-string', () => {
    expect(stripLeadingEmoji('重點 🔥 提示')).toBe('重點 🔥 提示')
  })

  it('handles empty input', () => {
    expect(stripLeadingEmoji('')).toBe('')
  })
})

describe('deriveToc', () => {
  it('maps regions to emoji-stripped nav labels, preserving ids and order', () => {
    const regions: HandoutRegion[] = [
      { id: 'hdt-neuro-central', title: '🧠 神經解剖學 ①', html: '' },
      { id: 'hdt-head-neck', title: '👁️ 頭頸部', html: '' },
      { id: 'hdt-plain', title: '純文字', html: '' },
    ]
    expect(deriveToc(regions)).toEqual([
      { id: 'hdt-neuro-central', title: '神經解剖學 ①' },
      { id: 'hdt-head-neck', title: '頭頸部' },
      { id: 'hdt-plain', title: '純文字' },
    ])
  })

  it('returns an empty list for no regions', () => {
    expect(deriveToc([])).toEqual([])
  })
})
