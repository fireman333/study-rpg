/**
 * Generator: raw subject-miner outputs → committed concept-vocab TS + review artifacts.
 * (add-neurons-concept-tags §1.3 assembly)
 *
 *   INPUT   reference/blueprint-coarse.json (coarse chapters, official 大綱)
 *           <INPUT_DIR>/<subjectId>.concepts.json (per-subject mined leaves)
 *   OUTPUT  src/concept-vocab/<slug>.ts   (one SubjectConceptTree per subject)
 *           src/concept-vocab/index.ts    (assembled CONCEPT_VOCAB + helpers)
 *           <OUT_DIR>/concept-vocab.merged.json  (single-file review artifact)
 *           <OUT_DIR>/concept-vocab.report.md    (counts / cold / bottom-up / ambiguity)
 *
 * Usage: tsx scripts/gen-concept-vocab.ts [INPUT_DIR] [OUT_DIR]
 *
 * Sanitization (logged, never silent — coding_principles §5):
 *   - dedupe synonyms within a leaf; drop any equal to the leaf's own canonical
 *   - drop a synonym that collides with another leaf's canonical/synonym (keep first)
 *   - a chapter with 0 leaves is marked `cold` (derived from leaf presence)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateConceptVocab, normalizeSurface } from '../src/concept-vocab/validator'
import type { ConceptVocab, ConceptLeaf, ConceptChapter } from '../src/concept-vocab/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const INPUT_DIR = process.argv[2] ?? join(PKG, 'reference', 'concept-mining')
const OUT_DIR = process.argv[3] ?? INPUT_DIR

const SUBJECT_SLUG: Record<string, string> = {
  生物化學: 'biochemistry',
  解剖學: 'anatomy',
  胚胎學: 'embryology',
  組織學: 'histology',
  生理學: 'physiology',
  微生物學: 'microbiology',
  免疫學: 'immunology',
  寄生蟲學: 'parasitology',
  藥理學: 'pharmacology',
  病理學: 'pathology',
  公共衛生學: 'public-health',
}

interface MinerConcept {
  id: string
  zh: string
  en: string
  chapterId: string
  synonyms: string[]
  estTestedSittings?: number
  estQuestionCount?: number
  exampleQIds: string[]
  note?: string
}
interface MinerOutput {
  subjectId: string
  questionCount: number
  targetConceptCount: number
  concepts: MinerConcept[]
  coldChapters?: string[]
  ambiguityShortlist?: string[]
}

const blueprint = JSON.parse(readFileSync(join(PKG, 'reference', 'blueprint-coarse.json'), 'utf8')) as {
  subjects: { subjectId: string; paper: string; chapters: { id: string; zh: string; en: string }[] }[]
}
const corpus = JSON.parse(readFileSync(join(PKG, 'dist', 'questions.json'), 'utf8')) as { subject: string }[]
const corpusSubjectIds = [...new Set(corpus.map((q) => q.subject))]

const drops: string[] = []
const vocab: ConceptVocab = {}
const reportRows: string[] = []
const bottomUpAll: string[] = []
const ambiguityAll: string[] = []

for (const bp of blueprint.subjects) {
  const sid = bp.subjectId
  const file = join(INPUT_DIR, `${sid}.concepts.json`)
  if (!existsSync(file)) {
    console.error(`⚠️  MISSING miner output for ${sid} (${file}) — skipping`)
    continue
  }
  const mined = JSON.parse(readFileSync(file, 'utf8')) as MinerOutput

  // Build leaves with synonym sanitization + global collision resolution within the subject.
  const surfaceOwner = new Map<string, string>() // normalized surface → owning leaf id
  for (const c of mined.concepts) {
    surfaceOwner.set(normalizeSurface(c.zh), c.id)
    surfaceOwner.set(normalizeSurface(c.en), c.id)
  }
  const leaves: ConceptLeaf[] = mined.concepts.map((c) => {
    const canon = new Set([normalizeSurface(c.zh), normalizeSurface(c.en)])
    const kept: string[] = []
    const seen = new Set<string>()
    for (const syn of c.synonyms ?? []) {
      const ns = normalizeSurface(syn)
      if (!ns) continue
      if (canon.has(ns)) { drops.push(`${sid}/${c.id}: syn "${syn}" == own canonical`); continue }
      if (seen.has(ns)) { drops.push(`${sid}/${c.id}: syn "${syn}" duplicate within leaf`); continue }
      const owner = surfaceOwner.get(ns)
      if (owner && owner !== c.id) { drops.push(`${sid}/${c.id}: syn "${syn}" collides with leaf "${owner}"`); continue }
      seen.add(ns)
      surfaceOwner.set(ns, c.id)
      kept.push(syn)
    }
    const leaf: ConceptLeaf = { id: c.id, zh: c.zh, en: c.en, chapterId: c.chapterId, synonyms: kept }
    if (c.note && /bottom-?up/i.test(c.note)) { leaf.bottomUp = true; bottomUpAll.push(`${sid}/${c.id} — ${c.zh}`) }
    return leaf
  })

  // Chapters: cold iff 0 leaves under it (derived).
  const leafCountByChapter = new Map<string, number>()
  for (const l of leaves) leafCountByChapter.set(l.chapterId, (leafCountByChapter.get(l.chapterId) ?? 0) + 1)
  const chapters: ConceptChapter[] = bp.chapters.map((c) => {
    const n = leafCountByChapter.get(c.id) ?? 0
    const ch: ConceptChapter = { id: c.id, zh: c.zh, en: c.en }
    if (n === 0) ch.cold = true
    return ch
  })

  vocab[sid] = { subjectId: sid, paper: bp.paper, chapters, leaves }

  const coldNames = chapters.filter((c) => c.cold).map((c) => c.id)
  reportRows.push(
    `| ${sid} | ${mined.questionCount} | ${mined.targetConceptCount} | ${leaves.length} | ${coldNames.length ? coldNames.join(', ') : '—'} |`,
  )
  for (const a of mined.ambiguityShortlist ?? []) ambiguityAll.push(`- **${sid}**: ${a}`)
}

// Validate assembled vocab (raises on structural violations).
let validationMsg = '✅ passed'
try {
  validateConceptVocab(vocab, { corpusSubjectIds })
} catch (e) {
  validationMsg = (e as Error).message
  console.error('\n' + validationMsg + '\n')
}

// ---- Emit per-subject TS + index ----
const vocabDir = join(PKG, 'src', 'concept-vocab')
const emitLeaf = (l: ConceptLeaf) =>
  `  { id: ${JSON.stringify(l.id)}, zh: ${JSON.stringify(l.zh)}, en: ${JSON.stringify(l.en)}, chapterId: ${JSON.stringify(l.chapterId)}, synonyms: ${JSON.stringify(l.synonyms)}${l.bottomUp ? ', bottomUp: true' : ''} },`
const emitChapter = (c: ConceptChapter) =>
  `  { id: ${JSON.stringify(c.id)}, zh: ${JSON.stringify(c.zh)}, en: ${JSON.stringify(c.en)}${c.cold ? ', cold: true' : ''} },`

const importLines: string[] = []
const vocabEntries: string[] = []
for (const [sid, tree] of Object.entries(vocab)) {
  const slug = SUBJECT_SLUG[sid]
  const varName = slug.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()) + 'Tree'
  const body =
    `// AUTO-GENERATED by scripts/gen-concept-vocab.ts — do not edit by hand.\n` +
    `// Source: reference/concept-mining/${sid}.concepts.json + reference/blueprint-coarse.json\n` +
    `import type { SubjectConceptTree } from './types'\n\n` +
    `export const ${varName}: SubjectConceptTree = {\n` +
    `  subjectId: ${JSON.stringify(tree.subjectId)},\n  paper: ${JSON.stringify(tree.paper)},\n` +
    `  chapters: [\n${tree.chapters.map(emitChapter).join('\n')}\n  ],\n` +
    `  leaves: [\n${tree.leaves.map(emitLeaf).join('\n')}\n  ],\n}\n`
  writeFileSync(join(vocabDir, `${slug}.ts`), body)
  importLines.push(`import { ${varName} } from './${slug}'`)
  vocabEntries.push(`  ${JSON.stringify(sid)}: ${varName},`)
}

const indexBody =
  `// AUTO-GENERATED by scripts/gen-concept-vocab.ts — do not edit by hand.\n` +
  `import type { ConceptVocab } from './types'\n` +
  importLines.join('\n') + '\n\n' +
  `export const CONCEPT_VOCAB: ConceptVocab = {\n${vocabEntries.join('\n')}\n}\n\n` +
  `export * from './types'\n` +
  `export { validateConceptVocab, resolveLeaf, normalizeSurface, type ConceptVocabFailure } from './validator'\n\n` +
  `/** All leaves across all subjects, tagged with their subjectId. */\n` +
  `export const ALL_LEAVES = Object.values(CONCEPT_VOCAB).flatMap((t) =>\n` +
  `  t.leaves.map((l) => ({ ...l, subjectId: t.subjectId })),\n)\n`
writeFileSync(join(vocabDir, 'index.ts'), indexBody)

// ---- Emit review artifacts ----
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'concept-vocab.merged.json'), JSON.stringify(vocab, null, 2))

const totalLeaves = Object.values(vocab).reduce((s, t) => s + t.leaves.length, 0)
const report =
  `# Concept Vocabulary — review artifact (add-neurons-concept-tags §1.3)\n\n` +
  `Validation: ${validationMsg.startsWith('✅') ? '✅ passed' : '❌ see failures below'}\n` +
  `Total leaves: **${totalLeaves}** across ${Object.keys(vocab).length} subjects. Synonym drops: ${drops.length}.\n\n` +
  `| 科目 | 題數 | target | leaves | cold chapters |\n|---|---|---|---|---|\n${reportRows.join('\n')}\n\n` +
  `## Bottom-up additions (tested but not in 大綱): ${bottomUpAll.length}\n${bottomUpAll.map((b) => `- ${b}`).join('\n') || '- (none)'}\n\n` +
  `## Ambiguity shortlist — needs human eyes (§1.5 owner sign-off)\n${ambiguityAll.join('\n') || '- (none)'}\n\n` +
  (validationMsg.startsWith('✅') ? '' : `## ⚠️ Validation failures\n\`\`\`\n${validationMsg}\n\`\`\`\n\n`) +
  `## Synonym sanitization drops (${drops.length})\n${drops.slice(0, 200).map((d) => `- ${d}`).join('\n') || '- (none)'}\n`
writeFileSync(join(OUT_DIR, 'concept-vocab.report.md'), report)

console.log(`\nGenerated ${Object.keys(vocab).length}/11 subject trees, ${totalLeaves} leaves. Validation: ${validationMsg.startsWith('✅') ? 'PASS' : 'FAIL'}. Drops: ${drops.length}.`)
console.log(`Review: ${join(OUT_DIR, 'concept-vocab.report.md')}`)
