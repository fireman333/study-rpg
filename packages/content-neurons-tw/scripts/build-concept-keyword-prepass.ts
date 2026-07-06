/**
 * Deterministic keyword pre-pass (add-neurons-concept-tags §2.1).
 *
 * Builds a per-subject index of DISTINCTIVE (subject-unique) keyword tokens from each
 * leaf's canonical zh/en + synonyms, then matches every question's stem + CORRECT answer
 * against it. Purpose:
 *   1. free high-precision auto-tags for unambiguously-keyworded questions
 *   2. a cross-check signal for the §2.2 cheap-model pass (keyword vs model disagreement → flag)
 *
 * Distractor text is NOT matched (spec: "distractor mentions are not tagged"); distractor-only
 * hits are recorded separately as a weak signal only.
 *
 * Output (regenerable, not committed): <OUT>/keyword-prepass.json + printed hit-rate stats.
 *   pnpm --filter @study-rpg/content-neurons-tw exec tsx scripts/build-concept-keyword-prepass.ts [OUT_DIR]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONCEPT_VOCAB, normalizeSurface } from '../src/concept-vocab/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const OUT_DIR = process.argv[2] ?? join(PKG, 'reference', 'concept-mining')

interface Q { id: string; subject: string; stem: string; options: Record<string, string>; answer: string }
const corpus = JSON.parse(readFileSync(join(PKG, 'dist', 'questions.json'), 'utf8')) as Q[]

// Tokens too generic to discriminate a concept (would over-match).
const STOP = new Set([
  '疾病', '症候群', '細胞', '作用', '機制', '構造', '功能', '結構', '代謝', '感染', '病毒', '細菌',
  '蛋白', '蛋白質', '受體', '藥物', '治療', '診斷', '反應', '系統', '分類', '合成', '調控',
  'disease', 'diseases', 'syndrome', 'cell', 'cells', 'acid', 'acids', 'drug', 'drugs', 'protein',
  'proteins', 'receptor', 'receptors', 'mechanism', 'structure', 'function', 'metabolism', 'infection',
  'virus', 'viruses', 'bacteria', 'and', 'the', 'of', 'with', 'system', 'gene', 'genes', 'type', 'types',
])

function tokenize(s: string): string[] {
  return s
    .split(/[\/、，,;；：（）()「」『』【】\[\]\s　·&+]+/)
    .map((t) => normalizeSurface(t))
    .filter((t) => {
      if (!t || STOP.has(t)) return false
      const hasCJK = /[一-鿿]/.test(t)
      if (hasCJK) return t.length >= 2 // ≥2 CJK chars
      return /^[a-z][a-z0-9-]{3,}$/.test(t) // alphabetic ≥4, not pure number
    })
}

// Build per-subject unique-token index: token → leafId, keeping only tokens that map to
// exactly ONE leaf in the subject (distinctive).
const uniqueTokenIndex: Record<string, Map<string, string>> = {}
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) {
  const tokenLeaves = new Map<string, Set<string>>()
  for (const leaf of tree.leaves) {
    const surfaces = [leaf.zh, leaf.en, ...leaf.synonyms]
    const toks = new Set(surfaces.flatMap(tokenize))
    for (const t of toks) {
      if (!tokenLeaves.has(t)) tokenLeaves.set(t, new Set())
      tokenLeaves.get(t)!.add(leaf.id)
    }
  }
  const uniq = new Map<string, string>()
  for (const [t, leaves] of tokenLeaves) if (leaves.size === 1) uniq.set(t, [...leaves][0])
  uniqueTokenIndex[sid] = uniq
}

const result: Record<string, { unique: string | null; candidates: string[]; distractorOnly: string[] }> = {}
const stats = { total: 0, anyHit: 0, uniqueHit: 0, multiHit: 0, distractorOnly: 0 }
const perSubject: Record<string, { n: number; anyHit: number; uniqueHit: number }> = {}

for (const q of corpus) {
  const idx = uniqueTokenIndex[q.subject]
  if (!idx) continue
  stats.total++
  perSubject[q.subject] ??= { n: 0, anyHit: 0, uniqueHit: 0 }
  perSubject[q.subject].n++

  const primary = normalizeSurface(q.stem + ' ' + (q.options[q.answer] ?? ''))
  const distractors = normalizeSurface(
    Object.entries(q.options).filter(([k]) => k !== q.answer).map(([, v]) => v).join(' '),
  )
  const hit = new Set<string>()
  const distractorHit = new Set<string>()
  for (const [tok, leafId] of idx) {
    if (primary.includes(tok)) hit.add(leafId)
    else if (distractors.includes(tok)) distractorHit.add(leafId)
  }
  const candidates = [...hit]
  const unique = candidates.length === 1 ? candidates[0] : null
  result[q.id] = { unique, candidates, distractorOnly: [...distractorHit].filter((l) => !hit.has(l)) }

  if (candidates.length >= 1) { stats.anyHit++; perSubject[q.subject].anyHit++ }
  if (unique) { stats.uniqueHit++; perSubject[q.subject].uniqueHit++ }
  if (candidates.length >= 2) stats.multiHit++
  if (candidates.length === 0 && result[q.id].distractorOnly.length > 0) stats.distractorOnly++
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'keyword-prepass.json'), JSON.stringify(result))

const pct = (n: number) => `${((100 * n) / stats.total).toFixed(1)}%`
console.log(`\nKeyword pre-pass over ${stats.total} questions (${Object.keys(CONCEPT_VOCAB).length} subjects):`)
console.log(`  ≥1 keyword hit:      ${stats.anyHit} (${pct(stats.anyHit)})`)
console.log(`  unique (auto-tag):   ${stats.uniqueHit} (${pct(stats.uniqueHit)})   ← free high-precision tags`)
console.log(`  multi-candidate:     ${stats.multiHit} (${pct(stats.multiHit)})   ← model disambiguates in §2.2`)
console.log(`  no primary / weak:   ${stats.total - stats.anyHit} (${pct(stats.total - stats.anyHit)})   ← §2.2 must classify`)
console.log(`\n科目      Q   ≥1hit  unique`)
for (const [s, v] of Object.entries(perSubject)) {
  console.log(`${s.padEnd(8)}${String(v.n).padStart(4)}  ${((100 * v.anyHit) / v.n).toFixed(0).padStart(4)}%  ${((100 * v.uniqueHit) / v.n).toFixed(0).padStart(4)}%`)
}
console.log(`\n→ ${join(OUT_DIR, 'keyword-prepass.json')}`)
