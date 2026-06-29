/**
 * Backfill prep for the 80 questions left without a per-option 簡答
 * (backfill-neurons-simplified-explanations, tasks 1.2). Reads the committed
 * manual-review sidecar + the two question→page maps + the reconciled corpus,
 * recomputes the 3 generation queues by ISSUE TYPE (not the handoff estimate),
 * and writes per-question input files + a manifest into a working dir.
 *
 *   compress  = deterministic-fail whose ONLY issues are length (shorten in place)
 *   pdf       = needs regen AND has a PDF page map (Sonnet vision over the page)
 *   fallback  = needs regen with NO page map (Sonnet text strong-regen)
 *
 * "needs regen" = qa-major-fail, or a deterministic-fail with a structural issue
 * (empty option / markup / key parity / missing answer) — those can't be fixed by
 * shortening, so they are routed to the richest available source.
 *
 *   tsx scripts/option-explanations/backfill-prep.ts <workDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, type QuestionForValidation } from './validate'

const PROVENANCE = resolve(import.meta.dirname, '..', '..', 'provenance')
const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')

type CorpusQ = HashableQuestion & { id: string; subject: string; meta?: { qNumber?: number } }
type ManualEntry = {
  reason: string
  detIssues?: string[]
  optionExplanations?: Record<string, string>
}
type PageMap = Record<string, { file: string; page: number }>

type Queue = 'compress' | 'pdf' | 'fallback'
interface ManifestItem {
  qid: string
  queue: Queue
  subject: string
  qNumber: number
  sourceHash: string
  reason: string
  issueKind: 'length-only' | 'structural' | 'qa-major'
  file?: string
  page?: number
  png?: string
}

function qNumberOf(qid: string): number {
  const m = qid.match(/-Q(\d+)$/)
  return m ? Number(m[1]) : NaN
}

function main(): void {
  const workDir = process.argv[2]
  if (!workDir) throw new Error('usage: backfill-prep.ts <workDir>')
  const inputsDir = resolve(workDir, 'inputs')
  const pagesDir = resolve(workDir, 'pdf-pages')
  mkdirSync(inputsDir, { recursive: true })
  mkdirSync(pagesDir, { recursive: true })

  const manualReview: Record<string, ManualEntry> = JSON.parse(
    readFileSync(resolve(PROVENANCE, 'option-explanations.manual-review.json'), 'utf-8'),
  )
  const pmMain: PageMap = JSON.parse(readFileSync(resolve(PROVENANCE, 'question-page-map.json'), 'utf-8'))
  const pmRes: PageMap = JSON.parse(readFileSync(resolve(PROVENANCE, 'question-page-map-residual.json'), 'utf-8'))
  const corpus: CorpusQ[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const byId = new Map(corpus.map((q) => [q.id, q]))

  const mapOf = (qid: string) => pmMain[qid] ?? pmRes[qid] ?? null

  const manifest: ManifestItem[] = []
  const counts = { compress: 0, pdf: 0, fallback: 0, missing: 0 }

  for (const [qid, entry] of Object.entries(manualReview)) {
    const q = byId.get(qid)
    if (!q) {
      counts.missing += 1
      console.error(`  ! ${qid}: no matching question in reconciled corpus — skipping`)
      continue
    }
    const qv: QuestionForValidation = {
      id: qid,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      acceptedAnswers: q.acceptedAnswers,
      disputed: q.disputed,
      explanation: q.explanation,
    }
    const hash = sourceHash(qv)

    // Decide issue kind. det entries: recompute live against the prior 簡答 so the
    // length-only vs structural call is from the canonical validator, not stored text.
    let issueKind: ManifestItem['issueKind']
    if (entry.reason === 'deterministic-fail') {
      const res = validateEntry(
        { sourceHash: hash, optionExplanations: entry.optionExplanations ?? {} },
        qv,
        hash,
      )
      const lengthOnly = res.issues.length > 0 && res.issues.every((i) => /length \d+ outside/.test(i))
      issueKind = lengthOnly ? 'length-only' : 'structural'
    } else {
      issueKind = 'qa-major'
    }

    const pageMap = mapOf(qid)
    let queue: Queue
    if (issueKind === 'length-only') queue = 'compress'
    else if (pageMap) queue = 'pdf'
    else queue = 'fallback'
    counts[queue] += 1

    const qNumber = qNumberOf(qid)
    const png = queue === 'pdf' ? resolve(pagesDir, `${qid}.png`) : undefined

    // Per-question input file (only the fields that queue's generator needs).
    const input: Record<string, unknown> = {
      qid,
      queue,
      subject: q.subject,
      qNumber,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      acceptedAnswers: q.acceptedAnswers ?? [],
      disputed: !!q.disputed,
    }
    if (queue === 'compress') input.priorOptionExplanations = entry.optionExplanations ?? {}
    if (queue === 'fallback') {
      input.explanation = q.explanation
      input.priorOptionExplanations = entry.optionExplanations ?? {}
    }
    if (queue === 'pdf' && pageMap) {
      input.pdfFile = pageMap.file
      input.pdfPage = pageMap.page // 0-based
      input.png = png
      // 詳解 in older (continuous-flow) PDFs spills onto the next page, so we render and
      // pass a 2-page window. For newer self-contained cards the next page is the next
      // question's card (ignored via the question-number match in the prompt).
      input.pngNext = resolve(pagesDir, `${qid}-next.png`)
    }
    writeFileSync(resolve(inputsDir, `${qid}.json`), JSON.stringify(input, null, 1))

    manifest.push({
      qid,
      queue,
      subject: q.subject,
      qNumber,
      sourceHash: hash,
      reason: entry.reason,
      issueKind,
      file: pageMap?.file,
      page: pageMap?.page,
      png,
    })
  }

  manifest.sort((a, b) => a.qid.localeCompare(b.qid))
  writeFileSync(resolve(workDir, 'manifest.json'), JSON.stringify(manifest, null, 1))

  console.log('=== BACKFILL PREP ===')
  console.log(`manual-review entries: ${Object.keys(manualReview).length}`)
  console.log(`  compress (Haiku shorten)  : ${counts.compress}`)
  console.log(`  pdf      (Sonnet vision)  : ${counts.pdf}`)
  console.log(`  fallback (Sonnet text)    : ${counts.fallback}`)
  if (counts.missing) console.log(`  ! missing from corpus     : ${counts.missing}`)
  console.log(`inputs → ${inputsDir}`)
  console.log(`manifest → ${resolve(workDir, 'manifest.json')}`)
}

main()
