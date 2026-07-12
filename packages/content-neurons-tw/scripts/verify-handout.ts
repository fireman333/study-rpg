/**
 * verify-handout — regression coverage for the region-keyed 考前講義 contract
 * (add-neurons-histology-handout). Two layers:
 *
 *   1. Guard fixtures — call the pure `buildRegionKeyedQuizzes` with synthetic inputs and assert the
 *      happy path (single-region entries + union-cover pools) and that EACH contract violation throws.
 *      Self-contained (no corpus), so it protects the template for 胚胎/病理/藥理 too.
 *   2. Built-output check — assert dist/handout.json: 組織學 = 7 single-region entries with non-empty
 *      pools, and 解剖學 still carries a multi-region entry (legacy chapter-keyed / signpost path alive).
 *
 *   pnpm --filter @study-rpg/content-neurons-tw verify:handout   (run after build:handout)
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
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
