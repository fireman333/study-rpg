/**
 * Doctor↔room assignment service. Single source of truth: `doctor.assignedRoom`.
 *
 * Spec: openspec/specs/hospital-tycoon-engine —
 *   "Doctor assignment SHALL use `Doctor.assignedRoom` as the single source of truth"
 *
 * `Room.assignedDoctorId` is retained in the type (cloud blob compat) but never
 * written by this module. Read sites derive room→doctor via `buildDoctorByRoom`
 * helper in `./room-doctor-map.ts`.
 *
 * `checkAssignmentInvariants` is an active repairer — it modifies state to
 * restore invariants. Invoked on app boot + after every successful cloud pull.
 */

import { getHospitalDB, type DoctorRow } from '../db/schema'

/**
 * Assign a doctor to a room. If a different doctor was already in that room,
 * the prior doctor's `assignedRoom` is cleared in the same transaction
 * (displacement). If the target doctor was assigned elsewhere, the move is
 * captured by the single `doctors.put` on the target row (no second-room write
 * needed — single source of truth).
 */
export async function assignDoctor(roomId: string, doctorId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.doctors, async () => {
    const doctor = await db.doctors.get(doctorId)
    if (!doctor) throw new Error(`assignDoctor: doctor ${doctorId} not found`)

    // Displace any other doctor pointing to the target room.
    const all = await db.doctors.toArray()
    for (const d of all) {
      if (d.id !== doctorId && d.assignedRoom === roomId) {
        await db.doctors.put({ ...d, assignedRoom: null })
      }
    }

    if (doctor.assignedRoom !== roomId) {
      await db.doctors.put({ ...doctor, assignedRoom: roomId })
    }
  })
}

/** Clear the doctor currently assigned to a room. No-op if room is empty. */
export async function unassignDoctor(roomId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.doctors, async () => {
    const all = await db.doctors.toArray()
    const occupant = all.find((d) => d.assignedRoom === roomId)
    if (!occupant) return
    await db.doctors.put({ ...occupant, assignedRoom: null })
  })
}

export async function getUnassignedDoctors(): Promise<DoctorRow[]> {
  const db = getHospitalDB()
  const all = await db.doctors.orderBy('obtainedAt').reverse().toArray()
  return all.filter((d) => d.assignedRoom === null)
}

export interface AssignmentRepairReport {
  scanned: { rooms: number; doctors: number }
  repaired: {
    /** Rooms whose `assignedDoctorId` was non-null and got force-nulled. */
    roomsReset: number
    /** Doctors whose `assignedRoom` was nulled because another doctor with later
     *  `obtainedAt` already claimed the same room. */
    doctorsDuplicates: number
    /** Doctors whose `assignedRoom` pointed to a non-existent room id. */
    doctorsOrphans: number
  }
}

/**
 * Scan + repair assignment invariants in one Dexie transaction. Trusts the
 * `doctors` side as source of truth; force-nulls `rooms[*].assignedDoctorId`.
 *
 * Three repair rules (applied in one tx over both tables):
 *
 *   1. `room.assignedDoctorId !== null` → reset to null
 *   2. Multiple doctors with same `assignedRoom`: keep the one with the
 *      largest `obtainedAt`; null the rest
 *   3. `doctor.assignedRoom` references a room id not in the rooms table
 *      (orphan) → reset to null
 *
 * Invoked on app boot (App.tsx) and after every successful cloud pull
 * (sync/engine.ts pullNow resolve path).
 */
export async function checkAssignmentInvariants(): Promise<AssignmentRepairReport> {
  const db = getHospitalDB()
  const report: AssignmentRepairReport = {
    scanned: { rooms: 0, doctors: 0 },
    repaired: { roomsReset: 0, doctorsDuplicates: 0, doctorsOrphans: 0 },
  }

  await db.transaction('rw', db.rooms, db.doctors, async () => {
    const rooms = await db.rooms.toArray()
    const doctors = await db.doctors.toArray()
    report.scanned.rooms = rooms.length
    report.scanned.doctors = doctors.length

    // Rule 1: force-null any non-null rooms.assignedDoctorId
    for (const r of rooms) {
      if (r.assignedDoctorId !== null) {
        await db.rooms.put({ ...r, assignedDoctorId: null })
        report.repaired.roomsReset += 1
      }
    }

    // Rule 2 + 3 setup
    const roomIds = new Set(rooms.map((r) => r.id))
    const byRoom = new Map<string, DoctorRow>()
    const orphans: DoctorRow[] = []
    const losers: DoctorRow[] = []

    for (const d of doctors) {
      if (d.assignedRoom === null) continue
      if (!roomIds.has(d.assignedRoom)) {
        // Rule 3: orphan
        orphans.push(d)
        continue
      }
      const existing = byRoom.get(d.assignedRoom)
      if (!existing) {
        byRoom.set(d.assignedRoom, d)
        continue
      }
      // Rule 2: duplicate — keep larger obtainedAt
      if (d.obtainedAt > existing.obtainedAt) {
        losers.push(existing)
        byRoom.set(d.assignedRoom, d)
      } else {
        losers.push(d)
      }
    }

    for (const d of losers) {
      await db.doctors.put({ ...d, assignedRoom: null })
      report.repaired.doctorsDuplicates += 1
    }
    for (const d of orphans) {
      await db.doctors.put({ ...d, assignedRoom: null })
      report.repaired.doctorsOrphans += 1
    }
  })

  const { roomsReset, doctorsDuplicates, doctorsOrphans } = report.repaired
  if (roomsReset + doctorsDuplicates + doctorsOrphans > 0) {
    console.info(
      `[assignment] repaired ${roomsReset + doctorsDuplicates + doctorsOrphans} drift(s): ` +
        `roomsReset=${roomsReset}, doctorsDuplicates=${doctorsDuplicates}, doctorsOrphans=${doctorsOrphans}`,
    )
  }

  return report
}
