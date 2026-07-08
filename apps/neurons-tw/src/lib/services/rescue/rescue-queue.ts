/**
 * Single-subject rescue — high-yield pool + daily queue builder (pure).
 *
 * `buildYieldResolver` maps each question to a Yield band (cram tier first, corpus
 * appearance-frequency percentile fallback). `buildRescueQueue` ranks the subject's
 * questions by `priority`, triage-drops the mastered/unrecoverable, applies stop-loss
 * demotion, and splits into a capacity-capped CORE queue and a separate 加練 (override)
 * queue that never displaces core. `partitionDayMix` selects the day's set honouring
 * the recovery / new-target / mixed-check ratios. All pure + unit-testable.
 *
 * Spec: neurons-single-subject-rescue "Rescue question selection..." + "schedule backward...".
 */

import type { Question } from '@study-rpg/core'
import type { QuestionHistoryRow, QuestionFlagRow } from '../../db'
import type { ConceptTagMap } from '../../concept-tags'
import type { CramData } from '@study-rpg/content-neurons-tw'
import {
  priorityOf,
  isTriageDropped,
  tierToYieldBand,
  percentileToYieldBand,
  type YieldBand,
  type ConfidenceSignal,
  type RescueScoreInputs,
} from './rescue-priority'
import { stopLossDemotion, type StopLossAction } from './rescue-stoploss'

/** ≈1.6 min/Q — matches prescription's `floor(minutes / 1.6)` capacity. DOGFOOD-TUNABLE. */
export const RESCUE_EST_TIME_SEC = 96

type PushItem = CramData['books'][number]['subjects'][number]['push'][number]
const YIELD_RANK: Record<YieldBand, number> = { high: 2, mid: 1, low: 0 }

/**
 * Build a per-question Yield resolver. A question's band = the best band among its
 * concepts: cram tier if the concept has a push item, else the concept's corpus
 * appearance-frequency percentile (within this subject). Never a flat low default.
 */
export function buildYieldResolver(
  push: readonly PushItem[],
  subjectQuestions: readonly Question[],
  conceptTags: ConceptTagMap,
): (questionId: string) => YieldBand {
  const tierBand = new Map<string, YieldBand>()
  for (const p of push) {
    const b = tierToYieldBand(p.tier)
    if (b) tierBand.set(p.leafId, b)
  }
  const count = new Map<string, number>()
  for (const q of subjectQuestions) {
    for (const leaf of conceptTags[q.id] ?? []) count.set(leaf, (count.get(leaf) ?? 0) + 1)
  }
  const sorted = [...count.entries()].sort((a, b) => a[1] - b[1])
  const pct = new Map<string, number>()
  const n = sorted.length
  sorted.forEach(([leaf], i) => pct.set(leaf, n <= 1 ? 1 : i / (n - 1)))

  return (questionId: string): YieldBand => {
    const leaves = conceptTags[questionId] ?? []
    let best: YieldBand | undefined
    for (const leaf of leaves) {
      const b = tierBand.get(leaf)
      if (b && (best === undefined || YIELD_RANK[b] > YIELD_RANK[best])) best = b
    }
    if (best) return best
    let bestPct = -1
    for (const leaf of leaves) {
      const p = pct.get(leaf)
      if (p !== undefined && p > bestPct) bestPct = p
    }
    return bestPct >= 0 ? percentileToYieldBand(bestPct) : 'low'
  }
}

export interface RescueQueueParams {
  /** Subject-scoped candidate questions. */
  questions: readonly Question[]
  histById: Map<string, QuestionHistoryRow>
  flagById: Map<string, QuestionFlagRow>
  confidenceById: Map<string, ConfidenceSignal>
  yieldOf: (questionId: string) => YieldBand
  /** Mean concept-mastery STRENGTH [0,1] for the question (drives the unanswered prior). */
  conceptStrengthOf: (questionId: string) => number
  stopLossActionOf: (questionId: string) => StopLossAction
  stopLossedOnceOf: (questionId: string) => boolean
  /** Questions whose concept has an active player override → routed to the 加練 quota. */
  overrideQids: ReadonlySet<string>
  dailyMinutes: number
  estTimeSec?: number
  now?: number
}

export interface RescueQueue {
  /** Ranked, capacity-capped core queue. */
  core: Question[]
  /** Separate 加練 (override) queue — never displaces core, never a success metric. */
  addon: Question[]
  /** How many candidates were triage-dropped. */
  dropped: number
}

/** Questions answerable within the daily budget (`floor(minutes*60 / estTime)`). */
export function dailyCapacity(dailyMinutes: number, estTimeSec = RESCUE_EST_TIME_SEC): number {
  return Math.max(1, Math.floor((dailyMinutes * 60) / Math.max(1, estTimeSec)))
}

/** Rank + triage + stop-loss demotion + core/addon split. Pure. */
export function buildRescueQueue(p: RescueQueueParams): RescueQueue {
  const now = p.now ?? Date.now()
  const est = p.estTimeSec ?? RESCUE_EST_TIME_SEC
  const scored: { q: Question; score: number; addon: boolean }[] = []
  let dropped = 0
  for (const q of p.questions) {
    if (q.hasOptionImages) continue
    const inp: RescueScoreInputs = {
      history: p.histById.get(q.id),
      flag: p.flagById.get(q.id),
      confidence: p.confidenceById.get(q.id),
      conceptMasteryStrength: p.conceptStrengthOf(q.id),
      stopLossedOnce: p.stopLossedOnceOf(q.id),
      yieldBand: p.yieldOf(q.id),
      estTimeSec: est,
    }
    if (isTriageDropped(inp, now)) {
      dropped++
      continue
    }
    const score = priorityOf(q, inp, now) * stopLossDemotion(p.stopLossActionOf(q.id))
    scored.push({ q, score, addon: p.overrideQids.has(q.id) })
  }
  const cmp = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.score - a.score || (a.q.id < b.q.id ? -1 : a.q.id > b.q.id ? 1 : 0)
  const core = scored.filter((s) => !s.addon).sort(cmp)
  const addon = scored.filter((s) => s.addon).sort(cmp)
  const cap = dailyCapacity(p.dailyMinutes, est)
  return { core: core.slice(0, cap).map((s) => s.q), addon: addon.map((s) => s.q), dropped }
}

// ─── Day-mix (backward-planning daily composition) ───────────────────────────
export const DAY_MIX = { recovery: 0.2, newTargets: 0.65, mixed: 0.15 } as const
export type DayBucket = 'recovery' | 'new' | 'mixed'

/** Bucket a question by history: prior-wrong → recovery, unanswered → new, else mixed. Pure. */
export function classifyForDayMix(h: QuestionHistoryRow | undefined): DayBucket {
  if (!h) return 'new'
  if (h.lastResult === 'wrong' || h.everWrong) return 'recovery'
  return 'mixed'
}

/**
 * Select the day's set (≤ capacity) honouring the recovery/new/mixed ratios, drawing
 * from the already-ranked core in rank order per bucket, then filling any shortfall
 * from the remaining ranked questions. Preserves rank order within the final set. Pure.
 */
export function partitionDayMix(
  rankedCore: readonly Question[],
  histById: Map<string, QuestionHistoryRow>,
  capacity: number,
  mix: { recovery: number; newTargets: number; mixed: number } = DAY_MIX,
): Question[] {
  const cap = Math.min(capacity, rankedCore.length)
  const target: Record<DayBucket, number> = {
    recovery: Math.round(cap * mix.recovery),
    new: Math.round(cap * mix.newTargets),
    mixed: Math.round(cap * mix.mixed),
  }
  const taken = new Set<string>()
  const perBucket: Record<DayBucket, number> = { recovery: 0, new: 0, mixed: 0 }
  for (const q of rankedCore) {
    const b = classifyForDayMix(histById.get(q.id))
    if (perBucket[b] < target[b]) {
      taken.add(q.id)
      perBucket[b]++
    }
  }
  // Fill any shortfall (from rounding / empty buckets) with the next-best unranked-yet.
  for (const q of rankedCore) {
    if (taken.size >= cap) break
    if (!taken.has(q.id)) taken.add(q.id)
  }
  return rankedCore.filter((q) => taken.has(q.id)).slice(0, cap)
}
