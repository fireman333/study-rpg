/**
 * Standalone smoke for the connector-neuron closed set (add-neurons-connector-
 * neuron-family). Asserts the derived 55-set is well-formed: exact size, no
 * duplicates, no self-pairs, and order-independent pairKey. The app↔content
 * pairKey-agreement cross-check lives app-side (it needs the app's synapse
 * pairKey, which content cannot import).
 *
 * Run via: `pnpm --filter @study-rpg/content-neurons-tw verify:connectors`
 * Or:      `tsx scripts/verify-connectors.ts`
 *
 * Exits non-zero on assertion failure. Mirror of verify-equipment-validator.ts.
 */

import { FAMILY_IDS } from '../src/families'
import {
  CONNECTOR_PAIR_KEYS,
  CONNECTOR_TOTAL,
  connectorPairKey,
  connectorFamilies,
} from '../src/connectors'

let passed = 0
let failed = 0

function check(label: string, cond: boolean) {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    console.error(`  ❌ ${label}`)
  }
}

function assertThrows(label: string, fn: () => void) {
  try {
    fn()
    failed += 1
    console.error(`  ❌ ${label} — expected throw, got success`)
  } catch {
    passed += 1
    console.log(`  ✓ ${label}`)
  }
}

console.log('# Connector closed-set smoke\n')

const expected = (FAMILY_IDS.length * (FAMILY_IDS.length - 1)) / 2 // C(11,2) = 55
check(`set size === C(${FAMILY_IDS.length},2) = ${expected}`, CONNECTOR_TOTAL === expected)
check('CONNECTOR_PAIR_KEYS length matches CONNECTOR_TOTAL', CONNECTOR_PAIR_KEYS.length === CONNECTOR_TOTAL)
check('no duplicate pairKeys', new Set(CONNECTOR_PAIR_KEYS).size === CONNECTOR_PAIR_KEYS.length)
check(
  'no self-pairs (each pairKey joins two DISTINCT families)',
  CONNECTOR_PAIR_KEYS.every((k) => {
    const [a, b] = connectorFamilies(k)
    return a !== b
  }),
)
check(
  'every pairKey references known families',
  CONNECTOR_PAIR_KEYS.every((k) => connectorFamilies(k).every((f) => FAMILY_IDS.includes(f))),
)
check(
  'pairKey is order-independent for all pairs',
  FAMILY_IDS.every((a, i) =>
    FAMILY_IDS.slice(i + 1).every((b) => connectorPairKey(a, b) === connectorPairKey(b, a)),
  ),
)
check(
  'derived set equals the set of all unordered distinct pairs',
  (() => {
    const brute = new Set<string>()
    for (let i = 0; i < FAMILY_IDS.length; i++)
      for (let j = i + 1; j < FAMILY_IDS.length; j++)
        brute.add(connectorPairKey(FAMILY_IDS[i], FAMILY_IDS[j]))
    return brute.size === CONNECTOR_TOTAL && CONNECTOR_PAIR_KEYS.every((k) => brute.has(k))
  })(),
)
assertThrows('connectorPairKey rejects identical family ids', () =>
  connectorPairKey(FAMILY_IDS[0], FAMILY_IDS[0]),
)

console.log(`\n# Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
