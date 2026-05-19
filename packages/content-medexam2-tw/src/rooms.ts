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
  /**
   * Multiplier applied to throughput. Derived from `facilityLevel` via
   * `FACILITY_LEVEL_TO_FACILITY[facilityLevel]` in finances.ts. Persisted so the
   * tick loop's hot path doesn't need to recompute from level on every tick.
   * UI MUST write both `facilityLevel` and `roomFacility` together on upgrade.
   */
  roomFacility: number
  /** Discrete upgrade level (1-5). Level 1 = default; level 5 = 3.0× cap. */
  facilityLevel: number
  /**
   * @deprecated since `fix-medexam2-doctor-room-pointer-drift`. The single
   * source of truth for doctor↔room assignment is `Doctor.assignedRoom`. App
   * code SHALL NOT read or write this field; new values SHALL always be `null`.
   * Field retained for backward compatibility with the `hospital_state` cloud
   * blob schema and export/import JSON.
   */
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
