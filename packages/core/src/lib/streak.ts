/**
 * Daily-streak helpers. Pure functions, no React, no IO.
 *
 * UTC+8 (Asia/Taipei) is hard-coded for M2 (owner-only dogfood). When M4 adds
 * cross-device sync, replace the timezone constant with a player-preference or
 * server-side anchor — call sites should keep working.
 *
 * Spec: openspec/specs/engine-rewards/spec.md "Player carries daily-streak state",
 * "Daily check-in threshold and same-day idempotence", "applyCheckIn ...",
 * "Streak multiplier applies to reading and quiz-correct XP only".
 */

import type { Player } from '../types'

/** UTC+8 anchor. Centralized so the eventual M4 cross-timezone fix lives in one place. */
const STREAK_TIMEZONE = 'Asia/Taipei' as const

/** Either path crossing this count marks the UTC+8 day as checked-in. */
export const STREAK_CHECK_IN_THRESHOLD = 5

/** Streak multiplier flattens at this many days (1 + 0.05 * 10 = 1.5). */
export const STREAK_MULTIPLIER_CAP_DAYS = 10

// `Intl.DateTimeFormat` construction is ~0.1–0.5ms. `getTaipeiToday` runs on
// the per-second reading tick, so we cache both formatters at module scope to
// keep that hot path allocation-free.
const TAIPEI_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: STREAK_TIMEZONE })
const UTC_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })

/** Return today's UTC+8 calendar date as ISO YYYY-MM-DD. */
export function getTaipeiToday(now: Date = new Date()): string {
  return TAIPEI_FORMATTER.format(now)
}

/** Return yesterday's UTC+8 calendar date as ISO YYYY-MM-DD, relative to `today`. */
export function getTaipeiYesterday(today: string): string {
  // `today` is a calendar string like '2026-05-16'. Anchor at noon UTC so DST
  // shifts can't nudge the date when subtracting 24h.
  const noonUtc = new Date(`${today}T12:00:00Z`)
  noonUtc.setUTCDate(noonUtc.getUTCDate() - 1)
  return UTC_FORMATTER.format(noonUtc)
}

/**
 * Streak multiplier for reading-per-minute and quiz-correct XP. Capped at
 * +50% on day 10. Negative input is clamped to 0.
 */
export function getStreakMultiplier(streak: number): number {
  const safe = Math.max(0, streak)
  const capped = Math.min(safe, STREAK_MULTIPLIER_CAP_DAYS)
  return 1 + 0.05 * capped
}

/**
 * Apply a check-in for `today` to a player snapshot. Pure: returns a new
 * Player without mutating the input.
 *
 * Behavior matrix (see spec):
 * - lastCheckInDate === today  → no-op, return input.
 * - lastCheckInDate === yesterday(today)  → currentStreak += 1; longestStreak = max(...).
 * - lastCheckInDate older / undefined  → currentStreak = 1; longestStreak = max(...).
 */
export function applyCheckIn(player: Player, today: string): Player {
  if (player.lastCheckInDate === today) return player

  const yesterday = getTaipeiYesterday(today)
  const consecutive = player.lastCheckInDate === yesterday
  const nextStreak = consecutive ? player.currentStreak + 1 : 1
  const nextLongest = Math.max(player.longestStreak, nextStreak)

  return {
    ...player,
    lastCheckInDate: today,
    currentStreak: nextStreak,
    longestStreak: nextLongest,
  }
}

/**
 * Ensure `player.todayProgress` matches `today`. If the stored date differs (or
 * the field is missing), return a player with fresh zero counters for today.
 * Otherwise return the input unchanged.
 *
 * The streak fields themselves (currentStreak / longestStreak / lastCheckInDate)
 * are NOT touched here — break detection lives in `applyCheckIn`.
 */
export function ensureTodayProgress(player: Player, today: string): Player {
  if (player.todayProgress?.date === today) return player
  return {
    ...player,
    todayProgress: { date: today, readingMinutes: 0, questionsAnswered: 0 },
  }
}

/** Increment today's reading-minute counter by `delta` (default 1). */
export function incrementReadingMinutes(player: Player, today: string, delta: number = 1): Player {
  const base = ensureTodayProgress(player, today)
  const prev = base.todayProgress!
  return {
    ...base,
    todayProgress: { ...prev, readingMinutes: prev.readingMinutes + delta },
  }
}

/** Increment today's questions-answered counter by `delta`. */
export function incrementQuestionsAnswered(player: Player, today: string, delta: number): Player {
  const base = ensureTodayProgress(player, today)
  const prev = base.todayProgress!
  return {
    ...base,
    todayProgress: { ...prev, questionsAnswered: prev.questionsAnswered + delta },
  }
}

/** Has either counter crossed the threshold today? */
export function hasMetCheckInThreshold(player: Player, today: string): boolean {
  const tp = player.todayProgress
  if (!tp || tp.date !== today) return false
  return (
    tp.readingMinutes >= STREAK_CHECK_IN_THRESHOLD ||
    tp.questionsAnswered >= STREAK_CHECK_IN_THRESHOLD
  )
}
