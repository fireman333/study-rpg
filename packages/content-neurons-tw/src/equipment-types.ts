/**
 * Permanent equipment/companion types for the neurons acceleration system
 * (add-neurons-acceleration-system).
 *
 * Equipment is a P1–P5 rarity collection (mirrors the variant-gacha rarity
 * ladder, distinct from the DMN consumable P1–P4 dex). Each item is owned ONCE
 * (no upgrade ladder in v1) and contributes a rarity-scaled additive bonus to
 * one acceleration lane (speed or energy). All owned bonuses sum by lane into
 * the additive `1 + Σ` pool and are then hard-capped (see neurons-acceleration-
 * system: ENERGY_ACCEL_CAP / SPEED_ACCEL_CAP).
 *
 * Neuroscience lanes (OE-anchored, design.md Decision 3):
 *  - speed  → oligodendrocyte myelin / saltatory conduction / nodes of Ranvier
 *             (durable conduction velocity; Suminaite 2019 10.1002/glia.23665,
 *             Bacmeister 2022 10.1038/s41593-022-01169-4)
 *  - energy → Na+/K+-ATPase pump / mitochondria / astrocyte glycogen / lactate
 *             (endurance, NOT speed; Magistretti & Allaman 2018 10.1038/nrn.2018.19)
 *
 * Capability spec: openspec/specs/neurons-acceleration-system/spec.md
 */

/** 5-tier rarity ladder (P1 strongest → P5 negligible). */
export type EquipmentRarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export const EQUIPMENT_RARITIES: readonly EquipmentRarity[] = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
] as const

/** Which acceleration pool the bonus feeds. */
export type EquipmentLane = 'speed' | 'energy'

/**
 * Rarity-scaled additive bonus defaults (dogfood-tunable game-loop numbers,
 * NOT OE-anchored). P5 is negligible; P3-and-above is meaningful ("有感") per
 * owner intent. An item MAY override its bonus, but the validator requires the
 * override to stay within its tier's band (monotonic by rarity).
 */
export const EQUIPMENT_RARITY_BONUS: Record<EquipmentRarity, number> = {
  P1: 0.3,
  P2: 0.18,
  P3: 0.1,
  P4: 0.04,
  P5: 0.01,
} as const

/** Draw weights when a DMN draw rolls an equipment rarity (sum to 100). */
export const EQUIPMENT_RARITY_WEIGHTS: Record<EquipmentRarity, number> = {
  P1: 3,
  P2: 9,
  P3: 18,
  P4: 30,
  P5: 40,
} as const

/** Probability a single DMN draw rolls equipment (vs a consumable). Tunable. */
export const EQUIPMENT_DRAW_RATE = 0.05

export interface EquipmentDef {
  /** Stable kebab-case unique id (e.g., `eq-myelin-sheath-p1`). */
  equipmentId: string
  /** zh-TW player-facing name (≤ 16 char). */
  displayName: string
  /** zh-TW 1–2 sentence flavour blurb with neuroscience narrative anchor. */
  description: string
  /** Rarity tier — drives draw weight + bonus scaling + dex grouping. */
  rarity: EquipmentRarity
  /** Which acceleration pool this item feeds. */
  lane: EquipmentLane
  /** Additive bonus contributed to its lane's pool while owned. */
  bonus: number
  /** Sprite registry key (placeholder this change; real art via follow-up). */
  artworkId: string
}

/** Dexie row shape persisted in the `equipment` table. */
export interface OwnedEquipmentRow {
  equipmentId: string
  rarity: EquipmentRarity
  /** Epoch ms when first obtained on this save. */
  obtainedAt: number
  /** LWW field for sync (monotonic-union on presence; this stamps the merge). */
  updatedAt: number
}
