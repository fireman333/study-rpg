// Pure pieces of `admit.mjs` (add-neurons-handout-cloze-corpus D5, task 4.4), split out so the app's
// node test tier can exercise them without the filesystem, agy, or the content package
// (`apps/neurons-tw/src/__tests__/handout-cloze-admit.test.ts`). No imports on purpose — anything the
// gate owns (e.g. `maxCardsForTier`) is passed in. Ported from study-rpg-2nd `admit-lib.mjs`.

/** The grades a card may carry. `medical-error` is recorded separately from `bad` (spec: pilot gate). */
export const GRADES = ['good', 'ordinary', 'bad', 'medical-error']

/** Only the owner's grades can promote a card (spec: "The owner SHALL grade every pilot card"). */
export const PROMOTING_GRADER = 'owner'

/**
 * Is this report listing covered by an owner acknowledgement (`contradiction-acks.json`)? An ack
 * `{ subject, sentenceHashes, reason }` covers a listing when the subject matches and EVERY bullet
 * of the listing is among its hashes — so a listing that later grows a new location, or whose
 * bullet is reworded (new hash), is no longer covered and blocks again.
 */
export function isAcknowledged(listing, acks) {
  return (acks ?? []).some(
    (a) => a.subject === listing.subject && (listing.locations ?? []).every((l) => (a.sentenceHashes ?? []).includes(l.sentenceHash)),
  )
}

/**
 * `anchorId|sentenceHash` of every bullet the build report lists as a numeric contradiction —
 * minus the listings the owner has acknowledged as two different facts. The neurons gate names a
 * location's topic `topic` (its anchorId, or `<file>#topic<N>` for an untagged topic); 2nd's
 * `anchorId` is accepted too.
 */
export function contradictionKeys(report, acks = []) {
  const out = new Set()
  for (const c of report?.contradictions ?? []) {
    if (isAcknowledged(c, acks)) continue
    for (const l of c.locations ?? []) out.add(`${l.topic ?? l.anchorId}|${l.sentenceHash}`)
  }
  return out
}

/**
 * Which gate-passed cards may be written into `_cloze/`. A card is promoted only when ALL hold:
 *   - the grades file was written by the owner (an agent pre-grade never promotes);
 *   - the owner graded it good or ordinary;
 *   - its answer bullet is NOT on an unacknowledged contradiction listing (spec: "until it is
 *     corrected, or the owner records the listing as not a contradiction, the admission step SHALL
 *     refuse…") — whatever its grade.
 *
 * `cards` are gate-shipped cards (they carry `anchorId` and `sentenceHash`); `acks` is
 * `contradiction-acks.json`.
 */
export function promotableCards(cards, gradesFile, report, acks = []) {
  const promote = []
  const refused = []
  const contradicted = contradictionKeys(report, acks)
  const ownerGraded = gradesFile?.grader === PROMOTING_GRADER
  for (const card of cards) {
    const g = gradesFile?.grades?.[card.cardId]?.grade
    if (contradicted.has(`${card.anchorId}|${card.sentenceHash}`)) {
      refused.push({ cardId: card.cardId, why: 'contradiction' })
    } else if (!ownerGraded) {
      refused.push({ cardId: card.cardId, why: `not owner-graded (grader: ${gradesFile?.grader ?? 'none'})` })
    } else if (g === undefined) {
      refused.push({ cardId: card.cardId, why: 'ungraded' })
    } else if (g !== 'good' && g !== 'ordinary') {
      refused.push({ cardId: card.cardId, why: `graded ${g}` })
    } else {
      promote.push(card)
    }
  }
  return { promote, refused }
}

/** The answer mask's text of a card. */
export const answerOf = (card) => (card.masks ?? []).find((m) => m.role === 'answer')?.exact

const slugNumber = (id) => Number(String(id).slice(String(id).lastIndexOf('#') + 2))

/**
 * Card ids for one chapter file's cards. Spec: a cardId is assigned once and is never derived from
 * the text, so rewording a handout bullet must not mint a new one. In order:
 *   1. `slugs.json` already holds this (anchor, bullet hash, answer) → that id (same bullet);
 *   2. `existing` (the file already in `_cloze/`) has a card with the same anchorId and the same
 *      answer-mask `exact` not yet claimed this run → REUSE its id (the bullet was reworded);
 *   3. otherwise mint `<leafId>#k<N>`, N one past every id this anchor — or any anchor in another
 *      subject with the same leafId — has in slugs AND `existing` (cardIds are corpus-unique).
 * Pass 1 runs over all items before pass 2, so a reworded card cannot steal the id of a card whose
 * bullet did not change. Mutates `slugs` (records the choice). Returns ids in `items` order.
 *
 * `items`: `{ anchorId, leafId, bulletHash, answer }[]`.
 */
export function assignCardIds(items, slugs, existing = []) {
  const ids = new Array(items.length).fill(null)
  const taken = new Set()
  const keyOf = (it) => `${it.anchorId}|${it.bulletHash}|${it.answer}`
  items.forEach((it, i) => {
    const s = slugs[keyOf(it)]
    if (s && !taken.has(`${it.leafId}#${s}`)) {
      ids[i] = `${it.leafId}#${s}`
      taken.add(ids[i])
    }
  })
  items.forEach((it, i) => {
    if (ids[i]) return
    const hit = existing.find((c) => c.anchorId === it.anchorId && answerOf(c) === it.answer && !taken.has(c.cardId))
    if (hit) {
      ids[i] = hit.cardId
      slugs[keyOf(it)] = hit.cardId.slice(hit.cardId.lastIndexOf('#') + 1)
      taken.add(ids[i])
      return
    }
    const used = [
      ...Object.entries(slugs)
        // Same leafId in ANOTHER subject (e.g. 內科/外科 multiple-endocrine-neoplasia) shares the
        // `<leafId>#k<N>` namespace; the corpus requires cardId to be unique across subjects.
        .filter(([k]) => k.startsWith(`${it.anchorId}|`) || k.split('|')[0].endsWith(`::${it.leafId}`))
        .map(([, v]) => Number(String(v).slice(1))),
      ...existing.filter((c) => c.anchorId === it.anchorId || c.cardId.startsWith(`${it.leafId}#`)).map((c) => slugNumber(c.cardId)),
      ...[...taken].filter((id) => id.startsWith(`${it.leafId}#`)).map(slugNumber),
    ].filter((n) => Number.isFinite(n))
    const slug = `k${(used.length ? Math.max(...used) : 0) + 1}`
    slugs[keyOf(it)] = slug
    ids[i] = `${it.leafId}#${slug}`
    taken.add(ids[i])
  })
  return ids
}

/**
 * The per-topic ceiling with tier drift (spec: "Re-admission after tier drift"), then card ids.
 *
 * Admission enforces the CURRENT tier's ceiling only against NEW cards. A card that re-emerges as an
 * existing `_cloze/` card (same cardId, as `assignCardIds` would assign it) is always kept and keeps
 * its recorded `tierAtAdmission`. New cards fill only the slots the current ceiling leaves after
 * EVERY existing card of that topic (a `--promote` merge keeps existing cards whether or not they
 * re-emerge), best signal first; the rest are `capped`.
 *
 * `items`: `{ anchorId, leafId, bulletHash, answer, signalScore, bulletIndex }[]` (gate-passed).
 * `currentTierOf(anchorId)` → the topic's current tier; `maxCardsFor(tier)` → its ceiling.
 * Mutates `slugs` only for the kept cards (a dry run classifies first, on a copy).
 * Returns `{ kept: number[], capped: number[], ids: string[], tierAtAdmission: string[] }` where
 * `ids` / `tierAtAdmission` are parallel to `kept` (indexes into `items`, in input order).
 */
export function capAndAssign(items, slugs, existing, currentTierOf, maxCardsFor) {
  const dry = assignCardIds(items, JSON.parse(JSON.stringify(slugs)), existing)
  const existingById = new Map(existing.map((c) => [c.cardId, c]))
  const keptSet = new Set()
  const capped = []
  const anchors = [...new Set(items.map((it) => it.anchorId))]
  for (const anchorId of anchors) {
    const idx = items.map((it, i) => i).filter((i) => items[i].anchorId === anchorId)
    const readmitted = idx.filter((i) => existingById.has(dry[i]))
    for (const i of readmitted) keptSet.add(i)
    const fresh = idx
      .filter((i) => !existingById.has(dry[i]))
      .sort((a, b) => items[b].signalScore - items[a].signalScore || items[a].bulletIndex - items[b].bulletIndex || a - b)
    const already = existing.filter((c) => c.anchorId === anchorId).length
    const slots = Math.max(0, maxCardsFor(currentTierOf(anchorId)) - already)
    fresh.slice(0, slots).forEach((i) => keptSet.add(i))
    capped.push(...fresh.slice(slots))
  }
  const kept = [...keptSet].sort((a, b) => a - b)
  const ids = assignCardIds(kept.map((i) => items[i]), slugs, existing)
  const tierAtAdmission = ids.map((id, k) => existingById.get(id)?.tierAtAdmission ?? currentTierOf(items[kept[k]].anchorId))
  return { kept, capped: capped.sort((a, b) => a - b), ids, tierAtAdmission }
}

/**
 * `--promote` for one `_cloze/` file: the file's existing cards, each replaced in place by this
 * run's version when the cardId matches, then this run's new cards. An existing card missing from
 * this run's promote set is KEPT (never dropped silently) and reported in `kept`.
 */
export function mergePromoted(existing, promoted) {
  const incoming = new Map(promoted.map((c) => [c.cardId, c]))
  const cards = []
  const kept = []
  const replaced = []
  for (const c of existing ?? []) {
    if (incoming.has(c.cardId)) {
      cards.push(incoming.get(c.cardId))
      replaced.push(c.cardId)
      incoming.delete(c.cardId)
    } else {
      cards.push(c)
      kept.push(c.cardId)
    }
  }
  const added = [...incoming.keys()]
  cards.push(...incoming.values())
  return { cards, kept, replaced, added }
}

function countOf(hay, needle) {
  let n = 0
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) n += 1
  return n
}

/**
 * The shortest `prefix` / `suffix` (0–12 chars each, taken from inside the bullet) that make
 * `prefix + exact + suffix` occur exactly once in the 考點's plain text. `null` if none does.
 */
export function uniqueContext(text, start, end, bulletStart, bulletEnd, max = 12) {
  const exact = text.slice(start, end)
  for (let total = 0; total <= 2 * max; total += 1) {
    for (let p = 0; p <= Math.min(total, max); p += 1) {
      const s = total - p
      if (s > max) continue
      if (start - p < bulletStart || end + s > bulletEnd) continue
      const prefix = text.slice(start - p, start)
      const suffix = text.slice(end, end + s)
      if (countOf(text, prefix + exact + suffix) === 1) return { prefix, suffix }
    }
  }
  return null
}

/** pick-v4 `hide` limits — the gate's `CLOZE_MAX_HINTS` / `CLOZE_MAX_HINT_CHARS` (no imports here by design). */
export const MAX_HIDES = 3
export const MAX_HIDE_CHARS = 20

/**
 * Locate a pick's answer span and its `hide` phrases in the sentence (pick-v4, design D7). Shared by
 * `agent-pick-check.mjs` and `admit.mjs` so both read a reply the same way.
 *
 *   - every hide phrase is a non-empty string occurring EXACTLY once in the sentence, ≤ MAX_HIDE_CHARS
 *     characters, and there are at most MAX_HIDES of them;
 *   - the answer is the ONE occurrence of `span` that no hide phrase touches — a second occurrence of
 *     the answer may be hidden by a hide phrase (spec: "Answer repeated elsewhere is hidden"); any
 *     other occurrence must lie wholly inside a hide phrase.
 *
 * Returns `{ at, hides: [{ text, start, end }] }` or `{ error }`.
 */
export function resolveHides(sentence, span, hide = []) {
  const hides = []
  if (!Array.isArray(hide)) return { error: 'hide is not an array' }
  if (hide.length > MAX_HIDES) return { error: `hide has ${hide.length} phrases (max ${MAX_HIDES})` }
  for (const h of hide) {
    if (typeof h !== 'string' || h === '') return { error: `hide phrase ${JSON.stringify(h)} is not a non-empty string` }
    if (Array.from(h).length > MAX_HIDE_CHARS) return { error: `hide 「${h}」 is longer than ${MAX_HIDE_CHARS} characters` }
    const n = countOf(sentence, h)
    if (n !== 1) return { error: `hide 「${h}」 occurs ${n}× in the sentence (must be exactly once)` }
    const start = sentence.indexOf(h)
    hides.push({ text: h, start, end: start + h.length })
  }
  const occ = []
  for (let i = sentence.indexOf(span); i !== -1 && span !== ''; i = sentence.indexOf(span, i + 1)) occ.push(i)
  if (occ.length === 0) return { error: 'span is not verbatim in the sentence' }
  const touches = (i) => hides.some((h) => i < h.end && h.start < i + span.length)
  const inside = (i) => hides.some((h) => h.start <= i && i + span.length <= h.end)
  const free = occ.filter((i) => !touches(i))
  if (free.length === 0) return { error: 'every occurrence of the span overlaps a hide phrase' }
  if (free.length > 1) return { error: `span occurs ${free.length}× in the sentence outside the hide phrases` }
  const leaked = occ.filter((i) => i !== free[0] && !inside(i))
  if (leaked.length) return { error: 'a second occurrence of the span is only partly covered by a hide phrase' }
  return { at: free[0], hides }
}

/** The card face: the bullet with the answer as 【＿＿＿】 and each gloss or hint as 【…】. */
export function maskFace(bullet, ranges) {
  let out = bullet
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + (r.role === 'answer' ? '【＿＿＿】' : '【…】') + out.slice(r.end)
  }
  return out
}

/**
 * Pilot publication numbers over a graded set (denominator = every graded card). A medical error is
 * either the grade `medical-error` or the grading packets' `medicalError: true` flag (which `check.py`
 * forces to grade `bad`); it is counted once, as bad.
 */
export function pilotRates(grades) {
  const all = Object.values(grades ?? {})
  const vals = all.map((g) => g.grade)
  const n = vals.length
  const count = (k) => vals.filter((v) => v === k).length
  const good = count('good')
  const bad = count('bad') + count('medical-error')
  const medicalError = all.filter((g) => g.grade === 'medical-error' || g.medicalError === true).length
  return {
    n,
    good,
    ordinary: count('ordinary'),
    bad,
    medicalError,
    goodRate: n ? good / n : 0,
    badRate: n ? bad / n : 0,
    passes: n > 0 && good / n >= 0.7 && bad / n <= 0.1 && medicalError === 0,
  }
}
