/**
 * The plain text a 考前講義 topic SHOWS in the reader — one transformation, shared by the build
 * (cloze-card anchoring, add-neurons-handout-cloze-corpus D2) and, later, the app.
 *
 * WHY A SPEC PARSER AND NOT A REGEX. A cloze mask is anchored by searching for its verbatim text;
 * the only text worth searching is what the reader actually displays, because that is what a
 * future highlight layer will put a DOM Range on. The reader renders the shipped handout HTML with
 * `DOMParser` + `dangerouslySetInnerHTML`, so the displayed text of an element is its DOM
 * `textContent`: entities decoded, `<cite>` years included, emoji kept as text (neurons does no
 * emoji→sprite swap in handout prose), markup dropped. `parse5` implements the HTML standard's
 * tree construction — the same rules a browser applies — so tokenisation quirks (a bare `<30` is
 * text, `&lt;` decodes, implied end tags) come out the way the reader sees them. Equivalence with
 * a real browser is PROVEN outside vitest by `scripts/cloze-wip/parity-browser.mjs`.
 *
 * Unit of anchoring = the BULLET, not the topic: the reader injects a `.hdt-cram-link` button at the
 * end of each topic after render, so a live topic's `textContent` differs from the build's `text`.
 * Bullets (`li`) are untouched by that injection.
 *
 * ⚠️ Node-free by construction (no `node:` import): an app change will import this module.
 * It is deliberately NOT re-exported from the package's `src/index.ts` yet (no app consumer).
 */
import { parse, parseFragment, type DefaultTreeAdapterTypes } from 'parse5'

type Node = DefaultTreeAdapterTypes.Node
type Element = DefaultTreeAdapterTypes.Element
type ParentNode = DefaultTreeAdapterTypes.ParentNode

// ─── public shape ────────────────────────────────────────────────────────────

/** A text range. In `TopicBullet.citeRanges` it is local to the bullet's `text`. */
export interface TextRange {
  start: number
  end: number
}

export interface TopicBulletLabel {
  /** The leading `<b>` element's text, as displayed. */
  text: string
  /** Range in the TOPIC's `text` (same coordinates as `TopicBullet.start/end`). */
  start: number
  end: number
  /** The label is followed only by a colon (`：` / `:`) — i.e. it is the bullet's sub-heading. */
  followedByColon: boolean
}

export interface TopicBullet {
  /** Range of this `li`'s OWN text (nested lists excluded) in the topic's `text`. */
  start: number
  end: number
  /** `text.slice(start, end)` of the topic — the li's `textContent` minus nested lists. */
  text: string
  /** The li's source HTML, up to its first nested list (entities NOT decoded). */
  raw: string
  /** The li contains an element with class `hdt-intl` (⚠️ 國際教科書 note). */
  hasIntlNote: boolean
  /** The li's own text or source contains ⚠ (with or without the variation selector). */
  hasWarning: boolean
  /** The li's first non-blank child is a `<b>` element; `null` otherwise. */
  leadingBold: TopicBulletLabel | null
  /** Ranges of `<cite>` text within `text` (bullet-local), in document order. */
  citeRanges: TextRange[]
}

export interface TopicPlainText {
  /** 0-based document-order ordinal among every `.hdt-topic` of the fragment (tagged or not). */
  ordinal: number
  /** The topic's `data-leaf-ids` tokens, in order; `[]` when untagged. */
  leafIds: string[]
  /** `<subjectId>::<leafIds[0]>`, or `null` for an untagged topic (which may hold no cards). */
  anchorId: string | null
  /** The topic's full `textContent` (heading, teaching paragraphs, tables and bullets). */
  text: string
  /** Every `li` that is a direct child of a `ul.hdt-must` in this topic, in document order. */
  bullets: TopicBullet[]
}

// ─── hash ────────────────────────────────────────────────────────────────────

/**
 * djb2 → 8-char hex. The same algorithm and output format as study-rpg-2nd's `djb2Hex`
 * (`keypoint-plain-text.ts`). Not `node:crypto`: this module is node-free.
 */
export function djb2Hex(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** `text` with the given (non-overlapping or overlapping) ranges removed. */
export function removeRanges(text: string, ranges: readonly TextRange[]): string {
  let out = ''
  let at = 0
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.start > at) out += text.slice(at, r.start)
    at = Math.max(at, r.end)
  }
  return out + text.slice(at)
}

/**
 * The card's `sentenceHash`: djb2 of the bullet text with its `<cite>` years removed, so a new
 * sitting added to a bullet's cite (Layer-3 ingest does this every sitting) keeps the hash.
 */
export function sentenceHashOf(bulletText: string, citeRanges: readonly TextRange[]): string {
  return djb2Hex(removeRanges(bulletText, citeRanges))
}

// ─── tree helpers ────────────────────────────────────────────────────────────

const isElement = (n: Node): n is Element => 'tagName' in n

function classList(el: Element): string[] {
  const c = el.attrs.find((a) => a.name === 'class')?.value ?? ''
  return c.split(/\s+/).filter(Boolean)
}

const hasClass = (el: Element, cls: string): boolean => classList(el).includes(cls)
const attr = (el: Element, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value

const isList = (el: Element): boolean => el.tagName === 'ul' || el.tagName === 'ol'

/** DOM `textContent`: every Text node's data, in tree order. (A `<template>`'s content is not a child.) */
function textContent(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterTypes.TextNode).value
  if (!('childNodes' in node)) return ''
  return (node as ParentNode).childNodes.map(textContent).join('')
}

function* descendants(node: ParentNode): Generator<Element> {
  for (const c of node.childNodes) {
    if (!isElement(c)) continue
    yield c
    yield* descendants(c)
  }
}

// ─── the transformation ─────────────────────────────────────────────────────

/**
 * Walks one topic subtree once, appending every Text node to `text` exactly as `textContent`
 * would, and recording the ranges that belong to bullets and cites as it goes.
 */
class TopicWalker {
  text = ''
  bullets: TopicBullet[] = []
  constructor(
    private readonly src: string,
    private readonly subjectLabel: string,
  ) {}

  walk(node: Node): void {
    if (node.nodeName === '#text') {
      this.text += (node as DefaultTreeAdapterTypes.TextNode).value
      return
    }
    if (!isElement(node)) return
    if (node.tagName === 'ul' && hasClass(node, 'hdt-must')) {
      for (const child of node.childNodes) {
        if (isElement(child) && child.tagName === 'li') this.bullet(child)
        else this.walk(child)
      }
      return
    }
    for (const c of node.childNodes) this.walk(c)
  }

  private bullet(li: Element): void {
    const start = this.text.length
    const citeRanges: TextRange[] = []
    let ownEnd: number | null = null
    let nestedAt: number | null = null

    // Own text = everything before the first nested list. Text AFTER a nested list would make the
    // bullet's own text non-contiguous in the topic text (and in the DOM); no handout uses that
    // shape, so refuse it loudly rather than anchor into a guess.
    const visit = (n: Node, inCite: boolean): void => {
      if (n.nodeName === '#text') {
        const v = (n as DefaultTreeAdapterTypes.TextNode).value
        if (ownEnd !== null && v.length > 0) {
          throw new Error(
            `topic-plain-text: ${this.subjectLabel} li at offset ${li.sourceCodeLocation?.startOffset ?? '?'} has text after its nested list — unsupported shape`,
          )
        }
        this.text += v
        return
      }
      if (!isElement(n)) return
      if (isList(n) && ownEnd === null) {
        ownEnd = this.text.length
        nestedAt = n.sourceCodeLocation?.startOffset ?? null
        // Nested list text still belongs to the topic text (textContent), just not to this bullet.
        this.walk(n)
        return
      }
      if (isList(n)) {
        this.walk(n)
        return
      }
      if (n.tagName === 'cite' && !inCite) {
        // One range per OUTERMOST cite element, so a year token is never split across ranges.
        const s = this.text.length
        for (const c of n.childNodes) visit(c, true)
        if (this.text.length > s) citeRanges.push({ start: s - start, end: this.text.length - start })
        return
      }
      for (const c of n.childNodes) visit(c, inCite)
    }
    for (const c of li.childNodes) visit(c, false)

    const end = ownEnd ?? this.text.length
    const text = this.text.slice(start, end)
    const loc = li.sourceCodeLocation
    const rawEnd = nestedAt ?? loc?.endOffset
    const raw = loc && rawEnd !== undefined ? this.src.slice(loc.startOffset, rawEnd) : ''
    if (!raw) throw new Error(`topic-plain-text: ${this.subjectLabel} li has no source location`)

    // Nested-list descendants do not count towards the bullet's own intl note.
    const ownDescendants = (function* own(p: ParentNode): Generator<Element> {
      for (const c of p.childNodes) {
        if (!isElement(c) || isList(c)) continue
        yield c
        yield* own(c)
      }
    })(li)
    const hasIntlNote = [...ownDescendants].some((e) => hasClass(e, 'hdt-intl'))

    let leadingBold: TopicBulletLabel | null = null
    const first = li.childNodes.find((c) => !(c.nodeName === '#text' && /^\s*$/.test((c as DefaultTreeAdapterTypes.TextNode).value)))
    if (first && isElement(first) && first.tagName === 'b') {
      const lead = li.childNodes.indexOf(first)
      const before = li.childNodes.slice(0, lead).map(textContent).join('')
      const labelText = textContent(first)
      const ls = start + before.length
      leadingBold = {
        text: labelText,
        start: ls,
        end: ls + labelText.length,
        followedByColon: /^\s*[：:]/.test(text.slice(before.length + labelText.length)),
      }
    }

    this.bullets.push({
      start,
      end,
      text,
      raw,
      hasIntlNote,
      hasWarning: text.includes('⚠') || raw.includes('⚠') || /&#(?:x26a0|9888);/i.test(raw),
      leadingBold,
      citeRanges,
    })
  }
}

/**
 * Every `.hdt-topic` of a subject's SHIPPED handout HTML (i.e. after `injectLeafAnchors`), as the
 * reader displays it. `subjectId` is needed only to form `anchorId`.
 *
 * Parsed as a full document, exactly like the reader's `DOMParser.parseFromString(html, 'text/html')`.
 */
export function extractTopics(html: string, subjectId: string): TopicPlainText[] {
  const doc = parse(html, { sourceCodeLocationInfo: true })
  const out: TopicPlainText[] = []
  for (const el of descendants(doc)) {
    if (!hasClass(el, 'hdt-topic')) continue
    // A topic nested inside another topic would double-count text; none exists — refuse loudly.
    if (isInsideTopic(el)) {
      throw new Error(`topic-plain-text: ${subjectId} has a .hdt-topic nested inside another — unsupported shape`)
    }
    const leafIds = (attr(el, 'data-leaf-ids') ?? '').trim().split(/\s+/).filter(Boolean)
    const walker = new TopicWalker(html, subjectId)
    for (const c of el.childNodes) walker.walk(c)
    out.push({
      ordinal: out.length,
      leafIds,
      anchorId: leafIds.length > 0 ? `${subjectId}::${leafIds[0]}` : null,
      text: walker.text,
      // Document order (a bullet of a nested `ul.hdt-must` would otherwise precede its parent).
      bullets: walker.bullets.sort((a, b) => a.start - b.start),
    })
  }
  return out
}

function isInsideTopic(el: Element): boolean {
  for (let p = el.parentNode; p && isElement(p as Node); p = (p as Element).parentNode) {
    if (hasClass(p as Element, 'hdt-topic')) return true
  }
  return false
}

/**
 * The displayed text of every `<b>` in a bullet's `raw` source — the "bold subjects" the numeric
 * contradiction report compares. Parsed with the same parser, so entities decode as displayed.
 */
export function boldTexts(raw: string): string[] {
  const frag = parseFragment(raw)
  const out: string[] = []
  for (const el of descendants(frag)) if (el.tagName === 'b') out.push(textContent(el))
  return out
}
