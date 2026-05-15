/**
 * Atomic doctor↔room assignment transactions.
 *
 * Invariant: for every `room` with `room.assignedDoctorId === doctorId`,
 *   the matching `doctor.assignedRoom === room.id`. Both sides written in a
 *   single Dexie transaction so they never drift.
 *
 * Spec: openspec/specs/hospital-tycoon-engine/spec.md
 */

import { getHospitalDB, type DoctorRow } from '../db/schema'

/** Assign a doctor to a room. If the doctor was already in another room, that
 *  room is vacated atomically. If the target room already held another doctor,
 *  that doctor is unassigned atomically. */
export async function assignDoctor(roomId: string, doctorId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.rooms, db.doctors, async () => {
    const [targetRoom, doctor] = await Promise.all([
      db.rooms.get(roomId),
      db.doctors.get(doctorId),
    ])
    if (!targetRoom) throw new Error(`assignDoctor: room ${roomId} not found`)
    if (!doctor) throw new Error(`assignDoctor: doctor ${doctorId} not found`)

    // 1. Vacate the doctor's previous room (if any, and not the same as target)
    if (doctor.assignedRoom && doctor.assignedRoom !== roomId) {
      const oldRoom = await db.rooms.get(doctor.assignedRoom)
      if (oldRoom) {
        await db.rooms.put({ ...oldRoom, assignedDoctorId: null })
      }
    }

    // 2. Vacate the target room's previous doctor (if any, and not the same)
    if (targetRoom.assignedDoctorId && targetRoom.assignedDoctorId !== doctorId) {
      const oldDoctor = await db.doctors.get(targetRoom.assignedDoctorId)
      if (oldDoctor) {
        await db.doctors.put({ ...oldDoctor, assignedRoom: null })
      }
    }

    // 3. Write new bidirectional pointers
    await db.rooms.put({ ...targetRoom, assignedDoctorId: doctorId })
    await db.doctors.put({ ...doctor, assignedRoom: roomId })
  })
}

export async function unassignDoctor(roomId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.rooms, db.doctors, async () => {
    const room = await db.rooms.get(roomId)
    if (!room) return
    if (room.assignedDoctorId) {
      const doctor = await db.doctors.get(room.assignedDoctorId)
      if (doctor) {
        await db.doctors.put({ ...doctor, assignedRoom: null })
      }
    }
    await db.rooms.put({ ...room, assignedDoctorId: null })
  })
}

export async function getUnassignedDoctors(): Promise<DoctorRow[]> {
  const db = getHospitalDB()
  const all = await db.doctors.orderBy('obtainedAt').reverse().toArray()
  return all.filter((d) => d.assignedRoom === null)
}

/** Boot-time sanity scan: log warnings for any bidirectional drift between
 *  rooms.assignedDoctorId and doctors.assignedRoom. Does not auto-repair. */
export async function checkAssignmentInvariants(): Promise<void> {
  const db = getHospitalDB()
  const [rooms, doctors] = await Promise.all([db.rooms.toArray(), db.doctors.toArray()])
  const doctorMap = new Map(doctors.map((d) => [d.id, d]))
  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  for (const room of rooms) {
    if (!room.assignedDoctorId) continue
    const d = doctorMap.get(room.assignedDoctorId)
    if (!d) {
      console.warn(`[assignment] room ${room.id} points to missing doctor ${room.assignedDoctorId}`)
    } else if (d.assignedRoom !== room.id) {
      console.warn(
        `[assignment] drift: room ${room.id} → doctor ${d.id}, but doctor.assignedRoom = ${d.assignedRoom}`,
      )
    }
  }
  for (const d of doctors) {
    if (!d.assignedRoom) continue
    const r = roomMap.get(d.assignedRoom)
    if (!r) {
      console.warn(`[assignment] doctor ${d.id} points to missing room ${d.assignedRoom}`)
    } else if (r.assignedDoctorId !== d.id) {
      console.warn(
        `[assignment] drift: doctor ${d.id} → room ${r.id}, but room.assignedDoctorId = ${r.assignedDoctorId}`,
      )
    }
  }
}
