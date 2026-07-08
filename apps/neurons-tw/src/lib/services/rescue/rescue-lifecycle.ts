/**
 * Single-subject rescue — lifecycle date semantics (pure).
 *
 * D is the calendar-day difference `examDate − today` (D=0 = the exam day itself,
 * D=1 = the day before). The plan auto-archives at `examDate + 1 day` (i.e. once
 * today has passed the exam day). All inputs are `YYYY-MM-DD` strings so the maths
 * is timezone-stable and unit-testable without a clock.
 *
 * Spec: neurons-single-subject-rescue "schedule backward from the exam date...".
 */

const DAY_MS = 86_400_000

function midnightUTC(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** Remaining days D = examDate − today, in whole calendar days. Pure. */
export function computeRescueD(examISO: string, todayISO: string): number {
  return Math.round((midnightUTC(examISO) - midnightUTC(todayISO)) / DAY_MS)
}

/** Auto-archive once `examDate + 1 day` is reached (today is at least the day after the exam). */
export function shouldArchiveRescue(examISO: string, todayISO: string): boolean {
  return computeRescueD(examISO, todayISO) <= -1
}

export type RescuePhase = 'active' | 'exam-eve' | 'exam-morning' | 'archived'

/** Coarse phase from D. exam-eve = D1 (consolidation-only block at night); exam-morning = D0 (quick-scan). */
export function rescuePhase(examISO: string, todayISO: string): RescuePhase {
  const d = computeRescueD(examISO, todayISO)
  if (d <= -1) return 'archived'
  if (d === 0) return 'exam-morning'
  if (d === 1) return 'exam-eve'
  return 'active'
}
