/**
 * verify-handout — regression coverage for the region-keyed 考前講義 contract
 * (add-neurons-histology-handout). Two layers:
 *
 *   1. Guard fixtures — call the pure `buildRegionKeyedQuizzes` with synthetic inputs and assert the
 *      happy path (single-region entries + union-cover pools) and that EACH contract violation throws.
 *      Self-contained (no corpus), so it protects the template for 胚胎/病理/藥理 too.
 *   2. Built-output check — assert dist/handout.json: 組織學 = 7 single-region entries with non-empty
 *      pools, and 解剖學 still carries a multi-region entry (legacy chapter-keyed / signpost path alive).
 *   3. Latest-sitting teaching coverage — every question of the most recently ingested sitting SHALL have
 *      its primary tagged concept land in a handout topic that cites that sitting. Ingesting a sitting and
 *      leaving the 考前講義 silent about it is the failure this catches: the corpus grows, every other gate
 *      stays green, and the 講義 quietly stops covering what the newest paper actually asked.
 *
 *   pnpm --filter @study-rpg/content-neurons-tw verify:handout   (run after build:handout)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { buildRegionKeyedQuizzes, type RegionConfig } from '../src/handout/build-region-quizzes'
import type { HandoutData } from '../src/handout/handout-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const failures: string[] = []

// ── Layer 1: guard fixtures (synthetic, corpus-free) ──────────────────────────────────────────
const canonical = new Set(['a', 'b', 'c', 'd'])
const htmlRegionIds = ['hdt-x', 'hdt-y']
// q2 is tagged to leaf 'a' (region hdt-x) AND leaf 'c' (region hdt-y) → it lands in BOTH pools (cover).
const leafToQids = new Map<string, string[]>([
  ['a', ['q1', 'q2']],
  ['b', ['q2', 'q3']],
  ['c', ['q2', 'q4']],
  ['d', ['q5']],
])
const validConfig: RegionConfig[] = [
  { regionId: 'hdt-x', title: 'X 區', leafIds: ['a', 'b'], targetDepth: 'full' },
  { regionId: 'hdt-y', title: 'Y 區', leafIds: ['c', 'd'], targetDepth: 'brief' },
]

function expectThrows(name: string, fn: () => unknown, expectSubstr: string): void {
  try {
    fn()
    failures.push(`guard "${name}" did NOT throw (expected: ${expectSubstr})`)
  } catch (e) {
    const msg = (e as Error).message
    if (!msg.includes(expectSubstr)) failures.push(`guard "${name}" threw wrong message: "${msg}" (expected substring: ${expectSubstr})`)
  }
}

// happy path
try {
  const entries = buildRegionKeyedQuizzes('組織學', validConfig, canonical, htmlRegionIds, leafToQids)
  if (entries.length !== 2) failures.push(`happy path: expected 2 entries, got ${entries.length}`)
  if (!entries.every((e) => e.memberRegionIds.length === 1)) failures.push('happy path: an entry is not single-region (region-keyed)')
  const x = entries.find((e) => e.regionId === 'hdt-x')!
  const y = entries.find((e) => e.regionId === 'hdt-y')!
  // cover overlap: q2 must appear in BOTH pools (tagged to leaves in different regions)
  if (!x.sourceQuestionIds!.includes('q2') || !y.sourceQuestionIds!.includes('q2'))
    failures.push('cover semantics: q2 (multi-region leaf tags) should appear in both region pools')
  if (x.label !== 'X 區') failures.push('happy path: label should come from config title')
} catch (e) {
  failures.push(`happy path threw unexpectedly: ${(e as Error).message}`)
}

expectThrows('leaf-not-canonical', () =>
  buildRegionKeyedQuizzes('組織學', [{ regionId: 'hdt-x', title: 'X', leafIds: ['a', 'z'], targetDepth: 'full' }, { regionId: 'hdt-y', title: 'Y', leafIds: ['b', 'c', 'd'], targetDepth: 'full' }], canonical, htmlRegionIds, leafToQids), 'not in concept-recurrence')
expectThrows('leaf-shared', () =>
  buildRegionKeyedQuizzes('組織學', [{ regionId: 'hdt-x', title: 'X', leafIds: ['a', 'b'], targetDepth: 'full' }, { regionId: 'hdt-y', title: 'Y', leafIds: ['a', 'c', 'd'], targetDepth: 'full' }], canonical, htmlRegionIds, leafToQids), 'assigned to >1 region')
expectThrows('leaf-unassigned', () =>
  buildRegionKeyedQuizzes('組織學', [{ regionId: 'hdt-x', title: 'X', leafIds: ['a', 'b'], targetDepth: 'full' }, { regionId: 'hdt-y', title: 'Y', leafIds: ['c'], targetDepth: 'full' }], canonical, htmlRegionIds, leafToQids), 'unassigned to any region')
expectThrows('bad-targetDepth', () =>
  buildRegionKeyedQuizzes('組織學', [{ regionId: 'hdt-x', title: 'X', leafIds: ['a', 'b'], targetDepth: 'deep' as 'full' }, { regionId: 'hdt-y', title: 'Y', leafIds: ['c', 'd'], targetDepth: 'full' }], canonical, htmlRegionIds, leafToQids), "not 'full' | 'brief'")
expectThrows('config-region-not-in-html', () =>
  buildRegionKeyedQuizzes('組織學', [{ regionId: 'hdt-x', title: 'X', leafIds: ['a', 'b'], targetDepth: 'full' }, { regionId: 'hdt-z', title: 'Z', leafIds: ['c', 'd'], targetDepth: 'full' }], canonical, htmlRegionIds, leafToQids), 'has no HTML .hdt-region')
expectThrows('html-region-not-in-config', () =>
  buildRegionKeyedQuizzes('組織學', validConfig, canonical, ['hdt-x', 'hdt-y', 'hdt-extra'], leafToQids), 'has no config entry')
expectThrows('zero-question-region', () =>
  buildRegionKeyedQuizzes('組織學', [{ regionId: 'hdt-x', title: 'X', leafIds: ['a', 'b', 'c'], targetDepth: 'full' }, { regionId: 'hdt-y', title: 'Y', leafIds: ['d'], targetDepth: 'full' }], canonical, htmlRegionIds, new Map([['a', ['q1']], ['b', ['q2']], ['c', ['q3']]])), 'resolved 0 leaves or 0 questions')

// ── Layer 2: built-output check ───────────────────────────────────────────────────────────────
const distPath = join(DIST, 'handout.json')
if (!existsSync(distPath)) {
  failures.push('dist/handout.json missing — run build:handout before verify:handout')
} else {
  const data = JSON.parse(readFileSync(distPath, 'utf8')) as HandoutData
  const hist = data.subjects.find((s) => s.subjectId === '組織學')
  const anat = data.subjects.find((s) => s.subjectId === '解剖學')
  if (!hist) failures.push('dist: 組織學 subject missing')
  else {
    const q = hist.chapterQuizzes ?? []
    if (q.length !== 7) failures.push(`dist: 組織學 expected 7 region quizzes, got ${q.length}`)
    if (!q.every((e) => e.memberRegionIds.length === 1)) failures.push('dist: a 組織學 entry is not single-region')
    if (!q.every((e) => (e.sourceQuestionIds?.length ?? 0) > 0)) failures.push('dist: a 組織學 region has an empty question pool')
  }
  if (!anat) failures.push('dist: 解剖學 subject missing')
  else {
    const q = anat.chapterQuizzes ?? []
    if (!q.some((e) => e.memberRegionIds.length > 1))
      failures.push('dist: 解剖學 has no multi-region entry — legacy chapter-keyed / signpost path may have regressed')
  }
  const embryo = data.subjects.find((s) => s.subjectId === '胚胎學')
  if (!embryo) failures.push('dist: 胚胎學 subject missing')
  else {
    const q = embryo.chapterQuizzes ?? []
    if (q.length !== 4) failures.push(`dist: 胚胎學 expected 4 region quizzes, got ${q.length}`)
    if (!q.every((e) => e.memberRegionIds.length === 1)) failures.push('dist: a 胚胎學 entry is not single-region')
    if (!q.every((e) => (e.sourceQuestionIds?.length ?? 0) > 0)) failures.push('dist: a 胚胎學 region has an empty question pool')
  }

  // Newly-built region-keyed subjects (mirror the 組織學/胚胎學 guard): present + one single-region
  // 區測驗 per content region + non-empty pools.
  const REGION_KEYED_SUBJECTS: { id: string; regionCount: number }[] = [
    { id: '生理學', regionCount: 12 },
    { id: '藥理學', regionCount: 17 },
    { id: '病理學', regionCount: 14 },
    { id: '寄生蟲學', regionCount: 6 },
    { id: '微生物學', regionCount: 10 },
    { id: '生物化學', regionCount: 13 },
    { id: '公共衛生學', regionCount: 8 },
    { id: '免疫學', regionCount: 7 },
  ]
  for (const { id, regionCount } of REGION_KEYED_SUBJECTS) {
    const subject = data.subjects.find((s) => s.subjectId === id)
    if (!subject) {
      failures.push(`dist: ${id} subject missing`)
      continue
    }
    const q = subject.chapterQuizzes ?? []
    if (q.length !== regionCount) failures.push(`dist: ${id} expected ${regionCount} region quizzes, got ${q.length}`)
    if (!q.every((e) => e.memberRegionIds.length === 1)) failures.push(`dist: a ${id} entry is not single-region`)
    if (!q.every((e) => (e.sourceQuestionIds?.length ?? 0) > 0)) failures.push(`dist: a ${id} region has an empty question pool`)
  }
}

// ── Layer 3: latest-sitting teaching coverage ─────────────────────────────────────────────────
// The handout is a corpus derivative. When a new sitting is ingested, the 考前講義 has to say something
// about what it asked — otherwise the newest paper is exactly the part a 考前 reader is least prepared
// for. This asserts, per question of the latest sitting, that the handout topic owning its primary
// tagged concept cites that sitting (e.g. <cite>115-2</cite>, or a compound cite like 104/115-2).
const PKG = join(__dirname, '..')
const HANDOUT_SRC = join(PKG, 'src', 'handout')
interface CorpusQ { id: string; subject: string; meta: { year: number; session: number } }

const corpusPath = join(PKG, 'dist', 'questions.json')
const tagsPath = join(PKG, 'dist', 'concept-tags.json')
if (!existsSync(corpusPath) || !existsSync(tagsPath)) {
  failures.push('dist/questions.json or dist/concept-tags.json missing — run the content build before verify:handout')
} else {
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusQ[]
  const tags = JSON.parse(readFileSync(tagsPath, 'utf8')) as Record<string, string[]>

  // Latest sitting = max (year, session) present in the corpus.
  let latest = { year: 0, session: 0 }
  for (const q of corpus) {
    if (q.meta.year > latest.year || (q.meta.year === latest.year && q.meta.session > latest.session)) {
      latest = { year: q.meta.year, session: q.meta.session }
    }
  }
  const sitting = `${latest.year}-${latest.session}`

  // leafId → { cites } per subject, parsed from the committed HTML fragments (the authored source of truth).
  const topicCites: Record<string, Set<string>> = {} // `${subjectId}::${leafId}` → cite strings of that topic
  for (const file of readdirSync(HANDOUT_SRC).filter((f) => f.endsWith('.html'))) {
    const sid = basename(file, '.html')
    const html = readFileSync(join(HANDOUT_SRC, file), 'utf8')
    const topicRe = /<div class="hdt-topic" data-leaf-ids="([^"]*)">([\s\S]*?)\n  <\/div>/g
    let m: RegExpExecArray | null
    while ((m = topicRe.exec(html)) !== null) {
      const cites = new Set((m[2].match(/<cite>([^<]*)<\/cite>/g) ?? []).map((c) => c.replace(/<\/?cite>/g, '')))
      for (const leaf of m[1].split(/\s+/).filter(Boolean)) topicCites[`${sid}::${leaf}`] = cites
    }
  }

  const uncovered: string[] = []
  const unmapped: string[] = []
  let checked = 0
  for (const q of corpus) {
    if (q.meta.year !== latest.year || q.meta.session !== latest.session) continue
    const primary = (tags[q.id] ?? [])[0]
    if (!primary) continue // untagged questions are the concept-tag gate's business, not this one
    const key = `${q.subject}::${primary}`
    const cites = topicCites[key]
    if (!cites) {
      unmapped.push(`${q.id} (leaf ${primary} has no handout topic in ${q.subject})`)
      continue
    }
    checked += 1
    if (![...cites].some((c) => c.split('/').includes(sitting))) uncovered.push(`${q.id} → ${key}`)
  }
  console.log(`latest sitting ${sitting}: ${checked} question(s) checked, ${uncovered.length} uncovered, ${unmapped.length} unmapped`)
  for (const u of unmapped.slice(0, 10)) failures.push(`LATEST_SITTING_UNMAPPED: ${u}`)
  for (const u of uncovered.slice(0, 20)) failures.push(`LATEST_SITTING_UNCOVERED: ${u} — no <cite> naming ${sitting}`)
  if (uncovered.length > 20) failures.push(`LATEST_SITTING_UNCOVERED: …+${uncovered.length - 20} more`)
}

// ── Report ──
console.log('=== verify-handout ===')
console.log('guard fixtures: 7 violations + happy path (cover overlap) exercised')
console.log('built output: 組織學 + 胚胎學 region-keyed + 解剖學 chapter-keyed checked')
if (failures.length > 0) {
  console.error(`\nFAIL (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nPASS')
