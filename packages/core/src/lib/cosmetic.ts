/**
 * Cosmetic system pure functions — milestone unlock detection, catalog → item conversion,
 * equip / unequip helpers. No Dexie / DOM dependency.
 * Spec: openspec/specs/cosmetic-system/spec.md
 */

import type {
  Cosmetic,
  CosmeticCategory,
  CosmeticSlot,
  EquipSlot,
  Item,
  ItemInstance,
  ItemInstanceId,
  Player,
} from '../types'

/** Map a cosmetic category to its EquipSlot key. */
export function cosmeticSlotForCategory(cat: CosmeticCategory): CosmeticSlot {
  switch (cat) {
    case 'head': return 'cosmetic-head'
    case 'body': return 'cosmetic-body'
    case 'accessory': return 'cosmetic-accessory'
    case 'held': return 'cosmetic-held'
    case 'background': return 'cosmetic-background'
  }
}

/** Convert a catalog entry to a functional Item (effects=[], isCosmetic=true). */
export function cosmeticToItem(c: Cosmetic): Item {
  return {
    id: c.id,
    name: c.name,
    rarity: c.rarity ?? 'R',
    slot: cosmeticSlotForCategory(c.category) as EquipSlot,
    effects: [],
    artKey: c.artKey,
    isCosmetic: true,
  }
}

/**
 * Diff-based unlock detection. Returns cosmetics whose unlockCondition transitions from
 * false (prev) → true (next). Already-unlocked cosmetics are NOT re-emitted.
 */
export function checkMilestoneUnlocks(
  prev: Player,
  next: Player,
  catalog: readonly Cosmetic[],
): Cosmetic[] {
  const newlyUnlocked: Cosmetic[] = []
  for (const c of catalog) {
    const before = c.unlockCondition(prev)
    const after = c.unlockCondition(next)
    if (!before && after) newlyUnlocked.push(c)
  }
  return newlyUnlocked
}

/** Pure function: set Equipment[slot] to instanceId. */
export function equipCosmetic(
  player: Player,
  instanceId: ItemInstanceId,
  slot: CosmeticSlot,
): Player {
  return {
    ...player,
    equipment: {
      ...player.equipment,
      [slot]: instanceId,
    },
  }
}

/** Pure function: clear Equipment[slot]. */
export function unequipCosmetic(player: Player, slot: CosmeticSlot): Player {
  const { [slot]: _removed, ...rest } = player.equipment
  return {
    ...player,
    equipment: rest,
  }
}

/**
 * Build an ItemInstance for a freshly unlocked cosmetic. Caller adds to inventory.
 */
export function instanceFromCosmetic(c: Cosmetic, now: number = Date.now()): ItemInstance {
  return {
    id: `cosmetic-${c.id}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    itemId: c.id,
    obtainedAt: now,
    locked: false,
  }
}

/** Convenience: filter catalog to entries unlocked given player state. */
export function listUnlockedCosmetics(
  player: Player,
  catalog: readonly Cosmetic[],
): Cosmetic[] {
  return catalog.filter((c) => c.unlockCondition(player))
}

/** Convenience: filter catalog to entries still locked. */
export function listLockedCosmetics(
  player: Player,
  catalog: readonly Cosmetic[],
): Cosmetic[] {
  return catalog.filter((c) => !c.unlockCondition(player))
}
