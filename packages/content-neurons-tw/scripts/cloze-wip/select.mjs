// Rule layer (add-neurons-handout-cloze-corpus D5, task 4.2). Picks WHICH bullets of a topic are
// worth a card; the LLM (`pick.mjs`) only picks the span inside them. Ported from study-rpg-2nd
// `_cloze-wip/select.mjs` (select-v2). neurons changes:
//   - only `ul.hdt-must > li` bullets are considered (no 考點重點 block labels in the HTML handout);
//     a sentence is the bullet's plain text from the SHARED `extractTopics` (cite years included, as
//     displayed), so it is character-for-character the text the gate anchors in;
//   - year signal = the bullet's `<cite>` tokens (`115`, `104/106`, `115-2`); bold = `<b>`;
//   - a bullet with an `hdt-intl` note or ⚠️ is excluded (the gate's `isExcludedSource`);
//   - no rule span may touch a `<cite>` range;
//   - linked questions: the topic's (leaf ∩ same-subject) questions, narrowed — as in 2nd — to the
//     sittings the bullet cites.
//
//   $TSX packages/content-neurons-tw/scripts/cloze-wip/select.mjs [--subjects=胚胎學,寄生蟲學] [--widen=<json>]
//   → scripts/cloze-wip/candidates.json
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { boldTexts, removeRanges } from '../../src/handout/topic-plain-text.ts'
import { isExampleValue, isExcludedSource, isNegatedStem, isPartialRange } from '../../src/handout/cloze-gate.ts'
import { WIP_DIR, loadContent, loadSubject, subjectsFromArgv } from './lib.mjs'

/** Bump when scoring or exclusion rules change; recorded on every card as `signalVersion`. */
export const SIGNAL_VERSION = 'neurons-select-v2'

/** Candidates per topic = CANDIDATE_FACTOR × maxCards (design D6: about twice the ceiling). */
const CANDIDATE_FACTOR = 2
/** A bullet below this score is not offered to the LLM: the ceiling is not a target. */
const MIN_SENTENCE_SCORE = 3
/**
 * A topic with NO bullet at `MIN_SENTENCE_SCORE` may offer up to `maxCards` bullets at this score,
 * which still requires a real rule signal (a trigger phrase or a thresholded number), never cites alone.
 */
const FALLBACK_SENTENCE_SCORE = 2

// ─── patterns (from 2nd signals.py / select-v2) ─────────────────────────────

const CONTRAST_RE = /[（(](?:而非|並非|非|不是|而不是)[^）)]{1,40}[）)]/
// 2nd's unit table plus basic-science units (neurons: 一階 = physiology / biochem / embryology …).
const NUM_RE =
  /(?<![\d.,/])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\/\d+)?\s*(?:(?:–|-|~|～|至|到)\s*\d+(?:\.\d+)?\s*)?(?:mmHg|mOsm\/kg(?: H2O)?|mOsm\/L|mOsm|mL\/min(?:\/1\.73 ?m2)?|mL\/kg|mg\/dL|mg\/kg|mmol\/L|mEq\/L|meq\/L|g\/dL|g\/g Cr|g\/day|U\/L|kDa|μg|μm|µm|mcg|mg|mL|mV|ms|nm|IU|dB|Hz|%|％|cm|mm|kg|小時|天|日|週|個月|歲|分鐘|秒|倍|°C)(?![A-Za-z/])/g
const POLARITY_RE = /^(絕對)?(不|無|非|禁|切勿|避免|勿|無法|不可|不包括|不建議|不需|不宜)[^，。]{0,3}$/
const TRIGGER_RE =
  /(首選(?:藥物|治療|檢查|處置)?(?:為|是)?|第一線(?:治療|藥物)?(?:為|是)?|金標準(?:為|是)?|黃金標準(?:為|是)?|最常見(?:的)?(?:原因|病因|致病菌|表現|類型|症狀)?(?:為|是)|最重要(?:的)?(?:[^，。；、]{0,6})?(?:為|是)|唯一(?:能|可)?[^，。；、]{0,6}(?:為|是)|確診(?:需|靠|依據|方法)?(?:為|是)?|典型(?:表現|特徵)?(?:為|是)|最常發生(?:之|的)?[^，。；、]{0,6}(?:為|是))\s*/g
const STOP_SPAN = new Set(['不', '非', '無', '或', '與', '及', '和', '不可', '禁用', '不是', '而非', '可', '是'])
const PUNCT = '，。；、（）()：:「」'

const charLen = (s) => Array.from(s).length
const norm = (s) =>
  s
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/％/g, '%')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
const trimPunct = (s) => {
  let t = s.trim()
  while (t && PUNCT.includes(t[0])) t = t.slice(1).trim()
  while (t && PUNCT.includes(t[t.length - 1])) t = t.slice(0, -1).trim()
  return t
}

/**
 * The bullet's `<cite>` tokens: `115` → ['115']; `104/106` → ['104','106']; `111-2/113-2` → both.
 * Only `Y` and `Y-S` shapes count (anything else in a cite is not a sitting).
 */
export function citeMarks(bullet) {
  const out = []
  for (const r of bullet.citeRanges) {
    for (const tok of bullet.text.slice(r.start, r.end).split(/[/、,，\s]+/)) {
      const t = tok.trim()
      if (/^\d{3}(?:-[12])?$/.test(t)) out.push(t)
    }
  }
  return out
}

/** Does `[s, e)` (bullet-local) touch a `<cite>` range? */
const touchesCite = (bullet, s, e) => bullet.citeRanges.some((r) => s < r.end && r.start < e)

/** The topic's linked questions whose sitting the bullet cites (`Y` = either sitting of that year). */
function linkedForBullet(b, marks) {
  const { questions } = loadContent()
  return b.linkedQuestionIds
    .map((id) => questions.get(id))
    .filter(Boolean)
    .filter((q) =>
      marks.some((m) => {
        const [y, s] = m.split('-')
        return Number(y) === q.meta?.year && (s === undefined || Number(s) === q.meta?.session)
      }),
    )
}

/**
 * Option texts of the linked questions, split by stem polarity (the gate's `isNegatedStem`) and the
 * scored answer: what a question credits as TRUE, and what it refutes. Non-negated stem → keyed
 * options are true; negated stem (何者錯誤 …) → the NON-keyed options are true.
 */
function optionPolarity(qs) {
  const trueOpts = []
  const falseOpts = []
  for (const q of qs) {
    const keyed = new Set([q.answer, ...(q.acceptedAnswers ?? [])])
    const neg = isNegatedStem(q.stem ?? '')
    for (const [k, v] of Object.entries(q.options ?? {})) {
      if (typeof v !== 'string') continue
      ;(keyed.has(k) !== neg ? trueOpts : falseOpts).push(v)
    }
  }
  return { trueOpts, falseOpts }
}

/**
 * Rule candidates inside one bullet, each with signals.py's score. Every span must occur ONCE in the
 * bullet, must not touch a `<cite>`, and must not already fail an obvious gate shape.
 */
function ruleSpans(bullet, marks, poles) {
  const plain = bullet.text
  const cands = []
  const add = (span, kind, base) => {
    const sp = trimPunct(span)
    if (charLen(sp) < 2 || charLen(sp) > 20 || STOP_SPAN.has(sp)) return
    const at = plain.indexOf(sp)
    if (at === -1 || plain.indexOf(sp, at + 1) !== -1) return
    if (touchesCite(bullet, at, at + sp.length)) return
    if (isPartialRange(plain, at, at + sp.length) || isExampleValue(plain, at, at + sp.length)) return
    cands.push({ span: sp, kind, base })
  }
  // C1 — author inline bold (`<b>`), not the bullet's leading `<b>label</b>：`.
  const lead = bullet.leadingBold?.followedByColon ? bullet.leadingBold.text : null
  for (const raw of boldTexts(bullet.raw)) {
    if (lead !== null && raw === lead) continue
    const cb = raw.replace(/\s*[（(][^）)]*[）)]?\s*$/, '').trim()
    if (POLARITY_RE.test(cb)) add(cb, 'bold-polarity', 1)
    else add(cb, 'bold', 3)
  }
  // C2 — numeric threshold with a unit.
  for (const m of plain.matchAll(NUM_RE)) {
    const pre = plain.slice(Math.max(0, m.index - 20), m.index)
    if (/(由|從)\s*[\d.]+\s*\S{0,6}(升至|降至|上升到|下降到)\s*$/.test(pre)) continue
    const comp =
      /(大於|小於|超過|不超過|低於|高於|至少|達|≥|≤|>|<)\s*(或等於)?\s*$/.test(plain.slice(Math.max(0, m.index - 6), m.index)) ||
      /^\s*(以上|以下|以內)/.test(plain.slice(m.index + m[0].length, m.index + m[0].length + 3))
    add(m[0], 'number', comp ? 3 : 2)
  }
  // C3 — the object after a trigger phrase.
  for (const m of plain.matchAll(TRIGGER_RE)) {
    const tail = plain.slice(m.index + m[0].length)
    add(tail.split(/[，。；、（(]/)[0], 'trigger', 2)
  }
  // C3b — the object BEFORE a postposed trigger: 「以 X（…）最為常見」.
  for (const m of plain.matchAll(/以([^，。；、（(以]{2,20})(?:（[^）]*）)?\s*(?:最為常見|最常見|為主|最多)/g)) {
    add(m[1], 'trigger', 2)
  }

  const trueN = poles.trueOpts.map(norm).join('|')
  const falseN = poles.falseOpts.map(norm).join('|')
  const seen = new Set()
  const out = []
  for (const c of cands) {
    if (seen.has(c.span)) continue
    seen.add(c.span)
    const signals = [c.kind]
    let score = c.base
    const nm = Math.min(marks.length, 3)
    if (nm) {
      signals.push(`marks×${marks.length}`)
      score += nm
    }
    const ns = norm(c.span)
    if (charLen(ns) >= 3 && trueN.includes(ns)) {
      signals.push('in-true-option')
      score += 3
    } else if (charLen(ns) >= 3 && falseN.includes(ns)) {
      signals.push('in-distractor')
      score -= 3
    }
    const idx = plain.indexOf(c.span)
    const after = plain.slice(idx + c.span.length, idx + c.span.length + 14)
    if (CONTRAST_RE.test(after) || /^[（(](而非|並非|非)/.test(after)) {
      signals.push('contrast')
      score += 2
    }
    out.push({ ...c, signals, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

/**
 * select-v2 (pilot round 3): exam evidence. Grading showed card quality tracks whether a linked
 * question actually tests THIS bullet (examAlignment tested → 45/46 good; related → mostly ordinary).
 * A question "tests" a bullet when one of its TRUE options shares at least EXAM_OVERLAP of its
 * character bigrams with the bullet. (Stem overlap was tried and dropped: stems repeat the topic
 * name, so nearly every bullet matched. Calibrated on round-2 grades: tested median 0.63 vs
 * related 0.53 — a weak split, so pick-v3 rule 14 does the real filtering.)
 */
const EXAM_OVERLAP = 0.6
/** Topics with no exam-evidenced bullet may still offer this many bullets, so coverage survives. */
const NO_EVIDENCE_QUOTA = 1
const bigramSet = (t) => {
  const c = Array.from(String(t).replace(/\s+/g, '').toLowerCase())
  const out = new Set()
  for (let i = 0; i + 1 < c.length; i += 1) out.add(c[i] + c[i + 1])
  return out
}
const overlapShare = (S, text) => {
  const O = bigramSet(text)
  if (O.size < 2) return 0
  let hit = 0
  for (const g of O) if (S.has(g)) hit += 1
  return hit / O.size
}
function examEvidence(sentence, qs) {
  const S = bigramSet(sentence)
  const out = []
  for (const q of qs) {
    const keyed = new Set([q.answer, ...(q.acceptedAnswers ?? [])])
    const neg = isNegatedStem(q.stem ?? '')
    const trueOpts = Object.entries(q.options ?? {})
      .filter(([k, v]) => typeof v === 'string' && keyed.has(k) !== neg)
      .map(([, v]) => v)
    const optHit = trueOpts.find((o) => overlapShare(S, o) >= EXAM_OVERLAP)
    if (optHit) out.push({ id: q.id, stem: q.stem ?? '', trueOption: optHit ?? trueOpts[0] ?? '' })
  }
  return out
}

/** Every candidate bullet of one topic, ranked, capped at `CANDIDATE_FACTOR × maxCards`. */
export function selectForTopic(b, widen = false) {
  const { topic, maxCards } = b
  const rows = []
  const excluded = []
  topic.bullets.forEach((bullet, bulletIndex) => {
    if (isExcludedSource(bullet)) {
      excluded.push(bulletIndex)
      return
    }
    const sentence = bullet.text
    // A pure parent label (`<b>X</b>：` and nothing but cites after it) holds no fact.
    const lbl = bullet.leadingBold
    if (lbl?.followedByColon) {
      const bodyStart = lbl.end - bullet.start
      const cites = bullet.citeRanges.filter((r) => r.start >= bodyStart).map((r) => ({ start: r.start - bodyStart, end: r.end - bodyStart }))
      if (!removeRanges(sentence.slice(bodyStart), cites).replace(/^\s*[：:]/, '').trim()) return
    }
    const marks = citeMarks(bullet)
    const qs = linkedForBullet(b, marks)
    const poles = optionPolarity(qs)
    const spans = ruleSpans(bullet, marks, poles)
    const score = spans.length ? spans[0].score : Math.min(marks.length, 3)
    const tested = examEvidence(sentence, qs)
    rows.push({
      tested,
      bulletIndex,
      sentence,
      citeText: bullet.citeRanges.map((r) => sentence.slice(r.start, r.end)),
      marks,
      linkedQuestionIds: qs.map((q) => q.id),
      trueOptions: poles.trueOpts,
      spans,
      score,
    })
  })
  // select-v2: exam-evidenced bullets outrank everything; within each group, rule score.
  const rank = (x, y) => (y.tested.length > 0) - (x.tested.length > 0) || y.score - x.score || x.bulletIndex - y.bulletIndex
  const base = { considered: rows.length, excluded: excluded.length }
  // Re-pick: a topic that ended with no usable card is widened to every eligible bullet (no score
  // floor), still capped, so the picker can find a fact the rules did not score.
  if (widen) return { ...base, fallback: false, widened: true, candidates: rows.sort(rank).slice(0, 2 * CANDIDATE_FACTOR * maxCards) }
  // select-v2: a topic with exam-evidenced bullets offers ONLY those (score floor waived — the exam
  // is the signal); a topic with none keeps at most NO_EVIDENCE_QUOTA rule-scored bullets for coverage.
  const evidenced = rows.filter((r) => r.tested.length > 0).sort(rank)
  if (evidenced.length > 0) return { ...base, fallback: false, evidenced: true, candidates: evidenced.slice(0, CANDIDATE_FACTOR * maxCards) }
  const eligible = rows.filter((r) => r.score >= MIN_SENTENCE_SCORE).sort(rank).slice(0, NO_EVIDENCE_QUOTA)
  if (eligible.length === 0) {
    const fallback = rows.filter((r) => r.score >= FALLBACK_SENTENCE_SCORE).sort(rank)
    return { ...base, fallback: true, candidates: fallback.slice(0, NO_EVIDENCE_QUOTA) }
  }
  return { ...base, fallback: false, candidates: eligible.slice(0, CANDIDATE_FACTOR * maxCards) }
}

function main() {
  const argWiden = process.argv.find((a) => a.startsWith('--widen='))
  const WIDEN = new Set(argWiden ? JSON.parse(readFileSync(argWiden.slice('--widen='.length), 'utf-8')) : [])
  const out = []
  const noCandidates = []
  const untagged = []
  let totalCands = 0
  for (const subjectId of subjectsFromArgv()) {
    const sub = loadSubject(subjectId)
    for (const u of sub.untagged) untagged.push(`${subjectId}#topic${u.ordinal}（${u.heading}）`)
    for (const b of sub.bound) {
      const { considered, excluded, fallback, widened, candidates } = selectForTopic(b, WIDEN.has(b.anchorId))
      totalCands += candidates.length
      if (candidates.length === 0) noCandidates.push(b.anchorId)
      out.push({
        subjectId,
        relPath: sub.relPath,
        anchorId: b.anchorId,
        leafId: b.leafId,
        leafIds: b.leafIds,
        heading: b.heading,
        tier: b.tier,
        maxCards: b.maxCards,
        ...(widened ? { widened: true } : {}),
        candidates,
      })
      console.log(
        `[select] ${b.anchorId} (${b.tier}, max ${b.maxCards}) — bullets ${considered} (+${excluded} excluded hdt-intl/⚠️), candidates ${candidates.length}${fallback ? ` (fallback ≥${FALLBACK_SENTENCE_SCORE})` : ''}${widened ? ' (widened)' : ''}`,
      )
    }
  }
  const path = join(WIP_DIR, 'candidates.json')
  writeFileSync(path, JSON.stringify({ signalVersion: SIGNAL_VERSION, topics: out }, null, 1) + '\n')
  if (untagged.length) console.log(`[select] untagged topics (hold no cards, not in the denominator): ${untagged.join('、')}`)
  console.log(`[select] topics with NO candidates (${noCandidates.length}): ${noCandidates.join(', ') || '—'}`)
  console.log(
    `[select] ${SIGNAL_VERSION}: ${out.length - noCandidates.length}/${out.length} tagged topics with candidates, ${totalCands} candidate sentences → ${path}`,
  )
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main()
