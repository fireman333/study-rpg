/**
 * The cloze-card gate (add-neurons-handout-cloze-corpus D3, capability
 * `neurons-handout-cloze-corpus`). Ported from study-rpg-2nd `cloze-gate.ts`.
 *
 * A card is admitted to the shipped `handout-cloze.json` only if it passes every check here. The
 * checks are a WHITELIST of what a good card looks like, not a list of bad wordings: a card is
 * anchored verbatim, exactly once, inside one bullet (`ul.hdt-must > li`) of the text the reader
 * DISPLAYS (`topic-plain-text.ts`), and its answer has an acceptable shape.
 *
 * neurons differences from 2nd:
 *   - a card anchors to a `.hdt-topic` by `<subjectId>::<first data-leaf-ids token>`; untagged
 *     topics hold no cards (`unknown-anchor`);
 *   - `excluded-source` = the bullet carries an `hdt-intl` note or ⚠️;
 *   - `<cite>` years are displayed text but never part of a card: a mask (with its context) may not
 *     touch one (`cite-overlap`), and `answer-leak` ignores cite text but rejects an answer equal to
 *     one of the bullet's cite year tokens;
 *   - `sentenceHash` excludes cite text, so a new sitting year never invalidates a card;
 *   - the per-topic ceiling is keyed by the recorded `tierAtAdmission`; the current tier (highest
 *     over the topic's leaves, looked up by `(subjectId, leafId)`) only feeds the drift report.
 *
 * Every rejection carries a `reason` code, so a mutation probe can tell ITS check went red rather
 * than a neighbour's — an exit code cannot make that distinction.
 *
 * Pure and node-free: the build reads files, this decides. What the gate cannot check — whether a
 * card is medically right — is the owner's review, and nothing here claims otherwise.
 */
import { CONCEPT_TIERS } from '../concept-tiers'
import { boldTexts, removeRanges, sentenceHashOf, type TextRange, type TopicBullet, type TopicPlainText } from './topic-plain-text'

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * `answer` — the blank the reader fills. `gloss` — the parenthesis right after the answer. `hint` —
 * a phrase elsewhere in the bullet that would give the answer away (a synonym / abbreviation, a
 * non-adjacent English original, a 「並非 X」 contrast, a later restatement); shown hidden, never
 * graded or highlighted as the answer (design D7).
 */
export type ClozeMaskRole = 'answer' | 'gloss' | 'hint'

export interface ClozeMask {
  exact: string
  /** 0–12 characters of context before `exact`, enough to make the match unique. */
  prefix: string
  /** 0–12 characters of context after `exact`. */
  suffix: string
  role: ClozeMaskRole
}

/** One card as reviewed and committed under `src/handout/_cloze/<subjectId>.json`. */
export interface ClozeSourceCard {
  /** `<leafId>#k<N>` — assigned once at admission, never derived from the text. */
  cardId: string
  /** `<subjectId>::<first data-leaf-ids token of the holding topic>`. */
  anchorId: string
  masks: ClozeMask[]
  marks: string[]
  linkedQuestionIds: string[]
  kind: string
  signalScore: number
  signalVersion: string | number
  /** The topic's recurrence tier when the card was admitted — the ceiling the build enforces. */
  tierAtAdmission: string
  /** Debugging only — never an anchor, never shipped. */
  claimLine?: number
}

/** A source file: `{ version: 1, cards: [...] }`. */
export interface ClozeSourceFile {
  version: 1
  cards: ClozeSourceCard[]
}

/** One card as shipped: the source minus `claimLine`, plus the answer bullet's text and hash. */
export interface ClozeShippedCard extends Omit<ClozeSourceCard, 'claimLine'> {
  /** The plain text of the bullet holding the answer mask, `<cite>` text included (for display). */
  bulletText: string
  /** The `<cite>` text ranges within `bulletText`. */
  citeRanges: TextRange[]
  /** djb2 of `bulletText` with `citeRanges` removed. */
  sentenceHash: string
}

export const CLOZE_ARTIFACT_VERSION = 1

export interface ClozeArtifact {
  version: typeof CLOZE_ARTIFACT_VERSION
  cards: ClozeShippedCard[]
}

/** Every reason code the gate can emit. A closed list — the test asserts each is exercised. */
export const CLOZE_REASONS = [
  // structure
  'schema',
  'unknown-anchor',
  'duplicate-id',
  // anchoring
  'unresolved',
  'ambiguous',
  'cross-bullet',
  'not-in-bullet',
  'mask-overlap',
  // shape
  'length',
  'polarity-only',
  'sub-heading',
  'answer-leak',
  'cite-overlap',
  'partial-range',
  'gloss-leak',
  'example-value',
  'excluded-source',
  'false-option-only',
  'over-masked',
  // count
  'over-cap',
  'unmapped-tier',
] as const

export type ClozeReason = (typeof CLOZE_REASONS)[number]

export interface ClozeGateError {
  reason: ClozeReason
  /** The source file the card came from. */
  file: string
  /** `null` for a file- or topic-level failure. */
  cardId: string | null
  message: string
}

/** The only question data the gate reads (`dist/questions.json`). */
export interface ClozeQuestion {
  stem: string
  options: Record<string, string>
  answer: string
  acceptedAnswers?: readonly string[]
}

export interface ClozeCardFile {
  /** Repo-relative path, for messages. */
  file: string
  /** The parsed JSON — validated here, so `unknown`. */
  source: unknown
  /** This subject's topics (the shipped html through `extractTopics`). A card may only anchor here. */
  topics: readonly TopicPlainText[]
}

export interface ClozeGateInput {
  files: readonly ClozeCardFile[]
  /** `<subjectId>::<leafId>` → current recurrence tier, from `dist/concept-recurrence.json`. */
  recurrence: ReadonlyMap<string, string>
  /**
   * Question id → question. `null` means the data is unavailable, and every card with linked
   * questions is then REJECTED, not passed.
   */
  questions: ReadonlyMap<string, ClozeQuestion> | null
}

export interface ClozeGateCounts {
  imported: number
  rejected: number
  total: number
  /** Errors per reason (a rejected card may carry several). */
  byReason: Partial<Record<ClozeReason, number>>
}

export interface ClozeGateResult {
  errors: ClozeGateError[]
  /** The shipped cards — meaningful only when `errors` is empty. */
  cards: ClozeShippedCard[]
  counts: ClozeGateCounts
  report: ClozeReport
}

// ─── maxCards ────────────────────────────────────────────────────────────────

/**
 * Per-topic card ceiling by recurrence tier. A CEILING, not a target. UNMEASURED starting values;
 * the pilot's good-card rate is what will move them.
 *
 * Closed: its key set equals `CONCEPT_TIERS` (test-locked), and an unknown tier throws rather than
 * falling back — a fallback would quietly give a newly-introduced tier some number nobody chose.
 */
export const CLOZE_MAX_CARDS_BY_TIER: Readonly<Record<string, number>> = {
  常青必掃: 5,
  近年新寵: 4,
  穩定考點: 4,
  經典但降溫: 4,
  'low-yield': 3,
}

export function maxCardsForTier(tier: string): number {
  if (!isMappedTier(tier)) {
    throw new Error(`cloze maxCards: tier "${tier}" has no explicit mapping`)
  }
  return CLOZE_MAX_CARDS_BY_TIER[tier]
}

/** The tier has an explicit ceiling (own key — never an inherited property such as `toString`). */
export function isMappedTier(tier: string): boolean {
  return Object.prototype.hasOwnProperty.call(CLOZE_MAX_CARDS_BY_TIER, tier) && tierRank(tier) !== -1
}

/** Rank of a tier, 0 = highest (`CONCEPT_TIERS` order). -1 when unknown. */
export function tierRank(tier: string): number {
  return (CONCEPT_TIERS as readonly string[]).indexOf(tier)
}

/**
 * A topic's CURRENT tier: the highest tier among its leaves, looked up by `(subjectId, leafId)`
 * (a leafId is not unique across subjects). Throws when a leaf has no entry or its tier is unmapped.
 */
export function topicTier(subjectId: string, leafIds: readonly string[], recurrence: ReadonlyMap<string, string>): string {
  if (leafIds.length === 0) throw new Error(`${subjectId}: topic has no data-leaf-ids`)
  let best: string | null = null
  for (const leafId of leafIds) {
    const tier = recurrence.get(`${subjectId}::${leafId}`)
    if (tier === undefined) throw new Error(`leaf ${subjectId}::${leafId} has no recurrence entry`)
    maxCardsForTier(tier) // throws on an unmapped tier
    if (best === null || tierRank(tier) < tierRank(best)) best = tier
  }
  return best!
}

// ─── shape vocabularies ──────────────────────────────────────────────────────

/** Answers that are nothing but a polarity word or a connective. */
export const CLOZE_POLARITY_ONLY: ReadonlySet<string> = new Set([
  // polarity
  '不', '無', '非', '禁', '勿', '未', '否', '切勿', '沒有', '不可', '不能', '不會', '不宜', '不要',
  '不包括', '不建議', '不需', '不必', '禁用', '禁止', '並非', '而非', '絕不', '絕對不可',
  // connectives
  '而', '但', '且', '或', '及', '與', '和', '並', '則', '但是', '然而', '因此', '所以', '以及',
  '或是', '或者', '而且', '並且', '以及其', '亦即', '即',
])

/** At most this many `hint` masks per card, each at most `CLOZE_MAX_HINT_CHARS` characters (`schema`). */
export const CLOZE_MAX_HINTS = 3
export const CLOZE_MAX_HINT_CHARS = 20

/**
 * `over-masked`: the card's masked characters (answer + gloss + hint) may be at most this share of
 * the bullet's text with `<cite>` text removed. An UNMEASURED starting value (design D7): pilot cards
 * sat at a median 0.12, max 0.36.
 */
export const CLOZE_MAX_MASK_RATIO = 0.4

/**
 * `polarity-only` for a hint: the phrase (whitespace and punctuation ignored) is made up ENTIRELY of
 * `CLOZE_POLARITY_ONLY` words — hiding a lone 「非」 or 「並非」 can invert what the sentence teaches.
 */
export function isPolarityOnlyPhrase(phrase: string): boolean {
  const s = Array.from(phrase.replace(/[\s\p{P}]/gu, ''))
  if (s.length === 0) return true
  const words = [...CLOZE_POLARITY_ONLY].map((w) => Array.from(w))
  const ok: boolean[] = new Array(s.length + 1).fill(false)
  ok[0] = true
  for (let i = 0; i < s.length; i += 1) {
    if (!ok[i]) continue
    for (const w of words) {
      if (w.every((ch, k) => s[i + k] === ch)) ok[i + w.length] = true
    }
  }
  return ok[s.length]
}

/** Separators a numeric range may be written with (`A–B`, `A-B`, `A~B`, `A 至 B`). */
const RANGE_SEP = String.raw`(?:–|-|~|～|至)`
const NUM = String.raw`\d+(?:\.\d+)?`
const RANGE_BEFORE = new RegExp(String.raw`${NUM}\s*[%％]?\s*${RANGE_SEP}\s*$`)
const RANGE_AFTER = new RegExp(String.raw`^\s*${RANGE_SEP}\s*${NUM}`)

/**
 * A negated stem: the keyed option is the FALSE statement. Ported from 2nd, where it was measured on
 * 6,400 stems (whitespace stripped — OCR inserts spaces). The `不` alternatives are an explicit list
 * because a bare `不` also hits nouns (不孕症, 屈光不正); `非(?!常)` keeps 非常 out.
 */
export const NEGATED_STEM =
  /何者[^？?，。；]{0,8}?(?:錯誤|有誤|(?:為|並|最)?非(?!常)|不(?:適|恰|合|正確|正常|是|可|能|會|需|須|宜|屬|包|相|像|易|影|建|考|列|經|以|支|妥|迫|常|太|應|用|符|必|得|被|一|具|造|引|代表|推薦|傾向|容易))|不包括|除外|錯誤的(?:是|敘述)|不(?:正確|適當|恰當)的(?:是|敘述|處置)/

/** Whitespace-insensitive negation test (stems carry OCR spaces: 「何者 最不 適當」). */
export const isNegatedStem = (stem: string): boolean => NEGATED_STEM.test(stem.replace(/\s+/g, ''))

const TRAJECTORY = /由[^，。；\n]{0,30}?(?:上升至|下降至|增加至|減少至|升至|降至|增至|減至)[^，。；\n]{0,30}/g

// ─── helpers ─────────────────────────────────────────────────────────────────

const charLen = (s: string): number => Array.from(s).length

function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = []
  if (needle === '') return out
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push(i)
  return out
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

interface ResolvedMask {
  mask: ClozeMask
  start: number
  end: number
  /** Range of `prefix + exact + suffix`. */
  ctxStart: number
  ctxEnd: number
  bulletIndex: number
}

function cardIdOf(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && typeof (raw as { cardId?: unknown }).cardId === 'string') {
    return (raw as { cardId: string }).cardId
  }
  return null
}

/** File-level structural validation. An empty list means `raw` is `{version: 1, cards: [...]}`. */
export function clozeFileSchemaProblems(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['file is not an object `{version, cards}`']
  const f = raw as Record<string, unknown>
  const p: string[] = []
  if (f.version !== 1) p.push(`version must be 1, found ${JSON.stringify(f.version)}`)
  if (!Array.isArray(f.cards)) p.push('cards must be an array')
  return p
}

/** Card-level structural validation. An empty list means `raw` is a `ClozeSourceCard`. */
export function clozeSchemaProblems(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['card is not an object']
  const c = raw as Record<string, unknown>
  const p: string[] = []
  if (typeof c.cardId !== 'string' || !/^[^#\s]+#[^#\s]+$/.test(c.cardId)) {
    p.push('cardId must be `<leafId>#<slug>`')
  }
  if (typeof c.anchorId !== 'string' || !/^[^:\s]+::[^:\s]+$/.test(c.anchorId)) {
    p.push('anchorId must be `<subjectId>::<leafId>`')
  } else if (typeof c.cardId === 'string') {
    const leafId = c.anchorId.slice(c.anchorId.indexOf('::') + 2)
    if (!c.cardId.startsWith(`${leafId}#`)) p.push(`cardId must start with the anchor's leafId "${leafId}#"`)
  }
  if (!Array.isArray(c.masks) || c.masks.length === 0) {
    p.push('masks must be a non-empty array')
  } else {
    let answers = 0
    let hints = 0
    c.masks.forEach((m, i) => {
      if (!m || typeof m !== 'object') {
        p.push(`masks[${i}] is not an object`)
        return
      }
      const mm = m as Record<string, unknown>
      if (typeof mm.exact !== 'string' || mm.exact === '') p.push(`masks[${i}].exact must be a non-empty string`)
      for (const k of ['prefix', 'suffix'] as const) {
        if (typeof mm[k] !== 'string') p.push(`masks[${i}].${k} must be a string`)
        else if (charLen(mm[k] as string) > 12) p.push(`masks[${i}].${k} is longer than 12 characters`)
      }
      if (mm.role === 'answer') answers += 1
      else if (mm.role === 'hint') {
        hints += 1
        if (typeof mm.exact === 'string' && charLen(mm.exact) > CLOZE_MAX_HINT_CHARS) {
          p.push(`masks[${i}] hint "${mm.exact}" is longer than ${CLOZE_MAX_HINT_CHARS} characters`)
        }
      } else if (mm.role !== 'gloss') p.push(`masks[${i}].role must be "answer", "gloss" or "hint"`)
    })
    if (answers !== 1) p.push(`exactly one answer mask required, found ${answers}`)
    if (hints > CLOZE_MAX_HINTS) p.push(`at most ${CLOZE_MAX_HINTS} hint masks, found ${hints}`)
  }
  if (!isStringArray(c.marks)) p.push('marks must be a string array')
  if (!isStringArray(c.linkedQuestionIds)) p.push('linkedQuestionIds must be a string array')
  if (typeof c.kind !== 'string' || c.kind === '') p.push('kind must be a non-empty string')
  if (typeof c.signalScore !== 'number' || !Number.isFinite(c.signalScore)) p.push('signalScore must be a finite number')
  if (typeof c.signalVersion !== 'string' && typeof c.signalVersion !== 'number') {
    p.push('signalVersion must be a string or number')
  }
  if (typeof c.tierAtAdmission !== 'string' || c.tierAtAdmission === '') p.push('tierAtAdmission must be a non-empty string')
  if (c.claimLine !== undefined && typeof c.claimLine !== 'number') p.push('claimLine, when present, must be a number')
  return p
}

function bulletContaining(bullets: readonly TopicBullet[], start: number, end: number): number {
  return bullets.findIndex((b) => b.start <= start && end <= b.end)
}

function overlapsAnyBullet(bullets: readonly TopicBullet[], start: number, end: number): boolean {
  return bullets.some((b) => start < b.end && b.start < end)
}

const normOption = (s: string): string => s.replace(/\s+/g, '').toLowerCase()

/** A bullet's cite ranges in TOPIC coordinates. */
function topicCiteRanges(b: TopicBullet): TextRange[] {
  return b.citeRanges.map((r) => ({ start: b.start + r.start, end: b.start + r.end }))
}

// ─── shape checks (exported one by one so tests can name them) ──────────────

/**
 * The bullet with every given range blanked out — what the learner sees around the blanks. A NUL
 * replaces each (merged) range so its neighbours cannot join into a false match.
 */
export function visibleText(bulletText: string, ranges: readonly TextRange[]): string {
  const merged: TextRange[] = []
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  let out = bulletText
  for (const r of merged.reverse()) out = out.slice(0, r.start) + '\u0000' + out.slice(r.end)
  return out
}

/**
 * The year tokens a bullet's cites display: `115` → [115]; `105/106/113` → each; `113-2` → [113-2,
 * 113] (the year alone is visible inside the sitting token too).
 */
export function citeYearTokens(bulletText: string, citeRanges: readonly TextRange[]): Set<string> {
  const out = new Set<string>()
  for (const r of citeRanges) {
    for (const tok of bulletText.slice(r.start, r.end).split(/[\s/,、，;；]+/)) {
      const t = tok.trim()
      if (!t) continue
      out.add(t)
      const year = t.split('-')[0]
      if (year) out.add(year)
    }
  }
  return out
}

/** `partial-range`: the answer is one end of a numeric range whose other end is left visible. */
export function isPartialRange(bulletText: string, start: number, end: number): boolean {
  const answer = bulletText.slice(start, end)
  const before = bulletText.slice(0, start)
  const after = bulletText.slice(end)
  if (/^\d/.test(answer) && RANGE_BEFORE.test(before)) return true
  if (/[\d%％]$/.test(answer) && RANGE_AFTER.test(after)) return true
  return false
}

/**
 * `gloss-leak`: the parenthesis that starts within two characters after the answer, as a range of
 * its CONTENT in bullet coordinates — or `null` when there is none.
 */
export function trailingGloss(bulletText: string, end: number): TextRange | null {
  const near = bulletText.slice(end, end + 3)
  const open = near.search(/[（(]/)
  if (open === -1) return null
  const openAt = end + open
  const closeChar = bulletText[openAt] === '（' ? '）' : ')'
  const close = bulletText.indexOf(closeChar, openAt + 1)
  if (close === -1) return null
  // An enumerator such as `；(2)` or `（一）` is list numbering, not a gloss of the answer.
  if (/^\s*(?:\d{1,2}|[a-zA-Z]|[一二三四五六七八九十]{1,2}|[ivxIVX]{1,4})\s*$/.test(bulletText.slice(openAt + 1, close))) return null
  return { start: openAt + 1, end: close }
}

/** `example-value`: follows 如 / 例如 in its clause, or lies inside a `由 X 升至 Y` trajectory. */
export function isExampleValue(bulletText: string, start: number, end: number): boolean {
  const before = bulletText.slice(0, start)
  // A closing parenthesis ends a clause too: `（如大於 25）需處理` — 需處理 is not an example.
  const clauseStart = Math.max(...['，', '。', '；', '（', '(', '）', ')', '\n'].map((d) => before.lastIndexOf(d))) + 1
  if (/^\s*(例如|比如|如)/.test(before.slice(clauseStart))) return true
  for (const m of bulletText.matchAll(TRAJECTORY)) {
    const s = m.index ?? 0
    if (start < s + m[0].length && s < end) return true
  }
  return false
}

/** `excluded-source`: the bullet carries an `hdt-intl` (⚠️ 國際教科書) note or ⚠️. */
export function isExcludedSource(bullet: TopicBullet): boolean {
  return bullet.hasIntlNote || bullet.hasWarning
}

/**
 * `false-option-only` for one linked question: `null` when fine, else why not.
 * Keyed options are the SCORED answer (`answer` + `acceptedAnswers`) — not an explanation's ✓/✗.
 */
export function falseOptionOnly(answer: string, q: ClozeQuestion): string | null {
  const keyed = new Set([q.answer, ...(q.acceptedAnswers ?? [])])
  const needle = normOption(answer)
  let inKeyed = false
  let inOther = false
  for (const [letter, text] of Object.entries(q.options ?? {})) {
    if (typeof text !== 'string' || !normOption(text).includes(needle)) continue
    if (keyed.has(letter)) inKeyed = true
    else inOther = true
  }
  const negated = isNegatedStem(q.stem ?? '')
  if (!negated && inOther && !inKeyed) return 'answer occurs only in non-keyed options of a positive stem'
  if (negated && inKeyed && !inOther) return 'answer occurs only in the keyed option of a negated stem'
  return null
}

// ─── report ──────────────────────────────────────────────────────────────────

export interface ClozeDuplicate {
  answer: string
  similarity: number
  a: { cardId: string; anchorId: string; sentence: string }
  b: { cardId: string; anchorId: string; sentence: string }
}

export interface ClozeContradictionLocation {
  /** `anchorId`, or `<subjectId>#topic<ordinal>` for an untagged topic. */
  topic: string
  bulletIndex: number
  value: string
  /** Same formula as a card's `sentenceHash`, so admission can refuse cards on this bullet. */
  sentenceHash: string
  sentence: string
}

export interface ClozeContradiction {
  file: string
  subject: string
  locations: ClozeContradictionLocation[]
}

export interface ClozeTierDrift {
  anchorId: string
  /** Highest `tierAtAdmission` among the topic's cards — the ceiling the build enforces. */
  admittedTier: string
  currentTier: string
  cards: number
}

export interface ClozeTierAboveCurrent {
  cardId: string
  anchorId: string
  tierAtAdmission: string
  currentTier: string
}

export interface ClozeReport {
  /** Always stated in the rendered report: the contradiction scan is a heuristic, a lead only. */
  heuristic: true
  duplicates: ClozeDuplicate[]
  contradictions: ClozeContradiction[]
  /** Topics whose current tier differs from the tier their cap was admitted at. */
  tierDrift: ClozeTierDrift[]
  /** Cards whose recorded `tierAtAdmission` ranks above the topic's current tier (hand-edit check). */
  tierAboveCurrent: ClozeTierAboveCurrent[]
}

const DUPLICATE_SIMILARITY = 0.6

function bigrams(s: string): Set<string> {
  const chars = Array.from(s.replace(/\s+/g, ''))
  const out = new Set<string>()
  for (let i = 0; i + 1 < chars.length; i += 1) out.add(chars[i] + chars[i + 1])
  return out
}

/** Character-bigram Jaccard similarity, 0–1. */
export function sentenceSimilarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 && B.size === 0) return 1
  let inter = 0
  for (const x of A) if (B.has(x)) inter += 1
  return inter / (A.size + B.size - inter)
}

/** How far after a bold term its percentage may sit, in characters, within one sentence. */
const CONTRADICTION_WINDOW = 120

const PERCENT = /(\d+(?:\.\d+)?(?:\s*(?:–|-|~|～|至)\s*\d+(?:\.\d+)?)?)\s*[%％]/

/**
 * Same-subject numeric contradictions — a HEURISTIC, and a conservative one: for every `<b>` term in
 * the subject's bullets (3+ characters), each bullet that mentions the term contributes the first
 * percentage that follows it within the same sentence (≤ `CONTRADICTION_WINDOW` characters). A term
 * with two or more distinct values is listed. A lead for the maintainer, never a verdict: the cloze
 * layer does not pick a value, the handout gets corrected.
 */
export function findNumericContradictions(file: string, topics: readonly TopicPlainText[]): ClozeContradiction[] {
  const terms = new Set<string>()
  for (const t of topics) {
    for (const b of t.bullets) {
      for (const bt of boldTexts(b.raw)) {
        const term = bt.trim()
        if (charLen(term) >= 3) terms.add(term)
      }
    }
  }
  const out: ClozeContradiction[] = []
  for (const term of [...terms].sort()) {
    const locations: ClozeContradictionLocation[] = []
    for (const t of topics) {
      t.bullets.forEach((b, bulletIndex) => {
        // Cite years are not prose: search the sentence without them.
        const prose = removeRanges(b.text, b.citeRanges)
        const at = prose.indexOf(term)
        if (at === -1) return
        const tail = prose.slice(at + term.length).split(/[。；\n]/)[0].slice(0, CONTRADICTION_WINDOW)
        const m = PERCENT.exec(tail)
        if (!m) return
        locations.push({
          topic: t.anchorId ?? `${file}#topic${t.ordinal}`,
          bulletIndex,
          value: `${m[1].replace(/\s+/g, '').replace(/[–~～至]/g, '-')}%`,
          sentenceHash: sentenceHashOf(b.text, b.citeRanges),
          sentence: b.text,
        })
      })
    }
    if (new Set(locations.map((l) => l.value)).size > 1) out.push({ file, subject: term, locations })
  }
  return out
}

/** The report as markdown, for `scripts/cloze-wip/_report.md`. */
export function renderClozeReport(report: ClozeReport): string {
  const lines = [
    '# 字卡語料報告（不擋 build）',
    '',
    '> ⚠️ 數值矛盾偵測是**啟發式**：同一科內，同一個 `<b>` 粗體詞後同一句的第一個百分比不同就列出。',
    '> 它只是線索，不是判決；由維護者判斷後修講義本身。字卡層不替講義挑數字。',
    '> 列在這裡的 bullet，admit `--promote` 不收錄其上的卡（除非 owner 已記錄為非矛盾）。',
    '',
    `## 數值矛盾（${report.contradictions.length}）`,
    '',
  ]
  for (const c of report.contradictions) {
    lines.push(`### ${c.file} — **${c.subject}**`)
    for (const l of c.locations) {
      lines.push(`- \`${l.value}\` @ ${l.topic} bullet ${l.bulletIndex}（sentenceHash ${l.sentenceHash}）：${l.sentence}`)
    }
    lines.push('')
  }
  lines.push(`## 跨考點重複（${report.duplicates.length}）`, '')
  for (const d of report.duplicates) {
    lines.push(
      `- 答案「${d.answer}」相似度 ${d.similarity.toFixed(2)}：${d.a.cardId}（${d.a.anchorId}）↔ ${d.b.cardId}（${d.b.anchorId}）`,
    )
  }
  lines.push('', `## tier 漂移（${report.tierDrift.length}）`, '')
  lines.push('> 上限依收錄時的 tier（`tierAtAdmission`）擋；現在的 tier 不同只列在這裡，不擋 build。', '')
  for (const d of report.tierDrift) {
    lines.push(`- ${d.anchorId}：收錄 ${d.admittedTier} → 現在 ${d.currentTier}（${d.cards} 張）`)
  }
  lines.push('', `## tierAtAdmission 高於現在 tier 的卡（${report.tierAboveCurrent.length}）`, '')
  lines.push('> build 無法驗證手改過的 `tierAtAdmission`；這些卡請人工確認收錄紀錄。', '')
  for (const t of report.tierAboveCurrent) {
    lines.push(`- ${t.cardId}（${t.anchorId}）：tierAtAdmission ${t.tierAtAdmission} > 現在 ${t.currentTier}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ─── the gate ────────────────────────────────────────────────────────────────

/** `<subjectId>` of an anchorId. */
const subjectOf = (anchorId: string): string => anchorId.slice(0, anchorId.indexOf('::'))

export function validateClozeCorpus(input: ClozeGateInput): ClozeGateResult {
  const errors: ClozeGateError[] = []
  const shipped: ClozeShippedCard[] = []
  /** `file#index` of every card seen, and of every one rejected. */
  const seen: string[] = []
  const rejected = new Set<string>()
  /** anchorId → the topic and its cards, for the per-topic ceiling. */
  const byAnchor = new Map<string, { topic: TopicPlainText; file: string; cards: { key: string; card: ClozeSourceCard }[] }>()
  const idToFiles = new Map<string, { key: string; file: string }[]>()
  const accepted: { key: string; card: ClozeShippedCard; answer: string; sentence: string }[] = []

  /** File-level rejections (a malformed file): no card key exists, but each counts as rejected. */
  let rejectedFiles = 0
  const reject = (key: string | null, e: ClozeGateError): void => {
    errors.push(e)
    if (key) rejected.add(key)
  }

  for (const f of input.files) {
    const fileProblems = clozeFileSchemaProblems(f.source)
    if (fileProblems.length > 0) {
      reject(null, { reason: 'schema', file: f.file, cardId: null, message: fileProblems.join('; ') })
      rejectedFiles += 1
      continue
    }
    const topics = new Map<string, TopicPlainText>()
    for (const t of f.topics) if (t.anchorId) topics.set(t.anchorId, t)

    ;(f.source as { cards: unknown[] }).cards.forEach((raw, index) => {
      const key = `${f.file}#${index}`
      seen.push(key)
      const idGuess = cardIdOf(raw)
      const problems = clozeSchemaProblems(raw)
      if (problems.length > 0) {
        reject(key, { reason: 'schema', file: f.file, cardId: idGuess, message: `card ${index}: ${problems.join('; ')}` })
        return
      }
      const card = raw as ClozeSourceCard
      const where = (m: string) => `${card.cardId}: ${m}`
      const list = idToFiles.get(card.cardId) ?? []
      list.push({ key, file: f.file })
      idToFiles.set(card.cardId, list)

      const topic = topics.get(card.anchorId)
      if (!topic) {
        reject(key, {
          reason: 'unknown-anchor',
          file: f.file,
          cardId: card.cardId,
          message: where(`anchorId "${card.anchorId}" is not <subjectId>::<first data-leaf-ids token> of any topic of this subject`),
        })
        return
      }
      const entry = byAnchor.get(card.anchorId) ?? { topic, file: f.file, cards: [] }
      entry.cards.push({ key, card })
      byAnchor.set(card.anchorId, entry)

      // ── anchoring ──
      const resolved: ResolvedMask[] = []
      let anchorFailed = false
      for (const mask of card.masks) {
        const needle = mask.prefix + mask.exact + mask.suffix
        const hits = allIndexes(topic.text, needle)
        const label = `${mask.role} mask "${mask.exact}"`
        if (hits.length === 0) {
          reject(key, { reason: 'unresolved', file: f.file, cardId: card.cardId, message: where(`${label} does not occur in the topic's plain text`) })
          anchorFailed = true
          continue
        }
        if (hits.length > 1) {
          reject(key, { reason: 'ambiguous', file: f.file, cardId: card.cardId, message: where(`${label} with its context occurs ${hits.length} times`) })
          anchorFailed = true
          continue
        }
        const ctxStart = hits[0]
        const ctxEnd = ctxStart + needle.length
        const start = ctxStart + mask.prefix.length
        const end = start + mask.exact.length
        const bulletIndex = bulletContaining(topic.bullets, start, end)
        // The CONTEXT anchors too: a prefix or suffix reaching into a neighbouring bullet is an
        // anchor across a boundary even when `exact` itself sits inside one bullet.
        if (bulletIndex !== -1 && bulletContaining(topic.bullets, ctxStart, ctxEnd) !== bulletIndex) {
          reject(key, {
            reason: 'cross-bullet',
            file: f.file,
            cardId: card.cardId,
            message: where(`${label}: its prefix/suffix context spans a bullet boundary`),
          })
          anchorFailed = true
          continue
        }
        if (bulletIndex === -1) {
          const reason: ClozeReason = overlapsAnyBullet(topic.bullets, start, end) ? 'cross-bullet' : 'not-in-bullet'
          reject(key, {
            reason,
            file: f.file,
            cardId: card.cardId,
            message: where(
              reason === 'cross-bullet'
                ? `${label} spans a bullet boundary`
                : `${label} is not in a ul.hdt-must bullet (heading, p.hdt-teach or table)`,
            ),
          })
          anchorFailed = true
          continue
        }
        resolved.push({ mask, start, end, ctxStart, ctxEnd, bulletIndex })
      }
      if (anchorFailed) return
      if (new Set(resolved.map((r) => r.bulletIndex)).size > 1) {
        reject(key, { reason: 'cross-bullet', file: f.file, cardId: card.cardId, message: where('masks lie in different bullets') })
        return
      }
      // ── mask-overlap: its own check, BEFORE the shape checks — `visibleText` silently merges
      // overlapping ranges, so an overlap would otherwise pass unnoticed. Any roles. ──
      const byStart = [...resolved].sort((a, b) => a.start - b.start)
      const overlaps: string[] = []
      for (let i = 1; i < byStart.length; i += 1) {
        const prev = byStart[i - 1]
        const cur = byStart[i]
        if (cur.start < prev.end) overlaps.push(`${prev.mask.role} mask "${prev.mask.exact}" overlaps ${cur.mask.role} mask "${cur.mask.exact}"`)
      }
      if (overlaps.length > 0) {
        reject(key, { reason: 'mask-overlap', file: f.file, cardId: card.cardId, message: where(overlaps.join('; ')) })
        return
      }

      // ── shape ──
      const bullet = topic.bullets[resolved[0].bulletIndex]
      const bt = bullet.text
      const local = resolved.map((r) => ({ ...r, start: r.start - bullet.start, end: r.end - bullet.start }))
      const ans = local.find((r) => r.mask.role === 'answer')!
      const answer = ans.mask.exact
      const shape = (reason: ClozeReason, message: string) =>
        reject(key, { reason, file: f.file, cardId: card.cardId, message: where(message) })

      const n = charLen(answer)
      if (n < 2 || n > 20) shape('length', `answer "${answer}" is ${n} characters (2–20)`)
      if (CLOZE_POLARITY_ONLY.has(answer.trim())) shape('polarity-only', `answer "${answer}" is only a polarity word or connective`)
      const lbl = bullet.leadingBold
      if (lbl?.followedByColon) {
        const ls = lbl.start - bullet.start
        const le = lbl.end - bullet.start
        if (ls <= ans.start && ans.end <= le) shape('sub-heading', `answer "${answer}" is the bullet's sub-heading label "${lbl.text}"`)
      }
      // Visible text excludes the masks AND the cite years (a `15` answer must not collide with `115`).
      if (visibleText(bt, [...local, ...bullet.citeRanges]).includes(answer)) {
        shape('answer-leak', `answer "${answer}" appears again in the card's visible text`)
      } else if (citeYearTokens(bt, bullet.citeRanges).has(answer.trim())) {
        shape('answer-leak', `answer "${answer}" equals a <cite> year token of the bullet`)
      }
      const cites = topicCiteRanges(bullet)
      for (const r of resolved) {
        const hit = cites.find((c) => r.ctxStart < c.end && c.start < r.ctxEnd)
        if (hit) {
          shape(
            'cite-overlap',
            `${r.mask.role} mask "${r.mask.exact}" (with its context) overlaps <cite>${topic.text.slice(hit.start, hit.end)}</cite>`,
          )
        }
      }
      if (isPartialRange(bt, ans.start, ans.end)) shape('partial-range', `answer "${answer}" is one end of a numeric range`)
      const gloss = trailingGloss(bt, ans.end)
      if (gloss && !local.some((r) => r.mask.role === 'gloss' && r.start <= gloss.start && gloss.end <= r.end)) {
        shape('gloss-leak', `the parenthesis after "${answer}" (${bt.slice(gloss.start, gloss.end)}) is not covered by a gloss mask`)
      }
      if (isExampleValue(bt, ans.start, ans.end)) shape('example-value', `answer "${answer}" is an example value`)
      if (isExcludedSource(bullet)) shape('excluded-source', 'the answered bullet carries an hdt-intl note or ⚠️')
      // Hints: a lone negation / connective can flip the sentence (the other shape checks are the answer's only).
      for (const r of local) {
        if (r.mask.role === 'hint' && isPolarityOnlyPhrase(r.mask.exact)) {
          shape('polarity-only', `hint "${r.mask.exact}" is only polarity words or connectives`)
        }
      }
      const proseLen = charLen(removeRanges(bt, bullet.citeRanges))
      const maskedLen = local.reduce((n, r) => n + charLen(r.mask.exact), 0)
      if (proseLen > 0 && maskedLen / proseLen > CLOZE_MAX_MASK_RATIO) {
        shape(
          'over-masked',
          `masks cover ${maskedLen} of ${proseLen} characters of the bullet without <cite> (${((maskedLen / proseLen) * 100).toFixed(0)}% > ${CLOZE_MAX_MASK_RATIO * 100}%)`,
        )
      }
      for (const qid of card.linkedQuestionIds) {
        if (!input.questions) {
          shape('false-option-only', `linked question ${qid} cannot be checked: question data unavailable (fail closed)`)
          continue
        }
        const q = input.questions.get(qid)
        if (!q) {
          shape('false-option-only', `linked question ${qid} is not in the question data (fail closed)`)
          continue
        }
        const why = falseOptionOnly(answer, q)
        if (why) shape('false-option-only', `${qid}: ${why}`)
      }

      if (!rejected.has(key)) {
        const { claimLine: _debugOnly, ...rest } = card
        const shippedCard: ClozeShippedCard = {
          ...rest,
          bulletText: bt,
          citeRanges: bullet.citeRanges.map((r) => ({ ...r })),
          sentenceHash: sentenceHashOf(bt, bullet.citeRanges),
        }
        accepted.push({ key, card: shippedCard, answer, sentence: bt })
      }
    })
  }

  // ── corpus-level: ids ──
  for (const [cardId, list] of idToFiles) {
    if (list.length < 2) continue
    for (const l of list) rejected.add(l.key)
    errors.push({
      reason: 'duplicate-id',
      file: list.map((l) => l.file).join(' + '),
      cardId,
      message: `cardId "${cardId}" is used ${list.length} times: ${list.map((l) => l.file).join(', ')}`,
    })
  }

  // ── corpus-level: per-topic ceiling (by tierAtAdmission) + drift report (by current tier) ──
  const tierDrift: ClozeTierDrift[] = []
  const tierAboveCurrent: ClozeTierAboveCurrent[] = []
  for (const [anchorId, { topic, file, cards }] of byAnchor) {
    const failTier = (message: string) => {
      for (const c of cards) rejected.add(c.key)
      errors.push({ reason: 'unmapped-tier', file, cardId: null, message: `topic ${anchorId}: ${message}` })
    }
    let current: string
    try {
      current = topicTier(subjectOf(anchorId), topic.leafIds, input.recurrence)
    } catch (err) {
      failTier(err instanceof Error ? err.message : String(err))
      continue
    }
    const unmapped = cards.filter((c) => !isMappedTier(c.card.tierAtAdmission))
    if (unmapped.length > 0) {
      failTier(`tierAtAdmission ${[...new Set(unmapped.map((c) => `"${c.card.tierAtAdmission}"`))].join(', ')} has no explicit mapping`)
      continue
    }
    const admitted = cards.map((c) => c.card.tierAtAdmission).sort((a, b) => tierRank(a) - tierRank(b))[0]
    const max = maxCardsForTier(admitted)
    if (cards.length > max) {
      for (const c of cards) rejected.add(c.key)
      errors.push({
        reason: 'over-cap',
        file,
        cardId: null,
        message: `topic ${anchorId} (admitted at ${admitted}) has ${cards.length} cards; the ceiling is ${max}`,
      })
    }
    if (admitted !== current) tierDrift.push({ anchorId, admittedTier: admitted, currentTier: current, cards: cards.length })
    for (const c of cards) {
      if (tierRank(c.card.tierAtAdmission) < tierRank(current)) {
        tierAboveCurrent.push({ cardId: c.card.cardId, anchorId, tierAtAdmission: c.card.tierAtAdmission, currentTier: current })
      }
    }
  }

  for (const a of accepted) if (!rejected.has(a.key)) shipped.push(a.card)

  // ── report (never an error) ──
  const duplicates: ClozeDuplicate[] = []
  const kept = accepted.filter((a) => !rejected.has(a.key))
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      const a = kept[i]
      const b = kept[j]
      if (a.card.anchorId === b.card.anchorId || a.answer !== b.answer) continue
      const similarity = sentenceSimilarity(a.sentence, b.sentence)
      if (similarity < DUPLICATE_SIMILARITY) continue
      duplicates.push({
        answer: a.answer,
        similarity,
        a: { cardId: a.card.cardId, anchorId: a.card.anchorId, sentence: a.sentence },
        b: { cardId: b.card.cardId, anchorId: b.card.anchorId, sentence: b.sentence },
      })
    }
  }
  const contradictions = input.files.flatMap((f) => findNumericContradictions(f.file, f.topics))

  const byReason: Partial<Record<ClozeReason, number>> = {}
  for (const e of errors) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1
  return {
    errors,
    cards: shipped,
    counts: { imported: shipped.length, rejected: rejected.size + rejectedFiles, total: seen.length + rejectedFiles, byReason },
    report: { heuristic: true, duplicates, contradictions, tierDrift, tierAboveCurrent },
  }
}

/**
 * The write-time integrity check of every shipped card: `sentenceHash` is the hash of `bulletText`
 * minus `citeRanges`, the cite ranges lie inside `bulletText`, and every mask's `prefix + exact +
 * suffix` occurs in `bulletText`. Returns one message per failure; empty = the artifact may be written.
 */
export function shippedCardIntegrityErrors(cards: readonly ClozeShippedCard[]): string[] {
  const out: string[] = []
  for (const c of cards) {
    if (typeof c.bulletText !== 'string' || c.bulletText.length === 0) {
      out.push(`${c.cardId}: bulletText is missing`)
      continue
    }
    if (!Array.isArray(c.citeRanges) || c.citeRanges.some((r) => !(0 <= r.start && r.start <= r.end && r.end <= c.bulletText.length))) {
      out.push(`${c.cardId}: citeRanges are missing or outside bulletText`)
      continue
    }
    const expected = sentenceHashOf(c.bulletText, c.citeRanges)
    if (expected !== c.sentenceHash) {
      out.push(`${c.cardId}: sentenceHash ${c.sentenceHash} is not the hash of bulletText minus citeRanges (${expected})`)
    }
    for (const m of c.masks) {
      if (!c.bulletText.includes(m.prefix + m.exact + m.suffix)) {
        out.push(`${c.cardId}: ${m.role} mask "${m.exact}" with its context does not occur in bulletText`)
      }
    }
  }
  return out
}

/**
 * Fold errors raised BEFORE the gate (a card file that is not JSON) into the gate's counts. Each such
 * error is one rejected entry, one unit of `total`, and one tally of its reason; `imported` is the gate's own.
 */
export function withFileLevelErrors(c: ClozeGateCounts, fileErrors: readonly ClozeGateError[]): ClozeGateCounts {
  const byReason: Partial<Record<ClozeReason, number>> = { ...c.byReason }
  for (const e of fileErrors) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1
  return { ...c, rejected: c.rejected + fileErrors.length, total: c.total + fileErrors.length, byReason }
}

/** `imported: N, rejected: M (reason a×k, …), total: T` — printed on success AND failure. */
export function formatClozeCounts(c: ClozeGateCounts): string {
  const reasons = Object.entries(c.byReason)
    .map(([r, k]) => `${r}×${k}`)
    .join(', ')
  return `[handout] 字卡閘門 imported: ${c.imported}, rejected: ${c.rejected}${reasons ? ` (${reasons})` : ''}, total: ${c.total}`
}
