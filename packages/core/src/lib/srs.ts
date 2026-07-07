/**
 * Spaced repetition primitives for study-rpg.
 *
 * This module exports two SM-2 variants and one shared filter. Pick by use case:
 *
 * - `reviewCard(card, quality 0..5, now?)` — original 一階 (medexam-tw) variant.
 *   Accepts SM-2 quality rating 0..5, applies harsh "again" reset on quality < 3
 *   (interval → 1, ease − 0.2). Caller passes full `SrsCard` (with `lapses`).
 *
 * - `reviewCardBinary({ correct, prev, now? })` — 二階 (medexam2-hospital-tw) variant.
 *   Binary correct/wrong input. Standard SM-2 expansion on correct
 *   (1d → 6d → ×ease). Partial reset on wrong (interval *= 0.5, ease *= 0.85,
 *   both floored), favoring 養成-game tone over Anki harshness.
 *
 * - `dueCards(cards, now?)` — shared filter, works on the original `SrsCard` shape.
 *
 * Tunable constants live at the top of this file so dogfood-driven adjustments
 * stay co-located.
 */

import type { SrsCard, QuestionId } from '../types'

const DAY = 86_400_000

// ─── Tunable constants (dogfood-driven) ──────────────────────────────────────

/** Multiplier applied to `interval` on a wrong answer in the binary variant. */
export const WRONG_INTERVAL_MULTIPLIER = 0.5

/** Multiplier applied to `easeFactor` on a wrong answer in the binary variant. */
export const WRONG_EASE_MULTIPLIER = 0.85

/**
 * Multiplier applied to `easeFactor` when a wrong answer is flagged 觀念洞
 * (a self-declared concept gap). One notch harsher than `WRONG_EASE_MULTIPLIER`
 * — a concept gap is a stronger "I don't get this" signal than an unflagged
 * wrong (which folds in careless slips), so it decays ease slightly faster and
 * re-graduates more slowly. Dogfood-tunable.
 */
export const INSIGHT_EASE_MULTIPLIER = 0.8

/**
 * Initial interval seeds shared by both variants: [first correct, second correct].
 *
 * Wider seeds (was `[1, 6]`) align with FSRS default stability ≈ 3 days and
 * fix the "我答對為何又考" complaint where players see correctly-answered
 * questions resurface the next day.
 */
export const STANDARD_INITIAL_INTERVALS: readonly [number, number] = [3, 7]

/**
 * Multiplier applied to `ease` when player clicks the 「太簡單」 opt-in button.
 * Combined with `EASY_INTERVAL_MULTIPLIER` to escalate next-due aggressively.
 */
export const EASY_EASE_MULTIPLIER = 1.5

/**
 * Multiplier applied to `interval` when player clicks the 「太簡單」 opt-in button.
 * Clamped by `MAX_INTERVAL_DAYS`.
 */
export const EASY_INTERVAL_MULTIPLIER = 3

/**
 * Interval (days) forced when player clicks the 「我亂猜的」 opt-in button.
 * Ease and lapses are intentionally unchanged — the player answered correctly
 * per the canonical rule; this is an honesty modifier, not a lapse.
 */
export const GUESSED_RESET_INTERVAL = 1

/** Global daily cap on surfaced due cards in the 二階 hospital mode SRS queue. */
export const SRS_DAILY_CAP = 20

/**
 * Upper bound on `interval` (days) for the correct path of both SM-2 variants.
 * Capped at 365 because medical board exam cycles are annual — a question
 * scheduled beyond a year out would skip the next exam prep cycle entirely.
 * Applies only to the correct path; wrong-path partial reset cannot expand.
 */
export const MAX_INTERVAL_DAYS = 365

/** SM-2 easeFactor lower bound (Anki / SuperMemo standard). */
const EASE_FLOOR = 1.3

/** Default starting easeFactor for fresh cards. */
const DEFAULT_EASE = 2.5

// ─── 一階 variant: 0..5 quality input ────────────────────────────────────────

export function newCard(questionId: QuestionId, now: number = Date.now()): SrsCard {
  return { questionId, ease: DEFAULT_EASE, interval: 0, dueAt: now, lapses: 0 }
}

export function reviewCard(card: SrsCard, quality: number, now: number = Date.now()): SrsCard {
  const q = Math.max(0, Math.min(5, quality))

  if (q < 3) {
    // Lapse: reset interval, bump lapses
    return { ...card, interval: 1, dueAt: now + DAY, lapses: card.lapses + 1, ease: Math.max(EASE_FLOOR, card.ease - 0.2) }
  }

  const newEase = Math.max(EASE_FLOOR, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  let newInterval: number
  if (card.interval === 0) newInterval = STANDARD_INITIAL_INTERVALS[0]
  else if (card.interval === STANDARD_INITIAL_INTERVALS[0]) newInterval = STANDARD_INITIAL_INTERVALS[1]
  else newInterval = Math.round(card.interval * newEase)
  newInterval = Math.min(newInterval, MAX_INTERVAL_DAYS)

  return {
    ...card,
    ease: newEase,
    interval: newInterval,
    dueAt: now + newInterval * DAY,
  }
}

/**
 * 一階 opt-in modifier: 「太簡單」 (too easy) escalator.
 *
 * Multiplicative escalator applied when player explicitly graduates a question
 * after a correct answer. Replaces (not stacks with) the default
 * `reviewCard(card, 4)` quality-good update.
 *
 * - `ease *= EASY_EASE_MULTIPLIER` (no upper cap — see design Open Q1)
 * - `interval *= EASY_INTERVAL_MULTIPLIER`, clamped to `MAX_INTERVAL_DAYS`
 * - `lapses` unchanged
 */
export function reviewCardEasy(card: SrsCard, now: number = Date.now()): SrsCard {
  const newEase = card.ease * EASY_EASE_MULTIPLIER
  const baseInterval = card.interval === 0 ? STANDARD_INITIAL_INTERVALS[0] : card.interval
  const newInterval = Math.min(
    Math.round(baseInterval * EASY_INTERVAL_MULTIPLIER),
    MAX_INTERVAL_DAYS,
  )
  return {
    ...card,
    ease: newEase,
    interval: newInterval,
    dueAt: now + newInterval * DAY,
  }
}

/**
 * 一階 opt-in modifier: 「我亂猜的」 (I guessed) honesty reset.
 *
 * Forces `interval = GUESSED_RESET_INTERVAL` (1 day). Leaves `ease` and
 * `lapses` untouched — the canonical answer was correct; the player merely
 * signals lack of confidence so the question re-surfaces for verification.
 */
export function reviewCardGuessed(card: SrsCard, now: number = Date.now()): SrsCard {
  return {
    ...card,
    interval: GUESSED_RESET_INTERVAL,
    dueAt: now + GUESSED_RESET_INTERVAL * DAY,
  }
}

// ─── 二階 variant: binary correct/wrong input ────────────────────────────────

export interface BinaryReviewPrev {
  /** Previous interval in days. 0 = fresh / never reviewed. */
  interval: number
  /** Previous easeFactor (SM-2). Floor 1.3, default 2.5 for fresh. */
  easeFactor: number
  /** Previous due timestamp in ms epoch, or null for fresh. */
  nextDueAt: number | null
}

export interface BinaryReviewInput {
  correct: boolean
  prev: BinaryReviewPrev
  /** Defaults to `Date.now()`. */
  now?: number
}

export interface BinaryReviewResult {
  /** New interval in days (integer ≥ 1 after first review). */
  interval: number
  /** New easeFactor, clamped to `EASE_FLOOR`. */
  easeFactor: number
  /** New due timestamp in ms epoch. */
  nextDueAt: number
}

/**
 * Binary-input SM-2 review for 二階 hospital quiz.
 *
 * Correct path: standard SM-2 expansion (1d → 6d → prev × ease). EaseFactor unchanged.
 * Wrong path:   partial reset — interval *= 0.5 (floor 1d), easeFactor *= 0.85 (floor 1.3).
 *
 * Both paths set `nextDueAt = now + newInterval × DAY`.
 */
export function reviewCardBinary(input: BinaryReviewInput): BinaryReviewResult {
  const { correct, prev } = input
  const now = input.now ?? Date.now()
  const prevInterval = prev.interval
  const prevEase = prev.easeFactor

  if (correct) {
    let newInterval: number
    if (prevInterval === 0) newInterval = STANDARD_INITIAL_INTERVALS[0]
    else if (prevInterval === STANDARD_INITIAL_INTERVALS[0]) newInterval = STANDARD_INITIAL_INTERVALS[1]
    else newInterval = Math.round(prevInterval * prevEase)
    newInterval = Math.min(newInterval, MAX_INTERVAL_DAYS)

    return {
      interval: newInterval,
      easeFactor: prevEase,
      nextDueAt: now + newInterval * DAY,
    }
  }

  // Wrong: partial reset
  const rawInterval = prevInterval === 0 ? 1 : prevInterval * WRONG_INTERVAL_MULTIPLIER
  const newInterval = Math.max(1, Math.round(rawInterval))
  const newEase = Math.max(EASE_FLOOR, prevEase * WRONG_EASE_MULTIPLIER)

  return {
    interval: newInterval,
    easeFactor: newEase,
    nextDueAt: now + newInterval * DAY,
  }
}

/**
 * 二階 opt-in modifier: 「太簡單」 (too easy) escalator.
 *
 * Binary-input analogue of `reviewCardEasy`. Applied when player explicitly
 * graduates a question after a correct answer. The 「太簡單」 side effect of
 * clearing `everWrong` lives in the 二階 mastery helper (mastery.ts), NOT in
 * this engine function — `packages/core/` stays content-agnostic.
 */
export function reviewCardBinaryEasy(input: { prev: BinaryReviewPrev; now?: number }): BinaryReviewResult {
  const { prev } = input
  const now = input.now ?? Date.now()
  const baseInterval = prev.interval === 0 ? STANDARD_INITIAL_INTERVALS[0] : prev.interval
  const newInterval = Math.min(
    Math.round(baseInterval * EASY_INTERVAL_MULTIPLIER),
    MAX_INTERVAL_DAYS,
  )
  const newEase = prev.easeFactor * EASY_EASE_MULTIPLIER
  return {
    interval: newInterval,
    easeFactor: newEase,
    nextDueAt: now + newInterval * DAY,
  }
}

/**
 * 二階 opt-in modifier: 「我亂猜的」 (I guessed) honesty reset.
 *
 * Binary-input analogue of `reviewCardGuessed`. Forces `interval = 1` and
 * preserves `easeFactor`. `everWrong` is NOT touched by this path (mastery
 * helper enforces).
 */
export function reviewCardBinaryGuessed(input: { prev: BinaryReviewPrev; now?: number }): BinaryReviewResult {
  const { prev } = input
  const now = input.now ?? Date.now()
  return {
    interval: GUESSED_RESET_INTERVAL,
    easeFactor: prev.easeFactor,
    nextDueAt: now + GUESSED_RESET_INTERVAL * DAY,
  }
}

/**
 * neurons opt-in modifier: 「觀念洞」 (self-declared concept gap) on a WRONG answer.
 *
 * Like `reviewCardBinaryGuessed` it forces `interval = 1`, but UNLIKE guessed it
 * ALSO decrements ease (`× INSIGHT_EASE_MULTIPLIER`, floored at `EASE_FLOOR`) — a
 * concept gap is a stronger "I don't get this" signal than a lucky guess, so it
 * re-graduates more slowly. Ease is strictly lower than both the plain-wrong path
 * (`× WRONG_EASE_MULTIPLIER`) and guessed (ease preserved). `everWrong` is NOT
 * touched by this path (the neurons mastery/wrong-list monotonic-OR invariant).
 */
export function reviewCardBinaryInsight(input: { prev: BinaryReviewPrev; now?: number }): BinaryReviewResult {
  const { prev } = input
  const now = input.now ?? Date.now()
  return {
    interval: GUESSED_RESET_INTERVAL,
    easeFactor: Math.max(EASE_FLOOR, prev.easeFactor * INSIGHT_EASE_MULTIPLIER),
    nextDueAt: now + GUESSED_RESET_INTERVAL * DAY,
  }
}

// ─── Shared filter ───────────────────────────────────────────────────────────

export function dueCards(cards: SrsCard[], now: number = Date.now()): SrsCard[] {
  return cards.filter((c) => c.dueAt <= now)
}
