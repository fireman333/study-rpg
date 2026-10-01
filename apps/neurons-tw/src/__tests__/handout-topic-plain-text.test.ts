// The handout plain-text transformation (add-neurons-handout-cloze-corpus D2, tasks 1.3–1.4).
//
// ⚠️ WHAT THIS FILE CAN AND CANNOT PROVE. The synthetic cases pin DOM-`textContent` semantics
// (nested lists excluded from a bullet, cite ranges, entities, inline whitespace, untagged topics).
// The shipped-HTML case proves only SERIALIZATION STABILITY: parse → split into regions → reserialize
// → re-parse leaves every bullet's text unchanged. Both sides are parse5, so it does NOT prove
// agreement with a browser — that is `scripts/cloze-wip/parity-browser.mjs` (real Chromium).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, serializeOuter, type DefaultTreeAdapterTypes } from 'parse5'
import { describe, expect, it } from 'vitest'
import { injectLeafAnchors } from '@study-rpg/content-neurons-tw'
import {
  boldTexts,
  djb2Hex,
  extractTopics,
  removeRanges,
  sentenceHashOf,
} from '../../../../packages/content-neurons-tw/src/handout/topic-plain-text'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/content-neurons-tw')

const SYNTH = `
<section class="hdt-region" id="hdt-a">
  <h2 class="hdt-region__head">🧬 區</h2>
  <div class="hdt-topic" data-leaf-ids="leaf-one leaf-two">
    <h3>主題一</h3>
    <p class="hdt-teach">教學段落。</p>
    <ul class="hdt-must">
      <li><b>重點</b>：甲 <b>乙</b> <i>丙</i>丁。<cite>112/115</cite></li>
      <li>體型 A &lt; B &amp; C<cite>107</cite></li>
      <li>外層句子<ul><li>巢狀內容</li></ul></li>
      <li>國際註<span class="hdt-intl">（⚠️ 國際教科書：X）</span><cite>113-2</cite></li>
      <li>🧠 emoji 保留</li>
    </ul>
    <table class="hdt-tbl"><tr><td>表格</td></tr></table>
  </div>
  <div class="hdt-topic">
    <h3>未標主題</h3>
    <ul class="hdt-must"><li>未標句子</li></ul>
  </div>
</section>`

describe('extractTopics — synthetic DOM-textContent cases', () => {
  const topics = extractTopics(SYNTH, '測試科')
  const [t0, t1] = topics
  const bullet = (s: string) => t0.bullets.find((b) => b.text.includes(s))!

  it('finds every topic in document order, with leafIds and anchorId', () => {
    expect(topics.map((t) => t.ordinal)).toEqual([0, 1])
    expect(t0.leafIds).toEqual(['leaf-one', 'leaf-two'])
    expect(t0.anchorId).toBe('測試科::leaf-one')
  })

  it('an untagged topic has no anchor but still yields bullets', () => {
    expect(t1.leafIds).toEqual([])
    expect(t1.anchorId).toBeNull()
    expect(t1.bullets.map((b) => b.text)).toEqual(['未標句子'])
  })

  it('bullets are only the direct li of ul.hdt-must; nested-list text is excluded from its bullet', () => {
    expect(t0.bullets.map((b) => b.text)).toEqual([
      '重點：甲 乙 丙丁。112/115',
      '體型 A < B & C107',
      '外層句子',
      '國際註（⚠️ 國際教科書：X）113-2',
      '🧠 emoji 保留',
    ])
    // …but the nested text is still part of the topic's textContent, right after its parent bullet.
    const outer = bullet('外層句子')
    expect(t0.text.slice(outer.end, outer.end + 4)).toBe('巢狀內容')
  })

  it('topic text is textContent: heading, teaching paragraph and table included; markup dropped', () => {
    expect(t0.text).toContain('主題一')
    expect(t0.text).toContain('教學段落。')
    expect(t0.text).toContain('表格')
    expect(t0.text).not.toContain('<b>')
    for (const b of t0.bullets) expect(t0.text.slice(b.start, b.end)).toBe(b.text)
  })

  it('keeps whitespace between inline elements exactly', () => {
    expect(bullet('重點').text.startsWith('重點：甲 乙 丙丁。')).toBe(true)
  })

  it('decodes character entities (&lt; → <, &amp; → &)', () => {
    expect(bullet('體型').text).toBe('體型 A < B & C107')
    expect(bullet('體型').raw).toContain('&lt;')
  })

  it('records cite ranges bullet-locally, one per cite element', () => {
    const b = bullet('重點')
    expect(b.citeRanges.map((r) => b.text.slice(r.start, r.end))).toEqual(['112/115'])
    const d = bullet('國際註')
    expect(d.citeRanges.map((r) => d.text.slice(r.start, r.end))).toEqual(['113-2'])
    expect(bullet('外層句子').citeRanges).toEqual([])
  })

  it('flags hdt-intl notes and ⚠️', () => {
    const d = bullet('國際註')
    expect(d.hasIntlNote).toBe(true)
    expect(d.hasWarning).toBe(true)
    expect(bullet('重點').hasIntlNote).toBe(false)
    expect(bullet('重點').hasWarning).toBe(false)
  })

  it('keeps emoji as text', () => {
    expect(bullet('emoji').text).toBe('🧠 emoji 保留')
  })

  it('reports a leading <b> label and whether only a colon follows it', () => {
    const lb = bullet('重點').leadingBold!
    expect(lb.text).toBe('重點')
    expect(lb.followedByColon).toBe(true)
    expect(t0.text.slice(lb.start, lb.end)).toBe('重點')
    expect(bullet('體型').leadingBold).toBeNull()
  })

  it('raw is the li source HTML up to its first nested list', () => {
    expect(bullet('外層句子').raw).toBe('<li>外層句子')
    expect(bullet('重點').raw).toBe('<li><b>重點</b>：甲 <b>乙</b> <i>丙</i>丁。<cite>112/115</cite></li>')
  })

  it('boldTexts reads displayed <b> text from raw', () => {
    expect(boldTexts(bullet('重點').raw)).toEqual(['重點', '乙'])
  })

  it('sentenceHash drops cite text: adding a sitting does not change it', () => {
    const b = bullet('重點')
    expect(removeRanges(b.text, b.citeRanges)).toBe('重點：甲 乙 丙丁。')
    expect(sentenceHashOf(b.text, b.citeRanges)).toBe(djb2Hex('重點：甲 乙 丙丁。'))
    const more = extractTopics(SYNTH.replace('<cite>112/115</cite>', '<cite>112/115/116</cite>'), '測試科')[0]
    const b2 = more.bullets[0]
    expect(b2.text).not.toBe(b.text)
    expect(sentenceHashOf(b2.text, b2.citeRanges)).toBe(sentenceHashOf(b.text, b.citeRanges))
  })

  it('refuses text after a nested list (non-contiguous bullet) loudly', () => {
    expect(() => extractTopics('<div class="hdt-topic"><ul class="hdt-must"><li>a<ul><li>b</li></ul>c</li></ul></div>', 'x')).toThrow(
      /text after its nested list/,
    )
  })

  it('djb2Hex matches the 2nd algorithm (fixed vectors)', () => {
    expect(djb2Hex('')).toBe('00001505')
    expect(djb2Hex('a')).toBe('0002b606')
  })
})

// ─── shipped html: serialization stability (task 1.4) ───────────────────────

type El = DefaultTreeAdapterTypes.Element
function* elements(node: DefaultTreeAdapterTypes.ParentNode): Generator<El> {
  for (const c of node.childNodes) {
    if (!('tagName' in c)) continue
    yield c
    yield* elements(c)
  }
}
const hasClass = (el: El, c: string) => (el.attrs.find((a) => a.name === 'class')?.value ?? '').split(/\s+/).includes(c)

/** The shipped html exactly as build-handout.ts produces it: raw fragment → leaf-anchor gate. */
function shippedHtml(subjectId: string): string {
  const raw = readFileSync(resolve(PKG, `src/handout/${subjectId}.html`), 'utf8').trim()
  const config = JSON.parse(readFileSync(resolve(PKG, `${subjectId}.config.json`), 'utf8')) as { leafIds: string[] }[]
  return injectLeafAnchors(subjectId, raw, new Set(config.flatMap((r) => r.leafIds))).html
}

describe.each(['胚胎學', '寄生蟲學'])('%s shipped html — region split + reserialize keeps every bullet', (subjectId) => {
  const html = shippedHtml(subjectId)
  const whole = extractTopics(html, subjectId)

  it('has the pilot topic/bullet counts', () => {
    const counts = { 胚胎學: [12, 12, 124], 寄生蟲學: [23, 21, 166] } as Record<string, number[]>
    expect([whole.length, whole.filter((t) => t.anchorId).length, whole.flatMap((t) => t.bullets).length]).toEqual(counts[subjectId])
  })

  it('bullet text is unchanged after the reader-style region split and re-parse', () => {
    // Mirror `deriveRegions`: parse the document, take each `.hdt-region`'s outerHTML, and parse again.
    const regions = [...elements(parse(html))].filter((e) => hasClass(e, 'hdt-region')).map((e) => serializeOuter(e))
    expect(regions.length).toBeGreaterThan(0)
    const reparsed = regions.flatMap((r) => extractTopics(r, subjectId))
    const texts = (ts: typeof whole) => ts.map((t) => [t.anchorId, t.bullets.map((b) => b.text)])
    expect(texts(reparsed)).toEqual(texts(whole))
    const hashes = (ts: typeof whole) => ts.flatMap((t) => t.bullets.map((b) => sentenceHashOf(b.text, b.citeRanges)))
    expect(hashes(reparsed)).toEqual(hashes(whole))
  })
})
