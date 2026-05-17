import { randomId, rollGacha, type Subject } from '@study-rpg/core'
import {
  STARTER_PULL_WEIGHTS,
  RARITY_POWER_MULTIPLIER,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type DoctorRow } from '../db/schema'

export type StarterPullOutcome =
  | { ok: true; doctor: DoctorRow }
  | { ok: false; reason: 'already-used' }
  | { ok: false; reason: 'unknown-subject' }

/**
 * Single-use starter pull. Bypasses banner threshold + ticket consumption.
 * Guarantees rarity ≥ P4 via STARTER_PULL_WEIGHTS (P5 excluded).
 *
 * Mutates `gameCounters.hasUsedStarterPull = true` on success so the card
 * never reappears. Does NOT touch `gachaStats` (pity counters independent).
 */
export async function attemptStarterPull(subject: Subject): Promise<StarterPullOutcome> {
  if (!subject?.id) return { ok: false, reason: 'unknown-subject' }

  const db = getHospitalDB()
  return db.transaction('rw', db.gameCounters, db.doctors, async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters) return { ok: false, reason: 'already-used' } as const
    if (counters.hasUsedStarterPull) return { ok: false, reason: 'already-used' } as const

    // Pity rules: empty array — starter pull does not engage pity tracking.
    const result = rollGacha(
      { tiers: STARTER_PULL_WEIGHTS, pityRules: [] },
      { totalRolls: 0, rollsSinceLast: {} },
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
      pityCounter: 0,
    }

    await db.doctors.put(doctor)
    await db.gameCounters.put({ ...counters, hasUsedStarterPull: true })
    return { ok: true, doctor } as const
  })
}
