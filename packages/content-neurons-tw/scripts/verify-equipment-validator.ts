/**
 * Standalone smoke for the permanent-equipment catalog validator.
 *
 * Run via: `pnpm --filter @study-rpg/content-neurons-tw verify:equipment`
 * Or:      `tsx scripts/verify-equipment-validator.ts`
 *
 * Exits non-zero on assertion failure. Mirror of verify-dmn-validator.ts.
 */

import { EQUIPMENT_CATALOG } from '../src/equipment-catalog'
import { validateEquipmentCatalog } from '../src/equipment-validator'
import type { EquipmentDef } from '../src/equipment-types'

let passed = 0
let failed = 0

function assertThrows(label: string, fn: () => void, expectedRule: string) {
  try {
    fn()
    failed += 1
    console.error(`  ❌ ${label} — expected throw with rule "${expectedRule}", got success`)
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes(expectedRule)) {
      passed += 1
      console.log(`  ✓ ${label}`)
    } else {
      failed += 1
      console.error(`  ❌ ${label} — threw but missing rule "${expectedRule}":\n     ${msg.split('\n')[0]}`)
    }
  }
}

function assertNoThrow(label: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${label}`)
  } catch (e) {
    failed += 1
    console.error(`  ❌ ${label} — unexpected throw: ${(e as Error).message.split('\n')[0]}`)
  }
}

console.log('# Equipment catalog validator smoke\n')

// Positive: real catalog passes
assertNoThrow('real EQUIPMENT_CATALOG passes', () => validateEquipmentCatalog(EQUIPMENT_CATALOG))

// Negative 1: too few items (< 10)
assertThrows(
  'Catalog with 9 items fails',
  () => validateEquipmentCatalog(EQUIPMENT_CATALOG.slice(0, 9) as EquipmentDef[]),
  'TOO_FEW_ITEMS',
)

// Negative 2: a sparse tier (drop one P5 → only 1 P5 left, but pad back to 12 with a dupe-free P1)
assertThrows(
  'A rarity tier with < 2 items fails',
  () => {
    // Remap both P5 items to P1 → P5 count = 0
    const mutated = EQUIPMENT_CATALOG.map((e) =>
      e.rarity === 'P5' ? { ...e, rarity: 'P1' as const, bonus: 0.3 } : e,
    ) as EquipmentDef[]
    validateEquipmentCatalog(mutated)
  },
  'SPARSE_TIER',
)

// Negative 3: duplicate equipmentId
assertThrows(
  'Duplicate equipmentId fails',
  () => {
    const dup = EQUIPMENT_CATALOG[0]!
    const mutated = [...EQUIPMENT_CATALOG.slice(0, EQUIPMENT_CATALOG.length - 1), dup] as EquipmentDef[]
    validateEquipmentCatalog(mutated)
  },
  'DUPLICATE_ID',
)

// Negative 4: invalid lane
assertThrows(
  'Invalid lane fails',
  () => {
    const mutated = EQUIPMENT_CATALOG.map((e, i) =>
      i === 0 ? { ...e, lane: 'luck' as unknown as EquipmentDef['lane'] } : e,
    ) as EquipmentDef[]
    validateEquipmentCatalog(mutated)
  },
  'INVALID_LANE',
)

// Negative 5: bonus not matching rarity
assertThrows(
  'Bonus/rarity mismatch fails',
  () => {
    const mutated = EQUIPMENT_CATALOG.map((e, i) => (i === 0 ? { ...e, bonus: 0.99 } : e)) as EquipmentDef[]
    validateEquipmentCatalog(mutated)
  },
  'BONUS_RARITY_MISMATCH',
)

console.log(`\n# Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
