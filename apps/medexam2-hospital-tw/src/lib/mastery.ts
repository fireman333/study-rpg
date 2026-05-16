import { reviewCardBinary, type SubjectId } from '@study-rpg/core'
import { getHospitalDB, type MasteryRow, type QuestionHistoryRow } from '../db/schema'

interface AnswerRecord {
  subjectId: SubjectId
  questionId: string
}

async function upsertHistory(
  db: ReturnType<typeof getHospitalDB>,
  record: AnswerRecord,
  wasCorrect: boolean,
): Promise<void> {
  const now = Date.now()
  const existing = await db.questionHistory.get(record.questionId)
  const prevSrs = existing
    ? { interval: existing.interval, easeFactor: existing.easeFactor, nextDueAt: existing.nextDueAt }
    : { interval: 0, easeFactor: 2.5, nextDueAt: null }
  const srs = reviewCardBinary({ correct: wasCorrect, prev: prevSrs, now })
  if (existing) {
    await db.questionHistory.put({
      ...existing,
      attempts: existing.attempts + 1,
      correctCount: existing.correctCount + (wasCorrect ? 1 : 0),
      lastAnsweredAt: now,
      lastResult: wasCorrect ? 'correct' : 'wrong',
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      nextDueAt: srs.nextDueAt,
    })
  } else {
    const row: QuestionHistoryRow = {
      questionId: record.questionId,
      subjectId: record.subjectId,
      attempts: 1,
      correctCount: wasCorrect ? 1 : 0,
      lastAnsweredAt: now,
      lastResult: wasCorrect ? 'correct' : 'wrong',
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      nextDueAt: srs.nextDueAt,
    }
    await db.questionHistory.put(row)
  }
}

async function upsertMastery(
  db: ReturnType<typeof getHospitalDB>,
  subjectId: SubjectId,
  wasCorrect: boolean,
): Promise<void> {
  const existing = await db.mastery.get(subjectId)
  if (existing) {
    await db.mastery.put({
      subjectId,
      correct: existing.correct + (wasCorrect ? 1 : 0),
      total: existing.total + 1,
    })
  } else {
    await db.mastery.put({
      subjectId,
      correct: wasCorrect ? 1 : 0,
      total: 1,
    })
  }
}

/**
 * Correct answer: bumps mastery (correct + total) + questionHistory + affinity.
 * Single Dexie transaction across mastery / questionHistory / affinity tables.
 */
export async function recordCorrectAnswer(record: AnswerRecord): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.mastery, db.questionHistory, db.affinity, async () => {
    await upsertMastery(db, record.subjectId, true)
    await upsertHistory(db, record, true)
    const aff = await db.affinity.get(record.subjectId)
    await db.affinity.put({
      subjectId: record.subjectId,
      correctCount: (aff?.correctCount ?? 0) + 1,
    })
  })
}

/**
 * Wrong answer: bumps mastery.total + questionHistory.attempts only.
 * Affinity unchanged per recruitment-gacha spec (never decrement).
 */
export async function recordWrongAnswer(record: AnswerRecord): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.mastery, db.questionHistory, async () => {
    await upsertMastery(db, record.subjectId, false)
    await upsertHistory(db, record, false)
  })
}

/**
 * Format mastery as a display label. Returns `「掌握 N%」` when total > 0,
 * `「掌握 -」` placeholder otherwise.
 */
export function formatMasteryPercent(mastery: MasteryRow | undefined): string {
  if (!mastery || mastery.total === 0) return '掌握 -'
  const pct = Math.floor((mastery.correct / mastery.total) * 100)
  return `掌握 ${pct}%`
}
