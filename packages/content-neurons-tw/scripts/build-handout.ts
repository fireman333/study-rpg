/**
 * Build dist/handout.json for the 考前講義(beta) scene (add-neurons-anatomy-handout).
 *
 * Deterministic: read every committed HTML fragment under src/handout/*.html, wrap each
 * into a HandoutSubject, emit dist/handout.json. NO LLM / fan-out / headless Chromium at
 * build time — the teaching content is a static committed artifact (CI-safe, like cram.json).
 *
 * beta: only 解剖學.html exists → subjects has one entry. Adding another subject = drop a new
 * <subjectId>.html fragment; no code change.
 *
 * HONESTY lint: reject prediction-guarantee slang (mirrors verify-cram's ban).
 *
 *   pnpm --filter @study-rpg/content-neurons-tw build:handout
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import type { HandoutData, HandoutSubject, HandoutChapterQuiz } from '../src/handout/handout-types'
import { buildRegionKeyedQuizzes, type RegionConfig } from '../src/handout/build-region-quizzes'
import { injectLeafAnchors, type LeafAnchorResult } from '../src/handout/leaf-anchor-gate'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const FRAG_DIR = join(PKG, 'src', 'handout')
const DIST = join(PKG, 'dist')

// Display order + titles. Any fragment without an entry falls back to `${id} 考前講義`.
const SUBJECT_META: Record<string, { order: number; title: string }> = {
  解剖學: { order: 0, title: '解剖學 考前講義' },
  組織學: { order: 1, title: '組織學 考前講義' },
  胚胎學: { order: 2, title: '胚胎學 考前講義' },
  生理學: { order: 3, title: '生理學 考前講義' },
  藥理學: { order: 4, title: '藥理學 考前講義' },
  病理學: { order: 5, title: '病理學 考前講義' },
  寄生蟲學: { order: 6, title: '寄生蟲學 考前講義' },
  微生物學: { order: 7, title: '微生物學 考前講義' },
  生物化學: { order: 8, title: '生物化學 考前講義' },
  公共衛生學: { order: 9, title: '公共衛生學 考前講義' },
  免疫學: { order: 10, title: '免疫學 考前講義' },
}

// ── Region → blueprint-chapter map ────────────────────────────────────────────────────────
// The authored handout splits a subject into `.hdt-region` sections, but exam questions are
// tagged at the canonical blueprint-chapter granularity (concept-recurrence.json `chapters[]`).
// 解剖學 has 8 regions but only 4 blueprint chapters, so several regions share a chapter. We emit
// ONE quiz entry per blueprint chapter, anchored to that chapter's LAST region (its natural "章末"
// stopping point); the earlier member regions render a signpost pointing to it. Regions absent from
// this map (e.g. hdt-overview) get neither a CTA nor a signpost. leafIds/sourceQuestionIds are
// derived at build time from the already-built concept maps — no LLM, no network, no headless browser.
//
// @deprecated legacy chapter-keyed path. NEW subjects use `<subjectId>.config.json` (region-keyed,
// one 測驗本區 per content region) — do NOT add entries here; see buildRegionKeyedQuizzes.
const REGION_TO_CHAPTER: Record<string, Record<string, string>> = {
  解剖學: {
    'hdt-neuro-central': 'neuroanatomy',
    'hdt-neuro-brainstem': 'neuroanatomy',
    'hdt-head-neck': 'head-and-neck',
    'hdt-thorax': 'chest-abdomen-pelvis',
    'hdt-abdomen': 'chest-abdomen-pelvis',
    'hdt-pelvis-perineum': 'chest-abdomen-pelvis',
    'hdt-extremities': 'upper-lower-extremities',
  },
}

interface ConceptRecurrence {
  chapters: { subjectId: string; chapterId: string; zh: string }[]
  concepts: { subjectId: string; chapterId: string; leafId: string }[]
}

/** Load a required dist JSON, failing loudly (No Silent Errors) if the upstream build step is missing. */
function loadDist<T>(name: string): T {
  const p = join(DIST, name)
  if (!existsSync(p)) {
    console.error(`✗ ${name} not found in dist/ — run the concept-map build steps before build:handout`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

/**
 * Thin build wrapper around the pure `buildRegionKeyedQuizzes`: reads the region config + derives the
 * canonical leaf set and HTML region ids, then converts any thrown contract violation into a loud
 * `process.exit(1)` (mirroring the chapter-keyed guards). The pure logic lives in
 * src/handout/build-region-quizzes.ts so the region-config contract is unit-testable (verify-handout).
 */
function regionKeyedQuizzesFromConfig(
  subjectId: string,
  html: string,
  rec: ConceptRecurrence,
  leafToQids: Map<string, string[]>,
  configPath: string,
): HandoutChapterQuiz[] {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as RegionConfig[]
  const canonicalLeaves = new Set(rec.concepts.filter((c) => c.subjectId === subjectId).map((c) => c.leafId))
  const htmlRegionIds = [...html.matchAll(/<section class="hdt-region" id="([^"]+)"/g)].map((m) => m[1])
  try {
    return buildRegionKeyedQuizzes(subjectId, config, canonicalLeaves, htmlRegionIds, leafToQids)
  } catch (e) {
    console.error(`✗ regionQuiz: ${(e as Error).message}`)
    process.exit(1)
  }
}

/**
 * Canonical (region-bearing) leaf set for a subject — the leaf-anchor gate's validation domain.
 * Pluggable seam: config-keyed subjects (the 10 with a `<subjectId>.config.json`) take the union of
 * their config leafIds (each is region-bearing by the region-keyed partition contract); the legacy
 * chapter-keyed 解剖學 (no config) derives its set from concept-recurrence — all of its leaves map to
 * a REGION_TO_CHAPTER chapter, so they are all region-bearing. Add a new adapter branch here (not in
 * the gate) if a future subject uses neither shape.
 */
function canonicalLeavesForSubject(subjectId: string, rec: ConceptRecurrence): Set<string> {
  const configPath = join(PKG, `${subjectId}.config.json`)
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as RegionConfig[]
    return new Set(config.flatMap((r) => r.leafIds))
  }
  return new Set(rec.concepts.filter((c) => c.subjectId === subjectId).map((c) => c.leafId))
}

/**
 * Thin build wrapper around the pure `injectLeafAnchors`: converts a contract violation (unknown leaf
 * token / duplicate primary anchor) into a loud `process.exit(1)`, mirroring the region-drift guards.
 * The pure logic lives in src/handout/leaf-anchor-gate.ts so it is unit-testable.
 */
function gateLeafAnchors(subjectId: string, html: string, canonicalLeaves: Set<string>): LeafAnchorResult {
  try {
    return injectLeafAnchors(subjectId, html, canonicalLeaves)
  } catch (e) {
    console.error(`✗ leaf-anchor gate: ${(e as Error).message}`)
    process.exit(1)
  }
}

/**
 * Derive the chapterQuizzes for one subject from the concept maps. Returns undefined when the
 * subject has no quiz plan. Fails loudly on drift (region absent from HTML, unknown chapterId,
 * or a mapped chapter with zero leaves / questions) so a corpus rename can't silently ship an
 * empty「測驗本章」pool.
 */
function buildChapterQuizzes(
  subjectId: string,
  html: string,
  rec: ConceptRecurrence,
  leafToQids: Map<string, string[]>,
): HandoutChapterQuiz[] | undefined {
  // Region-keyed path (subjects with a `<subjectId>.config.json`, e.g. 組織學): one quiz per content
  // region. Additive — falls through to the legacy chapter-keyed path below when no config exists.
  const configPath = join(PKG, `${subjectId}.config.json`)
  if (existsSync(configPath)) return regionKeyedQuizzesFromConfig(subjectId, html, rec, leafToQids, configPath)

  const regionChapters = REGION_TO_CHAPTER[subjectId]
  if (!regionChapters) return undefined

  const subjectChapters = rec.chapters.filter((c) => c.subjectId === subjectId)
  const chapterIds = new Set(subjectChapters.map((c) => c.chapterId))
  const chapterZh = new Map(subjectChapters.map((c) => [c.chapterId, c.zh]))
  const leavesByChapter = new Map<string, string[]>()
  for (const c of rec.concepts) {
    if (c.subjectId !== subjectId) continue
    ;(leavesByChapter.get(c.chapterId) ?? leavesByChapter.set(c.chapterId, []).get(c.chapterId)!).push(c.leafId)
  }

  // Group regions by blueprint chapter in document order (the last member becomes the CTA anchor).
  const orderedRegionIds = [...html.matchAll(/<section class="hdt-region" id="([^"]+)"/g)].map((m) => m[1])
  const groups = new Map<string, string[]>()
  for (const rid of orderedRegionIds) {
    const chapterId = regionChapters[rid]
    if (!chapterId) continue // e.g. hdt-overview — no quiz, no signpost
    if (!chapterIds.has(chapterId)) {
      console.error(`✗ chapterQuiz: unknown chapterId "${chapterId}" for ${subjectId}/${rid} (concept-recurrence drift?)`)
      process.exit(1)
    }
    ;(groups.get(chapterId) ?? groups.set(chapterId, []).get(chapterId)!).push(rid)
  }
  // Any region mapped in REGION_TO_CHAPTER but absent from the HTML is a drift error.
  for (const rid of Object.keys(regionChapters)) {
    if (!orderedRegionIds.includes(rid)) {
      console.error(`✗ chapterQuiz: ${subjectId}.html has no region id="${rid}" (REGION_TO_CHAPTER drift?)`)
      process.exit(1)
    }
  }

  return [...groups.entries()].map(([chapterId, memberRegionIds]) => {
    const leafIds = leavesByChapter.get(chapterId) ?? []
    const sourceQuestionIds = [...new Set(leafIds.flatMap((l) => leafToQids.get(l) ?? []))]
    if (leafIds.length === 0 || sourceQuestionIds.length === 0) {
      console.error(`✗ chapterQuiz: ${subjectId}/${chapterId} resolved 0 leaves or 0 questions`)
      process.exit(1)
    }
    return {
      regionId: memberRegionIds[memberRegionIds.length - 1], // CTA anchors to the chapter's last region
      label: chapterZh.get(chapterId) ?? chapterId,
      memberRegionIds,
      leafIds,
      sourceQuestionIds,
    }
  })
}

// Honesty invariant: no hit-rate / guarantee language (same ban as cram's verify).
const BANNED = ['命中率', '保證會考', '保證命中', '必中', '必考', '今年一定考', '100%命中', '包中']

function lint(subjectId: string, html: string): void {
  const hits = BANNED.filter((w) => html.includes(w))
  if (hits.length) {
    console.error(`✗ honesty lint: ${subjectId}.html contains banned prediction slang: ${hits.join(', ')}`)
    process.exit(1)
  }
}

if (!existsSync(FRAG_DIR)) {
  console.error(`✗ handout fragments dir not found: ${FRAG_DIR}`)
  process.exit(1)
}

const fragFiles = readdirSync(FRAG_DIR).filter((f) => f.endsWith('.html'))
if (fragFiles.length === 0) {
  console.error(`✗ no handout fragments in ${FRAG_DIR} (expected e.g. 解剖學.html)`)
  process.exit(1)
}

// Concept maps for the per-chapter quiz CTAs (built by earlier content-pack steps).
const rec = loadDist<ConceptRecurrence>('concept-recurrence.json')
const conceptTags = loadDist<Record<string, string[]>>('concept-tags.json') // qid -> leafId[]
const leafToQids = new Map<string, string[]>()
for (const [qid, leaves] of Object.entries(conceptTags)) {
  for (const leaf of leaves) {
    ;(leafToQids.get(leaf) ?? leafToQids.set(leaf, []).get(leaf)!).push(qid)
  }
}
// qid → home subject, so each subject's 區測驗 pool can be scoped to its own questions. A few leaves
// straddle two subjects' domains (e.g. 細胞膜運輸 spans 生理學/生物化學); without this, the global
// leafToQids would leak the other subject's questions into this handout's pool. Mirrors mine.mjs.
const qSubject = new Map(loadDist<{ id: string; subject: string }[]>('questions.json').map((q) => [q.id, q.subject]))

const coverageReport: { subjectId: string; anchored: number; total: number }[] = []
const subjects: HandoutSubject[] = fragFiles
  .map((f) => {
    const subjectId = basename(f, '.html')
    const rawHtml = readFileSync(join(FRAG_DIR, f), 'utf8').trim()
    lint(subjectId, rawHtml)
    // Leaf-anchor gate (INDEPENDENT of the region drift check): validate `data-leaf-ids` tokens +
    // inject stable topic ids. The transformed html (ids added, data-leaf-ids passed through) is what
    // ships in handout.json and drives the (subject, leaf) resolver.
    const canonicalLeaves = canonicalLeavesForSubject(subjectId, rec)
    const gated = gateLeafAnchors(subjectId, rawHtml, canonicalLeaves)
    const html = gated.html
    coverageReport.push({ subjectId, anchored: gated.anchoredLeaves.length, total: gated.totalLeaves })
    const meta = SUBJECT_META[subjectId]
    // Scope the pool to this subject's own questions (no-op for subjects whose leaves don't overlap
    // another subject's domain; trims the 生理學↔生物化學 cross-domain leak on 細胞膜 leaves).
    const subjectLeafToQids = new Map(
      [...leafToQids].map(([leaf, qids]): [string, string[]] => [leaf, qids.filter((qid) => qSubject.get(qid) === subjectId)]),
    )
    const chapterQuizzes = buildChapterQuizzes(subjectId, html, rec, subjectLeafToQids)
    return { subjectId, title: meta?.title ?? `${subjectId} 考前講義`, html, chapterQuizzes, _order: meta?.order ?? 99 }
  })
  .sort((a, b) => a._order - b._order)
  .map(({ _order, ...s }) => s)

const data: HandoutData = {
  version: 1,
  builtAt: new Date().toISOString(),
  subjects,
}

mkdirSync(DIST, { recursive: true })
writeFileSync(join(DIST, 'handout.json'), JSON.stringify(data, null, 2))
console.log(
  `✓ Built dist/handout.json — ${subjects.length} subject(s): ${subjects
    .map((s) => `${s.subjectId} (${(s.html.length / 1024).toFixed(0)}KB, ${s.chapterQuizzes?.length ?? 0} 章測驗)`)
    .join(', ')}`,
)
// Leaf-anchor coverage (anchored primary / region-bearing leaves). NEVER a fail — a leaf with no
// primary topic anchor degrades to region-level resolution; the number just makes the gap visible.
console.log('  leaf-anchor coverage (anchored primary / region-bearing leaves):')
for (const c of [...coverageReport].sort((a, b) => a.subjectId.localeCompare(b.subjectId))) {
  const pct = c.total > 0 ? Math.round((c.anchored / c.total) * 100) : 0
  console.log(`    ${c.subjectId}: ${c.anchored}/${c.total} (${pct}%)`)
}
