/**
 * Build script: generates content-neurons-tw dist artifacts from
 * medexam-tw JSON + re-splits 微生物暨免疫學 → 微生物學 + 免疫學 via
 * source markdown per-Q `**科目**：` tag lookup.
 *
 * Per design.md Decision 1 (11-subject mapping) + Decision 4 (build pipeline).
 * Spec: openspec/changes/wire-neurons-content-and-theme/specs/neurons-mode/spec.md
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { NEURONS_ACHIEVEMENTS, NEURONS_ACHIEVEMENTS_STATS } from '../src/achievements'
import { validateNeuronsAchievementCatalog } from '../src/achievement-validator'
import { FAMILY_NT_BRANCH, FAMILY_COLOR, type NtBranchId } from '../src/families'

// 一階 corpus source = 考選部-authoritative reconciled artifacts committed under
// packages/content-neurons-tw/data/medexam-reconciled (see reconcile/README.md).
// Self-contained so the neurons build survives the planned removal of
// apps/medexam-tw / packages/content-medexam-tw. Override with MEDEXAM_TW_DIST.
const MEDEXAM_TW_DIST =
  process.env.MEDEXAM_TW_DIST ?? resolve(import.meta.dirname, '..', 'data', 'medexam-reconciled')
const MEDEXAM_SOURCE_ROOT =
  process.env.MEDEXAM_SOURCE_ROOT ??
  resolve(process.env.HOME ?? '/', 'Desktop/國考/一階國考/陽明國考考古/_extracted')
const ALLOW_SKIPS = process.env.MEDEXAM_ALLOW_SKIPS === '1'
const OUT_DIR = resolve(import.meta.dirname, '..', 'dist')
// Question figures committed alongside the content pack. Presence of
// `figures/<question-id>.png` is the source of truth for a question's figure:
// the build sets imagePath + forces hasImage. See add-neurons-question-figures design D1/D3.
const FIGURES_DIR = resolve(import.meta.dirname, '..', 'figures')
// Questions whose upstream `hasImage` flag is a false positive (flagged by the
// unreliable `**有附圖**：是` source marker, but the stem references no figure).
// Forced to hasImage:false so they show neither a figure nor a [圖] placeholder.
const FALSE_POSITIVE_HASIMAGE = new Set<string>(['111-2-醫學一-生理學-Q57'])

interface FamilyMap {
  family: string
  persona: string
}

/**
 * 11-subject display mapping per design.md Decision 1 (family name + persona).
 * NT branch lives in the single canonical source `../src/families` →
 * `FAMILY_NT_BRANCH` (per add-neurons-per-branch-decor D2); the `group` /
 * `color` columns below derive from it, so build output never drifts from the
 * runtime branch map. Key = subject.id (verbatim from medexam-tw for 9; new ids
 * 微生物學 / 免疫學 for split).
 */
const FAMILY_BY_SUBJECT: Record<string, FamilyMap> = {
  藥理學: {
    family: 'VTA Dopaminergic — Thrill-Seeker',
    persona: 'The Thrill-Seeker 尋樂者',
  },
  公共衛生學: {
    family: 'SNc Dopaminergic — Aging Guardian',
    persona: 'The Aging Guardian 長者守護',
  },
  寄生蟲學: {
    family: "Enteric Serotonergic — Puppeteer's Puppet",
    persona: "The Puppeteer's Puppet 寄生木偶",
  },
  組織學: {
    family: 'MRN Serotonergic — Quiet Curator',
    persona: 'The Quiet Curator 沉默策展人',
  },
  生物化學: {
    family: 'Cerebellar Purkinje — Mathematician',
    persona: 'The Mathematician 數學家',
  },
  病理學: {
    family: 'Striatal MSN — Judge',
    persona: 'The Judge 法官',
  },
  免疫學: {
    family: 'PV+ Cortical Interneuron — Sentry Under Siege',
    persona: 'The Sentry Under Siege 圍城警衛',
  },
  解剖學: {
    family: 'DRG Sensory Afferent — Scout',
    persona: 'The Scout 探險家',
  },
  生理學: {
    family: 'Cortical Pyramidal L5 — CEO',
    persona: 'The CEO 執行長',
  },
  胚胎學: {
    family: 'Cajal-Retzius — Pioneer Architect',
    persona: 'The Pioneer Architect 拓荒建築師',
  },
  微生物學: {
    family: 'Olfactory Sensory — Sentinel',
    persona: 'The Sentinel 哨兵（前線守門員）',
  },
}

/** Split heuristic for 微生物暨免疫學 per design Decision 4. Order matters: 免疫 must come BEFORE 微生 because `微免` matches both. */
const TAG_TO_SUBJECT: Array<{ pattern: RegExp; subject: '微生物學' | '免疫學' }> = [
  { pattern: /免疫|微免/, subject: '免疫學' },
  { pattern: /微生物|微⽣物|微生|細菌|病毒|黴菌/, subject: '微生物學' },
]
const DEFAULT_MICROIMMUNE_FALLBACK: '微生物學' = '微生物學'

interface MedexamQuestion {
  id: string
  subject: string
  stem: string
  options: Record<string, string>
  answer: string
  explanation: string
  hasImage?: boolean
  imagePath?: string | null  // set by build when a figures/<id>.png exists (see FIGURES_DIR)
  hasOptionImages?: boolean
  microImmune?: '微生物學' | '免疫學'  // baked split (self-contained; no _extracted needed in CI)
  meta: { year: number; session: number; book: string; paper: string; qNumber: number; pageRef?: string }
  sourceCredit?: string
}

interface MedexamSubject {
  id: string
  displayName: string
  group?: string
  color: string
  iconKey?: string
  totalQuestions: number
}

interface MedexamMeta {
  id: string
  displayName: string
  locale: string
  builtAt: string
  sourceCredit: string
  sourceUrl: string
  license: string
  stats?: { totalQuestions?: number; parsedFiles?: number; totalFiles?: number; subjects?: number }
}

/** Cached file content for source .md lookups; avoid re-reading the same year/session file for every question. */
const fileCache = new Map<string, string | null>()

function lookupSourceTag(year: number, session: number, qNumber: number): string | null {
  const filePath = resolve(MEDEXAM_SOURCE_ROOT, '醫學二', '微生物暨免疫學', `${year}-${session}.md`)
  let content = fileCache.get(filePath) ?? null
  if (!fileCache.has(filePath)) {
    content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null
    fileCache.set(filePath, content)
  }
  if (content === null) return null
  const blockRegex = new RegExp(`^## Q${qNumber}\\b`, 'm')
  const blockStart = content.search(blockRegex)
  if (blockStart === -1) return null
  const afterStart = content.slice(blockStart)
  const nextBlockOffset = afterStart.slice(1).search(/^## Q\d+/m)
  const block = nextBlockOffset === -1 ? afterStart : afterStart.slice(0, nextBlockOffset + 1)
  const tagMatch = block.match(/\*\*科目\*\*[：:]\s*(.+?)\r?$/m)
  return tagMatch ? tagMatch[1].trim() : null
}

function classifyMicroImmune(q: MedexamQuestion): { subject: '微生物學' | '免疫學'; tagged: boolean } {
  // Prefer the split baked into the reconciled corpus (self-contained; no _extracted in CI).
  if (q.microImmune === '微生物學' || q.microImmune === '免疫學') {
    return { subject: q.microImmune, tagged: true }
  }
  // Legacy fallback: per-Q `**科目**：` tag in the source .md (needs _extracted; CI lacks it).
  const tag = lookupSourceTag(q.meta.year, q.meta.session, q.meta.qNumber)
  if (tag === null) {
    return { subject: DEFAULT_MICROIMMUNE_FALLBACK, tagged: false }
  }
  for (const { pattern, subject } of TAG_TO_SUBJECT) {
    if (pattern.test(tag)) return { subject, tagged: true }
  }
  return { subject: DEFAULT_MICROIMMUNE_FALLBACK, tagged: false }
}

/**
 * Normalize whitespace cruft left by the upstream PDF→text extraction in the
 * 陽明國考考古 explanations (fix-neurons-question-mislabels-and-explanation-
 * whitespace, 2026-06-12). SAFE SUBSET — only touches whitespace and stray bare
 * page-number lines; it never alters a content line (verified: 0 content lines
 * changed across the corpus). Vertical single-char-per-line runs (e.g.
 * 依\n栓\n塞) are intentionally left intact — auto-rejoining them risks merging
 * legitimately short lines, so they are handled separately.
 *
 *   - strip per-line trailing whitespace
 *   - drop isolated bare 2–3 digit page-number lines (e.g. the answer-key "82")
 *   - collapse runs of blank lines to a single blank line
 *   - trim leading/trailing blank lines
 */
function normalizeExplanation(ex: string): string {
  if (!ex) return ex
  const kept: string[] = []
  for (const line of ex.split('\n')) {
    if (/^\s*\d{2,3}\s*$/.test(line)) continue // bare page-number line
    kept.push(line.replace(/\s+$/, '')) // strip trailing whitespace
  }
  const collapsed: string[] = []
  let blank = false
  for (const line of kept) {
    if (line === '') {
      if (!blank) collapsed.push('')
      blank = true
    } else {
      collapsed.push(line)
      blank = false
    }
  }
  return collapsed.join('\n').trim()
}

function main(): void {
  // Step 1: Read medexam-tw artifacts
  const metaPath = resolve(MEDEXAM_TW_DIST, 'meta.json')
  const subjectsPath = resolve(MEDEXAM_TW_DIST, 'subjects.json')
  const questionsPath = resolve(MEDEXAM_TW_DIST, 'questions.json')
  for (const p of [metaPath, subjectsPath, questionsPath]) {
    if (!existsSync(p)) {
      console.error(`✗ Missing medexam-tw artifact: ${p}`)
      console.error(
        '  Run `pnpm build:content` (root) first to build medexam-tw, OR set MEDEXAM_TW_DIST env var.',
      )
      process.exit(1)
    }
  }
  const medexamMeta: MedexamMeta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  const medexamSubjects: MedexamSubject[] = JSON.parse(readFileSync(subjectsPath, 'utf-8'))
  const medexamQuestions: MedexamQuestion[] = JSON.parse(readFileSync(questionsPath, 'utf-8'))

  console.log(
    `Read medexam-tw: ${medexamSubjects.length} subjects, ${medexamQuestions.length} questions`,
  )

  // Figure wiring: load the committed figure files once. A question with a
  // matching figures/<id>.png gets imagePath + hasImage:true (figure existence
  // is authoritative). False-positive flags get hasImage:false. See design D3.
  const figureIds = new Set(
    existsSync(FIGURES_DIR)
      ? readdirSync(FIGURES_DIR)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.slice(0, -'.png'.length))
      : [],
  )
  let figuresWired = 0
  let flaggedNoFigure = 0
  function wireFigure<T extends MedexamQuestion>(q: T): T {
    // Clean upstream PDF-extraction whitespace cruft before output (every
    // question passes through here exactly once).
    const explanation = normalizeExplanation(q.explanation)
    if (FALSE_POSITIVE_HASIMAGE.has(q.id)) {
      return { ...q, explanation, hasImage: false, imagePath: null }
    }
    if (figureIds.has(q.id)) {
      figuresWired += 1
      return { ...q, explanation, hasImage: true, imagePath: `content/neurons-tw/figures/${q.id}.png` }
    }
    if (q.hasImage) flaggedNoFigure += 1
    return { ...q, explanation }
  }

  // Step 2 + 3: 直送 9 subjects verbatim + split 微生物暨免疫學 (+ figure wiring)
  let splitMicro = 0
  let splitImmune = 0
  let untaggedFallback = 0
  const outputQuestions = medexamQuestions.map((q) => {
    if (q.subject !== '微生物暨免疫學') return wireFigure(q)
    const { subject, tagged } = classifyMicroImmune(q)
    if (!tagged) untaggedFallback += 1
    if (subject === '微生物學') splitMicro += 1
    else splitImmune += 1
    const { microImmune: _drop, ...rest } = q // strip build-only hint from output
    return wireFigure({ ...rest, subject })
  })

  // Step 4: Generate subjects.json from FAMILY_BY_SUBJECT
  const subjectTotals: Record<string, number> = {}
  for (const q of outputQuestions) {
    subjectTotals[q.subject] = (subjectTotals[q.subject] ?? 0) + 1
  }
  const outputSubjects = Object.entries(FAMILY_BY_SUBJECT).map(([id, m]) => {
    const ntBranch = FAMILY_NT_BRANCH[id]
    if (!ntBranch) throw new Error(`No NT branch for subject "${id}" in FAMILY_NT_BRANCH`)
    const color = FAMILY_COLOR[id]
    if (!color) throw new Error(`No per-subject color for subject "${id}" in FAMILY_COLOR`)
    return {
      id,
      displayName: m.family,
      // `group` (NT branch) stays internal data for context-art / decor; it no
      // longer drives the player-facing accent color (decouple-neurons-subjects-
      // from-nt-branches) — each subject now carries its own distinct color.
      group: ntBranch,
      color,
      iconKey: `subject:${id}`,
      totalQuestions: subjectTotals[id] ?? 0,
    }
  })

  // Step 8: Assertions
  const orphanSubjects = outputSubjects.filter((s) => s.totalQuestions === 0)
  if (orphanSubjects.length > 0 && !ALLOW_SKIPS) {
    console.error(
      `✗ Orphan subjects (no questions): ${orphanSubjects.map((s) => s.id).join(', ')}`,
    )
    process.exit(1)
  }
  const validIds = new Set(outputSubjects.map((s) => s.id))
  const orphanQuestions = outputQuestions.filter((q) => !validIds.has(q.subject))
  if (orphanQuestions.length > 0) {
    console.error(
      `✗ Orphan questions (subject not in 11-subject framework): ${orphanQuestions.length}`,
    )
    console.error(`  Sample IDs: ${orphanQuestions.slice(0, 5).map((q) => q.id).join(', ')}`)
    process.exit(1)
  }

  // Step 5: Generate meta.json with statSchema
  const outputMeta = {
    id: 'neurons-tw',
    displayName: '神經元 RPG — Long-term Potentiation',
    locale: 'zh-TW',
    builtAt: new Date().toISOString(),
    sourceCredit: '陽明國考考古題小組 + 中華民國考選部歷屆考題 + neurons reskin',
    sourceUrl: 'https://sites.google.com/view/ymmedexam/ans',
    license: 'CC-BY-NC-4.0 (詳解) + public domain (試題) + AGPL-3.0-or-later (neurons reskin)',
    stats: {
      totalQuestions: outputQuestions.length,
      parsedFiles: medexamMeta.stats?.parsedFiles ?? 0,
      totalFiles: medexamMeta.stats?.totalFiles ?? 0,
      subjects: outputSubjects.length,
      splitMicro,
      splitImmune,
      untaggedFallback,
    },
    statSchema: {
      // Default stat keys (knowledge / reflex / memory / stamina) preserved
      // to remain compatible with core's hardcoded SkillBranchStatKey type.
      // Labels + colors overridden to 4 NT theming per neurons-mode Requirement 2:
      //   knowledge ↔ Glu (學習 / LTP)
      //   reflex    ↔ DA  (動機 / 反應 / reward)
      //   memory    ↔ GABA (專注 / 控制 / 抑制)
      //   stamina   ↔ 5-HT (耐力 / 情緒 / mood)
      order: ['knowledge', 'reflex', 'memory', 'stamina'],
      labels: {
        knowledge: 'Glutamate 麩胺酸 (學習)',
        reflex: 'Dopamine 多巴胺 (動機)',
        memory: 'GABA γ-胺基丁酸 (專注)',
        stamina: 'Serotonin 血清素 (耐力)',
      },
      colors: {
        knowledge: 'var(--nt-glu)',
        reflex: 'var(--nt-da)',
        memory: 'var(--nt-gaba)',
        stamina: 'var(--nt-5ht)',
      },
    },
  }

  // Step 6: Write artifacts
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, 'meta.json'), JSON.stringify(outputMeta, null, 2))
  writeFileSync(resolve(OUT_DIR, 'subjects.json'), JSON.stringify(outputSubjects, null, 2))
  writeFileSync(resolve(OUT_DIR, 'questions.json'), JSON.stringify(outputQuestions))

  // Step 6b: Copy question figures into dist/figures (copy-content.mjs then → app public/)
  let figuresCopied = 0
  if (existsSync(FIGURES_DIR)) {
    const figOut = resolve(OUT_DIR, 'figures')
    mkdirSync(figOut, { recursive: true })
    for (const f of readdirSync(FIGURES_DIR).filter((n) => n.endsWith('.png'))) {
      copyFileSync(resolve(FIGURES_DIR, f), resolve(figOut, f))
      figuresCopied += 1
    }
  }

  // Step 7: Counters
  const ntCount = (br: NtBranchId) => outputSubjects.filter((s) => s.group === br).length
  console.log(`---`)
  console.log(
    `imported: ${outputQuestions.length} / skipped: 0 / total: ${outputQuestions.length}`,
  )
  console.log(
    `微生物暨免疫學 split: 微生物學=${splitMicro}, 免疫學=${splitImmune}, untagged fallback (→ 微生物學)=${untaggedFallback}`,
  )
  console.log(
    `subjects: ${outputSubjects.length} (DA ${ntCount('DA')} / 5-HT ${ntCount('5HT')} / GABA ${ntCount('GABA')} / Glu ${ntCount('Glu')})`,
  )
  console.log(
    `figures: wired ${figuresWired} (imagePath set) / copied ${figuresCopied} files / flagged-without-figure ${flaggedNoFigure} (→ [圖] fallback)`,
  )
  console.log(`Written: ${OUT_DIR}`)

  // Step 8: Validate achievement catalog (fail build on rule violation)
  validateNeuronsAchievementCatalog(NEURONS_ACHIEVEMENTS)
  console.log(
    `achievements: ${NEURONS_ACHIEVEMENTS_STATS.total} entries — ` +
      Object.entries(NEURONS_ACHIEVEMENTS_STATS.byCategory)
        .map(([c, n]) => `${c}:${n}`)
        .join(', '),
  )
}

main()
