/**
 * Boss-run mode logic.
 *
 * Two modes:
 *   - 'mini': N curated questions for a subject, time-limited; ≥60% to pass.
 *   - 'annual': full past-paper for a year (80–100Q), time-limited; ≥60% to pass.
 *
 * Pure functions; UI / DB persistence lives outside.
 */

import type { BossRun, Question, SubjectId } from '../types'

export const BOSS_PASS_THRESHOLD = 0.6
export const MINI_BOSS_DURATION_MS = 30 * 60_000 // 30 min
export const ANNUAL_BOSS_DURATION_MS = 80 * 60_000 // 80 min

export const MINI_BOSS_QUESTIONS = 30
export const MINI_BOSS_UNLOCK_SUBJECT_XP = 100

export interface BossSelection {
  questions: Question[]
  durationMs: number
}

/** Randomly sample N questions from a subject pool. Pure. */
export function sampleMiniBoss(pool: Question[], n: number = MINI_BOSS_QUESTIONS, rng: () => number = Math.random): BossSelection {
  const copy = [...pool]
  // Fisher–Yates shuffle, partial
  for (let i = 0; i < n && i < copy.length; i++) {
    const j = i + Math.floor(rng() * (copy.length - i))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return { questions: copy.slice(0, Math.min(n, copy.length)), durationMs: MINI_BOSS_DURATION_MS }
}

export function passed(run: Pick<BossRun, 'correctQ' | 'totalQ'>): boolean {
  if (run.totalQ === 0) return false
  return run.correctQ / run.totalQ >= BOSS_PASS_THRESHOLD
}

export function badgeId(mode: BossRun['mode'], subject?: SubjectId, year?: number): string {
  if (mode === 'mini' && subject) return `boss:${subject}:mini`
  if (mode === 'annual' && year !== undefined) return `boss:annual:${year}`
  return `boss:${mode}`
}
