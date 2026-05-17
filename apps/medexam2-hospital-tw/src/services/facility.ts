/**
 * Facility upgrade service for the redesign-hospital-economy change (§8).
 * Atomic: deduct revenue + bump room.facilityLevel + recompute roomFacility
 * multiplier all in one transaction.
 *
 * Costs and multiplier ladder live in content-pack `finances.ts`:
 *   level 1: 1.0×  (default, free)
 *   level 2: 1.5×  cost 10,000
 *   level 3: 2.0×  cost 50,000
 *   level 4: 2.5×  cost 200,000
 *   level 5: 3.0×  cost 1,000,000 (max)
 */

import {
  FACILITY_LEVEL_TO_FACILITY,
  FACILITY_MAX_LEVEL,
  FACILITY_UPGRADE_COSTS,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

export type FacilityUpgradeResult =
  | { kind: 'success'; roomId: string; newLevel: number; newMultiplier: number; revenueSpent: number }
  | { kind: 'aborted'; roomId: string; reason: 'max-level' | 'insufficient-revenue'; requiredRevenue: number }

export async function upgradeFacility(roomId: string): Promise<FacilityUpgradeResult> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.rooms, db.gameCounters], async () => {
    const room = await db.rooms.get(roomId)
    if (!room) return { kind: 'aborted', roomId, reason: 'max-level', requiredRevenue: 0 }
    const currentLevel = room.facilityLevel ?? 1
    if (currentLevel >= FACILITY_MAX_LEVEL) {
      return { kind: 'aborted', roomId, reason: 'max-level', requiredRevenue: 0 }
    }
    const nextLevel = currentLevel + 1
    const cost = FACILITY_UPGRADE_COSTS[nextLevel]
    const counters = await db.gameCounters.get('singleton')
    if (!counters || counters.revenue < cost) {
      return { kind: 'aborted', roomId, reason: 'insufficient-revenue', requiredRevenue: cost }
    }
    const newMultiplier = FACILITY_LEVEL_TO_FACILITY[nextLevel]
    await db.rooms.put({ ...room, facilityLevel: nextLevel, roomFacility: newMultiplier })
    await db.gameCounters.put({ ...counters, revenue: counters.revenue - cost })
    return { kind: 'success', roomId, newLevel: nextLevel, newMultiplier, revenueSpent: cost }
  })
}
