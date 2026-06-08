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
 * The projection comes in two canonical forms that share one「a slot is owned ⟺
 * ≥ 1 held individual」 core: a GLOBAL count (`ownedSlotCount` /
 * `computeOwnedSlotCount`) and a PER-FAMILY count (`ownedSlotCountForFamily` /
 * `computeOwnedSlotCountByFamily`). Any per-family「distinct-owned」 display reads
 * through the per-family form; re-deriving from
 * `db.neuronVariants.where('familyId')…count()` is the per-family regression.
 *
 * Spec: openspec/specs/neuron-variant-fusion/spec.md
 *   "`ownedSlotCount` SHALL be the single canonical「distinct-owned」 projection"
 */

import type { NeuronsDB, NeuronVariantRow, NeuronInstanceRow } from '../db'

const slotKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/** Shared core: the set of `${familyId}:${slotIndex}` keys with ≥ 1 held individual. */
function heldSlotKeySet(
  instances: ReadonlyArray<Pick<NeuronInstanceRow, 'familyId' | 'slotIndex' | 'consumedAt'>>,
): Set<string> {
  const held = new Set<string>()
  for (const inst of instances) {
    if (inst.consumedAt == null) held.add(slotKey(inst.familyId, inst.slotIndex))
  }
  return held
}

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
  const held = heldSlotKeySet(instances)
  let count = 0
  for (const v of variants) {
    if (held.has(slotKey(v.familyId, v.slotIndex))) count += 1
  }
  return count
}

/**
 * Pure per-family projection: `familyId → owned-slot count` (slots with ≥ 1 held
 * individual). A family's ghost slot is excluded exactly like the global count.
 * Families with zero owned slots are simply absent from the map (callers use
 * `.get(id) ?? 0`).
 */
export function computeOwnedSlotCountByFamily(
  variants: ReadonlyArray<Pick<NeuronVariantRow, 'familyId' | 'slotIndex'>>,
  instances: ReadonlyArray<Pick<NeuronInstanceRow, 'familyId' | 'slotIndex' | 'consumedAt'>>,
): Map<string, number> {
  const held = heldSlotKeySet(instances)
  const byFamily = new Map<string, number>()
  for (const v of variants) {
    if (held.has(slotKey(v.familyId, v.slotIndex))) {
      byFamily.set(v.familyId, (byFamily.get(v.familyId) ?? 0) + 1)
    }
  }
  return byFamily
}

/** Canonical distinct-owned projection. Loads both tables, then projects. */
export async function ownedSlotCount(db: NeuronsDB): Promise<number> {
  const [variants, instances] = await Promise.all([
    db.neuronVariants.toArray(),
    db.neuronInstances.toArray(),
  ])
  return computeOwnedSlotCount(variants, instances)
}

/**
 * Canonical per-family distinct-owned projection — for callers that only know a
 * single `familyId` (e.g. `VariantCollectionChip`). Both tables index `familyId`,
 * so the scoped reads stay cheap.
 */
export async function ownedSlotCountForFamily(db: NeuronsDB, familyId: string): Promise<number> {
  const [variants, instances] = await Promise.all([
    db.neuronVariants.where('familyId').equals(familyId).toArray(),
    db.neuronInstances.where('familyId').equals(familyId).toArray(),
  ])
  return computeOwnedSlotCountByFamily(variants, instances).get(familyId) ?? 0
}
