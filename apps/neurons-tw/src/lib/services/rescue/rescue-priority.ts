/**
 * Single-subject rescue — priority scoring (pure, device-local, zero-schema).
 *
 * Implements the core selection algorithm of the 考前救急 mode:
 *   priority(q) = Yield × Movability × Confidence × typeCoefficient ÷ EstTime
 *
 * Everything here is a pure function over already-loaded data + lookups (mirrors
 * weakness-pressure.ts), so it is fully unit-testable without IndexedDB or UI, and
 * writes nothing. Numeric band values are DOGFOOD-TUNABLE; the spec fixes only the
 * ordering property + which bands drop.
 *
 * Spec: openspec/changes/add-neurons-single-subject-rescue/specs/
 *       neurons-single-subject-rescue/spec.md
 */

import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow, QuestionFlagRow } from '../../db'

// ─── Yield ───────────────────────────────────────────────────────────────────
export type YieldBand = 'high' | 'mid' | 'low'

/** Band → numeric Yield. DOGFOOD-TUNABLE (spec fixes only the ordinal order). */
export const YIELD_VALUE: Record<YieldBand, number> = { high: 1.0, mid: 0.6, low: 0.3 }

/**
 * `CramPushItem.tier` is a freeform string; the built cram.json currently carries
 * exactly these three values. Ordinal map per spec. Unknown/absent tiers fall
 * through to the corpus-percentile fallback (never a flat low default).
 */
export const TIER_TO_YIELD: Record<string, YieldBand> = {
  常青必掃: 'high',
  穩定考點: 'mid',
  經典但降溫: 'low',
}

export function tierToYieldBand(tier: string | undefined | null): YieldBand | undefined {
  if (!tier) return undefined
  return TIER_TO_YIELD[tier]
}

/** Corpus cross-year appearance-frequency percentile [0,1] → band (terciles). */
export function percentileToYieldBand(p: number): YieldBand {
  if (p >= 2 / 3) return 'high'
  if (p >= 1 / 3) return 'mid'
  return 'low'
}

// ─── typeCoefficient extrapolation seam ──────────────────────────────────────
/**
 * factual/reasoning extrapolation coefficient. DEFERRED — always 1.0 this release.
 * The seam exists so v2 can supply real per-question-type values without touching
 * the priority formula. It is invoked through `rescueSeams` (below) so the call is
 * observable by the contract test and can never be dead-code-eliminated.
 */
export function typeCoefficient(_q: Question): number {
  return 1.0
}

/** Indirection layer so `typeCoefficient`'s call-site is observable (contract test). */
export const rescueSeams = { typeCoefficient }

// ─── Confidence (pre-reveal tap) ─────────────────────────────────────────────
/** Pre-reveal confidence tap recorded at submit time in the rescue session. */
export type ConfidenceSignal = 'sure' | 'guess' | undefined

// ─── Movability ──────────────────────────────────────────────────────────────
export type MovabilityBand =
  | 'unanswered'
  | 'wrong-learnable'
  | 'correct-unsure'
  | 'unrecoverable'
  | 'mastered'

/** SRS interval (days) at/above which a not-due correct card counts as mastered. */
export const MASTERED_INTERVAL_DAYS = 7
/** Cumulative wrong attempts at/above which a stuck+stop-lossed question is unrecoverable. */
export const UNRECOVERABLE_MIN_WRONG = 3

export interface RescueScoreInputs {
  /** This question's history row, or undefined if never answered. */
  history: QuestionHistoryRow | undefined
  /** Existing flags — cold-start prior ONLY for confidence (easyMarked/guessedMarked). */
  flag: QuestionFlagRow | undefined
  /** Pre-reveal confidence recorded THIS run for this question (device-local). */
  confidence: ConfidenceSignal
  /** For unanswered questions: concept mastery STRENGTH in [0,1] (1 = strong). */
  conceptMasteryStrength: number
  /** Whether this question's concept already tripped stop-loss once this run. */
  stopLossedOnce: boolean
  /** Resolved Yield band (from tier map or corpus fallback). */
  yieldBand: YieldBand
  /** Median answer seconds (global constant acceptable for MVP → ÷EstTime is a no-op). */
  estTimeSec: number
}

function isMastered(h: QuestionHistoryRow, now: number): boolean {
  if (h.lastResult !== 'correct') return false
  const notDue = !(typeof h.nextDueAt === 'number' && h.nextDueAt <= now)
  // SRS interval is the reliable "already-known" encoding (spec, D-decision).
  if (typeof h.interval === 'number' && h.interval >= MASTERED_INTERVAL_DAYS && notDue) return true
  // Fallback approximation of "recent consecutive-correct ≥2" without a streak field.
  if ((h.correctCount ?? 0) >= 2 && notDue) return true
  return false
}

/** Classify a candidate into exactly one Movability band. Pure. */
export function movabilityBandOf(inp: RescueScoreInputs, now: number): MovabilityBand {
  const h = inp.history
  if (!h) return 'unanswered'
  if (isMastered(h, now)) return 'mastered'
  if (h.lastResult === 'wrong') {
    const wrongCount = Math.max(0, (h.attempts ?? 0) - (h.correctCount ?? 0))
    if (wrongCount >= UNRECOVERABLE_MIN_WRONG && inp.stopLossedOnce) return 'unrecoverable'
    return 'wrong-learnable'
  }
  // Correct but not mastered (only-correct-once or correct-but-unsure).
  return 'correct-unsure'
}

/** Band → Movability value. The confidence multiplier lives in `confidenceMultiplier`, not here. */
export function movabilityValue(band: MovabilityBand, inp: RescueScoreInputs): number {
  switch (band) {
    case 'unanswered':
      // Weak concept (low strength) → high (~1.0); strong concept → 0.2.
      return clamp(0.2 + 0.8 * (1 - clamp01(inp.conceptMasteryStrength)), 0.2, 1.0)
    case 'wrong-learnable':
      return 1.0
    case 'correct-unsure':
      return 0.5
    case 'unrecoverable':
      return inp.yieldBand === 'low' ? 0.05 : 0.2
    case 'mastered':
      return 0 // canonical Movability-zero case → triage-dropped
  }
}

// ─── Confidence multiplier (SOLE home of the ×1.5) ───────────────────────────
export function confidenceMultiplier(inp: RescueScoreInputs): number {
  const h = inp.history
  const highConf =
    inp.confidence === 'sure' || (inp.confidence === undefined && inp.flag?.easyMarked === true)
  const lowConf =
    inp.confidence === 'guess' || (inp.confidence === undefined && inp.flag?.guessedMarked === true)
  if (h?.lastResult === 'wrong' && highConf) return 1.5 // hypercorrection
  if (h?.lastResult === 'correct' && lowConf) return 1.1
  return 1.0
}

// ─── priority + triage ───────────────────────────────────────────────────────
const EST_TIME_FLOOR = 1 // seconds; avoid divide-by-zero when estTime is unset

/**
 * priority(q) = Yield × Movability × Confidence × typeCoefficient ÷ EstTime.
 * typeCoefficient is called through `rescueSeams` so the seam stays live (spec).
 */
export function priorityOf(q: Question, inp: RescueScoreInputs, now: number): number {
  const band = movabilityBandOf(inp, now)
  const mv = movabilityValue(band, inp)
  const yieldV = YIELD_VALUE[inp.yieldBand]
  const conf = confidenceMultiplier(inp)
  const tc = rescueSeams.typeCoefficient(q) // seam — MUST remain in the formula
  const est = Math.max(EST_TIME_FLOOR, inp.estTimeSec)
  return (yieldV * mv * conf * tc) / est
}

/** Triage: drop already-mastered (`Movability == 0`) and unrecoverable low-yield (`≤0.05 & <mid`). */
export function isTriageDropped(inp: RescueScoreInputs, now: number): boolean {
  const band = movabilityBandOf(inp, now)
  const mv = movabilityValue(band, inp)
  if (mv === 0) return true
  if (mv <= 0.05 && inp.yieldBand === 'low') return true
  return false
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
function clamp01(v: number): number {
  return clamp(v, 0, 1)
}
