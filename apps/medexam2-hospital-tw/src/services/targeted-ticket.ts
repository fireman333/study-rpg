/**
 * Targeted ticket service — lifecycle helpers for epic / legendary fate-card-
 * sourced recruitment tickets that carry a chosen subject + rarity floor.
 *
 * See `openspec/changes/implement-targeted-fate-card-tickets/` for full spec.
 *
 * Lifecycle:
 *   1. `createPendingTargetedTicket(tier)`  — write a `status='pending'` row
 *      when a fate-card draw resolves to `targeted-pN-ticket`. Subject still
 *      unknown at this point.
 *   2. `assignTargetedTicket(id, subjectId)` — player picks subject in the
 *      FateCardPage picker modal + confirms; row transitions to `'assigned'`.
 *      Cannot be reversed under normal UI flow.
 *   3. `consumeTargetedTicket(id)` — player invokes consume on the recruitment
 *      page; service rolls the banner with rarity-floor enforcement, inserts a
 *      doctor row, and marks the ticket `'consumed'`.
 *
 * Targeted ticket consumption is INTENTIONALLY decoupled from:
 *   - `tickets.available` (global counter) — neither decremented nor checked
 *   - `gachaStats` pity counter — `rollGacha` is invoked with empty stats so
 *     pity doesn't accumulate across targeted rolls or pollute global pity
 */

import { randomId, rollGacha, type Subject } from '@study-rpg/core'
import {
  RECRUITMENT_WEIGHTS,
  RARITY_POWER_MULTIPLIER,
  DEFAULT_DOCTOR_TITLE_BY_RARITY,
  TARGETED_REROLL_CAP,
  rarityIsAtLeast,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import {
  getHospitalDB,
  type DoctorRow,
  type TargetedTicketRow,
  type TargetedTicketHistoryRow,
} from '../db/schema'
import { resolveSpriteKey } from './recruitment'

type TargetedFloor = 'P2' | 'P3'

const TIER_TO_FLOOR: Record<'epic' | 'legendary', TargetedFloor> = {
  epic: 'P3',
  legendary: 'P2',
}

/**
 * Insert a pending targeted ticket row + 'obtained' history entry.
 * Called by fate-card.ts when a draw resolves to `targeted-pN-ticket`.
 */
export async function createPendingTargetedTicket(
  tier: 'epic' | 'legendary',
): Promise<TargetedTicketRow> {
  const db = getHospitalDB()
  const now = Date.now()
  const row: TargetedTicketRow = {
    id: randomId(),
    subjectId: null,
    minRarity: TIER_TO_FLOOR[tier],
    status: 'pending',
    obtainedAt: now,
    assignedAt: null,
    consumedAt: null,
    resultDoctorId: null,
    sourceFateCardTier: tier,
  }
  await db.transaction('rw', db.targetedTickets, db.targetedTicketHistory, async () => {
    await db.targetedTickets.put(row)
    const historyRow: TargetedTicketHistoryRow = {
      ticketId: row.id,
      event: 'obtained',
      at: now,
      sourceFateCardTier: tier,
    }
    await db.targetedTicketHistory.add(historyRow)
  })
  return row
}

export type AssignOutcome =
  | { ok: true; ticket: TargetedTicketRow }
  | { ok: false; reason: 'not-found' | 'wrong-status' }

/**
 * Transition a pending ticket to assigned with a chosen subject. Idempotency:
 * if the row is already assigned to the same subject, return success quietly.
 */
export async function assignTargetedTicket(
  ticketId: string,
  subjectId: string,
): Promise<AssignOutcome> {
  const db = getHospitalDB()
  return db.transaction('rw', db.targetedTickets, db.targetedTicketHistory, async () => {
    const existing = await db.targetedTickets.get(ticketId)
    if (!existing) return { ok: false, reason: 'not-found' } as const
    if (existing.status === 'consumed') return { ok: false, reason: 'wrong-status' } as const
    if (existing.status === 'assigned' && existing.subjectId === subjectId) {
      return { ok: true, ticket: existing } as const
    }
    if (existing.status === 'assigned') return { ok: false, reason: 'wrong-status' } as const

    const now = Date.now()
    const next: TargetedTicketRow = {
      ...existing,
      subjectId,
      status: 'assigned',
      assignedAt: now,
    }
    await db.targetedTickets.put(next)
    await db.targetedTicketHistory.add({
      ticketId,
      event: 'assigned',
      at: now,
      subjectId,
    })
    return { ok: true, ticket: next } as const
  })
}

export type ConsumeOutcome =
  | { ok: true; doctor: DoctorRow; rarity: Rarity; ticket: TargetedTicketRow }
  | { ok: false; reason: 'not-found' | 'not-assigned' | 'no-subject' }

/**
 * Consume an assigned targeted ticket — roll banner with rarity-floor
 * enforcement, insert doctor row, mark ticket as 'consumed'.
 *
 * Caller (`subject`) must match the ticket's assigned subjectId — the caller
 * passes a Subject because we need the displayName for doctor naming. If the
 * subject doesn't match, return wrong-status.
 */
export async function consumeTargetedTicket(
  ticketId: string,
  subject: Subject,
): Promise<ConsumeOutcome> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [db.targetedTickets, db.targetedTicketHistory, db.doctors],
    async () => {
      const ticket = await db.targetedTickets.get(ticketId)
      if (!ticket) return { ok: false, reason: 'not-found' } as const
      if (ticket.status !== 'assigned') return { ok: false, reason: 'not-assigned' } as const
      if (!ticket.subjectId || ticket.subjectId !== subject.id) {
        return { ok: false, reason: 'no-subject' } as const
      }

      const rarity = rollRarityWithFloor(ticket.minRarity)
      const seq = (await db.doctors.where('subjectId').equals(subject.id).count()) + 1
      const doctor: DoctorRow = {
        id: randomId(),
        subjectId: subject.id,
        rarity,
        powerMultiplier: RARITY_POWER_MULTIPLIER[rarity],
        name: `${subject.displayName} ${DEFAULT_DOCTOR_TITLE_BY_RARITY[rarity]} #${seq}`,
        spriteKey: resolveSpriteKey(subject.id, rarity, THEME_PIXEL_HOSPITAL.sprites),
        obtainedAt: Date.now(),
        assignedRoom: null,
        pityCounter: 0,
      }

      const now = Date.now()
      const nextTicket: TargetedTicketRow = {
        ...ticket,
        status: 'consumed',
        consumedAt: now,
        resultDoctorId: doctor.id,
      }
      await db.doctors.put(doctor)
      await db.targetedTickets.put(nextTicket)
      await db.targetedTicketHistory.add({
        ticketId,
        event: 'consumed',
        at: now,
        subjectId: subject.id,
        doctorId: doctor.id,
        rarity,
      })
      return { ok: true, doctor, rarity, ticket: nextTicket } as const
    },
  )
}

/**
 * Roll the recruitment weight table up to `TARGETED_REROLL_CAP` times, returning
 * the first result that meets the rarity floor. If all attempts fail, force the
 * floor tier directly (sample uniformly within the floor's natural pool).
 *
 * Uses empty pity stats so the targeted roll path is independent of `gachaStats`
 * pity counters per the recruitment-gacha spec delta.
 */
function rollRarityWithFloor(minRarity: TargetedFloor): Rarity {
  for (let attempt = 0; attempt < TARGETED_REROLL_CAP; attempt++) {
    const result = rollGacha(
      { tiers: RECRUITMENT_WEIGHTS, pityRules: [] },
      { totalRolls: 0, rollsSinceLast: {} },
    )
    const rarity = result.tier as Rarity
    if (rarityIsAtLeast(rarity, minRarity)) return rarity
  }
  // All rerolls below floor — force the floor tier directly. A degenerate weight
  // table with only the floor tier guarantees the result regardless of RNG.
  const forced = rollGacha(
    { tiers: [{ id: minRarity, weight: 1 }], pityRules: [] },
    { totalRolls: 0, rollsSinceLast: {} },
  )
  return forced.tier as Rarity
}

// ─── Read helpers (for UI livequeries / chips) ───────────────────────────────

export async function getPendingTargetedTickets(): Promise<TargetedTicketRow[]> {
  const db = getHospitalDB()
  return db.targetedTickets.where('status').equals('pending').toArray()
}

export async function getAssignedTargetedTickets(): Promise<TargetedTicketRow[]> {
  const db = getHospitalDB()
  return db.targetedTickets.where('status').equals('assigned').toArray()
}
