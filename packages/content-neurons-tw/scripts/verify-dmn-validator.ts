/**
 * Standalone smoke for the DMN fate-card catalog validator.
 *
 * Run via: `pnpm --filter @study-rpg/content-neurons-tw verify:dmn`
 * Or:      `tsx scripts/verify-dmn-validator.ts`
 *
 * Exits non-zero on assertion failure. Mirror of verify-validator.ts pattern.
 */

import { DMN_CARD_CATALOG } from '../src/dmn-cards'
import { validateDmnCardCatalog } from '../src/dmn-card-validator'
import type { DmnCardDef } from '../src/dmn-types'

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
      console.error(
        `  ❌ ${label} — threw but missing rule "${expectedRule}":\n     ${msg.split('\n')[0]}`,
      )
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

console.log('# DMN fate-card validator smoke\n')

// Positive: real catalog must pass
assertNoThrow('real DMN_CARD_CATALOG passes', () =>
  validateDmnCardCatalog(DMN_CARD_CATALOG),
)

// Negative 1: wrong size (19 entries)
assertThrows(
  'Catalog with 19 entries fails',
  () => validateDmnCardCatalog(DMN_CARD_CATALOG.slice(0, 19) as DmnCardDef[]),
  'WRONG_CATALOG_SIZE',
)

// Negative 2: duplicate cardId
assertThrows(
  'Duplicate cardId fails',
  () => {
    const dup = DMN_CARD_CATALOG[0]!
    // Replace last entry with duplicate of first — keeps size === 20
    const mutated = [...DMN_CARD_CATALOG.slice(0, 19), dup] as DmnCardDef[]
    validateDmnCardCatalog(mutated)
  },
  'DUPLICATE_ID',
)

// Negative 3: missing description
assertThrows(
  'Entry with empty description fails',
  () => {
    const mutated = [
      ...DMN_CARD_CATALOG.slice(0, 19),
      { ...DMN_CARD_CATALOG[19]!, description: '' },
    ] as DmnCardDef[]
    validateDmnCardCatalog(mutated)
  },
  'MISSING_DESCRIPTION',
)

// Negative 4: unreachable eventKind (drop all hidden-reveal cards → 16 entries; size fails first
//   so we need to keep size==20 by remapping)
assertThrows(
  'Unreachable eventKind fails',
  () => {
    // Remap all hidden-reveal cards' eventKind to family-buff → hidden-reveal count = 0
    const mutated = DMN_CARD_CATALOG.map((c) =>
      c.eventKind === 'hidden-reveal' ? { ...c, eventKind: 'family-buff' as const } : c,
    )
    validateDmnCardCatalog(mutated)
  },
  'UNREACHABLE_EVENT_KIND',
)

// Negative 5: wrong rarity distribution (swap a P4 to be P1 → P1 count = 3, P4 count = 7)
assertThrows(
  'Wrong rarity distribution fails',
  () => {
    const mutated = DMN_CARD_CATALOG.map((c, i) =>
      i === DMN_CARD_CATALOG.length - 1 ? { ...c, rarity: 'P1' as const } : c,
    )
    validateDmnCardCatalog(mutated)
  },
  'WRONG_RARITY_DISTRIBUTION',
)

// Negative 6: invalid rarity (cast to bypass TS)
assertThrows(
  'Invalid rarity fails',
  () => {
    const mutated = [
      ...DMN_CARD_CATALOG.slice(0, 19),
      { ...DMN_CARD_CATALOG[19]!, rarity: 'P5' as unknown as DmnCardDef['rarity'] },
    ] as DmnCardDef[]
    validateDmnCardCatalog(mutated)
  },
  'INVALID_RARITY',
)

console.log(`\n# Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
