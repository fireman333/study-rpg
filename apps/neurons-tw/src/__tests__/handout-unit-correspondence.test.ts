/**
 * Unit coverage for the 講義↔救急↔猜題 unit-correspondence engine
 * (add-neurons-handout-unit-correspondence).
 *
 *   1. resolveLeafTarget — the (subject, leaf) cascade: primary anchor → region fallback → unavailable,
 *      including subject-scoping (a leafId shared across subjects resolves per the PASSED subject's
 *      quizzes, never globally) and the cross-subject-leak escape hatch (war-map leaf with no region
 *      → unavailable, never region 0 / crash).
 *   2. injectLeafAnchors — the build leaf-anchor gate: loud-fail on unknown token / duplicate primary,
 *      multi-value pass-through, stable id injection, and coverage counting (untagged leaf ≠ fail).
 *
 * vitest runs under the `node` env (no DOMParser), so the DOM anchor lookup is injected as a stub —
 * `findLeafAnchorId` itself (DOM-dependent) is exercised by the browser e2e pass.
 */
import { describe, it, expect } from 'vitest'
import { resolveLeafTarget, findLeafAnchorId } from '../lib/handout-regions'
import type { HandoutChapterQuiz } from '@study-rpg/content-neurons-tw'
import { injectLeafAnchors } from '@study-rpg/content-neurons-tw'

// A region-keyed subject (生理學-style): each chapterQuiz maps to exactly ONE region.
const physiology: HandoutChapterQuiz[] = [
  { regionId: 'hdt-cell-membrane', label: '細胞', memberRegionIds: ['hdt-cell-membrane'], leafIds: ['membrane-transport-mechanisms', 'cell-organelle-function-and-apoptosis'] },
  { regionId: 'hdt-reproductive', label: '生殖', memberRegionIds: ['hdt-reproductive'], leafIds: ['menstrual-cycle-and-menopause-physiology'] },
]
// A chapter-keyed subject (解剖學-style): a chapter bundles >1 region; the deep-link HEAD is memberRegionIds[0].
const anatomy: HandoutChapterQuiz[] = [
  { regionId: 'hdt-neuro-brainstem', label: '神經解剖', memberRegionIds: ['hdt-neuro-central', 'hdt-neuro-brainstem'], leafIds: ['spinal-cord-tracts'] },
]

describe('resolveLeafTarget — (subject, leaf) cascade', () => {
  it('leaf with a primary topic anchor → anchor (scroll target = the topic id)', () => {
    const found = (leaf: string) => (leaf === 'membrane-transport-mechanisms' ? 'hdt-topic-membrane-transport-mechanisms' : null)
    expect(resolveLeafTarget('membrane-transport-mechanisms', physiology, found)).toEqual({
      kind: 'anchor',
      anchorId: 'hdt-topic-membrane-transport-mechanisms',
    })
  })

  it('leaf with NO anchor but a region → region fallback (not a wrong topic)', () => {
    // No topic carries this leaf as an anchor (stub returns null) but it maps to a region.
    expect(resolveLeafTarget('cell-organelle-function-and-apoptosis', physiology, () => null)).toEqual({
      kind: 'region',
      regionId: 'hdt-cell-membrane',
      isChapter: false,
    })
  })

  it('chapter-keyed leaf with no anchor → region HEAD (memberRegionIds[0]), isChapter true', () => {
    expect(resolveLeafTarget('spinal-cord-tracts', anatomy, () => null)).toEqual({
      kind: 'region',
      regionId: 'hdt-neuro-central', // chapter HEAD, NOT the CTA regionId hdt-neuro-brainstem
      isChapter: true,
    })
  })

  it('leaf with no anchor and no region → unavailable (never region 0 / crash)', () => {
    expect(resolveLeafTarget('pharmacology-only-leaf', physiology, () => null)).toEqual({ kind: 'unavailable' })
    expect(resolveLeafTarget('anything', undefined, () => null)).toEqual({ kind: 'unavailable' })
    expect(resolveLeafTarget('anything', [], () => null)).toEqual({ kind: 'unavailable' })
  })

  it('escape-hatch regression: a war-map leaf that maps to no region in this subject → unavailable', () => {
    // e.g. 藥理 10 / 公衛 8 / 生化 7 cross-subject-leak leaves surfaced on a rescue 戰情圖 but absent
    // from THIS subject's regions. Must NOT fall back to region 0, must NOT throw.
    const res = resolveLeafTarget('cross-subject-leak-leaf', physiology, () => null)
    expect(res.kind).toBe('unavailable')
    expect(res).not.toHaveProperty('regionId')
  })

  it('is subject-scoped: the SAME leafId resolves per the passed subject, never a global map', () => {
    // 'shared-leaf' lives in different regions in two subjects; each call passes its OWN quizzes.
    const subjA: HandoutChapterQuiz[] = [{ regionId: 'hdt-a', label: 'A', memberRegionIds: ['hdt-a'], leafIds: ['shared-leaf'] }]
    const subjB: HandoutChapterQuiz[] = [{ regionId: 'hdt-b', label: 'B', memberRegionIds: ['hdt-b'], leafIds: ['shared-leaf'] }]
    expect(resolveLeafTarget('shared-leaf', subjA, () => null)).toEqual({ kind: 'region', regionId: 'hdt-a', isChapter: false })
    expect(resolveLeafTarget('shared-leaf', subjB, () => null)).toEqual({ kind: 'region', regionId: 'hdt-b', isChapter: false })
  })

  it('findLeafAnchorId is null-safe with no DOM (node env)', () => {
    expect(findLeafAnchorId('anything')).toBeNull()
    expect(findLeafAnchorId('')).toBeNull()
  })

  it('findLeafAnchorId queries the PASSED root, never a global document (subject-scoped)', () => {
    // Each "subject container" only exposes its own topics. The fn MUST honor the passed root so a
    // residual other-subject topic in the global DOM can never cross-resolve (leafId not unique).
    const makeRoot = (present: string) =>
      ({
        querySelector: (sel: string) =>
          sel.includes(present) ? ({ id: `hdt-topic-${present}` } as unknown as HTMLElement) : null,
      }) as unknown as ParentNode
    expect(findLeafAnchorId('leaf-x', makeRoot('leaf-x'))).toBe('hdt-topic-leaf-x')
    // leaf-x absent from subject B's container → null (scoped), even if some global DOM had it.
    expect(findLeafAnchorId('leaf-x', makeRoot('leaf-y'))).toBeNull()
  })
})

describe('injectLeafAnchors — build leaf-anchor gate', () => {
  const canonical = new Set(['leaf1', 'leaf2', 'leaf3', 'leaf4'])
  const goodHtml = [
    '<section class="hdt-region" id="hdt-overview"><p class="hdt-intro">攻略地圖（no topics）</p></section>',
    '<section class="hdt-region" id="hdt-a">',
    '  <div class="hdt-topic" data-leaf-ids="leaf1"><h3>T1</h3></div>',
    '  <div class="hdt-topic" data-leaf-ids="leaf2 leaf3"><h3>T2 (compressed)</h3></div>',
    '  <div class="hdt-topic"><h3>T3 (split sibling — untagged)</h3></div>',
    '</section>',
  ].join('\n')

  it('injects a stable id per tagged topic, passes data-leaf-ids through, leaves untagged topics alone', () => {
    const r = injectLeafAnchors('TestSubj', goodHtml, canonical)
    expect(r.html).toContain('<div class="hdt-topic" data-leaf-ids="leaf1" id="hdt-topic-leaf1">')
    expect(r.html).toContain('<div class="hdt-topic" data-leaf-ids="leaf2 leaf3" id="hdt-topic-leaf2">')
    // The untagged split-sibling topic gets NO id (graceful degradation → region resolution).
    expect(r.html).toContain('<div class="hdt-topic"><h3>T3 (split sibling — untagged)</h3></div>')
  })

  it('reports coverage as anchored / total (an unanchored leaf is NOT a failure)', () => {
    const r = injectLeafAnchors('TestSubj', goodHtml, canonical)
    expect(new Set(r.anchoredLeaves)).toEqual(new Set(['leaf1', 'leaf2', 'leaf3']))
    expect(r.totalLeaves).toBe(4) // leaf4 has no anchor → coverage 3/4, but the build does NOT fail
  })

  it('loud-fails on an unknown data-leaf-ids token (rename / typo drift)', () => {
    const bad = '<div class="hdt-topic" data-leaf-ids="bogus-leaf"><h3>X</h3></div>'
    expect(() => injectLeafAnchors('TestSubj', bad, canonical)).toThrow(/not a canonical leaf/)
    expect(() => injectLeafAnchors('TestSubj', bad, canonical)).toThrow(/bogus-leaf/)
  })

  it('loud-fails when one canonical leaf is declared primary by >1 topic', () => {
    const dup = [
      '<div class="hdt-topic" data-leaf-ids="leaf1"><h3>A</h3></div>',
      '<div class="hdt-topic" data-leaf-ids="leaf1 leaf2"><h3>B</h3></div>',
    ].join('\n')
    expect(() => injectLeafAnchors('TestSubj', dup, canonical)).toThrow(/declared primary by >1 topic/)
    expect(() => injectLeafAnchors('TestSubj', dup, canonical)).toThrow(/leaf1/)
  })
})
