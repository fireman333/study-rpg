/**
 * Build dist/cram.json for the cram tab (add-neurons-cram-tab Phase 1).
 *
 * Deterministic parse + join — NO LLM/fan-out:
 *   1. Parse 11 速看 HTML fragments (src/cram/fragments/*.html) → per-subject CramBlock[].
 *   2. Assemble 押題 from dist/concept-recurrence.json (eligible concepts, breadth-sorted)
 *      + dist/concept-tags.json (sourceQuestionIds, recent-first, capped 12).
 *   3. Emit dist/cram.json = CramData.
 *   4. Copy the two 考前速看 PDFs from iCloud into apps/neurons-tw/public/cram/ (best-effort).
 *
 * HONESTY: 押題 items carry ONLY raw counts + tier (no normalized/hit-rate fields).
 *
 *   pnpm --filter @study-rpg/content-neurons-tw build:cram
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { CramBlock, CramPushItem, CramSubject, CramBook, CramData } from '../src/cram/cram-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const FRAGMENTS_DIR = join(PKG, 'src', 'cram', 'fragments')

const SOURCE_QID_CAP = 12

// Book/subject display order (spec-fixed).
const BOOK_ORDER: { book: '醫學一' | '醫學二'; subjects: string[] }[] = [
  { book: '醫學一', subjects: ['解剖學', '生理學', '生物化學', '組織學', '胚胎學'] },
  { book: '醫學二', subjects: ['病理學', '藥理學', '微生物學', '免疫學', '寄生蟲學', '公共衛生學'] },
]

/**
 * Corpus qid subject-segment aliasing.
 * concept-recurrence separates 微生物學 / 免疫學, but the corpus qids (concept-tags keys AND
 * questions.json ids) merge both into a single `微生物暨免疫學` segment. The 微生物學 / 免疫學
 * leafId sets are fully disjoint (verified: 0 overlap), so mapping this combined segment to
 * BOTH honors the spec's subject-match intent (prevent cross-subject leaf contamination)
 * without dropping every 微生物學 / 免疫學 push item's sourceQuestionIds. All other subjects
 * match their qid segment exactly.
 */
const QID_SEGMENT_ALIASES: Record<string, string[]> = {
  微生物暨免疫學: ['微生物學', '免疫學'],
}

// ── Input JSON shapes ──────────────────────────────────────────────────────
interface RecurrenceConcept {
  subjectId: string
  leafId: string
  zh: string
  tier: string
  breadth: number
  questionCount: number
  recencyWeightedBreadth: number
  eligible: boolean
}
interface Recurrence {
  meta: { sittingsTotal: number; sittings: string[] }
  concepts: RecurrenceConcept[]
}
type ConceptTags = Record<string, string[]>

// Honesty invariant: neither 押題 items nor 速看 study-section headings may use guarantee/
// prediction slang. 押題 items carry raw counts + tier only; 速看 headings are curated labels.
// The former `必中考古` heading was renamed `高頻考古` (frequency-based — matches the /cram
// disclaimer 頻率高 ≠ 今年一定考), superseding design D7's 速看-heading carve-out, per the honesty
// spec ban on 保證/必中/100%/今年一定考 (fix-neurons-cram-guarantee-wording, 2026-07-06).
// verify-cram lints both surfaces (押題 fields + 速看 headings).

// ── HTML helpers (dependency-free) ─────────────────────────────────────────

/** Sanitize inline HTML: keep only <b>/</b>, strip every other tag, decode entities, trim. */
function sanitizeInline(raw: string): string {
  return decodeEntities(
    raw
      // protect <b>/</b> with sentinels, drop all other tags, restore
      .replace(/<b>/gi, 'B')
      .replace(/<\/b>/gi, '/B')
      .replace(/<[^>]*>/g, '')
      .replace(/B/g, '<b>')
      .replace(/\/B/g, '</b>'),
  ).trim()
}

/** Strip ALL tags → plain text (for cells/labels where <b> is not preserved). */
function stripAll(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]*>/g, '')).trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** Extract the 中文 heading from an <h3> (drop leading emoji + surrounding whitespace). */
function parseHeading(h3Inner: string): string {
  const text = stripAll(h3Inner)
  // Emoji/pictographs live at the very start; drop leading non-CJK/non-word symbols + spaces.
  return text.replace(/^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/u, '').trim()
}

/** Return the inner content of each <tag ...>...</tag>, case-insensitive, non-greedy. */
function matchAll(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(m[1])
  return out
}

/** Inner content of every `<tag class="cls" ...>...</tag>` (case-insensitive, non-greedy). */
function matchAllClass(html: string, tag: string, cls: string): string[] {
  const re = new RegExp(`<${tag}\\s+class="${cls}"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(m[1])
  return out
}

/** Parse a <tr>'s cells with colspan awareness: a td[colspan=N] contributes N column slots
 *  (the cell content followed by N-1 empty cells) so downstream column alignment holds. */
function parseCells(tr: string, sanitize: (s: string) => string): string[] {
  const re = /<td(\s[^>]*)?>([\s\S]*?)<\/td>/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(tr)) !== null) {
    const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(m[1] ?? '')?.[1] ?? '1') || 1
    out.push(sanitize(m[2]))
    for (let i = 1; i < span; i++) out.push('')
  }
  return out
}

interface ParseResult {
  blocks: CramBlock[]
  imported: number
  skipped: number
  skippedHeadings: string[]
}

/**
 * Parse one fragment file's HTML into CramBlock[]. A single `<div class="block">` may contain
 * MULTIPLE content nodes (e.g. two `<table class="disc">` under one `<h3>`) — emit one block per
 * node so no content is silently dropped (Codex review 2026-07-06). Multiple `<div class="skel">`
 * nodes join into ONE skeleton block, matching the source's single 骨架 section.
 */
function parseFragment(html: string): ParseResult {
  const blocks: CramBlock[] = []
  const skippedHeadings: string[] = []
  let imported = 0
  let skipped = 0

  // Segment on the block marker (matchAllClass('div','skel') handles the nested skel divs).
  const segments = html.split('<div class="block">').slice(1)

  for (const seg of segments) {
    const h3 = /<h3>([\s\S]*?)<\/h3>/i.exec(seg)
    const heading = h3 ? parseHeading(h3[1]) : ''
    let found = 0

    // kernel <ul> — one block per ul
    for (const ulInner of matchAllClass(seg, 'ul', 'kernel')) {
      const items = matchAll(ulInner, 'li').map((li) => {
        const citeM = /<cite>([\s\S]*?)<\/cite>/i.exec(li)
        const cite = citeM ? stripAll(citeM[1]) : undefined
        const withoutCite = li.replace(/<cite>[\s\S]*?<\/cite>/gi, '')
        const item: { html: string; cite?: string } = { html: sanitizeInline(withoutCite) }
        if (cite) item.cite = cite
        return item
      })
      blocks.push({ kind: 'kernel', heading, items })
      imported++; found++
    }
    // kw tables — one block per table
    for (const t of matchAllClass(seg, 'table', 'kw')) {
      const rows = matchAll(t, 'tr').map((tr) => {
        const tds = matchAll(tr, 'td')
        return { k: stripAll(tds[0] ?? ''), v: sanitizeInline(tds[1] ?? '') }
      })
      blocks.push({ kind: 'kw', heading, rows })
      imported++; found++
    }
    // disc tables — one block per table (colspan-aware)
    for (const t of matchAllClass(seg, 'table', 'disc')) {
      const theadM = /<thead>([\s\S]*?)<\/thead>/i.exec(t)
      const cols = theadM ? matchAll(theadM[1], 'th').map((th) => sanitizeInline(th)) : []
      const tbodyM = /<tbody>([\s\S]*?)<\/tbody>/i.exec(t)
      const bodyRows = tbodyM ? matchAll(tbodyM[1], 'tr') : []
      const rows = bodyRows.map((tr) => parseCells(tr, sanitizeInline))
      blocks.push({ kind: 'disc', heading, cols, rows })
      imported++; found++
    }
    // num tables — one block per table
    for (const t of matchAllClass(seg, 'table', 'num')) {
      const rows = matchAll(t, 'tr').map((tr) => {
        const tds = matchAll(tr, 'td')
        return { label: stripAll(tds[0] ?? ''), value: sanitizeInline(tds[1] ?? '') }
      })
      blocks.push({ kind: 'num', heading, rows })
      imported++; found++
    }
    // skeleton <div class="skel"> — join all into one block
    const skels = matchAllClass(seg, 'div', 'skel')
    if (skels.length > 0) {
      blocks.push({ kind: 'skeleton', heading, html: skels.map((s) => sanitizeInline(s)).join('\n') })
      imported++; found++
    }

    if (found === 0) {
      // No recognized content node → count + log, don't silently drop.
      skipped++
      skippedHeadings.push(heading || '(no heading)')
    }
  }

  return { blocks, imported, skipped, skippedHeadings }
}

// ── 押題 assembly ───────────────────────────────────────────────────────────

/** Parse `<year>-<session>` recency key from a qid prefix (higher = newer). */
function recencyKey(qid: string): number {
  const p = qid.split('-')
  const year = Number(p[0]) || 0
  const session = Number(p[1]) || 0
  return year * 10 + session
}

function buildPushForSubject(
  subjectId: string,
  concepts: RecurrenceConcept[],
  tags: ConceptTags,
  sittingsTotal: number,
): { push: CramPushItem[]; imported: number } {
  const eligible = concepts
    .filter((c) => c.subjectId === subjectId && c.eligible === true)
    .sort((a, b) => b.breadth - a.breadth || b.recencyWeightedBreadth - a.recencyWeightedBreadth)

  const push: CramPushItem[] = eligible.map((c) => {
    // sourceQuestionIds: qids tagged with this leaf whose subject-segment matches subjectId
    // (with 微生物暨免疫學 alias), sorted recent-first, capped at 12.
    const qids: string[] = []
    for (const qid of Object.keys(tags)) {
      if (!tags[qid].includes(c.leafId)) continue
      const seg = qid.split('-')[3]
      const segMatches = seg === subjectId || (QID_SEGMENT_ALIASES[seg]?.includes(subjectId) ?? false)
      if (segMatches) qids.push(qid)
    }
    qids.sort((a, b) => recencyKey(b) - recencyKey(a) || (a < b ? -1 : a > b ? 1 : 0))
    const sourceQuestionIds = qids.slice(0, SOURCE_QID_CAP)

    return {
      subjectId: c.subjectId,
      leafId: c.leafId,
      zh: c.zh,
      tier: c.tier,
      sittingBreadth: c.breadth,
      sittingsTotal,
      questionCount: c.questionCount,
      sourceQuestionIds,
    }
  })

  return { push, imported: push.length }
}

// The 考前速看 A4 PDFs are committed content-pack source at src/cram/pdf/ and served by the
// app's copy-content.mjs (→ public/content/neurons-tw/cram-pdf/). NOT copied from iCloud here:
// that path is unavailable in CI, which would 404 the prod download.

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const recurrence = JSON.parse(
    readFileSync(join(PKG, 'dist', 'concept-recurrence.json'), 'utf8'),
  ) as Recurrence
  const tags = JSON.parse(readFileSync(join(PKG, 'dist', 'concept-tags.json'), 'utf8')) as ConceptTags
  const sittingsTotal = recurrence.meta.sittingsTotal
  // The 「統計至 N」 stamp is the last ingested sitting, read from the corpus rather than pinned —
  // a stale literal here tells the player the 考古 ranking covers less than it does.
  const statUpTo = recurrence.meta.sittings[recurrence.meta.sittings.length - 1]
  if (!statUpTo) throw new Error('concept-recurrence.json has no sittings — cannot stamp cram.json')

  let totalBlocks = 0
  let totalBlocksSkipped = 0
  let totalPush = 0
  const totalConcepts = recurrence.concepts.length
  const kindCounts: Record<string, number> = { kernel: 0, kw: 0, disc: 0, num: 0, skeleton: 0 }
  const anomalies: string[] = []

  const fragmentFiles = new Set(readdirSync(FRAGMENTS_DIR).filter((f) => f.endsWith('.html')))

  const books: CramBook[] = BOOK_ORDER.map(({ book, subjects }) => {
    const cramSubjects: CramSubject[] = subjects.map((subjectId) => {
      // Parse 速看 fragment.
      const fragName = `${book}__${subjectId}.html`
      let blocks: CramBlock[] = []
      if (fragmentFiles.has(fragName)) {
        const parsed = parseFragment(readFileSync(join(FRAGMENTS_DIR, fragName), 'utf8'))
        blocks = parsed.blocks
        totalBlocks += parsed.imported
        totalBlocksSkipped += parsed.skipped
        for (const b of blocks) kindCounts[b.kind]++
        if (parsed.skipped > 0) {
          anomalies.push(`${fragName}: ${parsed.skipped} block(s) skipped (unknown kind): ${parsed.skippedHeadings.join(', ')}`)
        }
      } else {
        anomalies.push(`Fragment file missing: ${fragName}`)
      }

      // Assemble 押題.
      const { push, imported } = buildPushForSubject(subjectId, recurrence.concepts, tags, sittingsTotal)
      totalPush += imported
      if (push.length === 0) anomalies.push(`${subjectId}: 0 押題 items`)

      return { subjectId, book, name: subjectId, blocks, push }
    })
    return { book, subjects: cramSubjects }
  })

  const data: CramData = {
    version: 1,
    statUpTo,
    sittingsTotal,
    builtAt: new Date().toISOString(),
    books,
  }

  const outPath = join(PKG, 'dist', 'cram.json')
  writeFileSync(outPath, JSON.stringify(data))

  // ── Summary (No Silent Errors) ──
  const subjectCount = books.reduce((n, b) => n + b.subjects.length, 0)
  console.log('\n=== build-cram summary ===')
  console.log(`速看 blocks:  imported ${totalBlocks} / skipped ${totalBlocksSkipped} / total ${totalBlocks + totalBlocksSkipped}`)
  console.log(`  by kind: kernel ${kindCounts.kernel}, kw ${kindCounts.kw}, disc ${kindCounts.disc}, num ${kindCounts.num}, skeleton ${kindCounts.skeleton}`)
  console.log(`押題 items:  imported ${totalPush} / skipped(ineligible) ${totalConcepts - totalPush} / total ${totalConcepts}`)
  console.log(`subjects: ${subjectCount} (books: ${books.length})`)
  if (anomalies.length) {
    console.log(`\nAnomalies (${anomalies.length}):`)
    for (const a of anomalies) console.log(`  - ${a}`)
  } else {
    console.log('\nNo anomalies.')
  }
  console.log(`\n→ ${outPath}`)
}

main()
