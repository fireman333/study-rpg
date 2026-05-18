/**
 * Build script: parse 陽明國考考古 _extracted (recursively) into questions.json + subjects.json
 *
 * Source format (per Q block):
 *   ## Q1
 *   **科目**：解剖
 *   **有附圖**：否
 *   **頁碼**：PDF p.4
 *
 *   ### 題幹
 *   <stem text...>
 *
 *   ### 選項
 *   - (A) ...
 *   - (B) ...
 *   - (C) ...
 *   - (D) ...
 *
 *   ### 答案
 *   (C)
 *
 *   ### 詳解
 *   <explanation markdown...>
 *
 * Source attribution: 陽明國考考古題小組 — https://sites.google.com/view/ymmedexam/ans
 * License of 詳解: CC-BY-NC (per the site notice).
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

// Default to the user's local extraction folder; override via env var.
const SOURCE_ROOT =
  process.env.MEDEXAM_SOURCE_ROOT ??
  resolve(process.env.HOME ?? '/', 'Desktop/國考/一階國考/陽明國考考古/_extracted')

const OUT_DIR = resolve(import.meta.dirname, '..', 'dist')

// Subjects to ingest. Defaults to all 10 subjects (~3505 Q).
// Set MEDEXAM_SUBJECTS=藥理學 (or comma-separated list) for vertical-slice fast iteration.
// MEDEXAM_SUBJECTS=all is an explicit synonym of the default.
const MVP_SUBJECTS = (process.env.MEDEXAM_SUBJECTS ?? 'all').split(',').map((s) => s.trim())
const ALLOW_SKIPS = process.env.MEDEXAM_ALLOW_SKIPS === '1'

const SOURCE_CREDIT = '陽明國考考古題小組'
const SOURCE_URL = 'https://sites.google.com/view/ymmedexam/ans'

interface FrontMatter {
  year: number
  session: number
  book: string
  subject: string
  question_range: string
  extracted_from: string
  extracted_at: string
}

interface ParsedQuestion {
  id: string
  subject: string
  stem: string
  options: Record<string, string>
  answer: string
  explanation: string
  hasImage: boolean
  hasOptionImages: boolean
  meta: {
    year: number
    session: number
    book: string
    paper: 'medexam-1' | 'medexam-2'
    qNumber: number
    pageRef?: string
  }
  sourceCredit: string
}

// Forward-compat marker mirror of 二階. 一階 corpus has zero matches today;
// the gate exists so a future upstream PDF→Markdown extractor regression
// can't leak un-renderable options into the quiz pool without spec review.
const OPTION_IMAGE_MARKER = /_\(圖片或缺失\)_/

function bookToPaper(book: string): 'medexam-1' | 'medexam-2' | null {
  if (book === '醫學一') return 'medexam-1'
  if (book === '醫學二') return 'medexam-2'
  return null
}

function splitFrontMatter(raw: string): { fm: FrontMatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error('Missing YAML frontmatter')
  return { fm: parseYaml(m[1]) as FrontMatter, body: m[2] }
}

function parseQuestionBlocks(
  body: string,
  fm: FrontMatter,
  fileLabel: string,
): { questions: ParsedQuestion[]; totalBlocks: number } {
  // Split on `## Qn` headers (Q-numbered blocks)
  const re = /^## Q(\d+)\s*$/gm
  const matches: Array<{ qn: number; start: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    matches.push({ qn: Number(m[1]), start: m.index })
  }
  const result: ParsedQuestion[] = []
  for (let i = 0; i < matches.length; i++) {
    const { qn, start } = matches[i]
    const end = i + 1 < matches.length ? matches[i + 1].start : body.length
    const block = body.slice(start, end)
    const q = parseSingleBlock(block, qn, fm, fileLabel)
    if (q) result.push(q)
  }
  return { questions: result, totalBlocks: matches.length }
}

function parseSingleBlock(block: string, qn: number, fm: FrontMatter, fileLabel: string): ParsedQuestion | null {
  // Line-based section parser: split the block, find lines starting with "### <label>",
  // collect everything until the next "### " or "## " heading.
  const lines = block.split('\n')
  const sections: Record<string, string[]> = {}
  let current: string | null = null
  for (const line of lines) {
    if (/^## Q\d+/.test(line)) continue // skip the outer Q header
    const m = line.match(/^### (.+?)\s*$/)
    if (m) {
      current = m[1]
      sections[current] = []
    } else if (current) {
      sections[current].push(line)
    }
  }
  const sec = (label: string): string | null => {
    const arr = sections[label]
    if (!arr) return null
    const text = arr.join('\n').trim()
    return text.length > 0 ? text : null
  }
  const stem = sec('題幹')
  const optionsBlock = sec('選項')
  const answerRaw = sec('答案')
  const explanation = sec('詳解') ?? ''

  if (!stem || !optionsBlock || !answerRaw) {
    console.warn(`[skip] ${fileLabel} Q${qn} — missing 題幹/選項/答案`)
    return null
  }

  const options: Record<string, string> = {}
  // Parse options line-by-line: each option starts with "- (X) ", continuation lines are appended.
  let currentOpt: string | null = null
  for (const line of optionsBlock.split('\n')) {
    const m = line.match(/^- \(([A-E])\)\s*(.*)$/)
    if (m) {
      currentOpt = m[1]
      options[currentOpt] = m[2].trim()
    } else if (currentOpt && line.trim().length > 0) {
      options[currentOpt] += '\n' + line.trim()
    }
  }
  if (Object.keys(options).length < 2) {
    console.warn(`[skip] ${fileLabel} Q${qn} — options not parsed (${Object.keys(options).length})`)
    return null
  }

  const ansMatch = answerRaw.match(/\(?([A-E])\)?/)
  if (!ansMatch) {
    console.warn(`[skip] ${fileLabel} Q${qn} — answer not parsed: "${answerRaw}"`)
    return null
  }
  const answer = ansMatch[1]

  const paper = bookToPaper(fm.book)
  if (paper === null) {
    console.warn(`[skip] ${fileLabel} Q${qn} — unknown book "${fm.book}" (expected 醫學一 / 醫學二)`)
    return null
  }

  const hasImage = /\*\*有附圖\*\*：\s*是/.test(block) || /<img/i.test(stem) || /!\[.*\]\(/.test(stem)
  const hasOptionImages = Object.values(options).some((v) => OPTION_IMAGE_MARKER.test(v))
  const pageMatch = block.match(/\*\*頁碼\*\*：\s*(.+)/)
  const pageRef = pageMatch ? pageMatch[1].trim() : undefined

  return {
    id: `${fm.year}-${fm.session}-${fm.book}-${fm.subject}-Q${qn}`,
    subject: fm.subject,
    stem,
    options,
    answer,
    explanation,
    hasImage,
    hasOptionImages,
    meta: {
      year: fm.year,
      session: fm.session,
      book: fm.book,
      paper,
      qNumber: qn,
      pageRef,
    },
    sourceCredit: SOURCE_CREDIT,
  }
}

function walkMdFiles(root: string): string[] {
  const out: string[] = []
  function recur(dir: string) {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) recur(p)
      else if (s.isFile() && name.endsWith('.md')) out.push(p)
    }
  }
  recur(root)
  return out
}

function main() {
  if (!existsSync(SOURCE_ROOT)) {
    console.error(`Source not found: ${SOURCE_ROOT}`)
    console.error(`Set MEDEXAM_SOURCE_ROOT env var to override.`)
    process.exit(1)
  }
  console.log(`[build] source = ${SOURCE_ROOT}`)
  console.log(`[build] subjects = ${MVP_SUBJECTS.includes('all') ? '(all)' : MVP_SUBJECTS.join(', ')}`)

  const all = walkMdFiles(SOURCE_ROOT)
  console.log(`[build] found ${all.length} .md files`)

  const questions: ParsedQuestion[] = []
  const subjectsSet = new Map<string, { displayName: string; group: string; count: number }>()
  let parsedFiles = 0
  let totalBlocksSeen = 0

  for (const f of all) {
    try {
      const raw = readFileSync(f, 'utf8')
      const { fm, body } = splitFrontMatter(raw)
      if (!MVP_SUBJECTS.includes('all') && !MVP_SUBJECTS.includes(fm.subject)) continue
      const { questions: qs, totalBlocks } = parseQuestionBlocks(body, fm, f.replace(SOURCE_ROOT, ''))
      totalBlocksSeen += totalBlocks
      questions.push(...qs)
      const existing = subjectsSet.get(fm.subject)
      subjectsSet.set(fm.subject, {
        displayName: fm.subject,
        group: fm.book,
        count: (existing?.count ?? 0) + qs.length,
      })
      parsedFiles++
    } catch (err) {
      console.warn(`[skip] ${f}: ${(err as Error).message}`)
    }
  }

  const importedQ = questions.length
  const skippedQ = totalBlocksSeen - importedQ

  const subjects = [...subjectsSet.entries()].map(([id, v]) => ({
    id,
    displayName: v.displayName,
    group: v.group,
    color: subjectColor(id),
    iconKey: `subject:${id}`,
    totalQuestions: v.count,
  }))

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'questions.json'), JSON.stringify(questions, null, 0))
  writeFileSync(join(OUT_DIR, 'subjects.json'), JSON.stringify(subjects, null, 2))
  writeFileSync(
    join(OUT_DIR, 'meta.json'),
    JSON.stringify(
      {
        id: 'medexam-tw',
        displayName: '台灣一階醫師國考',
        locale: 'zh-TW',
        builtAt: new Date().toISOString(),
        sourceCredit: SOURCE_CREDIT,
        sourceUrl: SOURCE_URL,
        license: 'CC-BY-NC-4.0',
        stats: { totalQuestions: questions.length, parsedFiles, totalFiles: all.length, subjects: subjects.length },
      },
      null,
      2,
    ),
  )

  console.log(`[build] parsed ${parsedFiles} / ${all.length} files`)
  console.log(`[build] questions: ${importedQ} across ${subjects.length} subjects`)
  for (const s of subjects) console.log(`         ${s.id} (${s.group}): ${s.totalQuestions}`)

  // Mock-exam discoverability: distinct (year, session, paper) triples — each ≈ one real 國考 paper
  const paperCounts = new Map<string, number>()
  for (const q of questions) {
    const key = `${q.meta.year}-${q.meta.session}-${q.meta.paper}`
    paperCounts.set(key, (paperCounts.get(key) ?? 0) + 1)
  }
  const sortedPairs = [...paperCounts.entries()].sort(([a], [b]) => b.localeCompare(a))
  console.log(`[build] mock-exam papers: ${sortedPairs.length} distinct (year, session, paper) triples`)
  for (const [key, count] of sortedPairs) console.log(`         ${key}: ${count} Q`)

  console.log(`[build] wrote ${OUT_DIR}/`)
  console.log(`[build] imported: ${importedQ}, skipped: ${skippedQ}, total: ${totalBlocksSeen}`)

  if (skippedQ > 0 && !ALLOW_SKIPS) {
    console.error(
      `[build] FAIL: ${skippedQ} question block(s) skipped. ` +
        `Fix the source/parser, or re-run with MEDEXAM_ALLOW_SKIPS=1 if intentional.`,
    )
    process.exit(1)
  }
}

function subjectColor(id: string): string {
  const map: Record<string, string> = {
    解剖學: '#c44d4d',
    生物化學: '#6a8c3f',
    生理學: '#6a9bc4',
    胚胎學: '#d4a04d',
    組織學: '#a06ac4',
    藥理學: '#c46a8c',
    微生物暨免疫學: '#4d8cc4',
    病理學: '#8c5a3f',
    公共衛生學: '#5fa57e',
    寄生蟲學: '#7a8c4d',
  }
  return map[id] ?? '#8c6d4a'
}

main()
