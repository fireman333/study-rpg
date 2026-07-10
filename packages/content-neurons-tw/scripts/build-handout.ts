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
import type { HandoutData, HandoutSubject } from '../src/handout/handout-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const FRAG_DIR = join(PKG, 'src', 'handout')
const DIST = join(PKG, 'dist')

// Display order + titles. Any fragment without an entry falls back to `${id} 考前講義`.
const SUBJECT_META: Record<string, { order: number; title: string }> = {
  解剖學: { order: 0, title: '解剖學 考前講義' },
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

const subjects: HandoutSubject[] = fragFiles
  .map((f) => {
    const subjectId = basename(f, '.html')
    const html = readFileSync(join(FRAG_DIR, f), 'utf8').trim()
    lint(subjectId, html)
    const meta = SUBJECT_META[subjectId]
    return { subjectId, title: meta?.title ?? `${subjectId} 考前講義`, html, _order: meta?.order ?? 99 }
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
  `✓ Built dist/handout.json — ${subjects.length} subject(s): ${subjects.map((s) => `${s.subjectId} (${(s.html.length / 1024).toFixed(0)}KB)`).join(', ')}`,
)
