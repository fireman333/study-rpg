/**
 * Acceleration engine (add-neurons-acceleration-system).
 *
 * Two additive `1 + Σbonus` pools, each hard-capped, derived at read time from
 * (a) active consumable buffs (`dmnActiveBuffs`) and (b) owned permanent
 * equipment (`equipment`). Composition is ADDITIVE then clamped — the cap is a
 * predictable ceiling guarding the positive-feedback runaway the grill flagged.
 *
 *   energyAccel(familyId) = min(ENERGY_ACCEL_CAP, 1 + Σ active-energy-bonus + Σ owned-energy-bonus)
 *   speedAccel()          = min(SPEED_ACCEL_CAP,  1 + Σ active-speed-bonus  + Σ owned-speed-bonus)
 *
 * `family-buff` is family-scoped (only the buffed family's energy faucet); it
 * folds into `energyAccel(familyId)` as a `+1.0` bonus (preserves its prior ×2).
 * `surge`/`bolus` are global. Equipment bonuses are rarity-scaled (catalog).
 *
 * Caps + magnitudes are dogfood-tunable game-loop numbers (NOT OE-anchored).
 *
 * Capability spec: openspec/specs/neurons-acceleration-system/spec.md
 */

import {
  EQUIPMENT_CATALOG,
  type DmnEventKind,
  type EquipmentLane,
} from '@study-rpg/content-neurons-tw'
import { db } from '../db'

export const ENERGY_ACCEL_CAP = 2.5
export const SPEED_ACCEL_CAP = 2.0

const HOUR = 60 * 60 * 1000

/** Which active-buff kinds feed which pool, their additive bonus, and duration. */
export interface ConsumableBoost {
  lane: EquipmentLane
  bonus: number
  durationMs: number
  /** family-buff applies only to its buffed family's energy; surge/bolus are global. */
  familyScoped: boolean
}

export const CONSUMABLE_BOOSTS: Partial<Record<DmnEventKind, ConsumableBoost>> = {
  'family-buff': { lane: 'energy', bonus: 1.0, durationMs: HOUR, familyScoped: true },
  surge: { lane: 'speed', bonus: 0.5, durationMs: HOUR / 2, familyScoped: false },
  bolus: { lane: 'energy', bonus: 0.5, durationMs: HOUR / 2, familyScoped: false },
}

const EQUIPMENT_BY_ID = new Map(EQUIPMENT_CATALOG.map((e) => [e.equipmentId, e]))

function clampPool(v: number, cap: number): number {
  if (v > cap) return cap
  if (v < 1) return 1
  return v
}

async function ownedEquipmentBonus(lane: EquipmentLane): Promise<number> {
  const owned = await db.equipment.toArray()
  let sum = 0
  for (const row of owned) {
    const def = EQUIPMENT_BY_ID.get(row.equipmentId)
    if (def && def.lane === lane) sum += def.bonus
  }
  return sum
}

async function activeConsumableBonus(lane: EquipmentLane, familyId: string | null): Promise<number> {
  const now = Date.now()
  const buffs = await db.dmnActiveBuffs.toArray()
  let sum = 0
  for (const b of buffs) {
    if (b.expiresAt <= now) continue
    const spec = CONSUMABLE_BOOSTS[b.buffKind]
    if (!spec || spec.lane !== lane) continue
    if (spec.familyScoped && b.familyId !== familyId) continue
    sum += spec.bonus
  }
  return sum
}

/**
 * Energy-pool multiplier for a correct-answer maze-energy faucet in `familyId`.
 * Folds in an active family-buff (when it matches `familyId`) + global bolus +
 * owned energy-lane equipment. Pass `null` for the family-agnostic baseline.
 */
export async function energyAccel(familyId: string | null = null): Promise<number> {
  const consumable = await activeConsumableBonus('energy', familyId)
  const equip = await ownedEquipmentBonus('energy')
  return clampPool(1 + consumable + equip, ENERGY_ACCEL_CAP)
}

/** Speed-pool multiplier for exploration speed (global). */
export async function speedAccel(): Promise<number> {
  const consumable = await activeConsumableBonus('speed', null)
  const equip = await ownedEquipmentBonus('speed')
  return clampPool(1 + consumable + equip, SPEED_ACCEL_CAP)
}
