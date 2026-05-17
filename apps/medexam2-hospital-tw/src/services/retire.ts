/**
 * Voluntary retirement service — `redesign-hospital-economy` §5.7.
 *
 * Atomic transaction:
 *   1. Read doctor + counters
 *   2. Delete doctor from `db.doctors`
 *   3. Null `assignedDoctorId` on any room referencing the retired doctor
 *   4. Refund `powerMultiplier × 1000` to `gameCounters.revenue`
 *   5. Append a `retirementLog` row for the 24-hour diversification grace lookup
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
    [db.doctors, db.rooms, db.gameCounters, db.retirementLog],
    async () => {
      const doctor = await db.doctors.get(doctorId)
      if (!doctor) return { kind: 'not-found', doctorId } as RetireResult

      const refund = doctor.powerMultiplier * 1000

      // Free any room currently assigned to this doctor
      let roomFreed: string | null = null
      const assignedRoom = await db.rooms.where('id').equals(doctor.assignedRoom ?? '').first()
      if (assignedRoom && assignedRoom.assignedDoctorId === doctorId) {
        await db.rooms.put({ ...assignedRoom, assignedDoctorId: null })
        roomFreed = assignedRoom.id
      } else {
        // Defensive: scan all rooms in case doctor.assignedRoom is stale
        const allRooms = await db.rooms.toArray()
        const orphanRoom = allRooms.find((r) => r.assignedDoctorId === doctorId)
        if (orphanRoom) {
          await db.rooms.put({ ...orphanRoom, assignedDoctorId: null })
          roomFreed = orphanRoom.id
        }
      }

      // Delete the doctor row
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
