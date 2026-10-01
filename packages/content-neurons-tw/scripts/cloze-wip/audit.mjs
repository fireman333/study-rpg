// Leak audit (task 7.6): an agent that did NOT pick the card reads only the masked face and decides
// whether the answer is inferable from the face itself. Pick-time self-checks missed 13/18 bad cards
// in pilot round 4 (unhidden restatement / synonym / contrast, elimination), so this is a separate pass.
//
//   $TSX …/audit.mjs --emit=<dir> [--size=35]   # admitted.json → <dir>/audit-NN.packet.json
//   (agents write <dir>/audit-NN.reply.json per grade/prompt-leak-audit.txt)
//   $TSX …/audit.mjs --apply=<dir>              # verdicts → drafts/ (hide appended / pick → skip)
//   $TSX …/admit.mjs                            # re-admit from the audited drafts
//
// Apply edits drafts in place and keeps their inputHash, so pick.mjs will NOT redo audited topics.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WIP = dirname(fileURLToPath(import.meta.url))
const DRAFTS = join(WIP, 'drafts')
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const EMIT = arg('emit')
const APPLY = arg('apply')
const SIZE = Number(arg('size') ?? 35)
const MAX_HIDE = 3
const MAX_HIDE_LEN = 20
const VERDICTS = new Set(['ok', 'hide', 'drop'])
const LEAKS = new Set(['none', 'synonym', 'contrast', 'restatement', 'elimination', 'arithmetic', 'heading', 'not-unique'])

const draftName = (anchorId) => anchorId.replace('::', '__') + '.json'
const count = (s, sub) => (sub ? s.split(sub).length - 1 : 0)

if (EMIT) {
  const cards = JSON.parse(readFileSync(join(WIP, 'admitted.json'), 'utf-8')).cards
  mkdirSync(EMIT, { recursive: true })
  const rows = cards.map((c) => ({
    cardId: c.card.cardId,
    // Identity of what the auditor saw: --apply refuses a verdict whose card has since changed
    // (cardId survives a reworded bullet by design, so cardId alone is not enough).
    sentenceHash: c.card.sentenceHash,
    heading: c.heading,
    face: c.face,
    answer: c.answer,
    hint: c.hint ?? [],
    gloss: c.gloss ?? [],
    sentence: c.sentence,
  }))
  let k = 0
  for (let i = 0; i < rows.length; i += SIZE) {
    k += 1
    const group = `audit-${String(k).padStart(2, '0')}`
    writeFileSync(join(EMIT, `${group}.packet.json`), JSON.stringify({ group, cards: rows.slice(i, i + SIZE) }, null, 1) + '\n')
    console.log(`[audit] ${group}: ${rows.slice(i, i + SIZE).length} cards`)
  }
  console.log(`[audit] emitted ${rows.length} cards in ${k} packet(s) → ${EMIT}`)
} else if (APPLY) {
  const cards = new Map(JSON.parse(readFileSync(join(WIP, 'admitted.json'), 'utf-8')).cards.map((c) => [c.card.cardId, c]))
  const tally = { ok: 0, hide: 0, drop: 0, problems: 0 }
  const leaks = {}
  const drafts = new Map()
  const loadDraft = (anchorId) => {
    if (!drafts.has(anchorId)) drafts.set(anchorId, JSON.parse(readFileSync(join(DRAFTS, draftName(anchorId)), 'utf-8')))
    return drafts.get(anchorId)
  }
  const problem = (msg) => {
    tally.problems += 1
    console.error(`[audit] PROBLEM ${msg}`)
  }
  for (const f of readdirSync(APPLY).filter((n) => n.endsWith('.reply.json')).sort()) {
    const reply = JSON.parse(readFileSync(join(APPLY, f), 'utf-8'))
    const packet = JSON.parse(readFileSync(join(APPLY, f.replace('.reply.json', '.packet.json')), 'utf-8'))
    for (const seen of packet.cards) {
      const { cardId } = seen
      const v = reply[cardId]
      if (!v || !VERDICTS.has(v.verdict) || !LEAKS.has(v.leak)) {
        problem(`${f}: ${cardId} missing or invalid verdict/leak`)
        continue
      }
      leaks[v.leak] = (leaks[v.leak] ?? 0) + 1
      tally[v.verdict] += 1
      if (v.verdict === 'ok') continue
      const c = cards.get(cardId)
      if (!c || c.card.sentenceHash !== seen.sentenceHash || c.answer !== seen.answer || c.face !== seen.face) {
        // Fail closed on drift: admitted.json was regenerated after --emit, so this verdict was about
        // a different card face. Re-emit and re-audit instead of applying a stale judgement.
        problem(`${cardId}: card changed since the audit packet was emitted (re-run --emit)`)
        continue
      }
      const d = loadDraft(c.card.anchorId)
      const pick = d.picks.find((p) => !p.skip && p.span === c.answer && d.candidates[p.n - 1]?.sentence === c.sentence)
      if (!pick) {
        problem(`${cardId}: no draft pick matches answer 「${c.answer}」`)
        continue
      }
      if (v.verdict === 'drop') {
        pick.skip = true
        pick.why = `leak-audit drop (${v.leak}): ${v.reason ?? ''}`
        continue
      }
      const sentence = d.candidates[pick.n - 1].sentence
      const hide = [...(pick.hide ?? [])]
      for (const h of v.hide ?? []) {
        if (hide.includes(h)) continue
        if (Array.from(h).length > MAX_HIDE_LEN || count(sentence, h) !== 1 || h.includes(pick.span) || pick.span.includes(h)) {
          problem(`${cardId}: hide 「${h}」 not verbatim-unique, too long, or overlaps the answer`)
          continue
        }
        hide.push(h)
      }
      if (hide.length > MAX_HIDE) {
        // Cannot hide every leak within the cap: dropping beats shipping a leaking card.
        pick.skip = true
        pick.why = `leak-audit drop (needs ${hide.length} hides > ${MAX_HIDE})`
        continue
      }
      pick.hide = hide
      pick.why = `${pick.why ?? ''} | leak-audit hide (${v.leak})`
    }
  }
  for (const [anchorId, d] of drafts) writeFileSync(join(DRAFTS, draftName(anchorId)), JSON.stringify(d, null, 1))
  console.log(`[audit] applied: ok ${tally.ok}, hide ${tally.hide}, drop ${tally.drop}, problems ${tally.problems}; leak ${JSON.stringify(leaks)}; drafts rewritten ${drafts.size}`)
  if (tally.problems) process.exitCode = 1
} else {
  console.error('usage: audit.mjs --emit=<dir> [--size=N] | --apply=<dir>')
  process.exitCode = 1
}
