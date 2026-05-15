import { randomId, rollGacha, type Subject } from '@study-rpg/core'
import {
  RECRUITMENT_THRESHOLDS,
  RECRUITMENT_WEIGHTS,
  RECRUITMENT_PITY_RULES,
  RARITY_POWER_MULTIPLIER,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import {
  getAffinity,
  getGachaStats,
  getHospitalDB,
  type DoctorRow,
} from '../db/schema'

export type RollOutcome =
  | { ok: true; doctor: DoctorRow; wasPity: boolean }
  | { ok: false; reason: 'banner-locked'; missing: number }
  | { ok: false; reason: 'no-tickets' }
  | { ok: false; reason: 'unknown-subject' }

export async function attemptRoll(subject: Subject): Promise<RollOutcome> {
  const threshold = RECRUITMENT_THRESHOLDS[subject.id]
  if (threshold === undefined) return { ok: false, reason: 'unknown-subject' }

  const affinity = await getAffinity(subject.id)
  if (affinity < threshold) {
    return { ok: false, reason: 'banner-locked', missing: threshold - affinity }
  }

  const db = getHospitalDB()
  return db.transaction('rw', db.tickets, db.gachaStats, db.doctors, async () => {
    const ticketsRow = await db.tickets.get('global')
    if (!ticketsRow || ticketsRow.available < 1) {
      return { ok: false, reason: 'no-tickets' } as const
    }

    const stats = await getGachaStats()
    const result = rollGacha(
      { tiers: RECRUITMENT_WEIGHTS, pityRules: RECRUITMENT_PITY_RULES },
      stats,
    )
    const rarity = result.tier as Rarity
    const seq = (await db.doctors.where('subjectId').equals(subject.id).count()) + 1
    const doctor: DoctorRow = {
      id: randomId(),
      subjectId: subject.id,
      rarity,
      powerMultiplier: RARITY_POWER_MULTIPLIER[rarity],
      name: `${subject.displayName} 醫師 #${seq}`,
      spriteKey: `doctor-${subject.id}-${rarity}`,
      obtainedAt: Date.now(),
      assignedRoom: null,
    }

    await db.tickets.put({ ...ticketsRow, available: ticketsRow.available - 1 })
    await db.gachaStats.put({
      id: 'global',
      totalRolls: result.newStats.totalRolls,
      rollsSinceLast: { ...result.newStats.rollsSinceLast },
    })
    await db.doctors.put(doctor)
    return { ok: true, doctor, wasPity: result.wasPity } as const
  })
}
