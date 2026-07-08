/**
 * Single-subject rescue — session orchestration (mostly pure data assembly).
 *
 * The pure scoring/queue core (rescue-priority / rescue-queue / rescue-score /
 * rescue-stoploss) is unit-tested in isolation. This layer joins the live app data
 * (subject questions + questionHistory + flags + concept tags + cram push) into the
 * params those pure functions expect, and adds the three UI-facing derivations that
 * were spec'd but not in the algorithm core: the D-scaled diagnostic blitz sampler,
 * the concept 戰情圖 (red/yellow/grey), and the exam-morning quick-scan pool. It stays
 * free of React/Dexie so it is directly unit-testable.
 *
 * Spec: openspec/changes/add-neurons-single-subject-rescue/specs/
 *       neurons-single-subject-rescue/spec.md
 */

import type { Question } from '@study-rpg/core'
import type { CramData } from '@study-rpg/content-neurons-tw'
import type { QuestionHistoryRow, QuestionFlagRow } from '../../db'
import type { ConceptTagMap } from '../../concept-tags'
import {
  tierToYieldBand,
  percentileToYieldBand,
  movabilityBandOf,
  movabilityValue,
  type YieldBand,
  type ConfidenceSignal,
  type RescueScoreInputs,
} from './rescue-priority'
import {
  buildYieldResolver,
  buildRescueQueue,
  partitionDayMix,
  dailyCapacity,
  RESCUE_EST_TIME_SEC,
  type RescueQueue,
} from './rescue-queue'
import { computeConceptMastery, computeRescueScore, returnTier, type ReturnTier } from './rescue-score'
import { stopLossAction, type ConceptStats, type StopLossAction } from './rescue-stoploss'

type PushItem = CramData['books'][number]['subjects'][number]['push'][number]

// ─── concept-level Yield map (mirror of buildYieldResolver, keyed by concept) ──
/**
 * Resolve each concept of a subject to a Yield band: cram tier when the concept has
 * a push item, else its corpus appearance-frequency percentile (within the subject).
 * Concepts that never appear map to `low`. Needed by RescueScore + the 戰情圖.
 */
export function buildConceptYield(
  push: readonly PushItem[],
  subjectQuestions: readonly Question[],
  conceptTags: ConceptTagMap,
): Map<string, YieldBand> {
  const out = new Map<string, YieldBand>()
  const count = new Map<string, number>()
  for (const q of subjectQuestions) {
    for (const leaf of conceptTags[q.id] ?? []) count.set(leaf, (count.get(leaf) ?? 0) + 1)
  }
  const sorted = [...count.entries()].sort((a, b) => a[1] - b[1])
  const n = sorted.length
  const pct = new Map<string, number>()
  sorted.forEach(([leaf], i) => pct.set(leaf, n <= 1 ? 1 : i / (n - 1)))
  for (const leaf of count.keys()) {
    out.set(leaf, percentileToYieldBand(pct.get(leaf) ?? 0))
  }
  // Tier overrides percentile where a push item exists.
  for (const p of push) {
    const b = tierToYieldBand(p.tier)
    if (b) out.set(p.leafId, b)
  }
  return out
}

// ─── D-scaled diagnostic blitz sampler ───────────────────────────────────────
/** Blitz question count for remaining days D (before thick-history shrink). */
export function blitzSize(d: number): number {
  if (d >= 3) return 25
  if (d === 2) return 15
  return 10
}

/**
 * Sample the diagnostic blitz: prefer concepts with no / stale history, weighted
 * toward high-Yield material. Size scales with D and shrinks when the family already
 * has thick answer history (per spec — a well-answered family needs less diagnosis).
 * Pure: caller supplies `now`.
 */
export function buildBlitzPool(
  subjectQuestions: readonly Question[],
  histById: Map<string, QuestionHistoryRow>,
  conceptYield: Map<string, YieldBand>,
  conceptTags: ConceptTagMap,
  d: number,
  now: number = Date.now(),
): Question[] {
  const answerable = subjectQuestions.filter((q) => !q.hasOptionImages)
  let size = blitzSize(d)
  // Thick-history shrink: if most of the family is already answered, the blitz can be
  // smaller (the daily queue already knows the standing weak spots).
  const answeredFrac = answerable.length
    ? answerable.filter((q) => histById.has(q.id)).length / answerable.length
    : 0
  if (answeredFrac > 0.6) size = Math.max(6, Math.round(size * 0.6))
  const yieldRank: Record<YieldBand, number> = { high: 2, mid: 1, low: 0 }
  const questionYield = (q: Question): number => {
    let best = -1
    for (const leaf of conceptTags[q.id] ?? []) {
      const r = yieldRank[conceptYield.get(leaf) ?? 'low']
      if (r > best) best = r
    }
    return best < 0 ? 0 : best
  }
  // Staleness: unanswered = max; answered = elapsed since last answer. Frequency-weight
  // as the tie-break so high-Yield unknowns lead.
  const scored = answerable.map((q) => {
    const h = histById.get(q.id)
    const staleness = h ? now - h.lastAnsweredAt : Number.MAX_SAFE_INTEGER
    return { q, staleness, yield: questionYield(q) }
  })
  scored.sort(
    (a, b) => b.staleness - a.staleness || b.yield - a.yield || (a.q.id < b.q.id ? -1 : 1),
  )
  return scored.slice(0, size).map((s) => s.q)
}

// ─── concept 戰情圖 (red / yellow / grey) ─────────────────────────────────────
export type WarMapBand = 'red' | 'yellow' | 'grey'
export interface WarMapConcept {
  conceptId: string
  band: WarMapBand
  /** Recency-decayed mastery in [0,1], or undefined when undiagnosed. */
  mastery: number | undefined
  yieldBand: YieldBand
  /** A question in this concept was submitted 有把握 yet answered wrong (the worst leak). */
  hiConfWrong: boolean
}

/**
 * Build the concept red/yellow/grey map. Red = high-frequency-weak OR any high-
 * confidence-wrong; grey = undiagnosed (no history); everything else yellow. Sorted
 * red → yellow → grey, then by Yield so the highest-leverage concepts lead. Pure.
 */
export function buildWarMap(
  subjectQuestions: readonly Question[],
  history: readonly QuestionHistoryRow[],
  conceptYield: Map<string, YieldBand>,
  conceptTags: ConceptTagMap,
  confidenceById: Map<string, ConfidenceSignal>,
  now: number = Date.now(),
): WarMapConcept[] {
  const mastery = computeConceptMastery(history, conceptTags, undefined, now)
  const histById = new Map(history.map((h) => [h.questionId, h]))
  // High-confidence-wrong questions per concept.
  const hiConfWrongConcepts = new Set<string>()
  for (const q of subjectQuestions) {
    if (confidenceById.get(q.id) !== 'sure') continue
    if (histById.get(q.id)?.lastResult !== 'wrong') continue
    for (const leaf of conceptTags[q.id] ?? []) hiConfWrongConcepts.add(leaf)
  }
  const yieldRankOrder: Record<YieldBand, number> = { high: 2, mid: 1, low: 0 }
  const rows: WarMapConcept[] = []
  for (const [conceptId, yieldBand] of conceptYield) {
    const m = mastery.get(conceptId)
    const hiConfWrong = hiConfWrongConcepts.has(conceptId)
    let band: WarMapBand
    if (m === undefined) band = 'grey'
    else if (hiConfWrong || (yieldBand === 'high' && m < 0.5) || m < 0.35) band = 'red'
    else band = 'yellow'
    rows.push({ conceptId, band, mastery: m, yieldBand, hiConfWrong })
  }
  const bandRank: Record<WarMapBand, number> = { red: 0, yellow: 1, grey: 2 }
  rows.sort(
    (a, b) => bandRank[a.band] - bandRank[b.band] || yieldRankOrder[b.yieldBand] - yieldRankOrder[a.yieldBand],
  )
  return rows
}

// ─── stop-loss stats from today's history ────────────────────────────────────
const DAY_MS = 86_400_000

/**
 * Derive per-concept stop-loss stats from TODAY's answers: `attemptsToday` = the
 * concept's questions answered in the last 24h, `recentAccuracy` = today-correct
 * fraction. A concept the player has hammered ≥6× today at <40% accuracy trips
 * stop-loss (the pure `isStuck` gate). Pure: caller supplies `now`.
 */
export function buildConceptStatsToday(
  subjectQuestions: readonly Question[],
  history: readonly QuestionHistoryRow[],
  conceptTags: ConceptTagMap,
  now: number = Date.now(),
): Map<string, ConceptStats> {
  const histById = new Map(history.map((h) => [h.questionId, h]))
  const acc = new Map<string, { attempts: number; correct: number }>()
  for (const q of subjectQuestions) {
    const h = histById.get(q.id)
    if (!h || now - h.lastAnsweredAt > DAY_MS) continue
    for (const leaf of conceptTags[q.id] ?? []) {
      const a = acc.get(leaf) ?? { attempts: 0, correct: 0 }
      a.attempts += 1
      if (h.lastResult === 'correct') a.correct += 1
      acc.set(leaf, a)
    }
  }
  const out = new Map<string, ConceptStats>()
  for (const [leaf, a] of acc) {
    out.set(leaf, { attemptsToday: a.attempts, recentAccuracy: a.attempts ? a.correct / a.attempts : 1 })
  }
  return out
}

// ─── block delivery: interleave concepts, cap same-concept per block (§6.2) ───
/**
 * Re-order a ranked day set into blocks of `blockSize` (~8) with at most
 * `sameConceptCap` (~3) questions of one concept per block, interleaving adjacent
 * concepts to train discrimination. Rank order is otherwise preserved as closely as
 * possible (a capped question is deferred to the next block, not dropped). Pure.
 */
export function interleaveByBlock(
  day: readonly Question[],
  conceptTags: ConceptTagMap,
  blockSize = 8,
  sameConceptCap = 3,
): Question[] {
  const primaryConcept = (q: Question): string => conceptTags[q.id]?.[0] ?? '∅'
  const out: Question[] = []
  let pending = [...day]
  while (pending.length > 0) {
    const block: Question[] = []
    const perConcept = new Map<string, number>()
    const deferred: Question[] = []
    for (const q of pending) {
      if (block.length >= blockSize) {
        deferred.push(q)
        continue
      }
      const c = primaryConcept(q)
      const n = perConcept.get(c) ?? 0
      if (n >= sameConceptCap) {
        deferred.push(q)
        continue
      }
      block.push(q)
      perConcept.set(c, n + 1)
    }
    // Interleave within the block: round-robin across concepts so adjacent items differ.
    const byConcept = new Map<string, Question[]>()
    for (const q of block) {
      const c = primaryConcept(q)
      const arr = byConcept.get(c) ?? []
      arr.push(q)
      byConcept.set(c, arr)
    }
    const lanes = [...byConcept.values()]
    let drained = false
    while (!drained) {
      drained = true
      for (const lane of lanes) {
        const next = lane.shift()
        if (next) {
          out.push(next)
          drained = false
        }
      }
    }
    if (deferred.length === pending.length) {
      // No progress possible (all remaining are same-concept over cap) — flush as-is.
      out.push(...deferred)
      break
    }
    pending = deferred
  }
  return out
}

// ─── daily rescue queue assembly ─────────────────────────────────────────────
export interface AssembleQueueInput {
  subjectQuestions: readonly Question[]
  history: readonly QuestionHistoryRow[]
  flagById: Map<string, QuestionFlagRow>
  confidenceById: Map<string, ConfidenceSignal>
  conceptTags: ConceptTagMap
  push: readonly PushItem[]
  /** Concepts with an active (non-expired) player override → routed to the 加練 quota. */
  overrideConcepts: ReadonlySet<string>
  /** Session-runtime per-concept stats (drives stop-loss). Empty at day start. */
  conceptStats?: Map<string, ConceptStats>
  dailyMinutes: number
  now?: number
}

export interface AssembledQueue {
  queue: RescueQueue
  /** The day's chosen set honouring the 20/65/15 recovery/new/mixed mix. */
  day: Question[]
  /** Concepts that tripped a re-read stop-loss this build (for the interstitial). */
  rereadConcepts: string[]
  /** Concept → Yield band (reused by the 戰情圖 + quick-scan + RescueScore). */
  conceptYield: Map<string, YieldBand>
  /** Mean Movability of the day's set — feeds the qualitative return tier. */
  dayMeanMovability: number
}

/** Join live data → the pure `buildRescueQueue` + `partitionDayMix`. */
export function assembleRescueQueue(inp: AssembleQueueInput): AssembledQueue {
  const now = inp.now ?? Date.now()
  const histById = new Map(inp.history.map((h) => [h.questionId, h]))
  const conceptYield = buildConceptYield(inp.push, inp.subjectQuestions, inp.conceptTags)
  const yieldOf = buildYieldResolver(inp.push, inp.subjectQuestions, inp.conceptTags)
  const mastery = computeConceptMastery(inp.history, inp.conceptTags, undefined, now)
  const conceptStrengthOf = (qid: string): number => {
    const leaves = inp.conceptTags[qid] ?? []
    const vals = leaves.map((l) => mastery.get(l)).filter((v): v is number => typeof v === 'number')
    if (vals.length === 0) return 0 // undiagnosed concept → weak prior → high movability
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }
  const stats = inp.conceptStats ?? new Map<string, ConceptStats>()
  const conceptActionOf = (leaf: string): StopLossAction => {
    const s = stats.get(leaf)
    return s ? stopLossAction(s, conceptYield.get(leaf) ?? 'low') : 'none'
  }
  const stopLossActionOf = (qid: string): StopLossAction => {
    let action: StopLossAction = 'none'
    for (const leaf of inp.conceptTags[qid] ?? []) {
      const a = conceptActionOf(leaf)
      if (a === 'reread') return 'reread'
      if (a === 'demote') action = 'demote'
    }
    return action
  }
  const stopLossedOnceOf = (qid: string): boolean =>
    (inp.conceptTags[qid] ?? []).some((leaf) => conceptActionOf(leaf) !== 'none')
  const overrideQids = new Set<string>()
  if (inp.overrideConcepts.size > 0) {
    for (const q of inp.subjectQuestions) {
      if ((inp.conceptTags[q.id] ?? []).some((leaf) => inp.overrideConcepts.has(leaf)))
        overrideQids.add(q.id)
    }
  }
  const queue = buildRescueQueue({
    questions: inp.subjectQuestions,
    histById,
    flagById: inp.flagById,
    confidenceById: inp.confidenceById,
    yieldOf,
    conceptStrengthOf,
    stopLossActionOf,
    stopLossedOnceOf,
    overrideQids,
    dailyMinutes: inp.dailyMinutes,
    now,
  })
  const day = partitionDayMix(queue.core, histById, dailyCapacity(inp.dailyMinutes))
  // Mean Movability of the day's set (drives the qualitative return tier).
  const movabilityOf = (q: Question): number => {
    const scoreInp: RescueScoreInputs = {
      history: histById.get(q.id),
      flag: inp.flagById.get(q.id),
      confidence: inp.confidenceById.get(q.id),
      conceptMasteryStrength: conceptStrengthOf(q.id),
      stopLossedOnce: stopLossedOnceOf(q.id),
      yieldBand: yieldOf(q.id),
      estTimeSec: RESCUE_EST_TIME_SEC,
    }
    return movabilityValue(movabilityBandOf(scoreInp, now), scoreInp)
  }
  const dayMeanMovability = day.length
    ? day.reduce((s, q) => s + movabilityOf(q), 0) / day.length
    : 0
  // Re-read stop-loss concepts (hi-freq stuck) — surfaced as an interstitial.
  const rereadConcepts: string[] = []
  for (const [leaf, s] of stats) {
    if (stopLossAction(s, conceptYield.get(leaf) ?? 'low') === 'reread') rereadConcepts.push(leaf)
  }
  return { queue, day, rereadConcepts, conceptYield, dayMeanMovability }
}

// ─── RescueScore + qualitative return (thin wrapper over rescue-score) ────────
export interface RescueReadiness {
  score: number
  tier: ReturnTier
}

/**
 * RescueScore (0–100) + qualitative return tier for the target family. Mastery is a
 * recency-decayed pass over the family's history (NOT familyMastery); the return tier
 * comes from the mean movability of the day's core queue.
 */
export function computeReadiness(
  history: readonly QuestionHistoryRow[],
  conceptYield: Map<string, YieldBand>,
  conceptTags: ConceptTagMap,
  dayMeanMovability: number,
  now: number = Date.now(),
): RescueReadiness {
  const mastery = computeConceptMastery(history, conceptTags, undefined, now)
  const score = computeRescueScore(mastery, conceptYield)
  return { score, tier: returnTier(dayMeanMovability) }
}

// ─── exam-morning quick-scan pool ────────────────────────────────────────────
/**
 * The D=0 quick-scan: prior-day-corrected high-confidence-wrong questions plus a
 * handful of high-frequency kernel questions, sized for ~15 minutes. Reuses the same
 * answering path — this is a filtered pool, not a new scorer. Pure.
 */
export function buildQuickScanPool(
  subjectQuestions: readonly Question[],
  histById: Map<string, QuestionHistoryRow>,
  confidenceById: Map<string, ConfidenceSignal>,
  conceptYield: Map<string, YieldBand>,
  conceptTags: ConceptTagMap,
): Question[] {
  const cap = dailyCapacity(15, RESCUE_EST_TIME_SEC) // ~15 min budget
  const answerable = subjectQuestions.filter((q) => !q.hasOptionImages)
  const isHiYield = (q: Question): boolean =>
    (conceptTags[q.id] ?? []).some((leaf) => conceptYield.get(leaf) === 'high')
  // Highest leverage first: high-confidence-wrong the player has since seen, then
  // high-frequency kernel questions.
  const hiConfWrong = answerable.filter(
    (q) => confidenceById.get(q.id) === 'sure' && histById.get(q.id)?.everWrong === true,
  )
  const seen = new Set(hiConfWrong.map((q) => q.id))
  const hiFreqKernel = answerable.filter((q) => !seen.has(q.id) && isHiYield(q))
  return [...hiConfWrong, ...hiFreqKernel].slice(0, cap)
}
