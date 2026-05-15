/**
 * Mentor daily question — pure functions for question selection, backlog accumulation,
 * and reward computation. No Dexie / DOM dependency.
 * Spec: openspec/specs/mentor-daily/spec.md
 */

import type { Attempt, MentorBacklog, Player, Question, SrsCard } from '../types'
import { getTaipeiToday } from './streak'
import { FAST_ANSWER_THRESHOLD_MS, REWARD } from './xp'

export const MENTOR_BACKLOG_CAP = 5
export const MENTOR_LOOKBACK_DAYS = 30
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type MentorPickMode = 'srs' | 'weak' | 'random'

export interface MentorPickInput {
  srsDue: SrsCard[]                    // due cards where dueAt <= now
  player: Player
  questions: Question[]                // full content pack
  recentAttempts: Attempt[]            // attempts within MENTOR_LOOKBACK_DAYS
  now: number                          // epoch ms; used for randomness seed-free path
}

export interface MentorPickResult {
  questionId: string
  mode: MentorPickMode
}

/**
 * Hybrid 3-layer selection:
 *   1. SRS due (oldest dueAt wins)
 *   2. Weak subject random (lowest mastery, exclude recent 30-day attempts)
 *   3. Pure random fallback
 *
 * Returns null only when the content pack is empty.
 */
export function pickDailyQuestion(input: MentorPickInput): MentorPickResult | null {
  if (input.questions.length === 0) return null

  // Layer 1: SRS due — oldest dueAt
  if (input.srsDue.length > 0) {
    const sorted = [...input.srsDue].sort((a, b) => {
      if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt
      return a.questionId.localeCompare(b.questionId)
    })
    const head = sorted[0]
    // Ensure question still exists in current content pack
    if (input.questions.some((q) => q.id === head.questionId)) {
      return { questionId: head.questionId, mode: 'srs' }
    }
    // Orphaned card → fall through to weak/random
  }

  // Layer 2: Weak subject — lowest mastery
  const subjectIds = Object.keys(input.player.subjectLevels)
  if (subjectIds.length > 0) {
    const sortedSubjects = [...subjectIds].sort((a, b) => {
      const ma = input.player.subjectLevels[a]?.mastery ?? 0
      const mb = input.player.subjectLevels[b]?.mastery ?? 0
      if (ma !== mb) return ma - mb
      return a.localeCompare(b)
    })

    const recentIds = new Set(
      input.recentAttempts
        .filter((a) => input.now - a.ts < MENTOR_LOOKBACK_DAYS * ONE_DAY_MS)
        .map((a) => a.questionId),
    )

    for (const subj of sortedSubjects) {
      if ((input.player.subjectLevels[subj]?.mastery ?? 0) >= 1.0) continue
      const pool = input.questions.filter((q) => q.subject === subj && !recentIds.has(q.id))
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)]
        return { questionId: pick.id, mode: 'weak' }
      }
    }
  }

  // Layer 3: pure random fallback (all mastered or no subject progress)
  const pick = input.questions[Math.floor(Math.random() * input.questions.length)]
  return { questionId: pick.id, mode: 'random' }
}

/**
 * Decode a UTC+8 YYYY-MM-DD into local-day ordinal (days since epoch).
 * Used to count missed days between lastAssignedDate and today.
 */
function dayOrdinal(dateStr: string): number {
  // dateStr is YYYY-MM-DD in UTC+8; compute days since UNIX epoch in UTC+8 frame
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / ONE_DAY_MS)
}

/**
 * Accumulate one new question per missed UTC+8 day (capped at MENTOR_BACKLOG_CAP).
 * Idempotent if lastAssignedDate === today (no-op).
 */
export function enqueueBacklogForMissedDays(
  backlog: MentorBacklog,
  today: string,
  pickFn: () => string | null,
): MentorBacklog {
  const lastOrd = dayOrdinal(backlog.lastAssignedDate)
  const todayOrd = dayOrdinal(today)
  if (todayOrd <= lastOrd) return backlog

  const missedDays = todayOrd - lastOrd
  const newIds = [...backlog.questionIds]
  for (let i = 0; i < missedDays && newIds.length < MENTOR_BACKLOG_CAP; i++) {
    const id = pickFn()
    if (id === null) break
    newIds.push(id)
  }
  // Hard cap enforcement (FIFO — keep oldest, drop newest beyond cap)
  if (newIds.length > MENTOR_BACKLOG_CAP) newIds.length = MENTOR_BACKLOG_CAP

  return {
    questionIds: newIds,
    lastAssignedDate: today,
  }
}

/**
 * Create a fresh backlog for a first-mount player.
 */
export function initialBacklog(today: string, firstQuestionId: string): MentorBacklog {
  return {
    questionIds: [firstQuestionId],
    lastAssignedDate: today,
  }
}

/**
 * FIFO pop: remove head, return new state + popped id.
 */
export function consumeBacklog(backlog: MentorBacklog): {
  headId: string | null
  rest: MentorBacklog
} {
  if (backlog.questionIds.length === 0) return { headId: null, rest: backlog }
  const [head, ...tail] = backlog.questionIds
  return {
    headId: head,
    rest: { ...backlog, questionIds: tail },
  }
}

export interface MentorRewardOutcome {
  xpGain: number
  statDeltas: Array<{ name: string; delta: number }>
}

/**
 * Compute reward for a mentor question answer.
 * - Correct: 1.5× quizCorrect XP × streakMultiplier; knowledge+1; +reflex+1 if fast.
 * - Wrong: quizWrong flat XP (no multiplier, no stat).
 */
export function computeMentorReward(
  correct: boolean,
  elapsedMs: number,
  streakMultiplier: number,
): MentorRewardOutcome {
  if (!correct) {
    return {
      xpGain: REWARD.quizWrong.xp,
      statDeltas: [],
    }
  }
  const xpGain = Math.floor(REWARD.quizCorrect.xp * 1.5 * streakMultiplier)
  const statDeltas: Array<{ name: string; delta: number }> = [
    { name: REWARD.quizCorrect.stat.name, delta: REWARD.quizCorrect.stat.delta },
  ]
  if (elapsedMs < FAST_ANSWER_THRESHOLD_MS) {
    statDeltas.push({
      name: REWARD.quizFastAnswer.stat.name,
      delta: REWARD.quizFastAnswer.stat.delta,
    })
  }
  return { xpGain, statDeltas }
}

/**
 * Convenience: get today (UTC+8) — re-exports the streak module's helper.
 * Kept here so mentor consumers don't need to import from streak directly.
 */
export function mentorToday(): string {
  return getTaipeiToday()
}
