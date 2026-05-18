/**
 * Quiz-driven economy rewards (add-quiz-economy-redesign).
 *
 * On every correct quiz answer, grant:
 *  1. revenue + reputation deltas → gameCounters.singleton
 *  2. per-25-fresh-correct +1 ticket → tickets.global + monotonicCounters counter
 *  3. one-time +1 ticket on first banner-unlock crossing → tickets.global +
 *     bannerUnlockBonusLog
 *
 * All writes happen inside a single Dexie `rw` transaction spanning gameCounters,
 * monotonicCounters, tickets, bannerUnlockBonusLog, and affinity (read-only for
 * the threshold-cross check). Caller (QuizModal) handles toast surfacing from
 * the returned `toastTexts` list.
 *
 * Spec: `hospital-quiz` Req "Correct answer SHALL grant revenue and reputation",
 *       `recruitment-gacha` Reqs "Per-N fresh-correct ticket grant" + "Banner
 *       first-unlock SHALL grant a one-time ticket bonus".
 */
import type { SubjectId } from '@study-rpg/core'
import {
  QUIZ_REVENUE_PER_CORRECT_BASE,
  QUIZ_REPUTATION_PER_CORRECT_BASE,
  QUIZ_TICKET_GRANT_PER_N_CORRECT,
  READING_SESSION_BUFF_MULTIPLIER,
  RECRUITMENT_THRESHOLDS,
  getSpecialtyMultiplier,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

export interface ApplyQuizRewardInput {
  subjectId: SubjectId
  boundDoctor: { subjectId: SubjectId; rarity: Rarity } | null
  questionId: string
  isCorrect: boolean
  isDisputed: boolean
  /** True when this is the player's first attempt at `questionId` (no prior `questionHistory` row). */
  isFresh: boolean
}

export interface ApplyQuizRewardResult {
  revenueDelta: number
  reputationDelta: number
  ticketDelta: number
  toastTexts: string[]
}

const ZERO: ApplyQuizRewardResult = {
  revenueDelta: 0,
  reputationDelta: 0,
  ticketDelta: 0,
  toastTexts: [],
}

export async function applyQuizReward(input: ApplyQuizRewardInput): Promise<ApplyQuizRewardResult> {
  // 送分題 grants reward regardless of option chosen (per spec).
  const earnsReward = input.isCorrect || input.isDisputed
  if (!earnsReward) return ZERO

  const db = getHospitalDB()

  return db.transaction(
    'rw',
    [db.gameCounters, db.monotonicCounters, db.tickets, db.bannerUnlockBonusLog, db.affinity],
    async () => {
      const toastTexts: string[] = []
      let ticketDelta = 0

      // 1. Compute reward formula
      const specialtyMultiplier = getSpecialtyMultiplier(
        input.boundDoctor?.subjectId ?? null,
        input.boundDoctor?.rarity ?? null,
        input.subjectId,
      )
      const counters = await db.gameCounters.get('singleton')
      const readingActive = (counters?.currentSessionStartedAt ?? null) !== null
      const readingBuff = readingActive ? READING_SESSION_BUFF_MULTIPLIER : 1.0
      const revenueDelta = Math.round(
        QUIZ_REVENUE_PER_CORRECT_BASE * specialtyMultiplier * readingBuff,
      )
      const reputationDelta = Math.round(
        QUIZ_REPUTATION_PER_CORRECT_BASE * specialtyMultiplier * readingBuff,
      )

      // 2. Write revenue + reputation
      if (counters) {
        await db.gameCounters.put({
          ...counters,
          revenue: counters.revenue + revenueDelta,
          reputation: counters.reputation + reputationDelta,
        })
      }

      // 3. Fresh-correct ticket counter
      if (input.isFresh) {
        const mono = await db.monotonicCounters.get('singleton')
        if (mono) {
          const nextCounter = (mono.freshCorrectSinceLastTicket ?? 0) + 1
          if (nextCounter >= QUIZ_TICKET_GRANT_PER_N_CORRECT) {
            const t = await db.tickets.get('global')
            const overCap = (t?.available ?? 0) >= 99
            const granted = await _grantTickets(1)
            ticketDelta += granted
            await db.monotonicCounters.put({
              ...mono,
              freshCorrectSinceLastTicket: 0,
            })
            if (granted > 0) {
              toastTexts.push(
                `+1 招募券（已累積 ${QUIZ_TICKET_GRANT_PER_N_CORRECT} 題答對）`,
              )
            } else if (overCap) {
              toastTexts.push('招募券已達上限，請先消耗')
            }
          } else {
            await db.monotonicCounters.put({
              ...mono,
              freshCorrectSinceLastTicket: nextCounter,
            })
          }
        }
      }

      // 4. Banner-unlock bonus — only checked when this answer increments affinity
      //    past threshold. Affinity write happens in `recordCorrectAnswer`
      //    BEFORE this service runs, so the post-increment affinity is already
      //    on disk by the time we read.
      const affinityRow = await db.affinity.get(input.subjectId)
      const threshold = RECRUITMENT_THRESHOLDS[input.subjectId]
      if (
        threshold !== undefined &&
        affinityRow !== undefined &&
        affinityRow.correctCount >= threshold
      ) {
        const alreadyLogged = await db.bannerUnlockBonusLog.get(input.subjectId)
        if (!alreadyLogged) {
          await db.bannerUnlockBonusLog.put({
            subjectId: input.subjectId,
            grantedAt: Date.now(),
          })
          const granted = await _grantTickets(1)
          ticketDelta += granted
          if (granted > 0) {
            toastTexts.push(`+1 招募券（首次解鎖 ${input.subjectId}）`)
          }
        }
      }

      return { revenueDelta, reputationDelta, ticketDelta, toastTexts }

      // Local helper — inline so we can share the open transaction.
      async function _grantTickets(count: number): Promise<number> {
        const t = await db.tickets.get('global')
        if (!t) return 0
        const next = Math.min(99, t.available + count)
        const actually = next - t.available
        if (actually > 0) await db.tickets.put({ ...t, available: next })
        return actually
      }
    },
  )
}
