// LLM span picker (add-neurons-handout-cloze-corpus D5, task 4.3). Ported from study-rpg-2nd
// `_cloze-wip/pick.mjs` (pick-v3; neurons pick-v4 adds `hide`, design D7). One call per topic; the model
// sees ONLY that topic's candidate bullets (from `select.mjs`, shown EXACTLY as the bullet plain text,
// cite years included) and returns, per bullet, one verbatim span — plus up to 3 verbatim `hide`
// phrases that give the answer away (they become `hint` masks) — or `skip`. It never writes text: `admit.mjs` re-locates
// every span in the reader plain text and the build gate decides.
//
//   $TSX packages/content-neurons-tw/scripts/cloze-wip/pick.mjs [--subjects=…] [--force] [--model="Gemini 3.8 Flash (Medium)"]
//
// Agent mode (the pilot's mode, design D5):
//   pick.mjs --subjects=… --emit-prompts=<dir>   write <dir>/<draft>.prompt.txt for every topic whose
//                                                draft is missing or failed (same buildPrompt)
//   pick.mjs --subjects=… --ingest=<dir> --model="claude-sonnet-5-5 (subagent)"
//                                                parse <dir>/<draft>.reply.txt with the same parseReply
//                                                and write the draft exactly as an agy call would
//
// Resumable: each topic's result is `drafts/<subject>__<leaf>.json`. A topic whose draft is `ok` for
// the same candidate set, prompt version and model is skipped; `--force` redoes it. A FAILED call is
// saved as `status: "failed"` with the error and retried on the next run — never recorded as a skip.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DRAFTS_DIR, WIP_DIR, draftName, subjectsFromArgv } from './lib.mjs'

/** Bump when the prompt changes; a draft made under another version is redone. */
export const PROMPT_VERSION = 'neurons-pick-v4'

const AGY = join(homedir(), '.local/bin/agy')
/**
 * agy Gemini Flash (2nd's owner choice; 3.5 Flash left agy 2026-09-29). Recorded on every draft.
 * NEVER add `--dangerously-skip-permissions` to the agy call.
 */
const DEFAULT_MODEL = 'Gemini 3.8 Flash (Medium)'
const CALL_TIMEOUT_MS = 300_000

const argModel = process.argv.find((a) => a.startsWith('--model='))
const MODEL = argModel ? argModel.slice('--model='.length) : DEFAULT_MODEL
const FORCE = process.argv.includes('--force')
// --only=<json array file of anchorIds>: process ONLY these topics (others' drafts untouched, not
// re-emitted even if the prompt version changed) — used to re-pick just the topics a grading round flagged.
const argOnly = process.argv.find((a) => a.startsWith('--only='))
const ONLY = argOnly ? new Set(JSON.parse(readFileSync(argOnly.slice('--only='.length), 'utf-8'))) : null
const argEmit = process.argv.find((a) => a.startsWith('--emit-prompts='))
const EMIT_DIR = argEmit ? argEmit.slice('--emit-prompts='.length) : null
const argIngest = process.argv.find((a) => a.startsWith('--ingest='))
const INGEST_DIR = argIngest ? argIngest.slice('--ingest='.length) : null

/**
 * Only the linked options that actually talk about THIS sentence: a mark links every question of
 * the leaf in that sitting, most of them about another sentence. Share of the option's character
 * bigrams that also occur in the sentence.
 */
const bigrams = (s) => {
  const c = Array.from(s.replace(/\s+/g, '').toLowerCase())
  const out = new Set()
  for (let i = 0; i + 1 < c.length; i += 1) out.add(c[i] + c[i + 1])
  return out
}
export function relevantOptions(sentence, options, min = 0.35) {
  const S = bigrams(sentence)
  return [...new Set(options)].filter((o) => {
    const O = bigrams(o)
    if (O.size < 2) return false
    let hit = 0
    for (const x of O) if (S.has(x)) hit += 1
    return hit / O.size >= min
  })
}

const clip = (s, n) => (Array.from(s).length > n ? Array.from(s).slice(0, n).join('') + '…' : s)

export function buildPrompt(kp) {
  const lines = [
    '你是台灣醫師國考（一階）的出題老師，要把講義句子做成「挖空字卡」。',
    `考點：${kp.heading}`,
    '',
    '下面每一句都是講義原文（逐字照抄，含句末的出題年份標記）。請為每一句決定：挖掉句中**一段連續原文**當答案，或回 skip。',
    '',
    '挖空片段的規則（違反任何一條就改挖別段，或 skip）：',
    '1. 必須是句中**逐字**、連續的字元（含標點與空白都要一字不差），長度 2–20 字。不可改寫、不可省略。**不可包含句末的出題年份標記**（每句下方「年份標記」列出的文字，例如 104/106、115-2），也不可只挖年份。',
    '2. 挖「考試真的會考、答案唯一」的那個關鍵事實：構造或衍生物的名稱、致病原或宿主、機轉、首選藥物／治療／檢查、特徵性表現、關鍵病名。**優先挖概念（構造、病原、機轉、藥名、病名、表現），少挖純數字**：只有當數字本身是定義或診斷的關鍵門檻（或發育時序的關鍵天數／週數）、而且連結考題真的考過這個數字時才挖（整段數字連單位，範圍 A–B 要整段挖）；流行病學比例、發生率、存活率這類數字一律不挖，改挖同句中的概念或 skip。',
    '3. 不可挖：句首冒號前的粗體小標題；單獨的否定或極性詞（不、無、禁、切勿、避免…）；連接詞；整個長子句；「如／例如」後面的舉例值；「由 X 升至 Y」這種病程數值。',
    '4. 挖掉後，答案文字不可在同一句其他地方**未遮住地**再出現（否則等於洩題）；若會重複出現，依規則 12 把另一處列入 hide，做不到就改挖別段或 skip。',
    '5. 答案必須唯一：若句中是「A、B 或 C」並列而只挖其中一個會讓讀者合理填出別的答案，請 skip；若同句寫了兩個互相衝突的數字，請 skip。',
    '6. 若答案緊接著中文的英文括號註解，例如「血漿置換術（Plasma Exchange, PLEX）」，只挖中文「血漿置換術」，括號會由程式一併遮住；不要把括號放進答案，也不要只挖英文。',
    '7. 不挖教科書之間有版本差異、或屬冷僻細節的數字；寧可 skip，也不要湊一張普通的卡。',
    '8. 每句最多一個片段。',
    '9. 不可挖否定敘述的受詞：例如「不需使用類固醇」「絕不可進行鐙骨切除術」「對確診的必要性極低」「極少轉移至 X」「非首選」——讀者會想填「該做的」而不是「不該做的」，答案不唯一。要挖就挖同句中正向的那個事實，否則 skip。',
    '10. 答案不可就是這個考點的名稱本身（例如考點是「瘧疾」，就不要挖「瘧疾」），也不可是「減壓」「病程長短」這類籠統詞；答案要具體到能唯一填出。',
    '11. 同一件事實若在別句也出現，只挑一次。',
    '12. 洩題片語一併遮住（`hide`）：同句中若有讓人不懂這個事實也能推出答案的片語，把它們逐字列在 `hide`，程式會把它們顯示成【…】。只有以下四種才列：(a) 答案的同義詞、縮寫或代號（例如挖「迷走神經」而句中有「CN X」→ hide「CN X」）；(b) **不是**緊接在答案後面的英文原文或同義詞（緊接答案的英文括號，例如「血漿置換術（Plasma Exchange, PLEX）」，程式會自動遮住，**不要**列）；(c)「並非／而非 X」這種對照讓人二選一就能推出（例如挖「右葉」而句中寫「並非左葉」→ hide「並非左葉」）；(d) 後文以另一種說法重述同一事實，包括答案在句中第二次出現（例如挖「脾臟切除者」而後句寫「脾切除者失去這道防線」→ hide「脾切除者」）。每段必須是句中逐字、連續、**在句中只出現一次**的原文（不夠唯一就多帶一兩個前後字），長度 ≤20 字，不可與答案片段重疊，不可包含年份標記；最多 3 段。只遮洩題的那幾個字，不要遮整個子句。遮完後句子若讀不懂，或非得單獨遮掉一個否定詞（不、非、並非…）才不洩題，就 skip。沒有洩題就省略 `hide`。',
    '13. 答案要是專有名詞或具體事實，不可是口語形容（例如「老少通吃」）、或只是整套處置中的一個步驟而讓人以為那就是全部。',
    '14. 句子下方若列出「這句被考過的題目」：答案必須正是那題在問的點——學生要答對那題，必須知道你挖掉的這幾個字。句中別的事實再重要也不挖；若句中沒有任何片段對應題目的問點，skip。沒有列題目的句子，照規則 1–13 判斷，寧可 skip。',
    '15. 以下情況遮不掉，一律 skip：(a) 答案是一串列舉中的一項，而同句列出了其餘各項，讀者可用消去法填出；(b) 答案可由句中其他數字算出（例如給了總和與其他各項）；(c) 考點標題本身就含有答案。',
    '',
    '「連結考題的正確敘述」是這句話出處的歷屆考題中被判定為正確的選項，可幫你判斷哪個片段是真正被考的點；只能用來判斷，答案仍必須取自講義句子本身。',
    '',
    '只輸出一個 JSON 陣列，不要其他文字。每句一個物件：',
    '{"n": 句號, "span": "逐字片段", "hide": ["逐字洩題片語", …], "why": "一句話理由"} 或 {"n": 句號, "skip": true, "why": "理由"}',
    '（`hide` 可省略；有列時最多 3 段，每段 ≤20 字。）',
    '',
  ]
  kp.candidates.forEach((c, i) => {
    lines.push(`【${i + 1}】${c.sentence}`)
    if (c.citeText?.length) lines.push(`  年份標記（不可挖）：${c.citeText.join('、')}`)
    const bold = c.spans.filter((s) => s.kind === 'bold').map((s) => s.span)
    if (bold.length) lines.push(`  作者粗體：${bold.join('、')}`)
    for (const t of (c.tested ?? []).slice(0, 2)) lines.push(`  這句被考過的題目：題幹「${clip(t.stem.replace(/\s+/g, " ").trim(), 80)}」；正確敘述「${clip(t.trueOption, 60)}」`)
    const opts = relevantOptions(c.sentence, c.trueOptions).slice(0, 4)
    if (opts.length) lines.push(`  連結考題的正確敘述：${opts.map((o) => `「${clip(o, 60)}」`).join('；')}`)
  })
  return lines.join('\n')
}

/** The first JSON array in the model's reply, or throw — a reply we cannot read is a FAILURE. */
export function parseReply(text, n) {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('no JSON array in reply')
  const arr = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(arr)) throw new Error('reply is not an array')
  const picks = new Map()
  for (const o of arr) {
    if (!o || typeof o.n !== 'number' || o.n < 1 || o.n > n) throw new Error(`bad item ${JSON.stringify(o)}`)
    if (o.skip === true) picks.set(o.n, { skip: true, why: String(o.why ?? '') })
    else if (typeof o.span === 'string' && o.span !== '') {
      // pick-v4: optional `hide` — verbatim phrases that give the answer away (→ `hint` masks in admit).
      if (o.hide !== undefined && !(Array.isArray(o.hide) && o.hide.every((h) => typeof h === 'string' && h !== ''))) {
        throw new Error(`item ${o.n}: hide must be an array of non-empty strings`)
      }
      const pick = { span: o.span, why: String(o.why ?? '') }
      if (o.hide?.length) pick.hide = [...o.hide]
      picks.set(o.n, pick)
    } else throw new Error(`item ${o.n} has neither span nor skip`)
  }
  if (picks.size !== n) throw new Error(`reply covers ${picks.size} of ${n} sentences`)
  return [...picks.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ n: k, ...v }))
}

const CONCURRENCY = 4

function callAgy(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(AGY, ['-p', prompt, '--model', MODEL], { cwd: tmpdir() }) // keep the repo out of its tool loop
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`agy timed out after ${CALL_TIMEOUT_MS} ms`))
    }, CALL_TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`agy spawn: ${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`agy exit ${code}: ${(err || out).slice(0, 400)}`))
      else resolve(out)
    })
  })
}

async function main() {
  const cand = JSON.parse(readFileSync(join(WIP_DIR, 'candidates.json'), 'utf-8'))
  const subjects = new Set(subjectsFromArgv())
  mkdirSync(DRAFTS_DIR, { recursive: true })
  const tally = { calls: 0, reused: 0, noCandidates: 0, picked: 0, skipped: 0, failed: 0 }
  const jobs = []
  for (const kp of cand.topics) {
    if (!subjects.has(kp.subjectId)) continue
    if (ONLY && !ONLY.has(kp.anchorId)) continue
    const path = join(DRAFTS_DIR, draftName(kp.anchorId))
    const prompt = buildPrompt(kp)
    const inputHash = createHash('sha256').update(PROMPT_VERSION + MODEL + prompt).digest('hex').slice(0, 16)
    if (kp.candidates.length === 0) {
      writeFileSync(path, JSON.stringify({ anchorId: kp.anchorId, status: 'ok', inputHash, picks: [], candidates: [] }, null, 1))
      tally.noCandidates += 1
      console.log(`[pick] ${kp.anchorId} — no candidates (picked 0, skipped 0, failed 0)`)
      continue
    }
    if (!FORCE && existsSync(path)) {
      const prev = JSON.parse(readFileSync(path, 'utf-8'))
      const prevHash = createHash('sha256').update(PROMPT_VERSION + (prev.model ?? MODEL) + prompt).digest('hex').slice(0, 16)
      if (prev.status === 'ok' && prev.inputHash === prevHash) {
        tally.reused += 1
        const p = prev.picks.filter((x) => !x.skip).length
        tally.picked += p
        tally.skipped += prev.picks.length - p
        console.log(`[pick] ${kp.anchorId} — reused (picked ${p}, skipped ${prev.picks.length - p}, failed 0)`)
        continue
      }
    }
    if (EMIT_DIR) {
      mkdirSync(EMIT_DIR, { recursive: true })
      writeFileSync(join(EMIT_DIR, draftName(kp.anchorId).replace(/\.json$/, '.prompt.txt')), prompt + '\n')
      tally.calls += 1
      continue
    }
    const replyPath = INGEST_DIR ? join(INGEST_DIR, draftName(kp.anchorId).replace(/\.json$/, '.reply.txt')) : null
    if (INGEST_DIR && !existsSync(replyPath)) {
      tally.failed += 1
      console.error(`[pick] ${kp.anchorId} — FAILED (no reply file ${replyPath})`)
      continue
    }
    jobs.push(async () => {
    tally.calls += 1
    let reply = ''
    try {
      reply = INGEST_DIR ? readFileSync(replyPath, 'utf-8') : await callAgy(prompt)
      const picks = parseReply(reply, kp.candidates.length)
      const p = picks.filter((x) => !x.skip).length
      tally.picked += p
      tally.skipped += picks.length - p
      writeFileSync(
        path,
        JSON.stringify(
          { anchorId: kp.anchorId, status: 'ok', model: MODEL, promptVersion: PROMPT_VERSION, signalVersion: cand.signalVersion, inputHash, candidates: kp.candidates, picks, reply },
          null,
          1,
        ),
      )
      console.log(`[pick] ${kp.anchorId} — picked ${p}, skipped ${picks.length - p}, failed 0`)
    } catch (err) {
      tally.failed += 1
      writeFileSync(
        path,
        JSON.stringify({ anchorId: kp.anchorId, status: 'failed', model: MODEL, promptVersion: PROMPT_VERSION, inputHash, error: String(err), reply }, null, 1),
      )
      console.error(`[pick] ${kp.anchorId} — FAILED (${kp.candidates.length} sentences not decided): ${String(err).slice(0, 300)}`)
    }
    })
  }
  if (EMIT_DIR) {
    console.log(`[pick] emitted ${tally.calls} prompts → ${EMIT_DIR} (reused ${tally.reused}, no-candidate ${tally.noCandidates})`)
    return
  }
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) await jobs[next++]()
    }),
  )
  console.log(
    `[pick] model ${MODEL}: agy calls ${tally.calls}, reused ${tally.reused}, no-candidate 考點 ${tally.noCandidates}; picked ${tally.picked}, skipped ${tally.skipped}, FAILED 考點 ${tally.failed}`,
  )
  if (tally.failed > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) await main()
