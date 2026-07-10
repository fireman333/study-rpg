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

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const FRAG_DIR = join(PKG, 'src', 'handout')
const DIST = join(PKG, 'dist')

// Display order + titles. Any fragment without an entry falls back to `${id} 考前講義`.
const SUBJECT_META: Record<string, { order: number; title: string }> = {
  解剖學: { order: 0, title: '解剖學 考前講義' },
}

// ── Per-chapter quiz plan ─────────────────────────────────────────────────────────────────
// The authored handout splits a subject into `.hdt-region` sections, but exam questions are
// tagged at the canonical blueprint-chapter granularity (concept-recurrence.json `chapters[]`).
// 解剖學 has 8 regions but only 4 blueprint chapters, so several regions share a chapter. To avoid
// attaching an identical question pool to multiple region headers, we emit ONE quiz entry per
// blueprint chapter, anchored to that chapter's LAST region (its natural "章末" stopping point).
// Regions not listed here (e.g. hdt-overview) render no CTA. leafIds/sourceQuestionIds are derived
// at build time from the already-built concept maps — no LLM, no network, no headless browser.
const CHAPTER_QUIZ_PLAN: Record<string, { regionId: string; chapterId: string }[]> = {
  解剖學: [
    { regionId: 'hdt-neuro-brainstem', chapterId: 'neuroanatomy' },
    { regionId: 'hdt-head-neck', chapterId: 'head-and-neck' },
    { regionId: 'hdt-pelvis-perineum', chapterId: 'chest-abdomen-pelvis' },
    { regionId: 'hdt-extremities', chapterId: 'upper-lower-extremities' },
  ],
}

interface ConceptRecurrence {
  chapters: { subjectId: string; chapterId: string }[]
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
  const plan = CHAPTER_QUIZ_PLAN[subjectId]
  if (!plan) return undefined

  const regionIds = new Set([...html.matchAll(/<section class="hdt-region" id="([^"]+)"/g)].map((m) => m[1]))
  const chapterIds = new Set(rec.chapters.filter((c) => c.subjectId === subjectId).map((c) => c.chapterId))
  const leavesByChapter = new Map<string, string[]>()
  for (const c of rec.concepts) {
    if (c.subjectId !== subjectId) continue
    ;(leavesByChapter.get(c.chapterId) ?? leavesByChapter.set(c.chapterId, []).get(c.chapterId)!).push(c.leafId)
  }

  return plan.map(({ regionId, chapterId }) => {
    if (!regionIds.has(regionId)) {
      console.error(`✗ chapterQuiz plan: ${subjectId}.html has no region id="${regionId}"`)
      process.exit(1)
    }
    if (!chapterIds.has(chapterId)) {
      console.error(`✗ chapterQuiz plan: unknown chapterId "${chapterId}" for ${subjectId} (concept-recurrence drift?)`)
      process.exit(1)
    }
    const leafIds = leavesByChapter.get(chapterId) ?? []
    const sourceQuestionIds = [...new Set(leafIds.flatMap((l) => leafToQids.get(l) ?? []))]
    if (leafIds.length === 0 || sourceQuestionIds.length === 0) {
      console.error(`✗ chapterQuiz plan: ${subjectId}/${chapterId} resolved 0 leaves or 0 questions`)
      process.exit(1)
    }
    return { regionId, leafIds, sourceQuestionIds }
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

const subjects: HandoutSubject[] = fragFiles
  .map((f) => {
    const subjectId = basename(f, '.html')
    const html = readFileSync(join(FRAG_DIR, f), 'utf8').trim()
    lint(subjectId, html)
    const meta = SUBJECT_META[subjectId]
    const chapterQuizzes = buildChapterQuizzes(subjectId, html, rec, leafToQids)
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
