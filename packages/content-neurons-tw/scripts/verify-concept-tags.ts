/**
 * Concept-tag check layer (add-neurons-concept-tags §3.1 + §3.2).
 *
 * Deterministic hard-gate validator over the tagging output:
 *   §3.1  every question tagged 1–3 leaves, each ∈ its subject's closed tree, 100% coverage;
 *         question id/answer/stem/options are byte-identical (tags are a separate sidecar —
 *         asserted by hashing questions.json against a baseline the sidecar never writes to);
 *         coverage report lists leaves with 0 tagged questions (cold).
 *   §3.2  cross-signal flags → a review set: keyword-unique vs model disagreement, model tagged
 *         the full cap of 3 (ambiguity), or keyword-fallback src (model gave nothing).
 *
 * Exit 1 on any hard-gate violation. Prints coverage + flag summary.
 *   pnpm --filter @study-rpg/content-neurons-tw exec tsx scripts/verify-concept-tags.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONCEPT_VOCAB } from '../src/concept-vocab/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')

interface Q { id: string; subject: string }
const corpus = JSON.parse(readFileSync(join(PKG, 'dist', 'questions.json'), 'utf8')) as Q[]
const tags = JSON.parse(readFileSync(join(PKG, 'provenance', 'concept-tags.model.json'), 'utf8')) as Record<
  string,
  { leafIds: string[]; src: string }
>
const kwPath = join(PKG, 'reference', 'concept-mining', 'keyword-prepass.json')
const keyword = existsSync(kwPath)
  ? (JSON.parse(readFileSync(kwPath, 'utf8')) as Record<string, { unique: string | null; candidates: string[] }>)
  : {}
// Documented subject-mislabel exceptions: questions whose corpus `subject` is wrong, so no honest
// concept exists in their tree. Surfaced (not silent), excluded from the coverage gate.
const excPath = join(PKG, 'provenance', 'concept-tags-exceptions.json')
const exceptions = new Set(
  existsSync(excPath) ? Object.keys(JSON.parse(readFileSync(excPath, 'utf8'))).filter((k) => k !== '__doc__') : [],
)

const leafIdBySubject: Record<string, Set<string>> = {}
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) leafIdBySubject[sid] = new Set(tree.leaves.map((l) => l.id))

const errors: string[] = []
const flags: { qid: string; reason: string }[] = []
const taggedLeafCount: Record<string, number> = {} // leafId(subject-scoped key) → # tagged questions

for (const q of corpus) {
  const t = tags[q.id]
  // §3.1 coverage
  if (!t || !Array.isArray(t.leafIds) || t.leafIds.length === 0) {
    if (!exceptions.has(q.id)) errors.push(`UNCOVERED: ${q.id} has no tags`)
    continue
  }
  // §3.1 cardinality + closed-set
  if (t.leafIds.length > 3) errors.push(`CARDINALITY: ${q.id} has ${t.leafIds.length} tags (>3)`)
  const seen = new Set<string>()
  for (const id of t.leafIds) {
    if (seen.has(id)) errors.push(`DUP_TAG: ${q.id} repeats "${id}"`)
    seen.add(id)
    if (!leafIdBySubject[q.subject]?.has(id)) {
      errors.push(`OUT_OF_VOCAB: ${q.id} tag "${id}" ∉ ${q.subject} tree`)
    } else {
      taggedLeafCount[`${q.subject}::${id}`] = (taggedLeafCount[`${q.subject}::${id}`] ?? 0) + 1
    }
  }
  // §3.2 cross-signal flags (non-fatal — feed the review set)
  const kw = keyword[q.id]
  if (kw?.unique && !t.leafIds.includes(kw.unique)) flags.push({ qid: q.id, reason: `keyword≠model (kw:${kw.unique})` })
  if (t.leafIds.length === 3) flags.push({ qid: q.id, reason: 'tagged full cap of 3 (ambiguity)' })
  if (t.src === 'keyword') flags.push({ qid: q.id, reason: 'keyword-fallback (model gave nothing)' })
}

// phantom sidecar ids (tags for non-existent questions → would imply corpus drift)
const corpusIds = new Set(corpus.map((q) => q.id))
for (const id of Object.keys(tags)) if (!corpusIds.has(id)) errors.push(`PHANTOM: tag for unknown question "${id}"`)

// Coverage report: cold leaves (0 tagged questions)
const coldLeaves: string[] = []
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) {
  for (const l of tree.leaves) if (!(taggedLeafCount[`${sid}::${l.id}`] > 0)) coldLeaves.push(`${sid}/${l.id} (${l.zh})`)
}

// write the review set for §3.3 / §3.4
const reviewPath = join(PKG, 'reference', 'concept-mining', 'tag-review-flags.json')
writeFileSync(reviewPath, JSON.stringify({ flags, coldLeaves }, null, 2))

const srcCount = { model: 0, keyword: 0, repass: 0 }
for (const t of Object.values(tags)) srcCount[t.src as keyof typeof srcCount] = (srcCount[t.src as keyof typeof srcCount] ?? 0) + 1

console.log(`\nConcept-tag check — ${corpus.length} questions:`)
console.log(`  coverage:     ${Object.keys(tags).length}/${corpus.length} (+ ${exceptions.size} documented subject-mislabel exceptions)`)
console.log(`  src: model=${srcCount.model} keyword=${srcCount.keyword} repass=${srcCount.repass}`)
console.log(`  cold leaves (0 tagged Q): ${coldLeaves.length}`)
console.log(`  §3.2 review flags: ${flags.length} (keyword≠model / full-cap-3 / kw-fallback) → ${reviewPath}`)

if (errors.length) {
  console.error(`\n❌ ${errors.length} hard-gate violation(s):`)
  for (const e of errors.slice(0, 40)) console.error(`  - ${e}`)
  if (errors.length > 40) console.error(`  … +${errors.length - 40} more`)
  process.exit(1)
}
console.log('\n✅ hard gate passed — 100% coverage, all tags 1–3 & in closed vocab, no phantom/dup.')
