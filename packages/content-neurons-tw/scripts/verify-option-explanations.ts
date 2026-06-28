/**
 * verify:option-explanations — build gate for the per-option 簡答 sidecar
 * (neurons-simplified-explanations). Re-runs the deterministic validator over every
 * shipped entry against the reconciled corpus it was generated from, so a hand-edited
 * or stale sidecar can never ship a structurally-invalid 簡答. Exits non-zero on any
 * failure (No-Silent-Errors). A missing/empty sidecar passes trivially.
 *
 *   pnpm --filter @study-rpg/content-neurons-tw verify:option-explanations
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './option-explanations/hash'
import { validateEntry, type OptionExplanationEntry, type QuestionForValidation } from './option-explanations/validate'

const CORPUS = resolve(import.meta.dirname, '..', 'data', 'medexam-reconciled', 'questions.json')
const SIDECAR = resolve(import.meta.dirname, '..', 'provenance', 'option-explanations.generated.json')

type CorpusQuestion = HashableQuestion & { id: string }

function main(): void {
  if (!existsSync(SIDECAR)) {
    console.log('verify:option-explanations: no sidecar present — nothing to verify (0 entries).')
    return
  }
  const corpus: CorpusQuestion[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const byId = new Map(corpus.map((q) => [q.id, q]))
  const sidecar: Record<string, OptionExplanationEntry> = JSON.parse(readFileSync(SIDECAR, 'utf-8'))

  let ok = 0
  const failures: { id: string; issues: string[] }[] = []
  for (const [id, entry] of Object.entries(sidecar)) {
    const q = byId.get(id)
    if (!q) {
      failures.push({ id, issues: ['no matching question in reconciled corpus'] })
      continue
    }
    const qv: QuestionForValidation = {
      id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      acceptedAnswers: q.acceptedAnswers,
      disputed: q.disputed,
      explanation: q.explanation,
    }
    const res = validateEntry(entry, qv, sourceHash(qv))
    if (res.ok) ok += 1
    else failures.push({ id, issues: res.issues })
  }

  console.log(`verify:option-explanations: ${ok} ok / ${failures.length} failed / ${Object.keys(sidecar).length} total`)
  if (failures.length > 0) {
    for (const f of failures.slice(0, 20)) console.error(`  ✗ ${f.id}: ${f.issues.join('; ')}`)
    if (failures.length > 20) console.error(`  …and ${failures.length - 20} more`)
    process.exit(1)
  }
}

main()
