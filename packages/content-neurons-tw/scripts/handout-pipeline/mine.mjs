/**
 * handout-pipeline/mine.mjs — Stage 1 of the config-driven 考前講義 content pipeline.
 *
 * Reusable across subjects: reads `<subjectId>.config.json` (the single source of truth for
 * region boundaries) + the built concept maps + questions, and emits one packet per region for
 * the per-region draft subagents (Stage 2 dispatch). Deterministic, no LLM / network.
 *
 *   node packages/content-neurons-tw/scripts/handout-pipeline/mine.mjs <subjectId>
 *   → writes packages/content-neurons-tw/scripts/handout-pipeline/packets/<subjectId>.packets.json
 *
 * A packet = { regionId, title, targetDepth, leaves[], questionIds[], questions[], poolSize }.
 * Leaves are breadth-desc (high-yield first); questions are ordered by their leaves' max breadth.
 * Union pools MAY exceed the subject total (multi-tag questions land in every region they touch).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const subjectId = process.argv[2]
if (!subjectId) {
  console.error('✗ usage: node mine.mjs <subjectId>  (e.g. 組織學)')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..', '..') // packages/content-neurons-tw
const DIST = join(PKG, 'dist')
const OUT_DIR = join(__dirname, 'packets')

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const config = loadJson(join(PKG, `${subjectId}.config.json`))
const rec = loadJson(join(DIST, 'concept-recurrence.json'))
const tags = loadJson(join(DIST, 'concept-tags.json')) // qid -> leafId[]
const questions = loadJson(join(DIST, 'questions.json')).filter((q) => q.subject === subjectId)

// leaf -> canonical meta (zh / breadth / tier) and leaf -> qids inversion
const leafMeta = new Map(rec.concepts.filter((c) => c.subjectId === subjectId).map((c) => [c.leafId, c]))
const leafToQids = new Map()
for (const [qid, leaves] of Object.entries(tags)) {
  for (const l of leaves) (leafToQids.get(l) ?? leafToQids.set(l, []).get(l)).push(qid)
}
const qById = new Map(questions.map((q) => [q.id, q]))

const packets = config.map((region) => {
  const leaves = region.leafIds
    .map((leafId) => {
      const m = leafMeta.get(leafId)
      if (!m) {
        console.error(`✗ mine: ${subjectId}/${region.regionId} leaf "${leafId}" not in concept-recurrence`)
        process.exit(1)
      }
      return { leafId, zh: m.zh, en: m.en, breadth: m.breadth, tier: m.tier, questionCount: m.questionCount }
    })
    .sort((a, b) => b.breadth - a.breadth)

  // Union pool: every question tagged to any of this region's leaves. Dedup, then order by the
  // max breadth among the question's in-region leaves (high-yield first), then id for stability.
  const inRegion = new Set(region.leafIds)
  const qidWeight = new Map()
  for (const leafId of region.leafIds) {
    const w = leafMeta.get(leafId).breadth
    for (const qid of leafToQids.get(leafId) ?? []) {
      if (!qById.has(qid)) continue // guard: tag points at a qid outside this subject (shouldn't happen)
      qidWeight.set(qid, Math.max(qidWeight.get(qid) ?? 0, w))
    }
  }
  const questionIds = [...qidWeight.keys()].sort(
    (a, b) => qidWeight.get(b) - qidWeight.get(a) || a.localeCompare(b),
  )
  const pool = questionIds.map((id) => {
    const q = qById.get(id)
    return {
      id: q.id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      // which of THIS question's leaves fall in this region (helps the drafter focus)
      regionLeaves: (tags[q.id] ?? []).filter((l) => inRegion.has(l)),
      optionExplanations: q.optionExplanations ?? null,
      explanation: q.explanation ?? null,
    }
  })

  if (leaves.length === 0 || pool.length === 0) {
    console.error(`✗ mine: ${subjectId}/${region.regionId} resolved 0 leaves or 0 questions`)
    process.exit(1)
  }
  return {
    regionId: region.regionId,
    title: region.title,
    targetDepth: region.targetDepth,
    leaves,
    questionIds,
    questions: pool,
    poolSize: pool.length,
  }
})

mkdirSync(OUT_DIR, { recursive: true })
const outPath = join(OUT_DIR, `${subjectId}.packets.json`)
writeFileSync(outPath, JSON.stringify({ subjectId, builtAt: null, packets }, null, 2))
console.log(
  `✓ mined ${packets.length} region packets for ${subjectId} → ${outPath.replace(PKG + '/', '')}\n` +
    packets
      .map((p) => `  ${p.regionId.padEnd(28)} ${p.leaves.length} leaves / ${p.poolSize} Q`)
      .join('\n'),
)
