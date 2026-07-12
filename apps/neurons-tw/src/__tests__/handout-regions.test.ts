/**
 * Unit coverage for the 考前講義 nav-label logic (enhance-neurons-anatomy-handout).
 *
 * stripLeadingEmoji is the risky bit — the leading-emoji regex must strip every authored region
 * heading's icon (incl. variation-selector / ZWJ tails) yet keep in-string emoji and plain text.
 * deriveToc is the pure region→label mapping. deriveRegions (DOMParser split) is DOM-dependent and
 * is exercised by the browser e2e pass instead (vitest runs under the `node` environment here).
 */
import { describe, it, expect } from 'vitest'
import { stripLeadingEmoji, deriveToc, resolveLeafToRegion, type HandoutRegion } from '../lib/handout-regions'
import type { HandoutChapterQuiz } from '@study-rpg/content-neurons-tw'

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

describe('resolveLeafToRegion', () => {
  // A region-keyed subject (組織學-style): each chapterQuiz maps to exactly ONE region.
  const regionKeyed: HandoutChapterQuiz[] = [
    { regionId: 'hdt-cell', label: '細胞', memberRegionIds: ['hdt-cell'], leafIds: ['organelles', 'membrane-transport'] },
    { regionId: 'hdt-epi', label: '上皮', memberRegionIds: ['hdt-epi'], leafIds: ['epithelium'] },
  ]
  // A chapter-keyed subject (解剖學-style): a chapter bundles >1 region; CTA anchors the LAST
  // region (`regionId`), so the deep-link target must be the HEAD (`memberRegionIds[0]`).
  const chapterKeyed: HandoutChapterQuiz[] = [
    {
      regionId: 'hdt-neuro-cortex', // chapter END (CTA)
      label: '神經解剖',
      memberRegionIds: ['hdt-neuro-tracts', 'hdt-neuro-cortex'],
      leafIds: ['ascending-tracts', 'cortex'],
    },
  ]

  it('region-keyed leaf → its single region, isChapter false', () => {
    expect(resolveLeafToRegion(regionKeyed, 'epithelium')).toEqual({ regionId: 'hdt-epi', isChapter: false })
    expect(resolveLeafToRegion(regionKeyed, 'organelles')).toEqual({ regionId: 'hdt-cell', isChapter: false })
  })

  it('chapter-keyed leaf → the chapter HEAD (memberRegionIds[0]), not the CTA regionId, isChapter true', () => {
    expect(resolveLeafToRegion(chapterKeyed, 'cortex')).toEqual({ regionId: 'hdt-neuro-tracts', isChapter: true })
    expect(resolveLeafToRegion(chapterKeyed, 'ascending-tracts')).toEqual({ regionId: 'hdt-neuro-tracts', isChapter: true })
  })

  it('unresolved leaf (no chapter owns it) → null, never a fallback', () => {
    expect(resolveLeafToRegion(regionKeyed, 'disputed-only-leaf')).toBeNull()
    expect(resolveLeafToRegion(undefined, 'anything')).toBeNull()
    expect(resolveLeafToRegion([], 'anything')).toBeNull()
  })

  it('is subject-scoped: the same leafId resolves per the passed subject\'s quizzes, not globally', () => {
    // 'membrane-transport' is a leaf shared across 生理/生化; each subject passes its OWN quizzes.
    const physiology: HandoutChapterQuiz[] = [
      { regionId: 'hdt-phys-transport', label: '運輸', memberRegionIds: ['hdt-phys-transport'], leafIds: ['membrane-transport'] },
    ]
    expect(resolveLeafToRegion(regionKeyed, 'membrane-transport')).toEqual({ regionId: 'hdt-cell', isChapter: false })
    expect(resolveLeafToRegion(physiology, 'membrane-transport')).toEqual({ regionId: 'hdt-phys-transport', isChapter: false })
  })
})
