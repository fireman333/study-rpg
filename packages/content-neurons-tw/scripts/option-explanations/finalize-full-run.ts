/**
 * Finalize the full run (neurons-simplified-explanations, tasks 4.2). Merges gen + regen,
 * runs the COMMITTED deterministic validator, applies the QA verdicts, and writes the three
 * committed sidecar artifacts under the content pack's provenance/ dir:
 *   - option-explanations.generated.json  : qid → {sourceHash, model, promptVersion, generatedAt, optionExplanations, flags}
 *   - option-explanations.meta.json       : run summary
 *   - option-explanations.manual-review.json : qids excluded (not-generated / det-fail / QA major-fail)
 * Only QA-passed (or QA-missing / QA-minor-flagged) det-valid entries are shipped. Prints stats.
 *
 *   tsx scripts/option-explanations/finalize-full-run.ts <full-input.json> <outDir> <qaOutDir>
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, type QuestionForValidation } from './validate'

const MODEL = 'claude-haiku-4-5'
const PROMPT_VERSION = 'full-v1'
const PROVENANCE = resolve(import.meta.dirname, '..', '..', 'provenance')

type Item = HashableQuestion & { id: string; subject: string; sourceHash: string; risky: boolean }
type Verdict = { pass: boolean; issues?: string[]; severity?: string }

function mergeDir(dir: string, re: RegExp, order: (a: string, b: string) => number): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const f of readdirSync(dir).filter((n) => re.test(n)).sort(order)) {
    try {
      Object.assign(merged, JSON.parse(readFileSync(resolve(dir, f), 'utf-8')))
    } catch (e) {
      console.error(`  ! parse fail ${f}: ${(e as Error).message}`)
    }
  }
  return merged
}

function main(): void {
  const [fullInput, outDir, qaOutDir] = process.argv.slice(2)
  if (!fullInput || !outDir || !qaOutDir) throw new Error('usage: finalize-full-run.ts <full-input.json> <outDir> <qaOutDir>')

  const items: Item[] = JSON.parse(readFileSync(fullInput, 'utf-8'))
  // gen-* first, regen-* second (regen overrides).
  const oeByQid = mergeDir(outDir, /^(gen|regen)-.*\.json$/, (a, b) => {
    const ra = a.startsWith('regen-') ? 1 : 0
    const rb = b.startsWith('regen-') ? 1 : 0
    return ra - rb || a.localeCompare(b)
  }) as Record<string, Record<string, string>>
  const qaByQid = mergeDir(qaOutDir, /^qa-.*\.json$/, (a, b) => a.localeCompare(b)) as Record<string, Verdict>

  const sidecar: Record<string, unknown> = {}
  const manualReview: Record<string, unknown> = {}
  let shipped = 0
  let qaMajorFail = 0
  let qaMinorFlag = 0
  let detFail = 0
  let notGen = 0
  const bySubject: Record<string, { shipped: number; total: number }> = {}

  for (const item of items) {
    bySubject[item.subject] ??= { shipped: 0, total: 0 }
    bySubject[item.subject].total += 1
    const oe = oeByQid[item.id]
    if (!oe || Object.keys(oe).length === 0) {
      notGen += 1
      manualReview[item.id] = { reason: 'not-generated' }
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
      detFail += 1
      manualReview[item.id] = { reason: 'deterministic-fail', detIssues: res.issues, optionExplanations: oe }
      continue
    }
    const qa = item.risky ? qaByQid[item.id] : undefined
    if (qa && qa.pass === false && qa.severity === 'major') {
      qaMajorFail += 1
      manualReview[item.id] = { reason: 'qa-major-fail', qa, optionExplanations: oe }
      continue
    }
    const flags: string[] = []
    if (qa && qa.pass === false) {
      qaMinorFlag += 1
      flags.push('qa-minor')
    }
    sidecar[item.id] = {
      sourceHash: item.sourceHash,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      optionExplanations: oe,
      flags,
    }
    shipped += 1
    bySubject[item.subject].shipped += 1
  }

  writeFileSync(resolve(PROVENANCE, 'option-explanations.generated.json'), JSON.stringify(sidecar, null, 1))
  writeFileSync(resolve(PROVENANCE, 'option-explanations.manual-review.json'), JSON.stringify(manualReview, null, 2))
  writeFileSync(
    resolve(PROVENANCE, 'option-explanations.meta.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        total: items.length,
        shipped,
        manualReview: Object.keys(manualReview).length,
        breakdown: { notGenerated: notGen, deterministicFail: detFail, qaMajorFail, qaMinorFlagged: qaMinorFlag },
        riskyTotal: items.filter((i) => i.risky).length,
        qaVerdicts: Object.keys(qaByQid).length,
      },
      null,
      2,
    ),
  )

  console.log('=== FINALIZE ===')
  console.log(`total ${items.length} | shipped ${shipped} (${((shipped / items.length) * 100).toFixed(1)}%) | manual-review ${Object.keys(manualReview).length}`)
  console.log(`  manual-review breakdown: not-generated ${notGen} / det-fail ${detFail} / qa-major-fail ${qaMajorFail}`)
  console.log(`  qa-minor flagged (shipped) ${qaMinorFlag}`)
  console.log('per-subject shipped:')
  for (const [s, v] of Object.entries(bySubject).sort()) console.log(`  ${s}: ${v.shipped}/${v.total}`)
}

main()
