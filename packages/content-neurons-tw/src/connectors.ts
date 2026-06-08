/**
 * Connector neurons — a "bridge class" collectible (add-neurons-connector-neuron-
 * family). When two subject families' synaptic wire first reaches `strong`, that
 * pair's unique connector is permanently unlocked. The set is CLOSED: one connector
 * per unordered family pair = C(FAMILY_IDS.length, 2) = 55 for 11 families. NOT a
 * gacha pool, NOT a random roll, NOT a 12th subject family.
 *
 * Neuroscience framing (OE/PubMed-verified — design.md D7): a connector hub neuron
 * — a high-participation-coefficient node that bridges two functional modules, the
 * rich-club integration substrate. Anchors: van den Heuvel MP & Sporns O, J Neurosci
 * 2013;33(36):14489 (doi:10.1523/JNEUROSCI.2128-13.2013); Schroeter MS et al, J
 * Neurosci 2015;35(14):5459 (rich-get-richer emergence); Senden M et al, Hum Brain
 * Mapp 2018;39(3):1246 (rich club gates communication); Bagarinao E et al, NeuroImage
 * 2020;222:117241 (connector-hub identification). Game mapping: 11 subjects = modules;
 * a pair's wire reaching `strong` = the two modules forming a rich-club bond → a
 * connector hub neuron emerges bridging them.
 */

import { FAMILY_IDS, FAMILY_COLOR } from './families'

/**
 * Canonical connector key for an unordered family pair: the two ids sorted (JS
 * default string comparison) joined with `|`. MUST stay byte-identical to the app's
 * synapse `pairKey` (apps/neurons-tw/src/lib/connectome/state-machine.ts) so a
 * strong synapse maps to the right connector at backfill/unlock time — an app-side
 * cross-check test asserts the two agree across all pairs (coding principle §6,
 * single canonical form). Order-independent: `connectorPairKey(a,b) === connectorPairKey(b,a)`.
 */
export function connectorPairKey(familyA: string, familyB: string): string {
  if (familyA === familyB) {
    throw new Error(`connectorPairKey requires two distinct family ids; got "${familyA}" twice`)
  }
  const [first, second] = [familyA, familyB].sort()
  return `${first}|${second}`
}

/** The two family ids of a connector, recovered from its pairKey. */
export function connectorFamilies(pairKey: string): [string, string] {
  const [a, b] = pairKey.split('|')
  if (!a || !b) throw new Error(`Invalid connector pairKey: "${pairKey}"`)
  return [a, b]
}

/** The two FAMILY_COLOR accents of a connector (for the split-color frame). */
export function connectorColors(pairKey: string): [string, string] {
  const [a, b] = connectorFamilies(pairKey)
  return [FAMILY_COLOR[a] ?? '#888888', FAMILY_COLOR[b] ?? '#888888']
}

/** Theme sprite-registry key for a connector (`connector:<pairKey>`). */
export function connectorSpriteKey(pairKey: string): string {
  return `connector:${pairKey}`
}

/**
 * The closed set of all connector pairKeys, in a stable deterministic order
 * (sorted), derived from `FAMILY_IDS`. 11 families → 55 entries. Recomputes
 * automatically if the family roster ever changes.
 */
export const CONNECTOR_PAIR_KEYS: readonly string[] = (() => {
  const keys: string[] = []
  for (let i = 0; i < FAMILY_IDS.length; i++) {
    for (let j = i + 1; j < FAMILY_IDS.length; j++) {
      keys.push(connectorPairKey(FAMILY_IDS[i], FAMILY_IDS[j]))
    }
  }
  return keys.sort()
})()

/** Total connectors in the closed set (= C(FAMILY_IDS.length, 2) = 55 for 11 families). */
export const CONNECTOR_TOTAL = CONNECTOR_PAIR_KEYS.length
