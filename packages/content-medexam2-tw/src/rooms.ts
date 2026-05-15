/**
 * Hospital room data model for the 二階 medexam2 content pack.
 *
 * Throughput formula extended by `wire-hospital-reputation` (2026-05-15) to
 * include `affinityBonus` — see `./affinity.ts` for the 14-科 → room mapping
 * and rarity-scaled match bonus table.
 */

import type { SubjectId } from '@study-rpg/core'
import { getAffinityBonus } from './affinity'
import type { Rarity } from './recruitment'

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

/**
 * Throughput = baseRate × powerMultiplier × roomFacility × affinityBonus.
 * Zero if unassigned. `affinityBonus` comes from `getAffinityBonus(rarity, subjectId, room.type)`
 * — match returns rarity-scaled multiplier (P1 1.5× … P5 1.1×), mismatch returns 1.0×.
 */
export function computeThroughput(
  room: Pick<Room, 'baseRate' | 'roomFacility' | 'type'>,
  doctor: { powerMultiplier: number; rarity: Rarity; subjectId: SubjectId } | null,
): number {
  if (!doctor) return 0
  const affinityBonus = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)
  return room.baseRate * doctor.powerMultiplier * room.roomFacility * affinityBonus
}

/** Human-readable label per room type, used by Hospital page. */
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  outpatient: '門診',
  surgery: '手術房',
  ward: '病房',
}
