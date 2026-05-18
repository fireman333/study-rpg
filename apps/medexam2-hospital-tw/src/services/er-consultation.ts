/**
 * ER consultation service — orchestrates selector + picker + Dexie writes for
 * the random "急診照會" feature.
 *
 * Spec: openspec/specs/er-consultation/spec.md
 *
 * Settings storage: `meta` table key `er-consult-settings`. Cloud-sync compatible
 * via existing `meta` table sync path (key-value JSONB blob).
 * Active state: `gameCounters.erConsultActive` (JS prop, not indexed).
 * Telemetry: `erConsultLog` table, capped at ER_CONSULT_LOG_CAP rows (local-only).
 */

import {
  ER_CONSULT_AUTO_SKIP_MS,
  ER_CONSULT_LOG_CAP,
  ER_CONSULT_RECENT_ANSWER_WINDOW_MS,
  ER_CONSULT_RECENCY_WINDOW_MS,
  computeERConsultReward,
  pickERConsultQuestion,
  selectUnderUtilizedSubject,
  type ERConsultMasteryCounter,
} from '@study-rpg/core'
import {
  QUIZ_REPUTATION_PER_CORRECT_BASE,
  QUIZ_REVENUE_PER_CORRECT_BASE,
  QUIZ_TIER_MULTIPLIER,
} from '@study-rpg/content-medexam2-tw'
import {
  ALL_SUBJECT_IDS,
  getHospitalDB,
  type ERConsultActiveState,
} from '../db/schema'
import { loadSubjectQuestionIds } from '../lib/quiz'
import { recordCorrectAnswer, recordWrongAnswer } from '../lib/mastery'
import { ER_DOCTOR_SPRITE_KEYS } from '../lib/sprite-lookup'

const SETTINGS_META_KEY = 'er-consult-settings'

export interface ERConsultSettings {
  enabled: boolean
  /** Has the player seen the first-time onboarding tooltip yet? */
  onboarded: boolean
}

const DEFAULT_SETTINGS: ERConsultSettings = { enabled: true, onboarded: false }

/** 5 consult-request-tone greeting variants, subject-parameterized. */
export const ER_CONSULT_GREETINGS = Object.freeze([
  '{subject} 這題我不太確定，幫我看一下！',
  '急診來了個 {subject} 的 case，你怎麼想？',
  '剛收一個 {subject} 病人，這題你判斷一下',
  '{subject} 的 consult，你的意見呢？',
  '幫個忙，{subject} 這題你比較熟',
] as const)

/** 5 gratitude variants for correct-answer reply. */
export const ER_CONSULT_GRATITUDE = Object.freeze([
  '太強了！下次再求救',
  '感謝，這下我心裡有底了',
  'perfect，這個診斷我會記住',
  '你救了我，這 case 有方向了',
  '收到！這就是我需要的答案',
] as const)

/** 5 supportive-correction variants for wrong-answer reply. */
export const ER_CONSULT_CORRECTIONS = Object.freeze([
  '沒事，學起來下次就會了',
  '這題我也容易混淆，看一下解析',
  '別擔心，再看一次解釋就懂了',
  '這題踩 pitfall 滿正常的，記起來',
  '我也是這樣學會的，下次注意',
] as const)

export async function getERConsultSettings(): Promise<ERConsultSettings> {
  const db = getHospitalDB()
  const row = await db.meta.get(SETTINGS_META_KEY)
  if (!row) return { ...DEFAULT_SETTINGS }
  const v = (row.value ?? {}) as Partial<ERConsultSettings>
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_SETTINGS.enabled,
    onboarded: typeof v.onboarded === 'boolean' ? v.onboarded : DEFAULT_SETTINGS.onboarded,
  }
}

export async function setERConsultSettings(patch: Partial<ERConsultSettings>): Promise<ERConsultSettings> {
  const db = getHospitalDB()
  return db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get(SETTINGS_META_KEY)
    const cur = (row?.value ?? DEFAULT_SETTINGS) as ERConsultSettings
    const next: ERConsultSettings = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled,
      onboarded: typeof patch.onboarded === 'boolean' ? patch.onboarded : cur.onboarded,
    }
    await db.meta.put({ key: SETTINGS_META_KEY, value: next })
    return next
  })
}

/**
 * Build the input map needed by `selectUnderUtilizedSubject` from Dexie reads.
 * Side-effect-free apart from DB reads. Caller passes `now` so the time window
 * is consistent within a transaction.
 */
async function buildSelectorInput(now: number): Promise<{
  subjects: string[]
  masteryMap: Record<string, ERConsultMasteryCounter>
  recentAttempts7d: Record<string, number>
  recentConsultsBySubject7d: Record<string, number>
}> {
  const db = getHospitalDB()
  const cutoff7d = now - ER_CONSULT_RECENCY_WINDOW_MS

  const masteryRows = await db.mastery.toArray()
  const masteryMap: Record<string, ERConsultMasteryCounter> = {}
  for (const m of masteryRows) {
    masteryMap[m.subjectId] = { correct: m.correct, total: m.total }
  }

  const recentHistory = await db.questionHistory
    .where('lastAnsweredAt')
    .above(cutoff7d)
    .toArray()
  const recentAttempts7d: Record<string, number> = {}
  for (const r of recentHistory) {
    recentAttempts7d[r.subjectId] = (recentAttempts7d[r.subjectId] ?? 0) + 1
  }

  const recentConsults = await db.erConsultLog
    .where('triggeredAt')
    .above(cutoff7d)
    .toArray()
  const recentConsultsBySubject7d: Record<string, number> = {}
  for (const r of recentConsults) {
    recentConsultsBySubject7d[r.subjectId] = (recentConsultsBySubject7d[r.subjectId] ?? 0) + 1
  }

  return {
    subjects: Array.from(ALL_SUBJECT_IDS),
    masteryMap,
    recentAttempts7d,
    recentConsultsBySubject7d,
  }
}

/**
 * Attempt to roll a new consult. Returns the new active state on success or
 * null if no subject/question could be picked. Caller is responsible for the
 * outer mutex check (shouldRollERConsult) and for writing `erConsultActive`
 * back to `gameCounters` in the same transaction.
 */
export async function rollNewERConsult(now: number): Promise<ERConsultActiveState | null> {
  const db = getHospitalDB()
  const input = await buildSelectorInput(now)
  const subjectId = selectUnderUtilizedSubject(input)
  if (!subjectId) return null

  // Load 30-day exclusion set for picker
  const cutoff30d = now - ER_CONSULT_RECENT_ANSWER_WINDOW_MS
  const recentForSubject = await db.questionHistory
    .where('subjectId')
    .equals(subjectId)
    .filter((r) => r.lastAnsweredAt >= cutoff30d)
    .toArray()
  const recentlyAnsweredQuestionIds = new Set(recentForSubject.map((r) => r.questionId))

  const questionPool = await loadSubjectQuestionIds(subjectId)
  if (questionPool.length === 0) return null

  const questionId = pickERConsultQuestion({
    questionsInSubject: questionPool,
    recentlyAnsweredQuestionIds,
  })
  if (!questionId) return null

  // Randomly pick ER doctor gender each spawn (DEI parity with roster).
  const spriteKey = ER_DOCTOR_SPRITE_KEYS[Math.floor(Math.random() * ER_DOCTOR_SPRITE_KEYS.length)]
  return {
    questionId,
    subjectId,
    triggeredAt: now,
    doctorSpriteKey: spriteKey,
    greetingIdx: Math.floor(Math.random() * ER_CONSULT_GREETINGS.length),
  }
}

export interface ERConsultLogPayload {
  triggeredAt: number
  resolvedAt: number | null
  subjectId: string
  questionId: string
  resolution: 'correct' | 'wrong' | 'skipped' | 'auto-skipped'
  rewardGained: number
  reactionTimeMs: number | null
}

/**
 * Append a row to the rolling log + enforce the cap. Caller owns the
 * transaction (must include `db.erConsultLog` in the rw scope).
 */
export async function appendERConsultLog(row: ERConsultLogPayload): Promise<void> {
  const db = getHospitalDB()
  await db.erConsultLog.add(row)
  // Cap enforcement — count once and prune oldest beyond cap. Cheap enough
  // because table is small (capped at 500); index on triggeredAt makes scan fast.
  const count = await db.erConsultLog.count()
  if (count > ER_CONSULT_LOG_CAP) {
    const overflow = count - ER_CONSULT_LOG_CAP
    const oldest = await db.erConsultLog
      .orderBy('triggeredAt')
      .limit(overflow)
      .toArray()
    await db.erConsultLog.bulkDelete(oldest.map((r) => r.id!))
  }
}

/**
 * Check if active consult has timed out (10 min wall-clock since triggered).
 * Caller-owned tx; returns true if auto-skip should fire.
 */
export function isERConsultExpired(active: ERConsultActiveState, now: number): boolean {
  return now - active.triggeredAt >= ER_CONSULT_AUTO_SKIP_MS
}

export interface AnswerERConsultResult {
  resolution: 'correct' | 'wrong'
  rewardGained: number
  revenueDelta: number
  reputationDelta: number
}

/**
 * Apply a player answer to the active ER consult. Atomic across mastery,
 * questionHistory, affinity, gameCounters, and erConsultLog. Clears
 * `erConsultActive`.
 *
 * Reward semantics for correct answer:
 *   - revenue += round(QUIZ_REVENUE_PER_CORRECT_BASE × tierMultiplier × 1.8)
 *   - reputation += round(QUIZ_REPUTATION_PER_CORRECT_BASE × tierMultiplier × 1.8)
 *   - specialty multiplier = 1.0 (no partner doctor for ER consult)
 *   - NO ticket counter increment (different progression channel from normal quiz)
 *
 * Wrong answer: mastery total +1, affinity unchanged, no revenue/reputation.
 * Both paths upsert `questionHistory` (which advances SRS scheduling per existing
 * `recordWrongAnswer` path).
 */
export async function answerERConsult(opts: {
  active: ERConsultActiveState
  wasCorrect: boolean
  reactionTimeMs: number
}): Promise<AnswerERConsultResult | null> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [
      db.mastery,
      db.questionHistory,
      db.affinity,
      db.gameCounters,
      db.erConsultLog,
    ],
    async () => {
      const counters = await db.gameCounters.get('singleton')
      if (!counters) return null
      const cur = counters.erConsultActive ?? null
      // Stale-active guard — another tab / a parallel call may have already
      // cleared / replaced the active; only resolve when ids match.
      if (!cur || cur.questionId !== opts.active.questionId) return null

      const subjectId = opts.active.subjectId as SubjectIdType
      if (opts.wasCorrect) {
        await recordCorrectAnswer(
          { subjectId, questionId: opts.active.questionId },
          null, // no partner doctor — ER doctor is NPC
        )
      } else {
        await recordWrongAnswer({ subjectId, questionId: opts.active.questionId })
      }

      const now = Date.now()
      let revenueDelta = 0
      let reputationDelta = 0
      if (opts.wasCorrect) {
        const tierMult = QUIZ_TIER_MULTIPLIER[counters.tier] ?? 1.0
        revenueDelta = computeERConsultReward(
          Math.round(QUIZ_REVENUE_PER_CORRECT_BASE * tierMult),
        )
        reputationDelta = computeERConsultReward(
          Math.round(QUIZ_REPUTATION_PER_CORRECT_BASE * tierMult),
        )
      }

      await db.gameCounters.put({
        ...counters,
        revenue: counters.revenue + revenueDelta,
        reputation: counters.reputation + reputationDelta,
        erConsultActive: null,
      })

      const rewardGained = revenueDelta + reputationDelta
      await appendERConsultLog({
        triggeredAt: opts.active.triggeredAt,
        resolvedAt: now,
        subjectId: opts.active.subjectId,
        questionId: opts.active.questionId,
        resolution: opts.wasCorrect ? 'correct' : 'wrong',
        rewardGained,
        reactionTimeMs: opts.reactionTimeMs,
      })

      return {
        resolution: opts.wasCorrect ? 'correct' : 'wrong',
        rewardGained,
        revenueDelta,
        reputationDelta,
      }
    },
  )
}

/**
 * Skip the active ER consult — clears `erConsultActive`, logs `resolution: 'skipped'`,
 * no counter changes. Caller owns the first-time-confirm UI.
 */
export async function skipERConsult(active: ERConsultActiveState): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', [db.gameCounters, db.erConsultLog], async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters) return
    const cur = counters.erConsultActive ?? null
    if (!cur || cur.questionId !== active.questionId) return
    await db.gameCounters.put({ ...counters, erConsultActive: null })
    await appendERConsultLog({
      triggeredAt: active.triggeredAt,
      resolvedAt: Date.now(),
      subjectId: active.subjectId,
      questionId: active.questionId,
      resolution: 'skipped',
      rewardGained: 0,
      reactionTimeMs: null,
    })
  })
}

/**
 * Clear active state without logging — used by the settings toggle-off path
 * where the player's intent is "stop the feature", not "skip this consult".
 */
export async function discardActiveERConsult(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.gameCounters, async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters || (counters.erConsultActive ?? null) === null) return
    await db.gameCounters.put({ ...counters, erConsultActive: null })
  })
}

// Local alias to avoid the duplicate SubjectId import that pulls Question.
type SubjectIdType = string
