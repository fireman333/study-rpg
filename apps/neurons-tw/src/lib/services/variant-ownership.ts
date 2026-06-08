/**
 * Canonical「distinct-owned variant」 projection — the single source of truth for
 * how many variant slots the player CURRENTLY HOLDS (≥ 1 held individual), as
 * opposed to `neuronVariants.copies` (the monotonic lifetime-mint count kept for
 * catalog history + R2 MAX-merge stability).
 *
 * Every「distinct-owned」 surface (the global 🧬 count chip / the achievement
 * collection-milestone stat / the leaderboard `variant_count` payload) SHALL read
 * through this projection so a cross-device fusion **ghost slot** — a
 * `neuronVariants` row whose every `neuronInstances` individual has `consumedAt`
 * set — does NOT inflate any user-visible or cloud-visible count. Reading
 * `db.neuronVariants.count()` / `.toArray().length` directly for a distinct-owned
 * purpose is a regression.
 *
 * Spec: openspec/specs/neuron-variant-fusion/spec.md
 *   "`ownedSlotCount` SHALL be the single canonical「distinct-owned」 projection"
 */

import type { NeuronsDB, NeuronVariantRow, NeuronInstanceRow } from '../db'

const slotKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/**
 * Pure core: count variant slots that have at least one held (`consumedAt == null`)
 * individual. Callers that already hold both arrays (e.g. CollectionPage's
 * liveQuery) pass them in to read through the same projection without a redundant
 * table load.
 */
export function computeOwnedSlotCount(
  variants: ReadonlyArray<Pick<NeuronVariantRow, 'familyId' | 'slotIndex'>>,
  instances: ReadonlyArray<Pick<NeuronInstanceRow, 'familyId' | 'slotIndex' | 'consumedAt'>>,
): number {
  const heldKeys = new Set<string>()
  for (const inst of instances) {
    if (inst.consumedAt == null) heldKeys.add(slotKey(inst.familyId, inst.slotIndex))
  }
  let count = 0
  for (const v of variants) {
    if (heldKeys.has(slotKey(v.familyId, v.slotIndex))) count += 1
  }
  return count
}

/** Canonical distinct-owned projection. Loads both tables, then projects. */
export async function ownedSlotCount(db: NeuronsDB): Promise<number> {
  const [variants, instances] = await Promise.all([
    db.neuronVariants.toArray(),
    db.neuronInstances.toArray(),
  ])
  return computeOwnedSlotCount(variants, instances)
}
