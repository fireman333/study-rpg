/**
 * Build-time validator for the permanent equipment catalog.
 *
 * Rules (per spec Req "Permanent equipment SHALL be a P1–P5 rarity collection
 * with rarity-scaled bonuses"):
 * 1. Catalog size >= MIN_EQUIPMENT_COUNT (10)
 * 2. Every rarity tier P1–P5 has >= MIN_ITEMS_PER_TIER (2)
 * 3. equipmentId values globally unique
 * 4. Every entry has non-empty required fields
 * 5. lane ∈ {speed, energy}
 * 6. rarity ∈ EQUIPMENT_RARITIES
 * 7. bonus === EQUIPMENT_RARITY_BONUS[rarity] (rarity-matched, monotonic)
 *
 * Throws Error aggregating all failures. Wired into the package build script +
 * smoke fixture (scripts/verify-equipment-validator.ts).
 */

import {
  EQUIPMENT_RARITIES,
  EQUIPMENT_RARITY_BONUS,
  type EquipmentDef,
  type EquipmentRarity,
} from './equipment-types'

export interface EquipmentValidationFailure {
  rule: string
  entryId?: string
  message: string
}

export const MIN_EQUIPMENT_COUNT = 10
export const MIN_ITEMS_PER_TIER = 2
const ALLOWED_LANES = new Set(['speed', 'energy'])

export function validateEquipmentCatalog(catalog: readonly EquipmentDef[]): void {
  const failures: EquipmentValidationFailure[] = []

  // R1: catalog size
  if (catalog.length < MIN_EQUIPMENT_COUNT) {
    failures.push({
      rule: 'TOO_FEW_ITEMS',
      message: `equipment catalog must have >= ${MIN_EQUIPMENT_COUNT} items, got ${catalog.length}`,
    })
  }

  // R2: >= MIN_ITEMS_PER_TIER per rarity tier
  const tierCount: Record<string, number> = {}
  for (const e of catalog) tierCount[e.rarity] = (tierCount[e.rarity] ?? 0) + 1
  for (const rarity of EQUIPMENT_RARITIES) {
    const got = tierCount[rarity] ?? 0
    if (got < MIN_ITEMS_PER_TIER) {
      failures.push({
        rule: 'SPARSE_TIER',
        message: `rarity ${rarity} must have >= ${MIN_ITEMS_PER_TIER} items, got ${got}`,
      })
    }
  }

  // R3: id uniqueness
  const seen = new Map<string, number>()
  for (const e of catalog) seen.set(e.equipmentId, (seen.get(e.equipmentId) ?? 0) + 1)
  for (const [id, count] of seen.entries()) {
    if (count > 1) {
      failures.push({
        rule: 'DUPLICATE_ID',
        entryId: id,
        message: `equipmentId "${id}" appears ${count} times — ids must be globally unique`,
      })
    }
  }

  // R4 + R5 + R6 + R7: fields + enums + rarity-matched bonus
  const allowedRarities = new Set<string>(EQUIPMENT_RARITIES)
  for (const e of catalog) {
    if (!e.equipmentId || e.equipmentId.trim().length === 0) {
      failures.push({ rule: 'MISSING_ID', message: 'entry has empty equipmentId' })
    }
    if (!e.displayName || e.displayName.trim().length === 0) {
      failures.push({
        rule: 'MISSING_DISPLAY_NAME',
        entryId: e.equipmentId,
        message: `equipmentId "${e.equipmentId}" has empty displayName`,
      })
    }
    if (!e.description || e.description.trim().length === 0) {
      failures.push({
        rule: 'MISSING_DESCRIPTION',
        entryId: e.equipmentId,
        message: `equipmentId "${e.equipmentId}" has empty description`,
      })
    }
    if (!e.artworkId || e.artworkId.trim().length === 0) {
      failures.push({
        rule: 'MISSING_ARTWORK_ID',
        entryId: e.equipmentId,
        message: `equipmentId "${e.equipmentId}" has empty artworkId`,
      })
    }
    if (!ALLOWED_LANES.has(e.lane)) {
      failures.push({
        rule: 'INVALID_LANE',
        entryId: e.equipmentId,
        message: `equipmentId "${e.equipmentId}" has invalid lane "${e.lane}"`,
      })
    }
    if (!allowedRarities.has(e.rarity)) {
      failures.push({
        rule: 'INVALID_RARITY',
        entryId: e.equipmentId,
        message: `equipmentId "${e.equipmentId}" has invalid rarity "${e.rarity}"`,
      })
      continue
    }
    const expected = EQUIPMENT_RARITY_BONUS[e.rarity as EquipmentRarity]
    if (e.bonus !== expected) {
      failures.push({
        rule: 'BONUS_RARITY_MISMATCH',
        entryId: e.equipmentId,
        message: `equipmentId "${e.equipmentId}" rarity ${e.rarity} expects bonus ${expected}, got ${e.bonus}`,
      })
    }
  }

  if (failures.length > 0) {
    const lines = failures.map((f) => `  - [${f.rule}] ${f.message}`)
    throw new Error(
      `Equipment catalog validation failed (${failures.length} violation${
        failures.length === 1 ? '' : 's'
      }):\n${lines.join('\n')}`,
    )
  }
}
