/**
 * Event resolution service — `redesign-hospital-economy` §6.
 *
 * Modal events (medical-malpractice / vip-patient / emergency-shift / audit-event)
 * are resolved by the player; this module owns the atomic Dexie transaction:
 *   - apply revenue / reputation delta
 *   - write eventLog row
 *   - clear gameCounters.pendingEventId + set lastEventResolvedAt
 *   - for vip-patient: set vipBoostUntil
 *
 * Toast events resolve inside tick.ts directly (no player input needed).
 */

import {
  AUDIT_FAIL_REPUTATION_LOSS,
  AUDIT_PASS_PROBABILITY,
  AUDIT_PASS_REPUTATION,
  EMERGENCY_SHIFT_REPUTATION_BONUS,
  EMERGENCY_SHIFT_REVENUE_BONUS,
  MALPRACTICE_PENALTY_REP,
  MALPRACTICE_SETTLEMENT_MIN,
  MALPRACTICE_SETTLEMENT_PERCENT,
  VIP_BOOST_DURATION_MS,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

export type MalpracticeAction = 'settle' | 'accept-penalty'

export interface MalpracticeOutcome {
  kind: 'settled' | 'accepted-penalty' | 'insufficient-revenue'
  revenueDelta: number
  reputationDelta: number
  settlementCost?: number
}

/**
 * Resolve a 醫療糾紛.
 *
 * settle: deduct max(MIN, revenue × PERCENT) revenue, no rep penalty.
 * accept-penalty: -MALPRACTICE_PENALTY_REP rep, no revenue cost.
 * If 'settle' picked but revenue < MIN, returns 'insufficient-revenue'
 * without state change (UI should keep modal open).
 */
export async function resolveMalpractice(action: MalpracticeAction): Promise<MalpracticeOutcome> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.gameCounters, db.eventLog], async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters || counters.pendingEventId !== 'medical-malpractice') {
      return { kind: 'accepted-penalty', revenueDelta: 0, reputationDelta: 0 }
    }
    const now = Date.now()

    if (action === 'settle') {
      const settlementCost = Math.max(
        MALPRACTICE_SETTLEMENT_MIN,
        Math.round(counters.revenue * MALPRACTICE_SETTLEMENT_PERCENT),
      )
      if (counters.revenue < settlementCost) {
        return { kind: 'insufficient-revenue', revenueDelta: 0, reputationDelta: 0, settlementCost }
      }
      await db.gameCounters.put({
        ...counters,
        revenue: counters.revenue - settlementCost,
        pendingEventId: null,
        pendingEventTriggeredAt: null,
        lastEventResolvedAt: now,
      })
      await db.eventLog.add({
        triggeredAt: counters.pendingEventTriggeredAt ?? now,
        eventKey: 'medical-malpractice',
        outcome: 'settled',
        reputationDelta: 0,
        revenueDelta: -settlementCost,
      })
      return { kind: 'settled', revenueDelta: -settlementCost, reputationDelta: 0, settlementCost }
    }

    // accept-penalty
    const repDelta = -MALPRACTICE_PENALTY_REP
    await db.gameCounters.put({
      ...counters,
      reputation: Math.max(0, counters.reputation + repDelta),
      pendingEventId: null,
      pendingEventTriggeredAt: null,
      lastEventResolvedAt: now,
    })
    await db.eventLog.add({
      triggeredAt: counters.pendingEventTriggeredAt ?? now,
      eventKey: 'medical-malpractice',
      outcome: 'accepted-penalty',
      reputationDelta: repDelta,
      revenueDelta: 0,
    })
    return { kind: 'accepted-penalty', revenueDelta: 0, reputationDelta: repDelta }
  })
}

export interface VipOutcome {
  vipBoostUntil: number
  durationMs: number
}

export async function resolveVipPatient(): Promise<VipOutcome> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.gameCounters, db.eventLog], async () => {
    const counters = await db.gameCounters.get('singleton')
    const now = Date.now()
    const vipBoostUntil = now + VIP_BOOST_DURATION_MS
    if (!counters || counters.pendingEventId !== 'vip-patient') {
      return { vipBoostUntil, durationMs: VIP_BOOST_DURATION_MS }
    }
    await db.gameCounters.put({
      ...counters,
      vipBoostUntil,
      pendingEventId: null,
      pendingEventTriggeredAt: null,
      lastEventResolvedAt: now,
    })
    await db.eventLog.add({
      triggeredAt: counters.pendingEventTriggeredAt ?? now,
      eventKey: 'vip-patient',
      outcome: 'accepted',
      reputationDelta: 0,
      revenueDelta: 0,
    })
    return { vipBoostUntil, durationMs: VIP_BOOST_DURATION_MS }
  })
}

export interface EmergencyShiftOutcome {
  revenueDelta: number
  reputationDelta: number
}

export async function resolveEmergencyShift(): Promise<EmergencyShiftOutcome> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.gameCounters, db.eventLog], async () => {
    const counters = await db.gameCounters.get('singleton')
    const now = Date.now()
    if (!counters || counters.pendingEventId !== 'emergency-shift') {
      return { revenueDelta: 0, reputationDelta: 0 }
    }
    await db.gameCounters.put({
      ...counters,
      revenue: counters.revenue + EMERGENCY_SHIFT_REVENUE_BONUS,
      reputation: counters.reputation + EMERGENCY_SHIFT_REPUTATION_BONUS,
      pendingEventId: null,
      pendingEventTriggeredAt: null,
      lastEventResolvedAt: now,
    })
    await db.eventLog.add({
      triggeredAt: counters.pendingEventTriggeredAt ?? now,
      eventKey: 'emergency-shift',
      outcome: 'accepted',
      reputationDelta: EMERGENCY_SHIFT_REPUTATION_BONUS,
      revenueDelta: EMERGENCY_SHIFT_REVENUE_BONUS,
    })
    return {
      revenueDelta: EMERGENCY_SHIFT_REVENUE_BONUS,
      reputationDelta: EMERGENCY_SHIFT_REPUTATION_BONUS,
    }
  })
}

export interface AuditOutcome {
  kind: 'pass' | 'fail'
  reputationDelta: number
}

export async function resolveAudit(): Promise<AuditOutcome> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.gameCounters, db.eventLog], async () => {
    const counters = await db.gameCounters.get('singleton')
    const now = Date.now()
    const passed = Math.random() < AUDIT_PASS_PROBABILITY
    const repDelta = passed ? AUDIT_PASS_REPUTATION : -AUDIT_FAIL_REPUTATION_LOSS
    if (!counters || counters.pendingEventId !== 'audit-event') {
      return { kind: passed ? 'pass' : 'fail', reputationDelta: repDelta }
    }
    await db.gameCounters.put({
      ...counters,
      reputation: Math.max(0, counters.reputation + repDelta),
      pendingEventId: null,
      pendingEventTriggeredAt: null,
      lastEventResolvedAt: now,
    })
    await db.eventLog.add({
      triggeredAt: counters.pendingEventTriggeredAt ?? now,
      eventKey: 'audit-event',
      outcome: passed ? 'pass' : 'fail',
      reputationDelta: repDelta,
      revenueDelta: 0,
    })
    return { kind: passed ? 'pass' : 'fail', reputationDelta: repDelta }
  })
}
