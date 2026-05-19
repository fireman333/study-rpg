/**
 * Voluntary retirement service — `redesign-hospital-economy` §5.7.
 *
 * Atomic transaction:
 *   1. Read doctor + counters
 *   2. Delete doctor from `db.doctors` (removing the doctor row also drops its
 *      `assignedRoom` pointer — the single source of truth post `fix-medexam2-
 *      doctor-room-pointer-drift`, so no rooms-table mutation is needed)
 *   3. Refund `powerMultiplier × 1000` to `gameCounters.revenue`
 *   4. Append a `retirementLog` row for the 24-hour diversification grace lookup
 *
 * Curator note: retirement is destructive (db.doctors row gone). The UI MUST
 * present an explicit confirmation modal before invoking this service.
 */

import { getHospitalDB, type RetirementLogRow } from '../db/schema'

export type RetireResult =
  | { kind: 'success'; doctorId: string; refund: number; roomFreed: string | null }
  | { kind: 'not-found'; doctorId: string }

export async function retireDoctor(doctorId: string): Promise<RetireResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [db.doctors, db.gameCounters, db.retirementLog],
    async () => {
      const doctor = await db.doctors.get(doctorId)
      if (!doctor) return { kind: 'not-found', doctorId } as RetireResult

      const refund = doctor.powerMultiplier * 1000
      const roomFreed = doctor.assignedRoom

      // Delete the doctor row. With `Doctor.assignedRoom` as the single source
      // of truth, removing the row implicitly clears the room's occupancy —
      // no `rooms.put` needed.
      await db.doctors.delete(doctorId)

      // Refund to revenue
      const counters = await db.gameCounters.get('singleton')
      if (counters) {
        await db.gameCounters.put({ ...counters, revenue: counters.revenue + refund })
      }

      // Append retirementLog row
      const logRow: RetirementLogRow = {
        retiredAt: Date.now(),
        doctorId: doctor.id,
        subjectId: doctor.subjectId,
        rarity: doctor.rarity,
        refund,
      }
      await db.retirementLog.add(logRow)

      return { kind: 'success', doctorId, refund, roomFreed }
    },
  )
}
