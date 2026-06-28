/**
 * Post-generation consolidation for the full run (neurons-simplified-explanations, tasks 4).
 * Merges the per-batch generation files (+ any single-question regen files), runs the COMMITTED
 * deterministic validator on every entry, and emits:
 *   - regen-needed.json : qids that failed validation or were never generated (→ single-question regen)
 *   - qa-in/qa-NN.json  : TARGETED QA inputs (risky ∩ det-pass), each chunk = up to 8 questions
 *                          carrying ONLY their own {question fields + generated optionExplanations},
 *                          so a QA agent never reads the whole corpus (the pilot's cost sink).
 * Prints stats. Read-only on the corpus; writes only under <outDir>/<qaInDir>.
 *
 *   tsx scripts/option-explanations/consolidate-and-validate.ts <full-input.json> <outDir> <qaInDir>
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, type QuestionForValidation } from './validate'

const QA_CHUNK = 8

type Item = HashableQuestion & { id: string; subject: string; sourceHash: string; risky: boolean }

function mergeGen(outDir: string): Record<string, Record<string, string>> {
  const oe: Record<string, Record<string, string>> = {}
  // gen-* first, then regen-* (regen overrides the original on a re-generated qid).
  const files = readdirSync(outDir).filter((n) => /^(gen|regen)-.*\.json$/.test(n))
  const ordered = [...files.filter((n) => n.startsWith('gen-')).sort(), ...files.filter((n) => n.startsWith('regen-')).sort()]
  for (const f of ordered) {
    try {
      Object.assign(oe, JSON.parse(readFileSync(resolve(outDir, f), 'utf-8')))
    } catch (e) {
      console.error(`  ! parse fail ${f}: ${(e as Error).message}`)
    }
  }
  return oe
}

function main(): void {
  const [fullInput, outDir, qaInDir] = process.argv.slice(2)
  if (!fullInput || !outDir || !qaInDir) throw new Error('usage: consolidate-and-validate.ts <full-input.json> <outDir> <qaInDir>')
  mkdirSync(qaInDir, { recursive: true })

  const items: Item[] = JSON.parse(readFileSync(fullInput, 'utf-8'))
  const oeByQid = mergeGen(outDir)

  const regenNeeded: { id: string; reason: string; issues?: string[] }[] = []
  const qaInputs: Record<string, unknown>[] = []
  let detPass = 0
  let notGen = 0

  for (const item of items) {
    const oe = oeByQid[item.id]
    if (!oe || Object.keys(oe).length === 0) {
      notGen += 1
      regenNeeded.push({ id: item.id, reason: 'not-generated' })
      continue
    }
    const qv: QuestionForValidation = {
      id: item.id,
      stem: item.stem,
      options: item.options,
      answer: item.answer,
      acceptedAnswers: item.acceptedAnswers,
      disputed: item.disputed,
      explanation: item.explanation,
    }
    const res = validateEntry({ sourceHash: item.sourceHash, optionExplanations: oe }, qv, sourceHash(qv))
    if (!res.ok) {
      regenNeeded.push({ id: item.id, reason: 'deterministic-fail', issues: res.issues })
      continue
    }
    detPass += 1
    if (item.risky) {
      qaInputs.push({
        id: item.id,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        disputed: !!item.disputed,
        acceptedAnswers: item.acceptedAnswers ?? [],
        explanation: item.explanation,
        optionExplanations: oe,
      })
    }
  }

  writeFileSync(resolve(outDir, 'regen-needed.json'), JSON.stringify(regenNeeded, null, 2))
  let chunk = 0
  for (let i = 0; i < qaInputs.length; i += QA_CHUNK) {
    writeFileSync(resolve(qaInDir, 'qa-' + String(chunk).padStart(3, '0') + '.json'), JSON.stringify(qaInputs.slice(i, i + QA_CHUNK)))
    chunk++
  }

  console.log('=== CONSOLIDATE + VALIDATE ===')
  console.log(`total ${items.length} | det-pass ${detPass} | regen-needed ${regenNeeded.length} (not-generated ${notGen} / det-fail ${regenNeeded.length - notGen})`)
  console.log(`QA inputs (risky ∩ det-pass): ${qaInputs.length} → ${chunk} chunk files of ${QA_CHUNK}`)
}

main()
