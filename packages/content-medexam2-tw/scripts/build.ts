/**
 * Build pipeline for @study-rpg/content-medexam2-tw.
 *
 * Reads question .md + .explanations.md side-cars from MEDEXAM2_SOURCE_DIR
 * and emits dist/{questions,subjects,meta,stats}.json conforming to
 * @study-rpg/core's content-pack-contract.
 *
 * Env vars (see openspec/specs/medexam2-corpus-ingestion/spec.md):
 *   MEDEXAM2_SOURCE_DIR   default: ~/Desktop/國考/二階國考/二階國考_拆分
 *   MEDEXAM2_SUBJECTS     default: 'all'; comma list e.g. '內科,外科' for dev iteration
 *   MEDEXAM2_ALLOW_SKIPS  default: 0; set to 1 to opt-in past skip errors
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { parse as parseYaml } from 'yaml'
import type { Question, Subject, ContentPackMeta } from '@study-rpg/core'

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PACKAGE_ROOT = join(__dirname, '..')
const DIST_DIR = join(PACKAGE_ROOT, 'dist')
const REPO_ROOT = join(__dirname, '../../..')
const APP_PUBLIC = join(REPO_ROOT, 'apps/medexam2-hospital-tw/public/content/medexam2-tw')
const APP_IMAGE_DIR = join(REPO_ROOT, 'apps/medexam2-hospital-tw/public/images/medexam2-tw')
const APP_IMAGE_REL = 'images/medexam2-tw'

// ─── Env config ──────────────────────────────────────────────────────────────

const SOURCE_DIR = process.env.MEDEXAM2_SOURCE_DIR ??
  join(homedir(), 'Desktop/國考/二階國考/二階國考_拆分')
const SUBJECTS_FILTER = (process.env.MEDEXAM2_SUBJECTS ?? 'all').split(',').map(s => s.trim())
const ALLOW_SKIPS = process.env.MEDEXAM2_ALLOW_SKIPS === '1'

// ─── Constants ───────────────────────────────────────────────────────────────

const SUBJECT_PALETTE: Record<string, string> = {
  '內科': '#c44d4d',
  '家醫科': '#6a8c3f',
  '小兒科': '#d4a04d',
  '皮膚科': '#d4694d',
  '神經內科': '#6a4d8c',
  '精神科': '#8c6a4d',
  '外科': '#8b3a3a',
  '泌尿科': '#7b9bc4',
  '骨科': '#bf9b6e',
  '婦產科': '#d47bb5',
  '復健科': '#4d8c6a',
  '眼科': '#4d6a8c',
  '耳鼻喉科': '#6a4d4d',
  '麻醉科': '#5a5a5a',
}

const SUBJECT_TO_GROUP: Record<string, string> = {
  '內科': '醫學三', '家醫科': '醫學三',
  '小兒科': '醫學四', '皮膚科': '醫學四', '神經內科': '醫學四', '精神科': '醫學四',
  '外科': '醫學五', '泌尿科': '醫學五', '骨科': '醫學五',
  '婦產科': '醫學六', '復健科': '醫學六', '眼科': '醫學六', '耳鼻喉科': '醫學六', '麻醉科': '醫學六',
}

const SYSTEM_FOLDERS = new Set(['_analysis', '_cache', '_explainer_cache', '_explainer_pilot', '_pdf', '_scripts'])
const VALID_SUBJECTS = new Set(Object.keys(SUBJECT_PALETTE))
const VALID_GROUPS = new Set(['醫學三', '醫學四', '醫學五', '醫學六'])

const SITTING_MAP: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4 }

const PLACEHOLDER_EXPLANATION = '詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Frontmatter {
  year: string
  sitting: string
  paper: string
  subject: string
  question_count?: number
  source_pdf?: string
  parsed_date?: string
}

interface ExplanationFrontmatter {
  source_md?: string
  generated_date?: string
  model?: string
  validation?: string
  question_count?: number
  explanation_count?: number
  conflict_count?: number
  oe_hit_rate?: number
  gemini_fallback_count?: number
}

interface ExplanationData {
  text: string
  confidence?: string
  oeHitRate?: number
  model?: string
}

interface ParsedQuestion {
  qNum: number
  subspecialty: string
  topic: string
  stem: string
  options: Record<string, string>
  answer: string
  topicLabel: string
  hasImage: boolean
  hasOptionImages: boolean
  disputed: boolean
  gradingNote?: string
}

// Marker the upstream PDF→Markdown extractor writes when an option's body is a
// graphic that could not be OCR'd to text. Questions with this marker in any
// option are un-renderable in the text-only QuizModal and get filtered out at
// pool-load by the host apps. See openspec/specs/medexam2-corpus-ingestion +
// content-pack-contract.
const OPTION_IMAGE_MARKER = /_\(圖片或缺失\)_/

// Upstream PDF→Markdown extractor leaked page-footer / answer-key content into
// option text (and consequently into explanation `**X. ...**` bold blocks when
// the LLM echoed the polluted option). Three classes of junk observed:
//   (a) Q80 trailing answer-key appendix — variants:
//       「測驗題標準答案更正 考試名稱：...」
//       「測驗式試題標準答案 考試名稱：...」
//   (b) Per-page watermark / page number / page-header fragment that bled into
//       a random option, e.g.: `... 醫 護 【版權所有，翻印必究】 --12--`
//   (c) Lone trailing 醫 / 護 when only one character of the page-header
//       「醫 護」 (presumably 「醫師(二)」/「護理師」 split) leaked in.
// Strip from the first marker through the next closing `**` (explanation
// context) or end-of-string (option context). Lone trailing 醫/護 (no
// preceding marker) is handled by a second pass that requires whitespace
// before the character — guards against false-matching legit Chinese endings
// like 「就醫」/「保護」 which have no space.
function stripPdfExtractionJunk(text: string): string {
  // Pass 0: 考選部 per-question grading directive (※第N題[...]給分。) — strip
  // the directive itself only (NOT through to **/EOS), because subsequent
  // option/explanation text after the directive may exist and is legitimate.
  // The directive content is surfaced separately via extractGradingNote +
  // explanation blockquote prepend in buildQuestion.
  text = text.replace(/\s*※\s*第\s*\d+\s*題[^。]*給分。?/gu, '')
  // Pass 1: marker-anchored strip through to closing ** or EOS
  text = text.replace(
    /\s*(?:測驗式?試?題?標準答案|【版權所有|--\d+--|醫\s+護)[\s\S]*?(?=\*\*|$)/g,
    ''
  )
  // Pass 2: lone trailing 醫 / 護 in option context (no ** wrapper)
  text = text.replace(/\s+[醫護](?=\s*$)/gu, '')
  // Pass 3: lone trailing 醫 / 護 inside an explanation bold block
  text = text.replace(/\s+[醫護](?=\*\*)/gu, '')
  return text
}

// 考選部 sometimes attaches a per-question grading directive at the very end of
// a disputed question's last option in the source PDF, e.g.
// 「※第17題答Ｂ、Ｄ給分。」/「※第22題一律給分。」. The upstream PDF→Markdown
// extractor copied it onto the option text as a suffix. We extract it here so
// `buildQuestion` can surface it as a blockquote header on the explanation
// instead of leaving it polluting the option string.
function extractGradingNote(optionText: string): { cleaned: string; note: string | null } {
  // NOT anchored at end-of-input — some source MDs have trailing page-header
  // fragments AFTER the directive (e.g. `... ※第73題一律給分。 醫` or
  // `... ※第74題一律給分。 --10--`). Anything after the directive is also
  // upstream junk by inspection, so safe to drop wholesale.
  const re = /\s*(※\s*第\s*\d+\s*題[^。]*給分。?)/u
  const m = re.exec(optionText)
  if (!m) return { cleaned: optionText, note: null }
  return { cleaned: optionText.slice(0, m.index).trimEnd(), note: m[1].trim() }
}

// ─── File system walking ─────────────────────────────────────────────────────

function* walkSourceDir(): Generator<string> {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(`MEDEXAM2_SOURCE_DIR does not exist: ${SOURCE_DIR}`)
  }
  for (const group of readdirSync(SOURCE_DIR)) {
    if (SYSTEM_FOLDERS.has(group) || !VALID_GROUPS.has(group)) continue
    const groupDir = join(SOURCE_DIR, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const subject of readdirSync(groupDir)) {
      if (SYSTEM_FOLDERS.has(subject)) continue
      if (SUBJECTS_FILTER[0] !== 'all' && !SUBJECTS_FILTER.includes(subject)) continue
      const subjectDir = join(groupDir, subject)
      if (!statSync(subjectDir).isDirectory()) continue
      for (const file of readdirSync(subjectDir)) {
        if (!file.endsWith('.md')) continue
        if (file.endsWith('.explanations.md')) continue
        yield join(subjectDir, file)
      }
    }
  }
}

// ─── Frontmatter splitter ────────────────────────────────────────────────────

function splitFrontmatter(content: string): { fm: Record<string, unknown>; body: string } {
  if (!content.startsWith('---')) return { fm: {}, body: content }
  const endIdx = content.indexOf('\n---', 4)
  if (endIdx < 0) return { fm: {}, body: content }
  const fmStr = content.slice(4, endIdx)
  const body = content.slice(endIdx + 4)
  const fm = (parseYaml(fmStr) ?? {}) as Record<string, unknown>
  return { fm, body }
}

// ─── Question parser ─────────────────────────────────────────────────────────

interface ParseResult {
  parsed: ParsedQuestion[]
  totalBlocksSeen: number
  skips: Array<{ qNum: number; reason: string }>
}

function parseQuestionBlocks(body: string): ParseResult {
  const parsed: ParsedQuestion[] = []
  const skips: Array<{ qNum: number; reason: string }> = []

  const blockRegex = /^## Q(\d+)\s+\[([^/\n]+?)\s*\/\s*([^\]\n]+?)\]\s*$/gm
  interface Block { qNum: number; subspecialty: string; topic: string; start: number; end: number }
  const blocks: Block[] = []
  let match: RegExpExecArray | null

  while ((match = blockRegex.exec(body)) !== null) {
    blocks.push({
      qNum: parseInt(match[1], 10),
      subspecialty: match[2].trim(),
      topic: match[3].trim(),
      start: match.index,
      end: -1,
    })
  }
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].end = i + 1 < blocks.length ? blocks[i + 1].start : body.length
  }

  const totalBlocksSeen = blocks.length

  for (const block of blocks) {
    const blockContent = body.slice(block.start, block.end)
    const afterHeader = blockContent.slice(blockContent.indexOf('\n') + 1)

    const lines = afterHeader.split('\n')
    const options: Record<string, string> = {}
    let answer: string | null = null
    let disputed = false
    let topicLabel: string = block.topic
    let gradingNote: string | null = null
    const stemLines: string[] = []
    let inOptions = false

    for (const line of lines) {
      const optMatch = /^- ([A-Z])\.\s+(.+)$/.exec(line)
      // Accept both ASCII '#' and fullwidth '＃' as 國考-disputed-question markers
      const ansMatch = /^\*\*答案\*\*[：:]\s*([A-Z]|#|＃)\s*$/.exec(line.trim())
      const topMatch = /^\*\*Topic\*\*[：:]\s*(.+)$/.exec(line.trim())

      if (optMatch) {
        inOptions = true
        // Extract per-question grading directive BEFORE stripping other junk,
        // so we can capture it for the explanation blockquote header. The
        // subsequent stripPdfExtractionJunk call cleans residual page-footer
        // fragments that may have been BETWEEN content and the directive
        // (e.g. `糖尿病 醫 ※第22題一律給分。` → 糖尿病).
        const { cleaned, note } = extractGradingNote(optMatch[2])
        if (note) gradingNote = note
        options[optMatch[1]] = stripPdfExtractionJunk(cleaned).trim()
      } else if (ansMatch) {
        if (ansMatch[1] === '#' || ansMatch[1] === '＃') {
          disputed = true
        } else {
          answer = ansMatch[1]
        }
      } else if (topMatch) {
        topicLabel = topMatch[1].trim()
      } else if (!inOptions) {
        stemLines.push(line)
      }
    }

    const stem = stemLines.join('\n').trim()

    if (!stem) { skips.push({ qNum: block.qNum, reason: 'empty stem' }); continue }
    if (Object.keys(options).length < 2) { skips.push({ qNum: block.qNum, reason: `<2 options (got ${Object.keys(options).length})` }); continue }

    // Disputed (送分題): no canonical answer — pick first option as placeholder
    if (disputed) {
      answer = Object.keys(options)[0]
    }

    if (!answer) { skips.push({ qNum: block.qNum, reason: 'missing answer line' }); continue }
    if (!(answer in options)) { skips.push({ qNum: block.qNum, reason: `answer ${answer} not in options [${Object.keys(options).join(',')}]` }); continue }

    // Detect any reference to a figure / image. Patterns observed in 二階國考
    // (whitespace-tolerant because PDF extraction can split "附圖" into "附 圖"):
    //   [圖] / （圖） / (圖) — explicit markers
    //   附圖 / 上圖 / 下圖 / 左圖 / 右圖 — referential nouns
    //   圖一 / 圖A / 圖 1 — numbered/lettered figure ref
    //   箭頭所指 / 箭號所指 — arrow annotation
    //   如圖 / 圖示 / 示意圖 / 流程圖 / 圖像 / 圖為 — predicate / typed figure
    //   圖中Ａ / 圖中★ — figure-internal annotation
    //   心電圖如/為 — ECG with display verb (excludes narrative description)
    //   如下所示 / 如下列圖 / 兩張圖 — multi/listed figures
    //
    // Excludes false matches by removing 意圖 / 試圖 / 企圖 / 構圖 / 地圖 /
    // 圖書 / 圖表 / 插圖 before testing.
    const stemForImageCheck = stem.replace(
      /意\s*圖|試\s*圖|企\s*圖|構\s*圖|地\s*圖|圖\s*書|圖\s*表|插\s*圖/g,
      ''
    )
    const hasImage = new RegExp(
      '\\[\\s*圖\\s*\\]|（\\s*圖\\s*）|\\(\\s*圖\\s*\\)|' +
      '附\\s*圖|上\\s*圖|下\\s*圖|左\\s*圖|右\\s*圖|' +
      '圖\\s*[一二三四五六七八九十甲乙丙丁ABCDE12345]|' +
      '箭\\s*[頭號]\\s*所\\s*指|' +
      '如\\s*圖|' +
      '圖\\s*示|示\\s*意\\s*圖|流\\s*程\\s*圖|' +
      '圖\\s*像|圖\\s*為|' +
      '圖\\s*中\\s*[ＡＢＣＤＥA-Ea-e★▲△○●◇◆□■☆◎*]|' +
      '(心|肌|腦)\\s*電\\s*圖\\s*(如|為|顯\\s*示\\s*如|紀\\s*錄\\s*如|檢\\s*查\\s*如)|' +
      '如\\s*下\\s*所\\s*示|如\\s*下\\s*列\\s*圖|' +
      '兩\\s*張\\s*圖'
    ).test(stemForImageCheck)

    const hasOptionImages = Object.values(options).some((v) => OPTION_IMAGE_MARKER.test(v))

    parsed.push({
      qNum: block.qNum,
      subspecialty: block.subspecialty,
      topic: block.topic,
      stem,
      options,
      answer,
      topicLabel,
      hasImage,
      hasOptionImages,
      disputed,
      gradingNote: gradingNote ?? undefined,
    })
  }

  return { parsed, totalBlocksSeen, skips }
}

// ─── Explanation side-car parser ─────────────────────────────────────────────

function parseExplanationsFile(path: string): { exps: Map<number, ExplanationData>; fm: ExplanationFrontmatter } {
  const exps = new Map<number, ExplanationData>()
  if (!existsSync(path)) return { exps, fm: {} }

  const content = readFileSync(path, 'utf-8')
  const { fm: fmRaw, body } = splitFrontmatter(content)
  const fm = fmRaw as ExplanationFrontmatter

  const headerRe = /^## Q(\d+)\s+\[/gm
  interface Pos { qNum: number; pos: number }
  const positions: Pos[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(body)) !== null) {
    positions.push({ qNum: parseInt(m[1], 10), pos: m.index })
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].pos
    const end = i + 1 < positions.length ? positions[i + 1].pos : body.length
    const qBlock = body.slice(start, end)

    const confMatch = /overall confidence[:：]\s*(P[1-5])/.exec(qBlock)
    const confidence = confMatch ? confMatch[1] : undefined

    const detailIdx = qBlock.indexOf('### 選項詳解')
    let text = ''
    if (detailIdx >= 0) {
      // Skip the "### 選項詳解" header line itself — QuizModal already renders a
      // "解析" section label, so the inner header is visually redundant.
      const afterHeader = qBlock.indexOf('\n', detailIdx) + 1
      text = qBlock.slice(afterHeader).trim()
    } else {
      const hdrLine = qBlock.indexOf('\n')
      text = qBlock.slice(hdrLine + 1).trim()
    }
    if (!text) continue

    const cleanText = stripPdfExtractionJunk(text)
    exps.set(positions[i].qNum, { text: cleanText, confidence, model: fm.model, oeHitRate: fm.oe_hit_rate })
  }

  return { exps, fm }
}

// ─── Question construction ───────────────────────────────────────────────────

function buildQuestion(parsed: ParsedQuestion, fm: Frontmatter, sourcePath: string, exp: ExplanationData | undefined): Question {
  const yearMatch = /民國(\d+)/.exec(fm.year)
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 0
  const sittingMatch = /第([一二三四五])次/.exec(fm.sitting)
  const sitting = sittingMatch ? (SITTING_MAP[sittingMatch[1]] ?? 0) : 0

  const id = `${year}-${sitting}-${fm.paper}-${fm.subject}-Q${parsed.qNum}`
  const baseExplanation = exp?.text ?? PLACEHOLDER_EXPLANATION
  // Prepend the 考選部 per-question grading directive (extracted from the
  // upstream-polluted option text) as a blockquote header. The LLM-echoed
  // copy inside `**X. ...**` bold blocks is already stripped by Pass 0 of
  // stripPdfExtractionJunk applied in parseExplanationsFile.
  const explanation = parsed.gradingNote
    ? `> 📋 考選部給分附註：${parsed.gradingNote}\n\n${baseExplanation}`
    : baseExplanation
  const explanationStatus = exp ? 'ok' : 'pending'

  const meta: Record<string, unknown> = {
    year,
    sitting,
    paper: fm.paper,
    subspecialty: parsed.subspecialty,
    topic: parsed.topicLabel,
    hasExplanation: !!exp,
    explanationStatus,
    sourceFile: relative(SOURCE_DIR, sourcePath),
  }
  if (parsed.disputed) meta.disputed = true
  if (parsed.gradingNote) meta.gradingNote = parsed.gradingNote
  if (exp?.model) meta.explanationModel = exp.model
  if (exp?.oeHitRate !== undefined) meta.oeHitRate = exp.oeHitRate
  if (exp?.confidence) meta.explanationConfidence = exp.confidence

  // Only attach imagePath when the question genuinely needs an image (hasImage
  // true). Files for false-positive PNGs may exist on disk from earlier
  // extraction runs against a looser regex — ignore them.
  const imageFilename = `${id}.png`
  const imagePath =
    parsed.hasImage && existsSync(join(APP_IMAGE_DIR, imageFilename))
      ? `${APP_IMAGE_REL}/${imageFilename}`
      : null

  return {
    id,
    subject: fm.subject,
    stem: parsed.stem,
    options: parsed.options,
    answer: parsed.answer,
    explanation,
    hasImage: parsed.hasImage,
    imagePath,
    hasOptionImages: parsed.hasOptionImages,
    disputed: parsed.disputed || undefined,
    meta,
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface PerSubjectStats {
  totalQuestions: number
  explainedQuestions: number
  coveragePercent: number
  perYearCounts: Record<string, number>
}

async function main(): Promise<void> {
  console.log(`[medexam2-build] source: ${SOURCE_DIR}`)
  console.log(`[medexam2-build] subjects filter: ${SUBJECTS_FILTER.join(',')}`)
  console.log(`[medexam2-build] allow skips: ${ALLOW_SKIPS}`)
  console.log()

  const allQuestions: Question[] = []
  let importedQ = 0
  let skippedQ = 0
  let totalBlocksSeen = 0
  let filesSeen = 0
  let filesWithExp = 0

  for (const filePath of walkSourceDir()) {
    filesSeen++
    const content = readFileSync(filePath, 'utf-8')
    const { fm: fmRaw, body } = splitFrontmatter(content)
    const fm = fmRaw as unknown as Frontmatter

    if (!fm.year || !fm.sitting || !fm.paper || !fm.subject) {
      console.warn(`[skip-file] ${relative(SOURCE_DIR, filePath)}: incomplete frontmatter`)
      continue
    }
    if (!VALID_SUBJECTS.has(fm.subject)) {
      console.warn(`[skip-file] ${relative(SOURCE_DIR, filePath)}: unknown subject "${fm.subject}"`)
      continue
    }

    const expPath = filePath.replace(/\.md$/, '.explanations.md')
    const { exps } = parseExplanationsFile(expPath)
    if (exps.size > 0) filesWithExp++

    const { parsed, totalBlocksSeen: blocks, skips } = parseQuestionBlocks(body)
    totalBlocksSeen += blocks
    for (const skip of skips) {
      console.warn(`[skip-Q] ${relative(SOURCE_DIR, filePath)} Q${skip.qNum}: ${skip.reason}`)
      skippedQ++
    }

    for (const p of parsed) {
      const exp = exps.get(p.qNum)
      const q = buildQuestion(p, fm, filePath, exp)
      allQuestions.push(q)
      importedQ++
    }
  }

  // Subjects
  const subjectCounts: Record<string, number> = {}
  for (const q of allQuestions) {
    subjectCounts[q.subject] = (subjectCounts[q.subject] ?? 0) + 1
  }
  const subjects: Subject[] = Object.entries(SUBJECT_PALETTE)
    .filter(([sid]) => SUBJECTS_FILTER[0] === 'all' || SUBJECTS_FILTER.includes(sid))
    .map(([sid, color]) => ({
      id: sid,
      displayName: sid,
      group: SUBJECT_TO_GROUP[sid] ?? '其他',
      color,
      totalQuestions: subjectCounts[sid] ?? 0,
    }))

  // Recruitment threshold parity check: every subjectId in RECRUITMENT_THRESHOLDS
  // must exist in the built subjects. Locked literals in src/recruitment.ts must
  // not silently drift from the corpus.
  if (SUBJECTS_FILTER[0] === 'all') {
    const { RECRUITMENT_THRESHOLDS } = await import('../src/recruitment')
    const builtSubjectIds = new Set(subjects.map((s) => s.id))
    const thresholdIds = Object.keys(RECRUITMENT_THRESHOLDS)
    const missing = thresholdIds.filter((id) => !builtSubjectIds.has(id))
    const extra = subjects.filter((s) => !(s.id in RECRUITMENT_THRESHOLDS)).map((s) => s.id)
    if (missing.length > 0 || extra.length > 0) {
      console.error(`Recruitment threshold parity check failed:`)
      if (missing.length > 0) console.error(`  missing from corpus: ${missing.join(', ')}`)
      if (extra.length > 0) console.error(`  extra subjects in corpus: ${extra.join(', ')}`)
      console.error(`  imported: ${importedQ}, skipped: ${skippedQ}, total: ${totalBlocksSeen}`)
      console.error(`  edit packages/content-medexam2-tw/src/recruitment.ts to re-lock thresholds.`)
      process.exit(1)
    }
  }

  // Stats
  const perSubject: Record<string, PerSubjectStats> = {}
  for (const sid of Object.keys(SUBJECT_PALETTE)) {
    if (SUBJECTS_FILTER[0] !== 'all' && !SUBJECTS_FILTER.includes(sid)) continue
    const qs = allQuestions.filter(q => q.subject === sid)
    const explained = qs.filter(q => (q.meta as Record<string, unknown>).explanationStatus === 'ok').length
    const perYear: Record<string, number> = {}
    for (const q of qs) {
      const m = q.meta as Record<string, unknown>
      const yr = `${m.year}-${m.sitting}`
      perYear[yr] = (perYear[yr] ?? 0) + 1
    }
    perSubject[sid] = {
      totalQuestions: qs.length,
      explainedQuestions: explained,
      coveragePercent: qs.length > 0 ? Math.round((explained / qs.length) * 1000) / 10 : 0,
      perYearCounts: perYear,
    }
  }

  const stats = {
    perSubject,
    totalQuestions: allQuestions.length,
    totalSubjects: Object.keys(perSubject).length,
    builtAt: new Date().toISOString(),
  }

  // Meta
  const meta: ContentPackMeta = {
    id: 'medexam2-tw',
    displayName: '台灣二階醫師國考',
    locale: 'zh-TW',
    examMeta: {
      builtAt: stats.builtAt,
      stats: {
        totalQuestions: allQuestions.length,
        parsedFiles: filesSeen,
        totalFiles: filesSeen,
        subjects: stats.totalSubjects,
      },
    },
    credits: [
      { name: '中華民國考選部歷屆考題', url: 'https://wwwq.moex.gov.tw/', license: '公資源' },
      { name: 'LLM-generated explanations © 康瑋麟 (WLK), Claude Haiku 4.5 + OpenEvidence-validated', license: 'CC-BY-4.0' },
    ],
  }

  // Write artifacts
  mkdirSync(DIST_DIR, { recursive: true })
  writeFileSync(join(DIST_DIR, 'questions.json'), JSON.stringify(allQuestions))
  writeFileSync(join(DIST_DIR, 'subjects.json'), JSON.stringify(subjects))
  writeFileSync(join(DIST_DIR, 'meta.json'), JSON.stringify(meta))
  writeFileSync(join(DIST_DIR, 'stats.json'), JSON.stringify(stats, null, 2))

  // Copy to app public
  mkdirSync(APP_PUBLIC, { recursive: true })
  for (const f of ['questions.json', 'subjects.json', 'meta.json']) {
    writeFileSync(join(APP_PUBLIC, f), readFileSync(join(DIST_DIR, f)))
  }

  // Summary
  console.log()
  console.log(`imported: ${importedQ}, skipped: ${skippedQ}, total: ${totalBlocksSeen}`)
  console.log(`files: ${filesSeen} seen, ${filesWithExp} with explanations side-car (coverage ${filesSeen > 0 ? Math.round((filesWithExp / filesSeen) * 100) : 0}%)`)
  console.log()
  console.log('Per-subject:')
  console.log('  Subject          Total  Explained  Coverage%')
  for (const sid of Object.keys(SUBJECT_PALETTE)) {
    const s = perSubject[sid]
    if (!s) continue
    console.log(`  ${sid.padEnd(8, '　')}    ${String(s.totalQuestions).padStart(5)}      ${String(s.explainedQuestions).padStart(5)}      ${s.coveragePercent.toFixed(1).padStart(5)}%`)
  }

  // Gzip size
  const qJson = readFileSync(join(DIST_DIR, 'questions.json'))
  const gz = gzipSync(qJson)
  const gzMB = (gz.length / 1024 / 1024).toFixed(2)
  console.log()
  console.log(`questions.json: ${qJson.length} bytes raw, ${gz.length} bytes gzipped (${gzMB} MB)`)
  if (gz.length > 2.5 * 1024 * 1024) {
    console.warn(`⚠️  gzipped size exceeds NFR ceiling 2.5 MB — flag for lazy-load-medexam2-by-subject follow-up`)
  }

  // Exit
  if (skippedQ > 0 && !ALLOW_SKIPS) {
    console.error()
    console.error(`Build aborted: ${skippedQ} skipped. Re-run with MEDEXAM2_ALLOW_SKIPS=1 after auditing skip log above.`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('build.ts failed:', err)
  process.exit(1)
})
