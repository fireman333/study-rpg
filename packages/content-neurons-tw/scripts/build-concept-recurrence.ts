/**
 * Concept-recurrence dataset (add-neurons-concept-tags §4).
 *
 * §4.1 per-concept sitting-breadth = # distinct sittings a concept is tested (denominator
 *      = every ingested sitting, derived from the corpus), deduped within a sitting;
 *      multi-label questions contribute each tested concept's sitting-presence;
 *      recency-weighted breadth as tiebreak.
 * §4.2 question-count = secondary "intensity" only (may exceed true totals under multi-label);
 *      押題 threshold breadth ≥ 5 sittings; 1–4 = searchable low-yield, not ranked.
 * §4.3 tier ∈ {常青必掃, 穩定考點, 近年新寵, 經典但降溫}; coarse-chapter breadth = union of its
 *      leaves' tested sittings.
 * §4.4 送分/answer-corrected questions (questions.json `disputed` OR acceptedAnswers.length>1)
 *      are EXCLUDED from breadth; per-concept `disputedExcluded` count recorded.
 *      (NB: the task text names provenance/base-corrections.json, but that file is PDF
 *       page-resolution corrections — the actual 送分 signal lives in questions.json.)
 * §4.5 emits dist/concept-recurrence.json + dist/concept-tags.json (search + downstream 押題).
 *
 *   pnpm --filter @study-rpg/content-neurons-tw exec tsx scripts/build-concept-recurrence.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONCEPT_VOCAB } from '../src/concept-vocab/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const PUSH_THRESHOLD = 5

interface Q {
  id: string; subject: string; answer: string; disputed?: boolean; acceptedAnswers?: string[]
  meta: { year: number; session: number }
}
const corpus = JSON.parse(readFileSync(join(PKG, 'dist', 'questions.json'), 'utf8')) as Q[]
const tags = JSON.parse(readFileSync(join(PKG, 'provenance', 'concept-tags.model.json'), 'utf8')) as Record<
  string,
  { leafIds: string[]; src: string }
>

const sittingKey = (q: Q) => `${q.meta.year}-${q.meta.session}`
const allSittings = [...new Set(corpus.map(sittingKey))].sort((a, b) => {
  const [ay, as] = a.split('-').map(Number); const [by, bs] = b.split('-').map(Number)
  return ay - by || as - bs
})
// recency rank from the end: last 3 → 1.5, next 3 → 1.2, else 1.0
// Denominator of every 出題頻率 line in the app. DERIVED from the corpus, never a literal —
// a hand-copied count silently misstates how often a 考點 has actually been examined the
// moment a sitting is ingested (23 → 24 when 115-2 landed).
const SITTINGS_TOTAL = allSittings.length
const recencyWeight: Record<string, number> = {}
const recent3 = new Set(allSittings.slice(-3))
allSittings.forEach((s, i) => {
  const fromEnd = allSittings.length - 1 - i
  recencyWeight[s] = fromEnd < 3 ? 1.5 : fromEnd < 6 ? 1.2 : 1.0
})
const isDisputed = (q: Q) => q.disputed === true || (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 1)

// leaf metadata lookup
const leafMeta: Record<string, { zh: string; en: string; chapterId: string }> = {}
const chapterZh: Record<string, string> = {}
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) {
  for (const l of tree.leaves) leafMeta[`${sid}::${l.id}`] = { zh: l.zh, en: l.en, chapterId: l.chapterId }
  for (const c of tree.chapters) chapterZh[`${sid}::${c.id}`] = c.zh
}

// accumulate per-concept: set of tested sittings (non-disputed), qcount, disputedExcluded
const acc: Record<string, { sittings: Set<string>; qcount: number; disputed: number }> = {}
for (const q of corpus) {
  const t = tags[q.id]
  if (!t) continue
  const disputed = isDisputed(q)
  for (const leaf of t.leafIds) {
    const key = `${q.subject}::${leaf}`
    acc[key] ??= { sittings: new Set(), qcount: 0, disputed: 0 }
    if (disputed) { acc[key].disputed++; continue }
    acc[key].sittings.add(sittingKey(q))
    acc[key].qcount++
  }
}

const sittingIndex: Record<string, number> = {}
allSittings.forEach((s, i) => (sittingIndex[s] = i))
const N = allSittings.length

/**
 * Recency-gap-aware tiering (revised per §3.4 二輪 panel — Codex+Fable consensus).
 * The old "近3=0 → 降溫" 3-sitting hard window had no statistical power (a b8 concept has
 * >20% chance of a coincidental 3-empty streak) and mislabeled staples (S.aureus/opioids/
 * thrombosis) whose last appearance was 113-2 — just one sitting outside the window.
 *   - `lastGap` = sittings since last tested (0 = tested in the most recent sitting).
 *   - 常青必掃: breadth ≥ 13 AND still active (lastGap ≤ 4) — catches permanent hot topics
 *     the old ≥15 cutoff missed (抗藥性/抗癲癇, b14 & recently tested).
 *   - 經典但降溫: breadth ≥ 8 AND genuinely absent (lastGap ≥ 5) — real decline only; a
 *     concept last seen at 113-2 (gap 3) is NOT cooling.
 *   - 近年新寵: genuinely new — first appearance within the last 6 sittings AND recurring
 *     (breadth ≥ 2). (Honest: very few concepts qualify; the old label over-claimed.)
 */
function tierOf(breadth: number, lastGap: number, firstIdx: number): string {
  if (firstIdx >= N - 6 && breadth >= 2) return '近年新寵'
  if (breadth < PUSH_THRESHOLD) return 'low-yield'
  if (breadth >= 13 && lastGap <= 4) return '常青必掃'
  // Cooling requires a genuinely long absence (≥6 sittings ≈ 3 yr). A gap of 5 is too weak
  // to call a historically-frequent flagship (e.g. S. aureus) "cooling" — those stay neutral.
  if (breadth >= 8 && lastGap >= 6) return '經典但降溫'
  return '穩定考點'
}

const concepts = []
const chapterSittings: Record<string, Set<string>> = {} // subject::chapter → union of tested sittings
for (const [sid, tree] of Object.entries(CONCEPT_VOCAB)) {
  for (const l of tree.leaves) {
    const key = `${sid}::${l.id}`
    const a = acc[key] ?? { sittings: new Set<string>(), qcount: 0, disputed: 0 }
    const tested = [...a.sittings].sort((x, y) => sittingIndex[x] - sittingIndex[y])
    const breadth = Math.min(tested.length, SITTINGS_TOTAL)
    const recent3Count = tested.filter((s) => recent3.has(s)).length
    const recencyWeighted = +tested.reduce((s, k) => s + recencyWeight[k], 0).toFixed(2)
    const lastGap = tested.length ? N - 1 - sittingIndex[tested[tested.length - 1]] : N
    const firstIdx = tested.length ? sittingIndex[tested[0]] : -1
    concepts.push({
      subjectId: sid, leafId: l.id, zh: l.zh, en: l.en, chapterId: l.chapterId,
      breadth, questionCount: a.qcount, recencyWeightedBreadth: recencyWeighted,
      recent3Count, lastGap, disputedExcluded: a.disputed,
      eligible: breadth >= PUSH_THRESHOLD, tier: tierOf(breadth, lastGap, firstIdx),
      testedSittings: tested,
    })
    const ck = `${sid}::${l.chapterId}`
    chapterSittings[ck] ??= new Set()
    for (const s of tested) chapterSittings[ck].add(s)
  }
}

const chapters = Object.entries(chapterSittings).map(([ck, set]) => {
  const [subjectId, chapterId] = ck.split('::')
  return { subjectId, chapterId, zh: chapterZh[ck] ?? chapterId, breadth: Math.min(set.size, SITTINGS_TOTAL) }
})

// §4.5 emit artifacts
const leanTags: Record<string, string[]> = {}
for (const [qid, t] of Object.entries(tags)) leanTags[qid] = t.leafIds
writeFileSync(join(PKG, 'dist', 'concept-tags.json'), JSON.stringify(leanTags))

concepts.sort((a, b) => b.breadth - a.breadth || b.recencyWeightedBreadth - a.recencyWeightedBreadth)
const disputedTotal = corpus.filter(isDisputed).length
writeFileSync(
  join(PKG, 'dist', 'concept-recurrence.json'),
  JSON.stringify({
    meta: {
      sittingsTotal: SITTINGS_TOTAL, sittings: allSittings, pushThreshold: PUSH_THRESHOLD,
      recent3: [...recent3], disputedQuestionsExcluded: disputedTotal, builtAt: new Date().toISOString(),
    },
    concepts, chapters,
  }, null, 2),
)

// summary
const tierCount: Record<string, number> = {}
for (const c of concepts) tierCount[c.tier] = (tierCount[c.tier] ?? 0) + 1
console.log(`\nConcept-recurrence over ${allSittings.length} sittings (${concepts.length} concepts):`)
for (const t of ['常青必掃', '穩定考點', '近年新寵', '經典但降溫', 'low-yield']) console.log(`  ${t}: ${tierCount[t] ?? 0}`)
console.log(`  送分/disputed excluded: ${disputedTotal} questions`)
console.log(`\nTop 12 by breadth:`)
for (const c of concepts.slice(0, 12)) console.log(`  ${String(c.breadth).padStart(2)}/${SITTINGS_TOTAL}  [${c.tier}] ${c.subjectId}/${c.zh} (${c.questionCount}Q${c.disputedExcluded ? `, ${c.disputedExcluded} disp` : ''})`)
console.log(`\n→ dist/concept-recurrence.json + dist/concept-tags.json`)
