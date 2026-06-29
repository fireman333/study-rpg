/**
 * Re-sync stale sourceHashes in the 簡答 sidecar after a corpus edit
 * (backfill-neurons-simplified-explanations). When `questions.json` changes (e.g. the
 * 104-1-醫學二 option-A extraction fix in commit 2f05bc2), every affected entry's
 * stored `sourceHash` no longer matches the question, so `verify:option-explanations`
 * fails even though the 簡答 text is still correct.
 *
 * This rehashes ONLY entries whose 簡答 is still safe to keep: the recomputed hash
 * differs, the entry still passes the committed deterministic validator with the new
 * hash, AND no option line contains a blank/placeholder marker (those are stale text
 * that must be regenerated, not rehashed). Everything it skips is reported so a human
 * can regenerate it. Idempotent.
 *
 *   tsx scripts/option-explanations/resync-sidecar-hashes.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { sourceHash, type HashableQuestion } from './hash'
import { validateEntry, type OptionExplanationEntry, type QuestionForValidation } from './validate'

const PROVENANCE = resolve(import.meta.dirname, '..', '..', 'provenance')
const CORPUS = resolve(import.meta.dirname, '..', '..', 'data', 'medexam-reconciled', 'questions.json')
const SIDECAR = resolve(PROVENANCE, 'option-explanations.generated.json')

// Lines that reference a missing/blank option — stale text that must be regenerated, not rehashed.
const PLACEHOLDER = /空白|無法評估|未提供|為空|無此選項|此選項缺|題幹未|無內容|選項缺失/

type CorpusQ = HashableQuestion & { id: string }

function main(): void {
  const write = process.argv.includes('--write')
  const corpus: CorpusQ[] = JSON.parse(readFileSync(CORPUS, 'utf-8'))
  const byId = new Map(corpus.map((q) => [q.id, q]))
  const sidecar: Record<string, OptionExplanationEntry> = JSON.parse(readFileSync(SIDECAR, 'utf-8'))

  const rehashed: string[] = []
  const skipped: { id: string; reason: string }[] = []

  for (const [id, entry] of Object.entries(sidecar)) {
    const q = byId.get(id)
    if (!q) {
      skipped.push({ id, reason: 'no matching question in corpus' })
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
    const recomputed = sourceHash(qv)
    if (entry.sourceHash === recomputed) continue // already in sync

    // Mismatch → only rehash if the 簡答 is still safe to keep.
    const placeholderKey = Object.entries(entry.optionExplanations ?? {}).find(([, v]) => PLACEHOLDER.test(v))
    if (placeholderKey) {
      skipped.push({ id, reason: `placeholder line in option ${placeholderKey[0]}: "${placeholderKey[1]}" — needs regen` })
      continue
    }
    const res = validateEntry({ ...entry, sourceHash: recomputed }, qv, recomputed)
    if (!res.ok) {
      skipped.push({ id, reason: `validator fails after rehash: ${res.issues.join('; ')} — needs regen` })
      continue
    }
    entry.sourceHash = recomputed
    rehashed.push(id)
  }

  console.log('=== RESYNC SIDECAR HASHES ===')
  console.log(`rehashed (safe): ${rehashed.length}`)
  for (const id of rehashed) console.log(`  ✓ ${id}`)
  console.log(`skipped (need regen / attention): ${skipped.length}`)
  for (const s of skipped) console.log(`  ✗ ${s.id}: ${s.reason}`)
  if (write && rehashed.length) {
    writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 1))
    console.log(`\nwrote ${SIDECAR}`)
  } else if (!write) {
    console.log('\n(dry run — pass --write to apply)')
  }
}

main()
