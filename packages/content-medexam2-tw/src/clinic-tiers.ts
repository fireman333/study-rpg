/**
 * Hospital tier progression for the 二階 medexam2 content pack.
 *
 * Locked by `wire-clinic-level-up` change (2026-05-15). Three monotonic tiers:
 * 診所 → 區域醫院 → 醫學中心. Per-tier room rosters are cumulative supersets
 * (deterministic ids) so tier upgrades can `bulkPut(TIER_ROOMS[next])` idempotently.
 *
 * Reputation thresholds + room mix per tier are deliberately conservative for
 * first dogfood; subsequent tuning happens by editing this file in a new change.
 */

import type { Room } from './rooms'

export type HospitalTier = '診所' | '區域醫院' | '醫學中心'

export const TIER_ORDER: HospitalTier[] = ['診所', '區域醫院', '醫學中心']

export const TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null> = {
  診所: 1000,
  區域醫院: 10_000,
  醫學中心: null,
}

function room(id: string, type: Room['type'], slot: number): Room {
  return { id, type, baseRate: 10, roomFacility: 1.0, assignedDoctorId: null, slot }
}

export const TIER_ROOMS: Record<HospitalTier, Room[]> = {
  診所: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
  ],
  區域醫院: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
    room('outpatient-4', 'outpatient', 4),
    room('surgery-1', 'surgery', 1),
  ],
  醫學中心: [
    room('outpatient-1', 'outpatient', 1),
    room('outpatient-2', 'outpatient', 2),
    room('outpatient-3', 'outpatient', 3),
    room('outpatient-4', 'outpatient', 4),
    room('surgery-1', 'surgery', 1),
    room('surgery-2', 'surgery', 2),
    room('ward-1', 'ward', 1),
  ],
}

export function getNextTier(current: HospitalTier): HospitalTier | null {
  const idx = TIER_ORDER.indexOf(current)
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}
