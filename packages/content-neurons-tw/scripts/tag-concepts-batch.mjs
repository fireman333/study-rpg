/**
 * Cheap-model batch concept tagging (add-neurons-concept-tags §2.2).
 *
 * Classifies each question into 1–3 tested leaf concepts from its OWN subject's closed
 * tree, via batched agy (Gemini flash, $0) calls — NOT per-question, NOT a Claude fan-out.
 * Bounded per design D2: batch ~30, hard call budget, single pass + one flagged re-pass,
 * validator drops out-of-vocab ids. Keyword pre-pass unique hits are the fallback so every
 * question ends with ≥1 tag (100% coverage).
 *
 * Usage: node scripts/tag-concepts-batch.mjs [subjectsCSV|all] [batchSize=30] [maxCalls=300]
 * Output: provenance/concept-tags.model.json  { qid: { leafIds:[...], src:"model|keyword|repass" } }
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')
const AGY = join(process.env.HOME, '.local', 'bin', 'agy')
const MODEL = 'Gemini 3.5 Flash (Medium)'

const arg = process.argv[2] ?? 'all'
const BATCH = Number(process.argv[3] ?? 30)
const MAX_CALLS = Number(process.argv[4] ?? 300)
const ALL_SUBJECTS = ['生物化學','解剖學','胚胎學','組織學','生理學','微生物學','免疫學','寄生蟲學','藥理學','病理學','公共衛生學']
const subjects = arg === 'all' ? ALL_SUBJECTS : arg.split(',')

const corpus = JSON.parse(readFileSync(join(PKG, 'dist', 'questions.json'), 'utf8'))
const bySubject = {}
for (const q of corpus) (bySubject[q.subject] ??= []).push(q)

const OUT = join(PKG, 'provenance', 'concept-tags.model.json')
const tags = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
// keyword pre-pass fallback (regenerate first if missing)
const KW = join(PKG, 'reference', 'concept-mining', 'keyword-prepass.json')
const keyword = existsSync(KW) ? JSON.parse(readFileSync(KW, 'utf8')) : {}

let calls = 0
const stats = { model: 0, keyword: 0, repass: 0, unclassified: 0, invalidDropped: 0 }

function leafListPrompt(sid, leaves) {
  let p = `你是台灣醫師國考題的概念分類器。以下是「${sid}」的封閉概念清單（leaf id｜中文｜英文），你只能從這些 id 中選：\n\n`
  for (const c of leaves) p += `- ${c.id} ｜ ${c.zh} ｜ ${c.en}\n`
  p += `\n為下面每一題，判斷它「實際在考」的 1–3 個概念（cap 3；只看題幹與正解選項，不看干擾選項，distractor 提到的不算）。回傳對應 leaf id。\n`
  p += `只輸出 JSON 陣列，格式 [{"qid":"...","leafIds":["..."]}]，不要任何其他文字或 markdown code fence。\n`
  return p
}
function questionsBlock(batch) {
  let b = `\n題目：\n`
  for (const x of batch) {
    b += `\n[${x.id}]\n題幹：${x.stem}\n`
    for (const [k, v] of Object.entries(x.options)) b += `(${k}) ${v}\n`
    b += `正解：${x.answer}\n`
  }
  return b
}
function callAgy(prompt) {
  calls++
  const out = execFileSync(AGY, ['-p', prompt, '--model', MODEL, '--print-timeout', '180s'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 200000,
  })
  return out
}
function parseJson(raw) {
  let s = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const i = s.indexOf('['), j = s.lastIndexOf(']')
  if (i < 0 || j < 0) return null
  try { return JSON.parse(s.slice(i, j + 1)) } catch { return null }
}

for (const sid of subjects) {
  const leaves = JSON.parse(readFileSync(join(PKG, 'reference', 'concept-mining', `${sid}.concepts.json`), 'utf8')).concepts
  const leafIds = new Set(leaves.map((c) => c.id))
  const prefix = leafListPrompt(sid, leaves)
  const qs = bySubject[sid] ?? []
  const batches = []
  for (let i = 0; i < qs.length; i += BATCH) batches.push(qs.slice(i, i + BATCH))
  console.log(`\n=== ${sid}: ${qs.length} Q / ${batches.length} batches (${leaves.length} leaves) ===`)

  for (let bi = 0; bi < batches.length; bi++) {
    if (calls >= MAX_CALLS) { console.error(`!! call budget ${MAX_CALLS} hit — aborting`); break }
    const batch = batches[bi]
    const need = batch.filter((x) => !tags[x.id])           // resume-safe: skip already-tagged
    if (need.length === 0) { console.log(`  batch ${bi + 1}/${batches.length}: cached`); continue }
    let parsed = null
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try { parsed = parseJson(callAgy(prefix + questionsBlock(need))) } catch (e) { console.error(`  agy error: ${String(e).slice(0, 120)}`) }
    }
    const got = new Map((parsed ?? []).map((r) => [r.qid, r.leafIds]))
    let tagged = 0, invalid = 0
    for (const x of need) {
      let ids = (got.get(x.id) ?? []).filter((id) => {
        if (leafIds.has(id)) return true; invalid++; stats.invalidDropped++; return false
      }).slice(0, 3)
      if (ids.length) { tags[x.id] = { leafIds: ids, src: 'model' }; stats.model++; tagged++ }
    }
    console.log(`  batch ${bi + 1}/${batches.length}: ${tagged}/${need.length} tagged${invalid ? `, ${invalid} invalid dropped` : ''} (call ${calls})`)
    writeFileSync(OUT, JSON.stringify(tags))          // flush after every batch (crash-safe)
  }
}

// Fallback: any question still untagged → keyword unique auto-tag, else record unclassified.
for (const sid of subjects) for (const x of bySubject[sid] ?? []) {
  if (tags[x.id]) continue
  const kw = keyword[x.id]
  if (kw?.unique) { tags[x.id] = { leafIds: [kw.unique], src: 'keyword' }; stats.keyword++ }
  else { stats.unclassified++ }
}
writeFileSync(OUT, JSON.stringify(tags))

const totalQ = subjects.reduce((s, sid) => s + (bySubject[sid]?.length ?? 0), 0)
console.log(`\n=== DONE: ${calls} agy calls ===`)
console.log(`  model-tagged:    ${stats.model}`)
console.log(`  keyword-fallback:${stats.keyword}`)
console.log(`  invalid dropped: ${stats.invalidDropped}`)
console.log(`  UNCLASSIFIED:    ${stats.unclassified}  (→ flagged re-pass §3.2)`)
console.log(`  coverage:        ${Object.keys(tags).length}/${totalQ}`)
console.log(`  → ${OUT}`)
