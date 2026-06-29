/**
 * Finalize the 簡答 backfill (backfill-neurons-simplified-explanations, task 4.2).
 * Reads the per-question gen outputs (<workDir>/out/<qid>.json) + QA verdicts
 * (<workDir>/qa/<qid>.json) for the 80 manual-review questions, re-runs the COMMITTED
 * deterministic validator and applies the QA verdicts (same gates as the full run), then
 * MERGES every pass-pass result into the existing committed sidecar and rewrites the
 * manual-review + meta files. Idempotent: re-running with the same outputs is a no-op.
 *
 * Only questions in the current manual-review set are touched; the 4,508 already-shipped
 * entries are preserved. Still-failing questions stay in manual-review (no-簡答 beats
 * wrong-簡答). Each backfilled entry records its generation `source`.
 *
 *   tsx scripts/option-explanations/backfill-finalize.ts <workDir>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, type QuestionForValidation } from './validate'

const MODEL = 'claude-sonnet-4-6'
const PROMPT_VERSION = 'backfill-v1'
const PROVENANCE = resolve(import.meta.dirname, '..', '..', 'provenance')
const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')

type CorpusQ = HashableQuestion & { id: string; subject: string }
type GenOut = {
  status?: string
  source?: string
  optionExplanations?: Record<string, string>
  reason?: string
}
type Verdict = { pass?: boolean; severity?: string; issues?: string[] }
type ManifestItem = { qid: string; queue: string; sourceHash: string; file?: string; page?: number }

function readJsonIf<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (e) {
    console.error(`  ! parse fail ${path}: ${(e as Error).message}`)
    return null
  }
}

function main(): void {
  const workDir = process.argv[2]
  if (!workDir) throw new Error('usage: backfill-finalize.ts <workDir>')

  const manifest: ManifestItem[] = JSON.parse(readFileSync(resolve(workDir, 'manifest.json'), 'utf-8'))
  const corpus: CorpusQ[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const byId = new Map(corpus.map((q) => [q.id, q]))

  const generated: Record<string, unknown> = JSON.parse(
    readFileSync(resolve(PROVENANCE, 'option-explanations.generated.json'), 'utf-8'),
  )
  const manualReview: Record<string, unknown> = JSON.parse(
    readFileSync(resolve(PROVENANCE, 'option-explanations.manual-review.json'), 'utf-8'),
  )
  const meta: Record<string, unknown> = JSON.parse(
    readFileSync(resolve(PROVENANCE, 'option-explanations.meta.json'), 'utf-8'),
  )

  const shippedBefore = Object.keys(generated).length
  let shipped = 0
  let qaMinor = 0
  const stillManual: Record<string, unknown> = {}
  const outcome: Record<string, { result: string; source?: string; detail?: string }> = {}
  const bySource: Record<string, number> = {}

  for (const item of manifest) {
    const { qid } = item
    const q = byId.get(qid)
    if (!q) {
      stillManual[qid] = manualReview[qid] ?? { reason: 'missing-from-corpus' }
      outcome[qid] = { result: 'manual', detail: 'missing from corpus' }
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

    const gen = readJsonIf<GenOut>(resolve(workDir, 'out', `${qid}.json`))
    if (!gen || gen.status !== 'ok' || !gen.optionExplanations) {
      stillManual[qid] = { ...(manualReview[qid] as object), reason: 'needs-review', backfillReason: gen?.reason ?? 'no output' }
      outcome[qid] = { result: 'manual', detail: gen?.reason ?? 'no/needs_review output' }
      continue
    }

    // Deterministic gate (committed validator).
    const det = validateEntry({ sourceHash: hash, optionExplanations: gen.optionExplanations }, qv, hash)
    if (!det.ok) {
      stillManual[qid] = { reason: 'deterministic-fail', detIssues: det.issues, optionExplanations: gen.optionExplanations, source: gen.source }
      outcome[qid] = { result: 'manual', source: gen.source, detail: `det: ${det.issues.join('; ')}` }
      continue
    }

    // QA gate.
    const qa = readJsonIf<Verdict>(resolve(workDir, 'qa', `${qid}.json`))
    if (qa && qa.pass === false && qa.severity === 'major') {
      stillManual[qid] = { reason: 'qa-major-fail', qa, optionExplanations: gen.optionExplanations, source: gen.source }
      outcome[qid] = { result: 'manual', source: gen.source, detail: `qa-major: ${(qa.issues ?? []).join('; ')}` }
      continue
    }
    const flags: string[] = []
    if (qa && qa.pass === false) {
      qaMinor += 1
      flags.push('qa-minor')
    }

    generated[qid] = {
      sourceHash: hash,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      optionExplanations: gen.optionExplanations,
      flags,
      source: gen.source ?? item.queue,
      ...(item.file ? { pdfFile: item.file, pdfPage: item.page, pdfScale: 2.5 } : {}),
    }
    shipped += 1
    bySource[gen.source ?? item.queue] = (bySource[gen.source ?? item.queue] ?? 0) + 1
    outcome[qid] = { result: 'shipped', source: gen.source }
  }

  // Write merged sidecar + remaining manual-review + refreshed meta.
  writeFileSync(resolve(PROVENANCE, 'option-explanations.generated.json'), JSON.stringify(generated, null, 1))
  writeFileSync(resolve(PROVENANCE, 'option-explanations.manual-review.json'), JSON.stringify(stillManual, null, 2))

  // Idempotent: each run recomputes the full backfill set from out/ (entries are overwritten),
  // so `shipped` is the current total of backfilled entries, not an increment.
  meta.shipped = Object.keys(generated).length
  meta.manualReview = Object.keys(stillManual).length
  meta.backfill = {
    finalizedAt: new Date().toISOString(),
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    attempted: manifest.length,
    shipped,
    remaining: Object.keys(stillManual).length,
    bySource,
    qaMinorFlagged: qaMinor,
  }
  writeFileSync(resolve(PROVENANCE, 'option-explanations.meta.json'), JSON.stringify(meta, null, 2))

  console.log('=== BACKFILL FINALIZE ===')
  console.log(`sidecar entries: ${shippedBefore} → ${Object.keys(generated).length}  (+${shipped} this run)`)
  console.log(`manual-review:   ${manifest.length} attempted → ${Object.keys(stillManual).length} remaining`)
  console.log(`shipped by source: ${JSON.stringify(bySource)}`)
  if (qaMinor) console.log(`qa-minor flagged (shipped with flag): ${qaMinor}`)
  console.log('still-manual reasons:')
  const reasons: Record<string, number> = {}
  for (const v of Object.values(stillManual)) {
    const r = (v as { reason?: string }).reason ?? '?'
    reasons[r] = (reasons[r] ?? 0) + 1
  }
  for (const [r, n] of Object.entries(reasons)) console.log(`  ${r}: ${n}`)
}

main()
