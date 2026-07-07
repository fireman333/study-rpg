import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { ContentPack } from '@study-rpg/core'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db } from '../lib/db'
import {
  recordCorrectAnswer,
  recordIncorrectAnswer,
  initMasteryForPack,
} from '../lib/services/connectome'
import { recordQuestionResult } from '../lib/services/question-history'

/**
 * fix-neurons-mastery-missing-row: answering a question when the family's
 * `familyMastery` row is not yet seeded (fresh device deep-linked to /bank or
 * /cram — those routes mount QuizModal WITHOUT OverviewPage, the only place that
 * used to run the seeder) makes `recordAttemptInTx` throw. In QuizModal.handlePick
 * that throw (unwrapped) aborted the whole async fn, silently skipping the
 * downstream recordQuestionResult / SRS / prescription writes.
 *
 * Two-part fix, both covered here:
 *   1. App boot seeds mastery rows via initMasteryForPack (idempotent) so the row
 *      exists before any route mounts QuizModal.
 *   2. handlePick wraps the record*Answer calls best-effort (log + swallow) so a
 *      mastery failure never short-circuits recordQuestionResult.
 */

const FAMILY = FAMILY_IDS[0]

/** Minimal ContentPack stub — initFamilyMasteryIfEmpty only reads subjects[].id. */
const packStub = {
  subjects: FAMILY_IDS.map((id) => ({ id })),
} as unknown as ContentPack

/**
 * Mirror of QuizModal.handlePick's answer-resolution sequence (the load-bearing
 * ordering): the mastery write is best-effort, and recordQuestionResult ALWAYS
 * runs afterward regardless of whether mastery threw.
 */
async function answerLikeQuizModal(
  questionId: string,
  family: string,
  isCorrect: boolean,
): Promise<void> {
  try {
    if (isCorrect) await recordCorrectAnswer(family)
    else await recordIncorrectAnswer(family)
  } catch {
    // best-effort — swallowed in handlePick, mirrored here
  }
  await recordQuestionResult(questionId, family, isCorrect)
}

beforeEach(async () => {
  // Fresh DB with NO familyMastery rows — the production shape of the bug on a
  // device that never mounted OverviewPage.
  await db.delete()
  await db.open()
})

describe('root cause: missing familyMastery row makes the record* calls throw', () => {
  it('recordIncorrectAnswer throws when the row is absent', async () => {
    expect(await db.familyMastery.get(FAMILY)).toBeUndefined()
    await expect(recordIncorrectAnswer(FAMILY)).rejects.toThrow(/no familyMastery row/)
  })

  it('recordCorrectAnswer throws when the row is absent', async () => {
    expect(await db.familyMastery.get(FAMILY)).toBeUndefined()
    await expect(recordCorrectAnswer(FAMILY)).rejects.toThrow(/no familyMastery row/)
  })
})

describe('fix 1: initMasteryForPack seeds every family idempotently', () => {
  it('creates one zeroed row per subject and does not double-seed on re-run', async () => {
    await initMasteryForPack(packStub)
    expect(await db.familyMastery.count()).toBe(FAMILY_IDS.length)
    const row = await db.familyMastery.get(FAMILY)
    expect(row).toEqual({ familyId: FAMILY, correct: 0, total: 0 })

    // Idempotent: a second boot must not throw or duplicate rows.
    await expect(initMasteryForPack(packStub)).resolves.toBeUndefined()
    expect(await db.familyMastery.count()).toBe(FAMILY_IDS.length)
  })

  it('after seeding, recordCorrectAnswer succeeds and bumps the counters', async () => {
    await initMasteryForPack(packStub)
    await expect(recordCorrectAnswer(FAMILY)).resolves.toBeUndefined()
    const row = await db.familyMastery.get(FAMILY)
    expect(row).toEqual({ familyId: FAMILY, correct: 1, total: 1 })
  })
})

describe('fix 2: a mastery failure does not drop the questionHistory write', () => {
  it('wrong answer with NO familyMastery row still records everWrong / lastResult', async () => {
    expect(await db.familyMastery.get(FAMILY)).toBeUndefined()

    // Must not reject to the caller (handlePick would otherwise abort mid-flow).
    await expect(answerLikeQuizModal('Q1', FAMILY, false)).resolves.toBeUndefined()

    // The downstream write survived the mastery throw.
    const hist = await db.questionHistory.get('Q1')
    expect(hist).toBeDefined()
    expect(hist?.everWrong).toBe(true)
    expect(hist?.lastResult).toBe('wrong')
  })

  it('correct answer with NO familyMastery row still records lastResult=correct', async () => {
    await expect(answerLikeQuizModal('Q2', FAMILY, true)).resolves.toBeUndefined()
    const hist = await db.questionHistory.get('Q2')
    expect(hist).toBeDefined()
    expect(hist?.lastResult).toBe('correct')
    expect(hist?.everWrong).toBe(false)
  })
})
