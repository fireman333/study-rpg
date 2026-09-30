// Admission (add-neurons-handout-cloze-corpus D5, task 4.4). Ported from study-rpg-2nd
// `_cloze-wip/admit.mjs` (admit-v4). Turns `pick.mjs` drafts into cards, runs every card through the
// BUILD'S OWN gate (`validateClozeCorpus`), assigns card ids, and writes the owner's review sheet.
//
//   $TSX packages/content-neurons-tw/scripts/cloze-wip/admit.mjs [--subjects=…]
//     → admitted.json        every card that passed the gate (the pilot's grading denominator)
//     → pilot-review.md      the owner review sheet, one section per subject
//     → admit-log.json       what was dropped before or at the gate, and why
//   $TSX packages/content-neurons-tw/scripts/cloze-wip/admit.mjs --promote [--subjects=…]
//     → src/handout/_cloze/<subject>.json `{version: 1, cards}` — ONLY owner-graded good/ordinary cards
//       whose bullet is not on an unacknowledged contradiction listing (`admit-lib.mjs`
//       `promotableCards`, acks in `contradiction-acks.json`). MERGED into the existing file
//       (`mergePromoted`): a card already there is replaced by its new version or kept — never
//       dropped silently.
//
// ⚠️ admit / promote share `slugs.json` and `admitted.json` (read whole, written whole, no lock):
// run them SEQUENTIALLY in a single process — never two at once.
//
// Card ids: `<leafId>#k<N>`, assigned once (`admit-lib.mjs` `assignCardIds`). The ceiling with tier
// drift is `capAndAssign`: the current tier caps NEW cards only; an existing `_cloze/` card keeps its
// `tierAtAdmission` and is never dropped by the cap (spec: "Re-admission after tier drift").
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { djb2Hex } from '../../src/handout/topic-plain-text.ts'
import { maxCardsForTier, sentenceSimilarity, trailingGloss, validateClozeCorpus } from '../../src/handout/cloze-gate.ts'
import {
  capAndAssign,
  contradictionKeys,
  maskFace,
  mergePromoted,
  pilotRates,
  promotableCards,
  resolveHides,
  uniqueContext,
} from './admit-lib.mjs'
import { CLOZE_SRC_DIR, DRAFTS_DIR, WIP_DIR, draftName, loadContent, loadSubject, readJson, subjectsFromArgv } from './lib.mjs'

const PROMOTE = process.argv.includes('--promote')
export const ADMIT_VERSION = 'neurons-admit-v2'

/**
 * Generator filters (NOT gate checks — the gate is unchanged), from 2nd admit-v2: the object of a
 * negated statement (「不需使用【類固醇】」) and the topic's own name as answer were the recurring
 * bad/ordinary shapes; the same fact carded in two topics was the other.
 */
const NEGATED_OBJECT_BEFORE = /(不需(?:要)?(?:使用|給予)?|不宜(?:使用)?|不應(?:使用)?|絕不可(?:進行|使用)?|不可(?:進行|使用)?|禁用|極少(?:轉移至|發生)?|必要性[^，。]{0,6}極低|而非|並非)\s*$/
const DUPLICATE_SIMILARITY = 0.25
/** admit-v3: two cards with the same answer are the same fact when the words AROUND the blank agree (±15). */
const blankContext = (sentence, span) => {
  const at = sentence.indexOf(span)
  return sentence.slice(Math.max(0, at - 15), at) + sentence.slice(at + span.length, at + span.length + 15)
}
const headingZh = (h) => h.split(/[（(]/)[0].trim()

/**
 * admit-v4 pure-number policy (owner 2026-09-29: 「減少純數字背誦，除非那個數字真的很重要」). A
 * PURE-NUMBER answer — digits plus units / comparison words and nothing else (`72 小時`, `第 3–4 天`,
 * `-70 mV`) — is kept only when the exam tested that number (`numberTestedByExam`: every digit group
 * appears in the stem or an option of a linked question) or it DEFINES something
 * (`isDefinitionalThreshold`). neurons adds basic-science units (mV, ms, μm, nm, kDa, mOsm, 秒…).
 */
const NUMBER_FILLER =
  /\d+(?:\.\d+)?|mg\/dL|g\/dL|mEq\/L|mmHg|mL\/min(?:\/1\.73\s*m2)?|mmol\/L|mOsm\/kg|mOsm\/L|mOsm|kDa|kg|cm|mm|μm|µm|nm|mV|ms|dB|Hz|[%％:：\/~～–\-.\s]|大於|小於|以上|以下|超過|不超過|至少|約|至|到|個|小時|天|日|週|周|個月|月|年|歲|分鐘|秒|次|倍|內|前|後|第/g
export const isPureNumber = (answer) => /\d/.test(answer) && answer.replace(NUMBER_FILLER, '') === ''
const digitsOf = (s) => s.match(/\d+(?:\.\d+)?/g) ?? []
/** A number that DEFINES the entity (e.g. 慢性＝超過 12 週) is worth knowing even if untested. */
export function isDefinitionalThreshold(sentence, span) {
  const at = sentence.indexOf(span)
  if (at === -1) return false
  const cut = Math.max(...['。', '；', '\n'].map((d) => sentence.lastIndexOf(d, at))) + 1
  const clause = sentence.slice(cut, at + span.length + 12)
  return /定義|診斷標準|診斷條件|稱為|即可診斷|才算|分為急性|慢性/.test(clause)
}
export function numberTestedByExam(answer, linkedIds, questions) {
  const want = digitsOf(answer)
  for (const id of linkedIds ?? []) {
    const q = questions.get(id)
    if (!q) continue
    const text = [q.stem, ...Object.values(q.options ?? {})].join(' ').replace(/\s+/g, '')
    const have = new Set(digitsOf(text))
    if (want.every((d) => have.has(d))) return true
  }
  return false
}

const SLUGS_PATH = join(WIP_DIR, 'slugs.json')
const clozePath = (subjectId) => join(CLOZE_SRC_DIR, `${subjectId}.json`)
/** The `_cloze/` source's cards, or `[]` when the file does not exist yet. */
function existingCards(subjectId) {
  const f = readJson(clozePath(subjectId), null)
  if (f === null) return []
  if (!f || f.version !== 1 || !Array.isArray(f.cards)) throw new Error(`${clozePath(subjectId)} is not {version: 1, cards: [...]}`)
  return f.cards
}

function gateOne(file, card, topics, content) {
  return validateClozeCorpus({
    files: [{ file, source: { version: 1, cards: [card] }, topics }],
    recurrence: content.recurrence,
    questions: content.questions,
  })
}

/** The bullet-local window a mask's context may use: inside the bullet, never into a `<cite>`. */
function contextWindow(bullet, ls, le) {
  let lo = 0
  let hi = bullet.text.length
  for (const r of bullet.citeRanges) {
    if (r.end <= ls) lo = Math.max(lo, r.end)
    if (r.start >= le) hi = Math.min(hi, r.start)
  }
  return { lo, hi }
}

function buildCards(sub, candByAnchor, log) {
  const cards = []
  for (const b of sub.bound) {
    const draft = readJson(join(DRAFTS_DIR, draftName(b.anchorId)), null)
    if (!draft) {
      log.push({ anchorId: b.anchorId, stage: 'draft', why: 'no draft (pick.mjs not run)' })
      continue
    }
    if (draft.status !== 'ok') {
      log.push({ anchorId: b.anchorId, stage: 'draft', why: `draft status ${draft.status}: ${draft.error}` })
      continue
    }
    if (!candByAnchor.has(b.anchorId)) {
      log.push({ anchorId: b.anchorId, stage: 'draft', why: 'topic missing from candidates.json (re-run select.mjs)' })
    }
    for (const p of draft.picks) {
      if (p.skip) continue
      const c = draft.candidates[p.n - 1]
      const bullet = b.topic.bullets[c.bulletIndex]
      const base = { anchorId: b.anchorId, n: p.n, span: p.span, sentence: c.sentence }
      if (!bullet || bullet.text !== c.sentence) {
        log.push({ ...base, stage: 'pick', why: 'stale: the bullet changed since select.mjs ran' })
        continue
      }
      const bt = bullet.text
      // pick-v4: the answer is the one occurrence no `hide` phrase touches; each hide phrase occurs once.
      const located = resolveHides(bt, p.span, p.hide ?? [])
      if (located.error) {
        log.push({ ...base, hide: p.hide, stage: 'pick', why: located.error })
        continue
      }
      const at = located.at
      if (NEGATED_OBJECT_BEFORE.test(bt.slice(Math.max(0, at - 10), at))) {
        log.push({ ...base, stage: 'filter', why: 'object of a negated statement' })
        continue
      }
      const zh = headingZh(b.heading)
      if (p.span === zh || (Array.from(p.span).length >= 4 && zh.includes(p.span))) {
        log.push({ ...base, stage: 'filter', why: "answer is the topic's own name" })
        continue
      }
      const masks = []
      const ranges = []
      const addMask = (ls, le, role) => {
        const w = contextWindow(bullet, ls, le)
        const ctx = uniqueContext(b.topic.text, bullet.start + ls, bullet.start + le, bullet.start + w.lo, bullet.start + w.hi)
        if (!ctx) return false
        masks.push({ exact: bt.slice(ls, le), prefix: ctx.prefix, suffix: ctx.suffix, role })
        ranges.push({ start: ls, end: le, role })
        return true
      }
      if (!addMask(at, at + p.span.length, 'answer')) {
        log.push({ ...base, stage: 'pick', why: 'no 0–12 char context (outside <cite>) makes the span unique in the topic' })
        continue
      }
      // A parenthesis right after the answer is covered by a `gloss` mask — still verbatim, no new text.
      const g = trailingGloss(bt, at + p.span.length)
      if (g && g.end > g.start && !addMask(g.start, g.end, 'gloss')) {
        log.push({ ...base, stage: 'pick', why: 'gloss parenthesis cannot be anchored uniquely' })
        continue
      }
      // pick-v4 `hide` → `hint` masks (design D7). A phrase inside the automatic gloss (its parentheses
      // included) is already hidden: drop THAT phrase only. Any other phrase that cannot be anchored
      // uniquely drops the whole card — a card showing its giveaway is the failure hints exist for.
      let hintFailed = null
      for (const h of located.hides) {
        if (g && g.end > g.start && g.start - 1 <= h.start && h.end <= g.end + 1) {
          log.push({ ...base, hide: h.text, stage: 'hide', why: 'hide phrase inside the automatic gloss: phrase dropped, card kept' })
          continue
        }
        if (!addMask(h.start, h.end, 'hint')) {
          hintFailed = h.text
          break
        }
      }
      if (hintFailed !== null) {
        log.push({ ...base, hide: hintFailed, stage: 'pick', why: 'hide phrase: no 0–12 char context (outside <cite>) makes it unique in the topic' })
        continue
      }
      const rule = c.spans.find((s) => s.span === p.span)
      const card = {
        cardId: `${b.leafId}#draft`,
        anchorId: b.anchorId,
        masks,
        marks: c.marks,
        linkedQuestionIds: c.linkedQuestionIds,
        kind: rule ? rule.kind : 'llm',
        signalScore: rule ? rule.score : c.score,
        signalVersion: draft.signalVersion,
        tierAtAdmission: b.tier,
      }
      cards.push({
        card,
        meta: { ...base, bulletIndex: c.bulletIndex, bulletHash: djb2Hex(bt), why: p.why, ranges, leafId: b.leafId, heading: b.heading, tier: b.tier },
      })
    }
  }
  return cards
}

function main() {
  const content = loadContent()
  const cand = readJson(join(WIP_DIR, 'candidates.json'), { topics: [] })
  const candByAnchor = new Map(cand.topics.map((t) => [t.anchorId, t]))
  const slugs = readJson(SLUGS_PATH, {})
  /** Owner acknowledgements: contradiction listings that are two different facts. */
  const ACKS = readJson(join(WIP_DIR, 'contradiction-acks.json'), [])
  const admitted = []
  const log = []
  const reports = []
  const subjects = []
  let wholeErrors = 0
  for (const subjectId of subjectsFromArgv()) {
    const sub = loadSubject(subjectId)
    const file = sub.clozeFile
    const tierOf = new Map(sub.bound.map((b) => [b.anchorId, b.tier]))
    const built = buildCards(sub, candByAnchor, log)
    // Card-level gate, one card at a time, so each rejection is attributed to its card.
    const passed = []
    for (const x of built) {
      const r = gateOne(file, x.card, sub.topics, content)
      if (r.errors.length === 0) passed.push(x)
      else for (const e of r.errors) log.push({ anchorId: x.meta.anchorId, n: x.meta.n, span: x.meta.span, sentence: x.meta.sentence, stage: 'gate', reason: e.reason, why: e.message })
    }
    // Pure-number answers the exam never tested are rote memorisation, not a key fact.
    for (const x of [...passed]) {
      if (isPureNumber(x.meta.span) && !isDefinitionalThreshold(x.meta.sentence, x.meta.span) && !numberTestedByExam(x.meta.span, x.card.linkedQuestionIds, content.questions)) {
        passed.splice(passed.indexOf(x), 1)
        log.push({ anchorId: x.meta.anchorId, span: x.meta.span, stage: 'filter', why: 'pure number not tested by any linked question' })
      }
    }
    // The same fact carded in two topics of this subject: keep the stronger signal.
    for (const x of [...passed]) {
      const twin = passed.find(
        (y) =>
          y !== x &&
          y.meta.anchorId !== x.meta.anchorId &&
          y.meta.span === x.meta.span &&
          sentenceSimilarity(blankContext(y.meta.sentence, y.meta.span), blankContext(x.meta.sentence, x.meta.span)) >= DUPLICATE_SIMILARITY &&
          (y.card.signalScore > x.card.signalScore || (y.card.signalScore === x.card.signalScore && passed.indexOf(y) < passed.indexOf(x))),
      )
      if (twin) {
        passed.splice(passed.indexOf(x), 1)
        log.push({ anchorId: x.meta.anchorId, span: x.meta.span, stage: 'filter', why: `same fact as a card in ${twin.meta.anchorId}` })
      }
    }
    // The ceiling (current tier, NEW cards only) + card ids.
    const existing = existingCards(subjectId)
    const items = passed.map((x) => ({
      anchorId: x.meta.anchorId,
      leafId: x.meta.leafId,
      bulletHash: x.meta.bulletHash,
      answer: x.meta.span,
      signalScore: x.card.signalScore,
      bulletIndex: x.meta.bulletIndex,
    }))
    const cap = capAndAssign(
      items,
      slugs,
      existing,
      (anchorId) => {
        const t = tierOf.get(anchorId)
        if (t === undefined) throw new Error(`${anchorId} has no current tier`)
        return t
      },
      maxCardsForTier,
    )
    for (const i of cap.capped) {
      const x = passed[i]
      log.push({ anchorId: x.meta.anchorId, span: x.meta.span, stage: 'cap', why: `over the ${maxCardsForTier(x.meta.tier)}-card ceiling of ${x.meta.tier} (lower signal, or slots taken by existing cards)` })
    }
    const kept = cap.kept.map((i, k) => {
      const x = passed[i]
      x.card.cardId = cap.ids[k]
      x.card.tierAtAdmission = cap.tierAtAdmission[k]
      return x
    })
    // The subject as the build will see it after a full promote (existing cards merged): zero errors.
    const merged = mergePromoted(existing, kept.map((x) => x.card)).cards
    const whole = validateClozeCorpus({
      files: [{ file, source: { version: 1, cards: merged }, topics: sub.topics }],
      recurrence: content.recurrence,
      questions: content.questions,
    })
    if (whole.errors.length) {
      for (const e of whole.errors) console.error(`[admit] ✗ whole-subject gate ${e.reason}: ${e.file} ${e.cardId ?? ''} — ${e.message}`)
      wholeErrors += whole.errors.length
      process.exitCode = 1
    }
    reports.push(whole.report)
    const shippedById = new Map(whole.cards.map((c) => [c.cardId, c]))
    for (const x of kept) {
      admitted.push({
        subjectId,
        file,
        card: shippedById.get(x.card.cardId) ?? x.card,
        face: maskFace(x.meta.sentence, x.meta.ranges),
        answer: x.meta.span,
        gloss: x.card.masks.filter((m) => m.role === 'gloss').map((m) => m.exact),
        hint: x.card.masks.filter((m) => m.role === 'hint').map((m) => m.exact),
        sentence: x.meta.sentence,
        heading: x.meta.heading,
        tier: x.meta.tier,
        why: x.meta.why,
      })
    }
    const cov = new Set(kept.map((x) => x.meta.anchorId)).size
    subjects.push({ subjectId, relPath: sub.relPath, topics: sub.bound.length, carded: cov, cards: kept.length, existing: existing.length })
    console.log(
      `[admit] ${subjectId}: built ${built.length}, gate-passed ${passed.length}, kept ${kept.length} (capped ${cap.capped.length}, existing in _cloze ${existing.length}); topics with ≥1 card ${cov}/${sub.bound.length}`,
    )
  }
  const contradictions = reports.flatMap((r) => r.contradictions)
  const duplicates = reports.flatMap((r) => r.duplicates)

  if (PROMOTE) {
    if (wholeErrors > 0) {
      console.error(`[admit] --promote refused: the whole-subject gate has ${wholeErrors} error(s)`)
      process.exitCode = 1
      return
    }
    const grades = readJson(join(WIP_DIR, 'pilot-grades.json'), null)
    if (!grades) {
      console.error('[admit] --promote refused: pilot-grades.json not found')
      process.exitCode = 1
      return
    }
    const { promote, refused } = promotableCards(admitted.map((a) => a.card), grades, { contradictions }, ACKS)
    for (const r of refused) console.log(`[admit] refused ${r.cardId}: ${r.why}`)
    writeFileSync(SLUGS_PATH, JSON.stringify(slugs, null, 1) + '\n')
    const bySubject = new Map()
    for (const c of promote) {
      const a = admitted.find((x) => x.card.cardId === c.cardId)
      // Source cards carry no derived fields: the build re-derives bulletText / citeRanges / sentenceHash.
      const { bulletText: _b, citeRanges: _c, sentenceHash: _h, ...source } = c
      bySubject.set(a.subjectId, [...(bySubject.get(a.subjectId) ?? []), source])
    }
    for (const [subjectId, cards] of bySubject) {
      const path = clozePath(subjectId)
      const merged = mergePromoted(existingCards(subjectId), cards)
      mkdirSync(CLOZE_SRC_DIR, { recursive: true })
      writeFileSync(path, JSON.stringify({ version: 1, cards: merged.cards }, null, 2) + '\n')
      for (const id of merged.kept) console.log(`[admit] kept ${id} (already in ${subjectId}.json, not in this run's promote set)`)
      console.log(
        `[admit] promoted → ${path}: ${merged.cards.length} cards (replaced ${merged.replaced.length}, added ${merged.added.length}, kept ${merged.kept.length})`,
      )
    }
    console.log(`[admit] promote: ${promote.length} promoted, ${refused.length} refused, ${admitted.length} admitted`)
    return
  }

  writeFileSync(SLUGS_PATH, JSON.stringify(slugs, null, 1) + '\n')
  writeFileSync(
    join(WIP_DIR, 'admitted.json'),
    JSON.stringify({ admitVersion: ADMIT_VERSION, subjects, cards: admitted, contradictions, duplicates }, null, 1) + '\n',
  )
  writeFileSync(join(WIP_DIR, 'admit-log.json'), JSON.stringify(log, null, 1) + '\n')
  const byReason = {}
  for (const l of log) {
    const k = l.stage === 'gate' ? `gate:${l.reason}` : `${l.stage}:${l.why.split(':')[0]}`
    byReason[k] = (byReason[k] ?? 0) + 1
  }
  // `hide` entries drop one hide phrase, not a card.
  console.log(`[admit] admitted ${admitted.length}; dropped ${log.filter((l) => l.stage !== 'hide').length}:`, byReason)
  console.log(`[admit] report: contradictions ${contradictions.length}, duplicates ${duplicates.length}`)
  writeReviewSheet(subjects, admitted, contradictions, ACKS)
}

function writeReviewSheet(subjects, admitted, contradictions, acks) {
  const grades = readJson(join(WIP_DIR, 'pilot-grades.json'), { grades: {} })
  const one = (s) => String(s).replace(/\n/g, ' ')
  const G = { good: '好', ordinary: '普通', bad: '不好', 'medical-error': '醫學錯誤' }
  const lines = [
    '# 講義挖空字卡試點（一階 neurons）— owner 審核表',
    '',
    '> 每張卡都已通過 build 閘門（逐字、唯一、形狀白名單），但**醫學正確性沒有任何自動檢查**。',
    '> 「agent 預評」欄是 agent 的預先判讀（`pilot-grades.json` 的 `grader: "agent-pregrade"`），**不是**你的評分，也不能用來 promote。',
    '> 請在「owner」欄填：好 / 普通 / 不好 / 醫學錯誤。發布門檻：好 ≥70%、不好 ≤10%、醫學錯誤 0（分母＝下表全部卡）；考點覆蓋率分母 33。',
    '> 卡面中【＿＿＿】是答案、【…】是一併遮住的括號註解或洩題片語（hint）；句末數字是 `<cite>` 出題年份，不屬於卡。',
    '',
  ]
  const contradicted = contradictionKeys({ contradictions }, acks)
  const rates = pilotRates(grades.grades)
  if (rates.n) {
    lines.push(
      `預評合計：${rates.n} 張｜好 ${rates.good}（${(rates.goodRate * 100).toFixed(0)}%）｜普通 ${rates.ordinary}｜不好 ${rates.bad}（${(rates.badRate * 100).toFixed(0)}%，其中醫學錯誤 ${rates.medicalError}）`,
      '',
    )
  }
  const covered = subjects.reduce((n, s) => n + s.carded, 0)
  const total = subjects.reduce((n, s) => n + s.topics, 0)
  lines.push(`考點覆蓋：${covered}/${total}`, '')
  if (contradictions.length) {
    lines.push('## 數值矛盾（落在這些 bullet 上的卡不會被 promote，除非列在 contradiction-acks.json）', '')
    for (const c of contradictions) for (const l of c.locations) lines.push(`- **${c.subject}** \`${l.value}\` @ ${l.topic}：${one(l.sentence).slice(0, 120)}…`)
    lines.push('')
  }
  for (const s of subjects) {
    lines.push(`## ${s.relPath}`, '', `${s.cards} 張｜有卡考點 ${s.carded}/${s.topics}`, '')
    let heading = null
    for (const a of admitted.filter((x) => x.subjectId === s.subjectId)) {
      if (a.heading !== heading) {
        heading = a.heading
        lines.push(`### ${heading}（${a.tier}）`, '')
      }
      const g = grades.grades?.[a.card.cardId]
      lines.push(
        `#### \`${a.card.cardId}\`${contradicted.has(`${a.card.anchorId}|${a.card.sentenceHash}`) ? '　⚠️ 落在數值矛盾 bullet，promote 會拒收' : ''}`,
        `- 卡面：${one(a.face)}`,
        `- 答案：**${one(a.answer)}**${a.gloss.length ? `　（一併遮住：${one(a.gloss.join('；'))}）` : ''}${a.hint?.length ? `　（洩題片語遮住：${one(a.hint.join('；'))}）` : ''}`,
        `- 原句：${one(a.sentence)}`,
        `- agent 預評：${g ? `${G[g.grade] ?? g.grade}${g.medicalError ? '（醫學錯誤）' : ''} — ${one(g.reason ?? '')}` : '—'}`,
        '- owner：',
        '',
      )
    }
  }
  writeFileSync(join(WIP_DIR, 'pilot-review.md'), lines.join('\n') + '\n')
  console.log(`[admit] review sheet → ${join(WIP_DIR, 'pilot-review.md')}`)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main()
