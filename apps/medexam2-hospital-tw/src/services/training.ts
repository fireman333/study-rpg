/**
 * Training service — thin DB-write wrapper around the content-pack
 * `attemptTraining` pure function. Per `redesign-hospital-economy` §5.
 *
 * Caller passes the target doctor id; service:
 *   1. Reads current `gameCounters.revenue` + doctor row inside one txn
 *   2. Calls `attemptTraining` (pure)
 *   3. On non-aborted result: deducts revenue, updates doctor (rarity / pity /
 *      powerMultiplier), appends a `trainingHistory` row — all atomic
 *
 * Returns the `TrainingAttemptResult` for UI animation.
 */

import { attemptTraining, type TrainingAttemptResult } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type DoctorRow, type TrainingHistoryRow } from '../db/schema'

export async function trainDoctor(doctorId: string): Promise<TrainingAttemptResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [db.doctors, db.gameCounters, db.trainingHistory],
    async () => {
      const doctor = await db.doctors.get(doctorId)
      if (!doctor) {
        return {
          kind: 'aborted',
          doctorId,
          reason: 'terminal-rarity',
          requiredRevenue: 0,
        } as TrainingAttemptResult
      }
      const counters = await db.gameCounters.get('singleton')
      const currentRevenue = counters?.revenue ?? 0

      const result = attemptTraining(
        { id: doctor.id, rarity: doctor.rarity, pityCounter: doctor.pityCounter },
        { currentRevenue, rng: Math.random },
      )

      if (result.kind === 'aborted') return result

      // Apply changes atomically
      if (counters) {
        await db.gameCounters.put({
          ...counters,
          revenue: currentRevenue - result.revenueSpent,
        })
      }

      const updatedDoctor: DoctorRow =
        result.kind === 'success'
          ? {
              ...doctor,
              rarity: result.toRarity,
              powerMultiplier: result.newPowerMultiplier,
              pityCounter: 0,
              spriteKey: doctor.spriteKey.endsWith('-female')
                ? `doctor-${doctor.subjectId}-${result.toRarity}-female`
                : `doctor-${doctor.subjectId}-${result.toRarity}`,
            }
          : { ...doctor, pityCounter: result.newPityCounter }
      await db.doctors.put(updatedDoctor)

      const historyRow: TrainingHistoryRow = {
        doctorId: doctor.id,
        attemptedAt: Date.now(),
        fromRarity: result.fromRarity,
        toRarity: result.toRarity,
        cost: result.revenueSpent,
        success: result.kind === 'success',
        pityTriggered: result.kind === 'success' ? result.pityTriggered : false,
      }
      await db.trainingHistory.add(historyRow)

      return result
    },
  )
}
