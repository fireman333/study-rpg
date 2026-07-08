/**
 * Single-subject rescue — RescueScore + qualitative return tier (pure, zero-schema).
 *
 * RescueScore(0–100) = a recency-decayed, Yield-weighted "if I tested this subject
 * now, how much of its high-frequency material do I hold". Mastery is derived at
 * read time from `questionHistory` (`lastResult × lastAnsweredAt` exponential decay)
 * — NOT from the backward-looking `familyMastery` ratio. The expected return of more
 * study is reported as a qualitative three-tier label, never a fabricated point gain.
 *
 * Spec: openspec/changes/add-neurons-single-subject-rescue/specs/
 *       neurons-single-subject-rescue/spec.md
 */

import type { QuestionHistoryRow } from '../../db'
import type { ConceptTagMap } from '../../concept-tags'
import { YIELD_VALUE, type YieldBand } from './rescue-priority'

/** Recency-decay time constant (days). DOGFOOD-TUNABLE; aligned to the SRS interval scale. */
export const DEFAULT_TAU_DAYS = 10
const DAY_MS = 86_400_000

/** Return-tier thresholds over expected marginal movability. DOGFOOD-TUNABLE. */
export const RETURN_TIER_THRESHOLDS = { 夯: 0.55, 普通: 0.25 } as const
export type ReturnTier = '夯' | '普通' | '低迷'

/**
 * Per-concept recency-decayed mastery strength in [0,1] (1 = strong), or `undefined`
 * when the concept has no answered questions (undiagnosed). Pure, one pass over the
 * subject's history rows joined with `conceptTags`.
 */
export function computeConceptMastery(
  history: readonly QuestionHistoryRow[],
  conceptTags: ConceptTagMap,
  tauDays: number = DEFAULT_TAU_DAYS,
  now: number = Date.now(),
): Map<string, number | undefined> {
  const acc = new Map<string, { num: number; den: number }>()
  const tauMs = Math.max(1, tauDays) * DAY_MS
  for (const row of history) {
    const leaves = conceptTags[row.questionId]
    if (!leaves) continue
    const w = Math.exp(-Math.max(0, now - row.lastAnsweredAt) / tauMs)
    const correct = row.lastResult === 'correct' ? 1 : 0
    for (const leaf of leaves) {
      const a = acc.get(leaf) ?? { num: 0, den: 0 }
      a.num += correct * w
      a.den += w
      acc.set(leaf, a)
    }
  }
  const out = new Map<string, number | undefined>()
  for (const [leaf, a] of acc) out.set(leaf, a.den > 0 ? a.num / a.den : undefined)
  return out
}

/**
 * RescueScore in [0,100] over the subject's high-yield concepts. Undiagnosed concepts
 * count as 0 mastery (you don't yet hold them). `conceptYield` supplies each concept's
 * resolved Yield band; concepts absent from it are skipped (not part of this subject).
 */
export function computeRescueScore(
  conceptMastery: Map<string, number | undefined>,
  conceptYield: Map<string, YieldBand>,
  masteryOverride?: (leaf: string, m: number | undefined) => number,
): number {
  let num = 0
  let den = 0
  for (const [leaf, band] of conceptYield) {
    const yieldW = YIELD_VALUE[band]
    const raw = conceptMastery.get(leaf)
    const m = masteryOverride ? masteryOverride(leaf, raw) : (raw ?? 0)
    num += yieldW * m
    den += yieldW
  }
  if (den === 0) return 0
  return Math.round(100 * (num / den))
}

/**
 * Qualitative return tier from the expected marginal movability of the next chunk of
 * study (mean Movability of the day's core queue). Deliberately NOT a point figure —
 * the Δp values are estimates and a precise "追回 X 分" would be false precision.
 */
export function returnTier(expectedMarginalMovability: number): ReturnTier {
  if (expectedMarginalMovability >= RETURN_TIER_THRESHOLDS.夯) return '夯'
  if (expectedMarginalMovability >= RETURN_TIER_THRESHOLDS.普通) return '普通'
  return '低迷'
}

/** Mean of a list of per-question Movability values (the raw material for `returnTier`). */
export function meanMovability(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}
