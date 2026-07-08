/**
 * Verify dist/cram.json (add-neurons-cram-tab Phase 1).
 *
 * Checks:
 *   1. Every 押題 sourceQuestionId exists as a question `id` in dist/questions.json.
 *   2. Each of the 11 subjects has ≥1 速看 block AND ≥1 押題 item.
 *   3. HONESTY grep — the forbidden guarantee/prediction phrases must not appear in 押題 item
 *      fields (raw counts + tier) NOR in any 速看 block heading (curated labels). Block BODIES are
 *      not linted (legit medical stats like sensitivity 100% live there). This supersedes design
 *      D7's 速看-heading carve-out (fix-neurons-cram-guarantee-wording, 2026-07-06).
 *   4. Content-loss guard: per subject, the count of 速看 table/kernel blocks in cram.json equals
 *      the count of `<table class="kw|disc|num">` + `<ul class="kernel">` nodes in its fragment
 *      (catches the "second table in a block silently dropped" class of bug).
 *   5. Alias-safety guard: the 微生物學 / 免疫學 leaf sets stay disjoint AND no qid is tagged with
 *      leaves from BOTH — the precondition that makes the 微生物暨免疫學 qid-segment alias sound.
 *
 *   pnpm --filter @study-rpg/content-neurons-tw verify:cram
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { CramData } from '../src/cram/cram-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const FRAGMENTS_DIR = join(PKG, 'src', 'cram', 'fragments')

const EXPECTED_SUBJECTS = 11
// One-page 進場前一張紙 speed-review PDF (add-neurons-5min-speed-review §2). Rendered out-of-band
// by scripts/render-speed-review-pdf.mjs (headless Chrome, NOT in CI — same discipline as the
// hand-committed 醫學一/醫學二 A4 blobs). Gate the committed blob's presence + non-trivial size so a
// missing/blank render can't silently ship a 404 download.
const SPEED_REVIEW_PDF = join(PKG, 'src', 'cram', 'pdf', '考前速看-5分鐘.pdf')
const SPEED_REVIEW_PDF_MIN_BYTES = 5 * 1024
const HONESTY_FORBIDDEN = ['命中率', '保證', '必中', '100%', '今年一定考']

interface Question {
  id: string
}
interface RecurrenceConcept {
  subjectId: string
  leafId: string
}

function countFragmentNodes(html: string): { tables: number; kernels: number } {
  return {
    tables: (html.match(/<table class="(?:kw|disc|num)"/g) ?? []).length,
    kernels: (html.match(/<ul class="kernel"/g) ?? []).length,
  }
}

function main(): void {
  const cramText = readFileSync(join(PKG, 'dist', 'cram.json'), 'utf8')
  const cram = JSON.parse(cramText) as CramData
  const questions = JSON.parse(readFileSync(join(PKG, 'dist', 'questions.json'), 'utf8')) as Question[]
  const questionIds = new Set(questions.map((q) => q.id))
  const fragmentFiles = new Set(readdirSync(FRAGMENTS_DIR).filter((f) => f.endsWith('.html')))

  const failures: string[] = []

  // 1. sourceQuestionIds referential integrity.
  let checked = 0
  const missing: string[] = []
  for (const book of cram.books) {
    for (const subj of book.subjects) {
      for (const item of subj.push) {
        for (const qid of item.sourceQuestionIds) {
          checked++
          if (!questionIds.has(qid)) missing.push(qid)
        }
      }
    }
  }
  if (missing.length > 0) {
    failures.push(`${missing.length} sourceQuestionIds not found in questions.json: ${[...new Set(missing)].slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`)
  }

  // 2. Each subject has ≥1 速看 block AND ≥1 押題 item. + 4. content-loss guard.
  let subjectCount = 0
  for (const book of cram.books) {
    for (const subj of book.subjects) {
      subjectCount++
      if (subj.blocks.length < 1) failures.push(`${subj.subjectId}: 0 速看 blocks`)
      if (subj.push.length < 1) failures.push(`${subj.subjectId}: 0 押題 items`)

      const fragName = `${book.book}__${subj.subjectId}.html`
      if (fragmentFiles.has(fragName)) {
        const { tables, kernels } = countFragmentNodes(readFileSync(join(FRAGMENTS_DIR, fragName), 'utf8'))
        const jsonTables = subj.blocks.filter((b) => b.kind === 'kw' || b.kind === 'disc' || b.kind === 'num').length
        const jsonKernels = subj.blocks.filter((b) => b.kind === 'kernel').length
        if (jsonTables !== tables) failures.push(`${subj.subjectId}: table content-loss — fragment has ${tables} table nodes, cram.json has ${jsonTables} table blocks`)
        if (jsonKernels !== kernels) failures.push(`${subj.subjectId}: kernel content-loss — fragment has ${kernels} kernel nodes, cram.json has ${jsonKernels} kernel blocks`)
      }
    }
  }
  if (subjectCount !== EXPECTED_SUBJECTS) {
    failures.push(`Expected ${EXPECTED_SUBJECTS} subjects, found ${subjectCount}`)
  }

  // 3. Honesty grep — 押題 item fields AND 速看 block headings (curated labels). Block BODIES are
  //    deliberately NOT linted: legit medical stats (e.g. sensitivity 100%) live in body text;
  //    guarantee/prediction slang in a curated heading is always a violation (supersedes D7).
  const pushText = JSON.stringify(cram.books.flatMap((b) => b.subjects.flatMap((s) => s.push)))
  for (const forbidden of HONESTY_FORBIDDEN) {
    if (pushText.includes(forbidden)) {
      failures.push(`HONESTY violation: forbidden phrase "${forbidden}" present in a 押題 item`)
    }
  }
  for (const book of cram.books) {
    for (const subj of book.subjects) {
      for (const block of subj.blocks) {
        for (const forbidden of HONESTY_FORBIDDEN) {
          if (block.heading.includes(forbidden)) {
            failures.push(`HONESTY violation: forbidden phrase "${forbidden}" in 速看 heading "${block.heading}" (${subj.subjectId})`)
          }
        }
      }
    }
  }

  // 5. Alias-safety guard (micro/immuno).
  const recurrence = JSON.parse(readFileSync(join(PKG, 'dist', 'concept-recurrence.json'), 'utf8')) as {
    concepts: RecurrenceConcept[]
  }
  const tags = JSON.parse(readFileSync(join(PKG, 'dist', 'concept-tags.json'), 'utf8')) as Record<string, string[]>
  const microLeaves = new Set(recurrence.concepts.filter((c) => c.subjectId === '微生物學').map((c) => c.leafId))
  const immuLeaves = new Set(recurrence.concepts.filter((c) => c.subjectId === '免疫學').map((c) => c.leafId))
  const overlap = [...microLeaves].filter((l) => immuLeaves.has(l))
  if (overlap.length > 0) failures.push(`alias UNSAFE: 微生物學/免疫學 leaf overlap (${overlap.length}): ${overlap.slice(0, 5).join(', ')}`)
  let dualTagged = 0
  for (const qid of Object.keys(tags)) {
    const ls = tags[qid]
    if (ls.some((l) => microLeaves.has(l)) && ls.some((l) => immuLeaves.has(l))) dualTagged++
  }
  if (dualTagged > 0) failures.push(`alias UNSAFE: ${dualTagged} qid(s) tagged with BOTH 微生物學 and 免疫學 leaves`)

  // 6. 進場前一張紙 speed-review PDF present + non-trivial (committed out-of-band render).
  let speedPdfBytes = 0
  if (!existsSync(SPEED_REVIEW_PDF)) {
    failures.push(`speed-review PDF missing: ${SPEED_REVIEW_PDF} — run \`pnpm --filter @study-rpg/content-neurons-tw run render:speed-review-pdf\``)
  } else {
    speedPdfBytes = statSync(SPEED_REVIEW_PDF).size
    if (speedPdfBytes < SPEED_REVIEW_PDF_MIN_BYTES) {
      failures.push(`speed-review PDF too small (${speedPdfBytes}B < ${SPEED_REVIEW_PDF_MIN_BYTES}B) — likely a blank render`)
    }
  }

  // ── Report ──
  const totalBlocks = cram.books.reduce((n, b) => n + b.subjects.reduce((m, s) => m + s.blocks.length, 0), 0)
  const totalPush = cram.books.reduce((n, b) => n + b.subjects.reduce((m, s) => m + s.push.length, 0), 0)
  console.log('=== verify-cram ===')
  console.log(`blocks: ${totalBlocks}`)
  console.log(`押題: ${totalPush}`)
  console.log(`sourceQuestionIds checked: ${checked} (missing ${missing.length})`)
  console.log(`subjects: ${subjectCount}`)
  console.log(`alias guard: 微生物學 ${microLeaves.size} leaves / 免疫學 ${immuLeaves.size} leaves / overlap ${overlap.length} / dual-tagged qids ${dualTagged}`)
  console.log(`speed-review PDF: ${speedPdfBytes > 0 ? `${(speedPdfBytes / 1024).toFixed(1)} KB` : 'MISSING'}`)

  if (failures.length > 0) {
    console.error(`\nFAIL (${failures.length}):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nPASS')
}

main()
