/**
 * Locks the session-repair「當場回鍋」srsEffect:none contract
 * (add-neurons-weakness-radar-and-error-repair, Feature 4, task 5.2).
 *
 * Session-repair answers go through `recordQuestionResult` (so everWrong /
 * lastResult stay truthful) but MUST NOT invoke `scheduleSrsForAnswer`. This test
 * proves the record-only path leaves the five SM-2 fields (interval / easeFactor /
 * nextDueAt / attempts / correctCount) UNCHANGED — the exact preservation the
 * QuizModal `sessionRepair` branch relies on by skipping the scheduler.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { recordQuestionResult } from '../lib/services/question-history'
import { scheduleSrsForAnswer } from '../lib/services/srs-scheduler'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const SEED = {
  questionId: 'q-1',
  family: '解剖學',
  lastResult: 'wrong' as const,
  everWrong: true,
  lastAnsweredAt: 100,
  updatedAt: 100,
  interval: 6,
  easeFactor: 2.3,
  nextDueAt: 999_999_999_999,
  attempts: 4,
  correctCount: 2,
}

describe('session-repair record-only path preserves SM-2 schedule', () => {
  it('recordQuestionResult (correct) does NOT change the five SM-2 fields', async () => {
    await db.questionHistory.put({ ...SEED })
    // Simulate a session-repair correct retry: record result WITHOUT the scheduler.
    await recordQuestionResult('q-1', '解剖學', true)
    const row = await db.questionHistory.get('q-1')
    expect(row!.lastResult).toBe('correct') // result recorded
    expect(row!.everWrong).toBe(true) // monotonic-OR intact
    // The five SM-2 fields are untouched (srsEffect: none).
    expect(row!.interval).toBe(SEED.interval)
    expect(row!.easeFactor).toBe(SEED.easeFactor)
    expect(row!.nextDueAt).toBe(SEED.nextDueAt)
    expect(row!.attempts).toBe(SEED.attempts)
    expect(row!.correctCount).toBe(SEED.correctCount)
  })

  it('contrast: the normal SRS path DOES advance the schedule (proves the branch matters)', async () => {
    await db.questionHistory.put({ ...SEED })
    await recordQuestionResult('q-1', '解剖學', true)
    await scheduleSrsForAnswer('q-1', '解剖學', true)
    const row = await db.questionHistory.get('q-1')
    // A scheduled review DID mutate at least one SM-2 field (attempts bumped).
    expect(row!.attempts).toBe(SEED.attempts + 1)
  })

  // Regression guard for the shared recordQuestionResult change (Codex #1):
  // MockExamRunner.doSubmit batch-writes wrong/unanswered questions via
  // recordQuestionResult WITHOUT the scheduler (MockExamRunner.tsx:127). The
  // old full-row `put` wiped the SM-2 schedule to undefined on every mock submit,
  // silently polluting buildDueReviewPool (a scheduled-and-due card would vanish).
  // Lock the fixed behaviour: a record-only WRONG write preserves the schedule.
  it('MockExamRunner-style record-only WRONG write preserves the SM-2 schedule', async () => {
    await db.questionHistory.put({ ...SEED, lastResult: 'correct', everWrong: false })
    // 模考 batch: record this question as wrong, no scheduler call.
    await recordQuestionResult('q-1', '解剖學', false)
    const row = await db.questionHistory.get('q-1')
    expect(row!.lastResult).toBe('wrong')
    expect(row!.everWrong).toBe(true) // monotonic-OR flips on the wrong record
    // All five SM-2 fields survive untouched — the mock submit must NOT reset the queue.
    expect(row!.interval).toBe(SEED.interval)
    expect(row!.easeFactor).toBe(SEED.easeFactor)
    expect(row!.nextDueAt).toBe(SEED.nextDueAt)
    expect(row!.attempts).toBe(SEED.attempts)
    expect(row!.correctCount).toBe(SEED.correctCount)
  })
})
