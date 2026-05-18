/**
 * Mock exam pure functions — scoring, progress curve, reward burst.
 *
 * No Dexie / DOM dependency. Engine-side caller wires these to UI state.
 * Spec: openspec/specs/mock-exam/spec.md
 */

import type { MockAttempt, MockPerQuestionAnswer, Player, Question, QuestionId } from '../types'
import { addStat, applyXp, REWARD } from './xp'

export interface MockSubmitInput {
  questions: Question[]                        // ordered as user saw them
  selections: Record<QuestionId, string>       // missing key = unanswered
}

export interface MockScoreResult {
  totalScore: number
  perQuestionAnswers: MockPerQuestionAnswer[]
}

/**
 * Score a mock submission against the source paper.
 * Unanswered questions count as wrong with `userSelection: null`.
 */
export function scoreMock(input: MockSubmitInput): MockScoreResult {
  const perQuestionAnswers: MockPerQuestionAnswer[] = input.questions.map((q) => {
    const userSelection = input.selections[q.id] ?? null
    // 送分題: 考選部判定全部給分 — 任何已選都算對
    const isCorrect = userSelection !== null && (q.disputed || userSelection === q.answer)
    return { questionId: q.id, userSelection, isCorrect }
  })
  const totalScore = perQuestionAnswers.reduce((acc, a) => acc + (a.isCorrect ? 1 : 0), 0)
  return { totalScore, perQuestionAnswers }
}

export interface ProgressDelta {
  attemptCount: number              // 1-based; this attempt's ordinal among same-paper attempts
  previousScore: number | null      // most-recent prior attempt's totalScore; null on first
  delta: number | null              // currentScore - previousScore; null on first
}

/**
 * Compute progress delta vs prior attempts on the same paper.
 * `priorAttempts` should be the existing same-paper attempts (excluding the current one),
 * unordered — this function picks the most recent by `finishedAt`.
 */
export function computeProgressDelta(currentScore: number, priorAttempts: MockAttempt[]): ProgressDelta {
  if (priorAttempts.length === 0) {
    return { attemptCount: 1, previousScore: null, delta: null }
  }
  const latest = priorAttempts.reduce((max, a) => (a.finishedAt > max.finishedAt ? a : max), priorAttempts[0])
  return {
    attemptCount: priorAttempts.length + 1,
    previousScore: latest.totalScore,
    delta: currentScore - latest.totalScore,
  }
}

export interface MockPassRewardOutcome {
  player: Player
  leveledUp: boolean
  levelsGained: number
  /** True — mockExamPass always grants exactly one guaranteed SR loot roll (caller handles roll). */
  grantGuaranteedSRLoot: true
}

/**
 * Apply REWARD.mockExamPass to the player. Bypasses any per-minute stat rate caps
 * (the burst is intentional — see engine-rewards spec).
 *
 * `paperPrimarySubject`: the SubjectId to receive the subject XP. Caller typically
 * picks the most-represented subject in the paper, or the paper's `book` group key.
 */
export function applyMockPassReward(
  player: Player,
  paperPrimarySubject: string,
): MockPassRewardOutcome {
  const reward = REWARD.mockExamPass
  const xpResult = applyXp(player, reward.xp)

  // Subject XP: accumulate into subjectLevels[paperPrimarySubject].xp (uniform with existing fields).
  const currentSubject = xpResult.player.subjectLevels[paperPrimarySubject] ?? {
    level: 1,
    xp: 0,
    mastery: 0,
  }
  const subjectLevels = {
    ...xpResult.player.subjectLevels,
    [paperPrimarySubject]: {
      ...currentSubject,
      xp: currentSubject.xp + reward.subjectXp,
    },
  }

  const stats = addStat(xpResult.player.stats, reward.stat.name, reward.stat.delta)

  return {
    player: {
      ...xpResult.player,
      stats,
      subjectLevels,
    },
    leveledUp: xpResult.leveledUp,
    levelsGained: xpResult.levelsGained,
    grantGuaranteedSRLoot: true,
  }
}

/**
 * Compose a paperId from year/session/paper. Use everywhere consistently to
 * avoid format drift (canonical-form discipline per coding principles).
 */
export function paperIdOf(year: number, session: number, paper: string): string {
  return `${year}-${session}-${paper}`
}

/**
 * Decode (year, session, paper) from a stored paperId. Returns null on malformed input.
 */
export function decodePaperId(paperId: string): { year: number; session: number; paper: string } | null {
  const m = paperId.match(/^(\d+)-(\d+)-([\w-]+)$/)
  if (!m) return null
  return { year: Number(m[1]), session: Number(m[2]), paper: m[3] }
}
