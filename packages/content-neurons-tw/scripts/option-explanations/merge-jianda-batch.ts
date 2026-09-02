/**
 * Merge a batch of per-option 簡答 generated from now-present 詳解 into the sidecar
 * (backfill-neurons-missing-explanations, task 4.2). Reads <workDir>/jianda-out/<qid>.json
 * (gen) + <workDir>/jianda-qa/<qid>.json (QA verdict) for the qids in <workDir>/manifest.json,
 * runs the COMMITTED deterministic validator (sourceHash recomputed from the CURRENT corpus,
 * which now carries these questions' recovered/AI 詳解), applies QA, and merges every pass-pass
 * result into option-explanations.generated.json. Still-failing are reported (not merged).
 * Does NOT touch manual-review.json (these questions were never in it). Idempotent.
 *
 *   tsx scripts/option-explanations/merge-jianda-batch.ts <workDir>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, type QuestionForValidation } from './validate'

// Recorded per entry as provenance. Override when a batch is produced by a different
// generator (the 115-2 backfill ran through agy/Gemini, not Sonnet).
const MODEL = process.env.JIANDA_MODEL ?? 'claude-sonnet-4-6'
const PROMPT_VERSION = process.env.JIANDA_PROMPT_VERSION ?? 'jianda-from-詳解-v1'
const PROVENANCE = resolve(import.meta.dirname, '..', '..', 'provenance')
const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')

type CorpusQ = HashableQuestion & { id: string; explanationSource?: string }
type GenOut = { status?: string; optionExplanations?: Record<string, string>; reason?: string }
type Verdict = { pass?: boolean; severity?: string; issues?: string[] }

function readJsonIf<T>(p: string): T | null {
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) as T } catch { return null }
}

function main(): void {
  const workDir = process.argv[2]
  if (!workDir) throw new Error('usage: merge-jianda-batch.ts <workDir>')
  const manifest: { qid: string }[] = JSON.parse(readFileSync(resolve(workDir, 'manifest.json'), 'utf-8'))
  const corpus: CorpusQ[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const byId = new Map(corpus.map((q) => [q.id, q]))
  const generated: Record<string, unknown> = JSON.parse(readFileSync(resolve(PROVENANCE, 'option-explanations.generated.json'), 'utf-8'))

  const before = Object.keys(generated).length
  let merged = 0
  const failed: { qid: string; why: string }[] = []

  for (const { qid } of manifest) {
    const q = byId.get(qid)
    if (!q) { failed.push({ qid, why: 'missing from corpus' }); continue }
    const qv: QuestionForValidation = {
      id: qid, stem: q.stem, options: q.options, answer: q.answer,
      acceptedAnswers: q.acceptedAnswers, disputed: q.disputed, explanation: q.explanation,
    }
    const hash = sourceHash(qv)
    const gen = readJsonIf<GenOut>(resolve(workDir, 'jianda-out', `${qid}.json`))
    if (!gen || gen.status !== 'ok' || !gen.optionExplanations) {
      failed.push({ qid, why: gen?.reason ?? 'no/needs_review output' }); continue
    }
    const det = validateEntry({ sourceHash: hash, optionExplanations: gen.optionExplanations }, qv, hash)
    if (!det.ok) { failed.push({ qid, why: `det: ${det.issues.join('; ')}` }); continue }
    const qa = readJsonIf<Verdict>(resolve(workDir, 'jianda-qa', `${qid}.json`))
    if (qa && qa.pass === false && qa.severity === 'major') {
      failed.push({ qid, why: `qa-major: ${(qa.issues ?? []).join('; ')}` }); continue
    }
    const flags: string[] = []
    if (qa && qa.pass === false) flags.push('qa-minor')
    generated[qid] = {
      sourceHash: hash, model: MODEL, promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(), optionExplanations: gen.optionExplanations, flags,
      source: q.explanationSource === 'ai-generated' ? 'text-from-ai-詳解' : 'text-from-recovered-詳解',
    }
    merged += 1
  }

  writeFileSync(resolve(PROVENANCE, 'option-explanations.generated.json'), JSON.stringify(generated, null, 1))
  console.log('=== MERGE 簡答 BATCH ===')
  console.log(`sidecar ${before} → ${Object.keys(generated).length} (+${merged})`)
  console.log(`merged ${merged} / failed ${failed.length} of ${manifest.length}`)
  for (const f of failed) console.log(`  ✗ ${f.qid}: ${f.why}`)
}

main()
