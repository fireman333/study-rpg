/**
 * Select a ~100-question pilot slice for the per-option 簡答 pipeline
 * (neurons-simplified-explanations, tasks 3.1). Stratified across subjects and
 * deliberately seeded with the risky shapes (disputed / multi-answer / short-詳解 /
 * 115-1 AI-generated / 簡解-sentinel) so the pilot exercises the hard cases. Emits a
 * pilot-input JSON: each item carries the fields the generator needs + the precomputed
 * sourceHash + a `risky` flag (drives the LLM-QA subset).
 *
 *   tsx scripts/option-explanations/select-pilot.ts <out.json> [count]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, charLen, type HashableQuestion } from './hash'

const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')

type Q = HashableQuestion & {
  id: string
  subject: string
  meta?: Record<string, unknown>
  explanationSource?: string
}

const JIANJIE = '簡解：'

/** The design's risky heuristics that route a question into the LLM-QA subset. */
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
  const out = process.argv[2]
  const count = Number(process.argv[3] ?? 100)
  if (!out) throw new Error('usage: select-pilot.ts <out.json> [count]')

  const corpus: Q[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const usable = corpus.filter((q) => (q.explanation ?? '').trim().length > 0 && Object.keys(q.options ?? {}).length >= 2)

  // Deterministic ordering (no RNG): id sort, then round-robin by subject for spread.
  const bySubject = new Map<string, Q[]>()
  for (const q of [...usable].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!bySubject.has(q.subject)) bySubject.set(q.subject, [])
    bySubject.get(q.subject)!.push(q)
  }

  // Seed: guarantee a few of each risky shape.
  const seeds: Q[] = []
  const seen = new Set<string>()
  const take = (pred: (q: Q) => boolean, n: number): void => {
    for (const q of usable) {
      if (seeds.length >= count) break
      if (seen.has(q.id) || !pred(q)) continue
      seeds.push(q)
      seen.add(q.id)
      if (seeds.filter(pred).length >= n) break
    }
  }
  take((q) => !!q.disputed, 6)
  take((q) => (q.acceptedAnswers?.length ?? 0) > 1, 4)
  take((q) => charLen(q.explanation ?? '') < 120, 8)
  take((q) => q.explanationSource === 'ai-generated', 6)
  take((q) => (q.explanation ?? '').startsWith(JIANJIE), 6)

  // Fill the rest round-robin across subjects for breadth.
  const cursors = new Map<string, number>()
  const subjects = [...bySubject.keys()].sort()
  while (seeds.length < count) {
    let progressed = false
    for (const s of subjects) {
      if (seeds.length >= count) break
      const list = bySubject.get(s)!
      let i = cursors.get(s) ?? 0
      while (i < list.length && seen.has(list[i].id)) i++
      cursors.set(s, i + 1)
      if (i < list.length) {
        seeds.push(list[i])
        seen.add(list[i].id)
        progressed = true
      }
    }
    if (!progressed) break
  }

  const items = seeds.slice(0, count).map((q) => ({
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

  writeFileSync(out, JSON.stringify(items, null, 2))
  const riskyN = items.filter((i) => i.risky).length
  const subjN = new Set(items.map((i) => i.subject)).size
  console.log(`pilot: ${items.length} questions across ${subjN} subjects, ${riskyN} risky (${out})`)
}

main()
