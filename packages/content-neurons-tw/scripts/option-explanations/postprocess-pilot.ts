/**
 * Post-process the pilot Workflow output (neurons-simplified-explanations, tasks 3.1/3.2).
 * Consolidates the per-batch generation files + QA verdict files, runs the COMMITTED
 * deterministic validator on every generated entry, and classifies each question into
 * shippable / manual-review. Emits a candidate sidecar (provenance shape) + a manual-review
 * file + prints stats and review samples. Read-only on the corpus; writes only to <outDir>.
 *
 *   tsx scripts/option-explanations/postprocess-pilot.ts <pilotInput.json> <outDir>
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, charLen, type HashableQuestion } from './hash'
import { validateEntry, NO_REASON_SENTINEL, type QuestionForValidation } from './validate'

const MODEL = 'claude-haiku-4-5'
const PROMPT_VERSION = 'pilot-v1'

type PilotItem = HashableQuestion & { id: string; subject: string; sourceHash: string; risky: boolean }

function loadJsonDir(dir: string, prefix: string): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  if (!existsSync(dir)) return merged
  for (const f of readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith('.json'))) {
    try {
      Object.assign(merged, JSON.parse(readFileSync(resolve(dir, f), 'utf-8')))
    } catch (e) {
      console.error(`  ! failed to parse ${f}: ${(e as Error).message}`)
    }
  }
  return merged
}

function main(): void {
  const pilotPath = process.argv[2]
  const outDir = process.argv[3]
  if (!pilotPath || !outDir) throw new Error('usage: postprocess-pilot.ts <pilotInput.json> <outDir>')

  const items: PilotItem[] = JSON.parse(readFileSync(pilotPath, 'utf-8'))
  const oeByQid = loadJsonDir(outDir, 'gen-') as Record<string, Record<string, string>>
  const qaByQid = loadJsonDir(outDir, 'qa-') as Record<string, { pass: boolean; issues?: string[]; severity?: string }>

  const sidecar: Record<string, unknown> = {}
  const manualReview: Record<string, unknown> = {}
  let detPass = 0
  let detFail = 0
  let qaFail = 0
  let notGenerated = 0
  const failSamples: string[] = []

  for (const item of items) {
    const oe = oeByQid[item.id]
    if (!oe || Object.keys(oe).length === 0) {
      notGenerated += 1
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
    const qa = qaByQid[item.id]
    const qaOk = !item.risky || !qa || qa.pass !== false // QA only gates risky; missing QA = not blocking for pilot

    if (res.ok && qaOk) {
      detPass += 1
      sidecar[item.id] = {
        sourceHash: item.sourceHash,
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        optionExplanations: oe,
        flags: qa && qa.pass === false ? ['qa-flagged'] : [],
      }
    } else {
      if (!res.ok) detFail += 1
      if (item.risky && qa && qa.pass === false) qaFail += 1
      manualReview[item.id] = {
        reason: !res.ok ? 'deterministic-fail' : 'qa-fail',
        detIssues: res.issues,
        qa: qa ?? null,
        optionExplanations: oe,
      }
      if (failSamples.length < 12) failSamples.push(`${item.id} [${!res.ok ? res.issues.join('; ') : 'QA:' + (qa?.issues ?? []).join('; ')}]`)
    }
  }

  writeFileSync(resolve(outDir, 'sidecar-candidate.json'), JSON.stringify(sidecar, null, 2))
  writeFileSync(resolve(outDir, 'manual-review.json'), JSON.stringify(manualReview, null, 2))

  const total = items.length
  console.log('=== PILOT POST-PROCESS ===')
  console.log(`total ${total} | generated ${total - notGenerated} | not-generated ${notGenerated}`)
  console.log(`deterministic: pass ${detPass} | fail ${detFail}`)
  console.log(`QA (risky ${items.filter((i) => i.risky).length}): fail ${qaFail}`)
  console.log(`→ shippable ${Object.keys(sidecar).length} | manual-review ${Object.keys(manualReview).length}`)
  if (failSamples.length) {
    console.log('\nFailure samples:')
    for (const s of failSamples) console.log('  ✗ ' + s)
  }
  // Length distribution sanity on the shippable set.
  const lens: number[] = []
  for (const v of Object.values(sidecar) as { optionExplanations: Record<string, string> }[]) {
    for (const t of Object.values(v.optionExplanations)) if (t !== NO_REASON_SENTINEL) lens.push(charLen(t))
  }
  if (lens.length) {
    lens.sort((a, b) => a - b)
    console.log(`\nshippable line lengths: min ${lens[0]} / median ${lens[Math.floor(lens.length / 2)]} / max ${lens[lens.length - 1]} (n=${lens.length})`)
  }
}

main()
