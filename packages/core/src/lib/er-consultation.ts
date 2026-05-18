/**
 * ER consultation — pure selector / picker / mutex helpers.
 *
 * Spec: openspec/specs/er-consultation/spec.md (二階 hospital mode)
 *
 * 純函式設計：所有 IO（Dexie reads/writes、Date.now、Math.random）由 caller
 * 注入；本檔不直接接 DB / time / RNG，方便單元測試 + 跨 host adaption。
 */

import type { SubjectId, QuestionId } from '../types'

/** 1.8× reward multiplier applied to the underlying quiz reward formula. */
export const ER_CONSULT_REWARD_MULTIPLIER = 1.8

/**
 * Cadence: tick interval between ER consult rolls. Tick frequency is set by the
 * host (medexam2 uses 5s/tick, so 72 ticks = 6 min, 120 ticks = 10 min).
 * Re-randomized after each roll fires.
 */
export const ER_CONSULT_TICK_INTERVAL_MIN = 72
export const ER_CONSULT_TICK_INTERVAL_MAX = 120

/** Cap on `erConsultLog` rows; oldest deleted on overflow. */
export const ER_CONSULT_LOG_CAP = 500

/** 30-day window in ms — used to exclude recently-answered questions from picker. */
export const ER_CONSULT_RECENT_ANSWER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/** 7-day window in ms — used to compute recency + subject-cooldown signals. */
export const ER_CONSULT_RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Per-subject cooldown threshold: subjects used as consult target ≥ 3 times in 7d get score penalty. */
export const ER_CONSULT_SUBJECT_COOLDOWN_THRESHOLD = 3
export const ER_CONSULT_SUBJECT_COOLDOWN_MULTIPLIER = 0.3

/** Auto-skip timeout from `triggeredAt` (10 min wall-clock). */
export const ER_CONSULT_AUTO_SKIP_MS = 10 * 60 * 1000

export interface MasteryCounter {
  correct: number
  total: number
}

export interface ERConsultSelectorInput {
  subjects: SubjectId[]
  masteryMap: Record<SubjectId, MasteryCounter>
  /** Count of questionHistory rows per subject with lastAnsweredAt within last 7 days. */
  recentAttempts7d: Record<SubjectId, number>
  /** Count of er-consult triggers per subject in last 7 days (for cooldown). */
  recentConsultsBySubject7d: Record<SubjectId, number>
  rng?: () => number
}

/**
 * Weighted score selector — returns subject with highest computed score.
 *
 * Formula:
 *   score(subject) = 0.6 × normalize(1 / max(recentAttempts7d, 1))
 *                  + 0.3 × (1 - masteryPct)
 *                  + 0.1 × rng()
 *   then × 0.3 if subject already used ≥ 3 times in last 7 days
 *
 * Returns null only when the subjects array is empty.
 */
export function selectUnderUtilizedSubject(input: ERConsultSelectorInput): SubjectId | null {
  const rng = input.rng ?? Math.random
  if (input.subjects.length === 0) return null

  // Reciprocal of recent attempts (lower attempts → higher reciprocal → higher recency weight)
  const recipMap: Record<SubjectId, number> = {}
  let recipMax = 0
  for (const s of input.subjects) {
    const attempts = input.recentAttempts7d[s] ?? 0
    const recip = 1 / Math.max(attempts, 1)
    recipMap[s] = recip
    if (recip > recipMax) recipMax = recip
  }

  let best: SubjectId | null = null
  let bestScore = -Infinity
  for (const s of input.subjects) {
    const recencyNorm = recipMax > 0 ? recipMap[s] / recipMax : 0
    const mastery = input.masteryMap[s] ?? { correct: 0, total: 0 }
    const masteryPct = mastery.total > 0 ? mastery.correct / mastery.total : 0
    const consultsCount = input.recentConsultsBySubject7d[s] ?? 0

    let score = 0.6 * recencyNorm + 0.3 * (1 - masteryPct) + 0.1 * rng()
    if (consultsCount >= ER_CONSULT_SUBJECT_COOLDOWN_THRESHOLD) {
      score *= ER_CONSULT_SUBJECT_COOLDOWN_MULTIPLIER
    }
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

export interface ERConsultQuestionPickerInput {
  questionsInSubject: QuestionId[]
  recentlyAnsweredQuestionIds: ReadonlySet<QuestionId>
  rng?: () => number
}

/**
 * Pick a random question from the subject pool, excluding questions answered
 * within last 30 days. Falls through to full pool if exclusion produces empty set.
 *
 * Returns null only when the subject pool itself is empty.
 */
export function pickERConsultQuestion(input: ERConsultQuestionPickerInput): QuestionId | null {
  if (input.questionsInSubject.length === 0) return null
  const rng = input.rng ?? Math.random

  const filtered = input.questionsInSubject.filter(
    (q) => !input.recentlyAnsweredQuestionIds.has(q),
  )
  const pool = filtered.length > 0 ? filtered : input.questionsInSubject
  return pool[Math.floor(rng() * pool.length)] ?? null
}

export interface ERConsultMutexState {
  currentHospitalEventPending: boolean
  erConsultActive: boolean
  mentorDialogOpen: boolean
  quizSessionActive: boolean
  readingSessionRunning: boolean
  erConsultEnabled: boolean
}

/**
 * Hard-mutex pre-condition check. Returns true ONLY when all 6 gates pass.
 * Any failing gate causes the current roll to be skipped (without queueing).
 */
export function shouldRollERConsult(state: ERConsultMutexState): boolean {
  if (!state.erConsultEnabled) return false
  if (state.currentHospitalEventPending) return false
  if (state.erConsultActive) return false
  if (state.mentorDialogOpen) return false
  if (state.quizSessionActive) return false
  if (state.readingSessionRunning) return false
  return true
}

/**
 * Compute ER consult reward by applying the 1.8× multiplier to a base reward.
 * For 二階 the base is revenue or reputation (both scaled equally); for 一階 it
 * could be XP. Caller multiplies whichever counter they grant.
 */
export function computeERConsultReward(baseReward: number): number {
  return Math.floor(baseReward * ER_CONSULT_REWARD_MULTIPLIER)
}

/**
 * Re-randomize tick countdown for the next roll. Returns integer in
 * [ER_CONSULT_TICK_INTERVAL_MIN, ER_CONSULT_TICK_INTERVAL_MAX] inclusive.
 */
export function jitterTicksUntilNextERConsult(rng: () => number = Math.random): number {
  const min = ER_CONSULT_TICK_INTERVAL_MIN
  const max = ER_CONSULT_TICK_INTERVAL_MAX
  return Math.floor(min + rng() * (max - min + 1))
}
