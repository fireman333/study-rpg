/**
 * Prepare the full-corpus run for the per-option 簡答 pipeline
 * (neurons-simplified-explanations, tasks 4.1). Reads the reconciled corpus, keeps every
 * usable question (non-empty 詳解 + ≥2 options), computes the sourceHash + risky flag, writes
 * a full-input.json and splits it into batch-of-N generation files. Idempotent: re-running
 * regenerates the same deterministic batches.
 *
 *   tsx scripts/option-explanations/prepare-full-run.ts <outDir> [batchSize]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, charLen, type HashableQuestion } from './hash'

const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')
const JIANJIE = '簡解：'

type Q = HashableQuestion & { id: string; subject: string; explanationSource?: string }

function isRisky(q: Q): boolean {
  const expl = q.explanation ?? ''
  if (q.disputed) return true
  if ((q.acceptedAnswers?.length ?? 0) > 1) return true
  if (charLen(expl) < 120) return true
  if (expl.startsWith(JIANJIE) && charLen(expl) < 160) return true
  if (q.explanationSource === 'ai-generated') return true
  return false
}

function main(): void {
  const outDir = process.argv[2]
  const batchSize = Number(process.argv[3] ?? 5)
  if (!outDir) throw new Error('usage: prepare-full-run.ts <outDir> [batchSize]')
  const genDir = resolve(outDir, 'gen')
  mkdirSync(genDir, { recursive: true })

  const corpus: Q[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const usable = corpus
    .filter((q) => (q.explanation ?? '').trim().length > 0 && Object.keys(q.options ?? {}).length >= 2)
    .sort((a, b) => a.id.localeCompare(b.id))

  const items = usable.map((q) => ({
    id: q.id,
    subject: q.subject,
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    acceptedAnswers: q.acceptedAnswers,
    disputed: q.disputed,
    explanation: q.explanation,
    sourceHash: sourceHash(q),
    risky: isRisky(q),
  }))
  writeFileSync(resolve(outDir, 'full-input.json'), JSON.stringify(items))

  // Split into generation batch files (only the fields the generator needs).
  let n = 0
  const batchPaths: string[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize).map((q) => ({
      qid: q.id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      disputed: !!q.disputed,
      acceptedAnswers: q.acceptedAnswers ?? [],
      explanation: q.explanation,
    }))
    const id = String(n).padStart(4, '0')
    writeFileSync(resolve(genDir, id + '.json'), JSON.stringify(slice))
    batchPaths.push(resolve(genDir, id + '.json'))
    n++
  }

  const riskyN = items.filter((i) => i.risky).length
  const subjN = new Set(items.map((i) => i.subject)).size
  console.log(`full-run prepared: ${items.length} usable questions / ${subjN} subjects / ${riskyN} risky`)
  console.log(`batches: ${n} (size ${batchSize}) → ${genDir}`)
  console.log(`skipped (no 詳解 / <2 options): ${corpus.length - usable.length} of ${corpus.length}`)
}

main()
