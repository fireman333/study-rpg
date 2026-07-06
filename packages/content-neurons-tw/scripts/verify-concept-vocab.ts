/**
 * Verify the concept-tag vocabulary (add-neurons-concept-tags §1.4).
 * Runs the closed-set validator against the assembled CONCEPT_VOCAB + corpus subjects,
 * then prints a per-subject leaf/chapter summary. Exit 1 on any violation.
 *
 *   pnpm --filter @study-rpg/content-neurons-tw verify:concept-vocab
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONCEPT_VOCAB, validateConceptVocab, ALL_LEAVES } from '../src/concept-vocab/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(
  readFileSync(join(__dirname, '..', 'dist', 'questions.json'), 'utf8'),
) as { subject: string }[]
const corpusSubjectIds = [...new Set(corpus.map((q) => q.subject))]

try {
  validateConceptVocab(CONCEPT_VOCAB, { corpusSubjectIds })
} catch (e) {
  console.error('❌ ' + (e as Error).message)
  process.exit(1)
}

console.log('✅ concept vocabulary valid — closed set, canonical-unique, corpus↔vocab parity.\n')
console.log('科目'.padEnd(8) + 'chapters  leaves')
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) {
  const cold = tree.chapters.filter((c) => c.cold).length
  console.log(
    `${sid.padEnd(8)}${String(tree.chapters.length).padStart(6)}${cold ? ` (${cold} cold)` : ''}${String(tree.leaves.length).padStart(8)}`,
  )
}
console.log(`\nTotal leaves: ${ALL_LEAVES.length} across ${Object.keys(CONCEPT_VOCAB).length} subjects.`)
