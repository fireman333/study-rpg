/**
 * Hospital room data model for the 二階 medexam2 content pack.
 *
 * Locked by `wire-hospital-tycoon-engine` change (2026-05-15). 診所 tier
 * defaults (3 outpatient rooms, baseRate 10, roomFacility 1.0) live here
 * as `INITIAL_ROOMS`; `wire-clinic-level-up` will replace this seeding
 * with tier-keyed generators when 區域醫院 / 醫學中心 tiers ship.
 */

export type RoomType = 'outpatient' | 'surgery' | 'ward'

export interface Room {
  id: string
  type: RoomType
  baseRate: number
  roomFacility: number
  assignedDoctorId: string | null
  slot: number
}

/** Tick loop offline catch-up cap. 5 minutes prevents accumulation exploits. */
export const MAX_OFFLINE_TICK_SEC = 300

/** Throughput = baseRate × powerMultiplier × roomFacility. Zero if unassigned. */
export function computeThroughput(
  room: Pick<Room, 'baseRate' | 'roomFacility'>,
  doctor: { powerMultiplier: number } | null,
): number {
  if (!doctor) return 0
  return room.baseRate * doctor.powerMultiplier * room.roomFacility
}

/** Human-readable label per room type, used by Hospital page. */
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  outpatient: '門診',
  surgery: '手術房',
  ward: '病房',
}
