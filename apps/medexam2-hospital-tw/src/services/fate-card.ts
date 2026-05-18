/**
 * Fate-card draw service — `redesign-hospital-economy` §7 + `implement-
 * targeted-fate-card-tickets` (targeted tickets persisted to dedicated table).
 *
 * Atomic per-draw transaction:
 *   1. Read counters + monotonicCounters (for per-tier pity)
 *   2. Call pure `drawFateCard` from content pack
 *   3. Apply result:
 *      - aborted: return early, no state change
 *      - badLuck: deduct reputation cost + penalty, bump per-tier pity
 *      - reward: deduct reputation cost, reset pity, APPLY reward effect
 *   4. Append fateCardHistory row
 *
 * Reward effects (MVP — full inventory deferred):
 *   - recruitment-ticket-x3 / x10        → tickets +N (clamp 99)
 *   - minor-revenue-5k                   → revenue +5,000
 *   - facility-plus-0.5                  → random non-maxed room +1 level
 *   - facility-all-plus-1                → every non-maxed room +1 level
 *   - targeted-p3-ticket / p2-ticket     → create pending targetedTickets row
 *                                          (subject pick + rarity-floor reroll
 *                                          handled by RecruitmentPage consume UX)
 *   - others (training-guarantee, event-immunity, salary-waiver,
 *     throughput-x2-week)                → log only; effect TBD when inventory ships
 */

import {
  FACILITY_LEVEL_TO_FACILITY,
  FACILITY_MAX_LEVEL,
  drawFateCard,
  type FateCardDrawResult,
  type FateCardTier,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { createPendingTargetedTicket } from './targeted-ticket'

const TICKET_CAP = 99

export type FateCardResolvedDraw = Exclude<FateCardDrawResult, { kind: 'aborted' }>

export type FateCardServiceResult =
  | {
      ok: true
      draw: FateCardResolvedDraw
      appliedEffect: string
      /**
       * Set when the resolved reward is a targeted-pN-ticket. UI uses this id
       * to open the subject picker modal pre-loaded to the just-created row.
       */
      targetedTicketId?: string
    }
  | { ok: false; reason: 'insufficient-reputation' | 'unknown-tier'; required?: number }

export async function drawFateCardAtTier(tier: FateCardTier): Promise<FateCardServiceResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [
      db.gameCounters,
      db.monotonicCounters,
      db.tickets,
      db.rooms,
      db.fateCardHistory,
      db.targetedTickets,
      db.targetedTicketHistory,
    ],
    async () => {
      const counters = await db.gameCounters.get('singleton')
      const mono = await db.monotonicCounters.get('singleton')
      if (!counters || !mono) {
        return { ok: false, reason: 'unknown-tier' as const }
      }

      const pityKey = tier === 'legendary' ? null : tier
      const consecutive =
        pityKey !== null ? mono.fateCardBadLuckPity[pityKey] : 0

      const result = drawFateCard(tier, Math.random, consecutive, {
        currentReputation: counters.reputation,
      })

      if (result.kind === 'aborted') {
        return {
          ok: false,
          reason: 'insufficient-reputation' as const,
          required: result.requiredReputation,
        }
      }

      // Deduct cost
      const costPaid = result.costPaid
      let newReputation = counters.reputation - costPaid
      let newRevenue = counters.revenue

      let appliedEffect = ''
      let targetedTicketId: string | undefined

      if (result.kind === 'badLuck') {
        newReputation = Math.max(0, newReputation - result.penaltyAmount)
        appliedEffect = `衰運：聲望 −${result.penaltyAmount.toLocaleString('en-US')}`
        if (pityKey !== null) {
          await db.monotonicCounters.put({
            ...mono,
            fateCardBadLuckPity: {
              ...mono.fateCardBadLuckPity,
              [pityKey]: result.newPityCounter,
            },
          })
        }
      } else {
        // reward — reset pity (counter = 0)
        if (pityKey !== null) {
          await db.monotonicCounters.put({
            ...mono,
            fateCardBadLuckPity: {
              ...mono.fateCardBadLuckPity,
              [pityKey]: 0,
            },
          })
        }
        const effect = await applyRewardEffect(result.reward.key, result.reward.label)
        appliedEffect = effect.description
        newRevenue += effect.revenueDelta
        targetedTicketId = effect.targetedTicketId
      }

      // Re-read counters defensively in case any reward effect mutated other
      // fields we don't know about (currently only revenue is delta-tracked).
      await db.gameCounters.put({ ...counters, revenue: newRevenue, reputation: newReputation })

      await db.fateCardHistory.add({
        drawnAt: Date.now(),
        tier,
        cost: costPaid,
        rewardKey: result.kind === 'reward' ? result.reward.key : 'bad-luck',
        wasBadLuck: result.kind === 'badLuck',
        pityTriggered: result.kind === 'reward' ? result.pityTriggered : false,
      })

      return { ok: true, draw: result, appliedEffect, targetedTicketId }
    },
  )
}

interface RewardEffectResult {
  description: string
  /**
   * Delta to apply to `gameCounters.revenue` in the main transaction's final
   * `put`. Non-zero only for monetary rewards (minor-revenue-5k). Returning a
   * delta — rather than self-writing — avoids the stale-clobber bug where the
   * outer `put({ ...counters, ... })` overwrites this side-effect with the
   * original revenue read at txn start.
   */
  revenueDelta: number
  /**
   * Set when the reward created a pending targeted ticket row. UI uses this to
   * open the subject picker modal for the just-created ticket.
   */
  targetedTicketId?: string
}

async function applyRewardEffect(key: string, label: string): Promise<RewardEffectResult> {
  switch (key) {
    case 'recruitment-ticket-x3': {
      await grantTickets(3)
      return { description: '+3 招募券', revenueDelta: 0 }
    }
    case 'recruitment-ticket-x10': {
      await grantTickets(10)
      return { description: '+10 招募券', revenueDelta: 0 }
    }
    case 'minor-revenue-5k':
      return { description: '+5,000 💰', revenueDelta: 5_000 }
    case 'targeted-p3-ticket':
    case 'targeted-p2-ticket': {
      const cardTier = key === 'targeted-p3-ticket' ? 'epic' : 'legendary'
      const ticket = await createPendingTargetedTicket(cardTier)
      return {
        description: `${label} — 請選擇要指派的科別`,
        revenueDelta: 0,
        targetedTicketId: ticket.id,
      }
    }
    case 'facility-plus-0.5': {
      const bumped = await bumpRandomRoomFacility()
      return {
        description:
          bumped !== null
            ? `${bumped[0]} 設施 +0.5（→ ×${FACILITY_LEVEL_TO_FACILITY[bumped[1]]}）`
            : '無可升級房間（全部已滿）',
        revenueDelta: 0,
      }
    }
    case 'facility-all-plus-1': {
      const count = await bumpAllRoomsFacility()
      return {
        description: count > 0 ? `全院 ${count} 間房間 facility +1 級` : '無可升級房間（全部已滿）',
        revenueDelta: 0,
      }
    }
    case 'training-guarantee-x1':
    case 'event-immunity-1':
    case 'event-positive-trigger':
    case 'salary-waiver-1-week':
    case 'throughput-x2-1-week':
      return { description: `${label}（已紀錄；庫存系統實裝後生效）`, revenueDelta: 0 }
    default:
      return { description: label, revenueDelta: 0 }
  }
}

async function grantTickets(amount: number): Promise<void> {
  const db = getHospitalDB()
  const row = await db.tickets.get('global')
  if (!row) return
  await db.tickets.put({
    ...row,
    available: Math.min(TICKET_CAP, row.available + amount),
  })
}

async function bumpRandomRoomFacility(): Promise<[string, number] | null> {
  const db = getHospitalDB()
  const rooms = await db.rooms.toArray()
  const eligible = rooms.filter((r) => (r.facilityLevel ?? 1) < FACILITY_MAX_LEVEL)
  if (eligible.length === 0) return null
  const target = eligible[Math.floor(Math.random() * eligible.length)]
  const nextLevel = (target.facilityLevel ?? 1) + 1
  const newMultiplier = FACILITY_LEVEL_TO_FACILITY[nextLevel]
  await db.rooms.put({ ...target, facilityLevel: nextLevel, roomFacility: newMultiplier })
  return [target.id, nextLevel]
}

async function bumpAllRoomsFacility(): Promise<number> {
  const db = getHospitalDB()
  const rooms = await db.rooms.toArray()
  let bumped = 0
  for (const r of rooms) {
    const current = r.facilityLevel ?? 1
    if (current < FACILITY_MAX_LEVEL) {
      const nextLevel = current + 1
      await db.rooms.put({
        ...r,
        facilityLevel: nextLevel,
        roomFacility: FACILITY_LEVEL_TO_FACILITY[nextLevel],
      })
      bumped += 1
    }
  }
  return bumped
}
