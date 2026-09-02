/**
 * Generate per-option 簡答 for questions missing from the sidecar, via agy (Gemini, headless).
 *
 * The original full run used Haiku and the 2026-07-13 115-1 backfill used Sonnet subagents;
 * this is the same contract driven by `agy --print` so a new sitting can be backfilled without
 * a fan-out. It writes the SAME work-dir shape `merge-jianda-batch.ts` already consumes
 * (manifest.json + jianda-out/<qid>.json), so the committed deterministic validator — not this
 * script — remains the thing that decides what ships.
 *
 * Usage:
 *   node scripts/option-explanations/gen-jianda-agy.mjs <workDir> [idPrefix] [batch=6]
 *   # then: tsx scripts/option-explanations/merge-jianda-batch.ts <workDir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const PKG = resolve(import.meta.dirname, '..', '..')
const CORPUS = join(PKG, 'data', 'medexam-reconciled', 'questions.json')
const SIDECAR = join(PKG, 'provenance', 'option-explanations.generated.json')
const AGY = join(process.env.HOME, '.local', 'bin', 'agy')
const MODEL = process.env.AGY_MODEL ?? 'Gemini 3.7 Flash (Medium)'

const workDir = process.argv[2]
if (!workDir) throw new Error('usage: gen-jianda-agy.mjs <workDir> [idPrefix] [batch]')
const idPrefix = process.argv[3] ?? ''
const BATCH = Number(process.argv[4] ?? 6)

const corpus = JSON.parse(readFileSync(CORPUS, 'utf-8'))
const sidecar = existsSync(SIDECAR) ? JSON.parse(readFileSync(SIDECAR, 'utf-8')) : {}
const targets = corpus.filter((q) => q.id.startsWith(idPrefix) && !sidecar[q.id])
const outDir = join(workDir, 'jianda-out')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(workDir, 'manifest.json'), JSON.stringify(targets.map((q) => ({ qid: q.id })), null, 1))
console.log(`${targets.length} question(s) need a 簡答 (prefix "${idPrefix}")`)

const HEAD = `你是台灣醫師一階國考題的「每選項一句話簡答」產生器。
給每一題的每個選項寫**一句**繁體中文短句，說明它為什麼對／為什麼錯。

硬規則：
- 每句 8–80 個字（含標點），**寧可精簡**，目標 20–35 字。
- 純文字：不可出現 markdown、HTML、表格符號 | < > \`\`\` --- 或開頭的 # * - •。
- 直接寫理由，不要寫「選項A」「此選項」開頭，不要重述題幹。
- 正解要點出「為什麼對」（機轉／構造／指標），錯誤選項要點出「錯在哪」。
- 醫學名詞可用英文，首次出現可加中文。
- 一律以提供的「官方答案」為準；即使你有不同看法也照官方答案寫。
- 若提供的詳解完全沒說明某錯誤選項的錯因，該選項就輸出這一串字（原樣）：詳解未明確說明此選項錯因

只輸出嚴格 JSON 陣列，不要 code fence、不要任何其他文字：
[{"qid":"...","optionExplanations":{"A":"...","B":"...","C":"...","D":"..."}}]
`

function block(q) {
  let s = `\n[${q.qid ?? q.id}]\n題幹：${q.stem}\n`
  for (const [k, v] of Object.entries(q.options)) s += `(${k}) ${v}\n`
  s += `官方答案：${q.disputed ? '本題一律給分（無單一正解）' : (q.acceptedAnswers?.length ? q.acceptedAnswers.join('、') + ' 均給分' : q.answer)}\n`
  s += `詳解：${(q.explanation || '').slice(0, 1600)}\n`
  return s
}

function parse(raw) {
  let s = String(raw).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const i = s.indexOf('['), j = s.lastIndexOf(']')
  if (i < 0 || j < 0) return null
  try { return JSON.parse(s.slice(i, j + 1)) } catch { return null }
}

let written = 0, failed = 0
for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH).filter((q) => !existsSync(join(outDir, `${q.id}.json`)))
  if (batch.length === 0) { console.log(`  batch ${i / BATCH + 1}: cached`); continue }
  const prompt = HEAD + '\n題目：\n' + batch.map(block).join('')
  let parsed = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      parsed = parse(execFileSync(AGY, ['-p', prompt, '--model', MODEL, '--print-timeout', '240s'],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 300000 }))
    } catch (e) { console.error(`  agy error: ${String(e).slice(0, 140)}`) }
  }
  const got = new Map((parsed ?? []).map((r) => [r.qid, r.optionExplanations]))
  for (const q of batch) {
    const oe = got.get(q.id)
    if (oe && Object.keys(oe).length === Object.keys(q.options).length) {
      writeFileSync(join(outDir, `${q.id}.json`), JSON.stringify({ status: 'ok', optionExplanations: oe }, null, 1))
      written++
    } else {
      writeFileSync(join(outDir, `${q.id}.json`), JSON.stringify({ status: 'needs_review', reason: 'agy returned nothing usable' }, null, 1))
      failed++
    }
  }
  console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(targets.length / BATCH)}: ${batch.length} asked, ok=${written} fail=${failed}`)
}
console.log(`\ndone: ${written} written / ${failed} unusable → ${outDir}`)
