/**
 * DMN fate-card draw orchestrator (add-neurons-acceleration-system).
 *
 * Each draw yields ONE of two forms (single acquisition channel, design D1):
 *  - low-probability PERMANENT equipment (EQUIPMENT_DRAW_RATE ≈ 5% vs the
 *    unowned equipment pool) → rarity-weighted P1–P5 → `equipment` table
 *  - else a REPEATABLE CONSUMABLE card → `inventory` backpack stock (+ a `dmnCards`
 *    dex row on first-seen only). NO auto-fire; activated from the backpack later.
 *
 * Algorithm (make-neurons-dmn-consumables-repeatable):
 * 1. Roll equipment branch ONLY when unowned equipment remains: rng() <
 *    EQUIPMENT_DRAW_RATE AND unowned equipment pool non-empty → award equipment.
 * 2. Otherwise a consumable (selected across the FULL catalog — duplicates allowed).
 *    Consumables NEVER exhaust, so a draw with a ticket always produces something.
 * 3. Inside one tx: re-check entitlement (derived grants − consumes), bump consumes,
 *    re-derive dmnDrawsAvailable, deposit +1 backpack stock; write the dmnCards dex
 *    row ONLY when first-seen.
 * 4. Consumable first-seen: append a dmnEventLog provenance row post-commit (NO
 *    dispatch). A duplicate returns { duplicate: true } and skips dex + provenance.
 * 5. Returns null ONLY when no entitlement (consumables never exhaust).
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 *                  openspec/specs/neurons-acceleration-system/spec.md
 */

import {
  DMN_CARD_CATALOG,
  DMN_RARITIES,
  DMN_RARITY_WEIGHTS,
  EQUIPMENT_CATALOG,
  EQUIPMENT_DRAW_RATE,
  EQUIPMENT_RARITIES,
  EQUIPMENT_RARITY_WEIGHTS,
  type DmnCardDef,
  type DmnCardRow,
  type DmnRarity,
  type EquipmentDef,
  type EquipmentRarity,
  type OwnedEquipmentRow,
} from '@study-rpg/content-neurons-tw'

import { db } from '../db'
import { getClientId } from '../sync/r2/bundles'
import { deriveDrawsAvailable } from './dmn-entitlement'
import { readSeededGrantsTotal } from './dmn-trigger'

const META_KEY_DRAWS = 'dmnDrawsAvailable'
const META_KEY_GRANTS = 'dmnGrantsTotal'
const META_KEY_LIFETIME = 'dmnLifetimeDrawsConsumed'

function parseIntSafe(v: string | undefined): number {
  if (!v) return 0
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

// ─── Consumable card selection (weighted by P1–P4 tier) ─────────────────────

function pickRarity(rng: () => number = Math.random): DmnRarity {
  const total = DMN_RARITIES.reduce((s, r) => s + DMN_RARITY_WEIGHTS[r], 0)
  const target = rng() * total
  let acc = 0
  for (const rarity of DMN_RARITIES) {
    acc += DMN_RARITY_WEIGHTS[rarity]
    if (target < acc) return rarity
  }
  return DMN_RARITIES[DMN_RARITIES.length - 1]!
}

// Tier rank: P1 = 1 (rarest) → P4 = 4 (most common). Lower = rarer.
function rarityOrder(r: DmnRarity): number {
  return { P1: 1, P2: 2, P3: 3, P4: 4 }[r]
}

// Consumables are REPEATABLE (make-neurons-dmn-consumables-repeatable): select
// across the FULL 22-card catalog weighted by rarity — drawing a card already in
// the dex is allowed and just adds backpack stock. Always returns a card.
function selectCardFromPool(rng: () => number = Math.random): DmnCardDef {
  const byRarity: Record<DmnRarity, DmnCardDef[]> = { P1: [], P2: [], P3: [], P4: [] }
  for (const card of DMN_CARD_CATALOG) byRarity[card.rarity].push(card)

  const target = pickRarity(rng)
  if (byRarity[target].length > 0) {
    const idx = Math.floor(rng() * byRarity[target].length)
    return byRarity[target][idx]!
  }

  // Fallback: walk rarity ladder, nearest tier first (defensive — every tier is
  // populated in the 22-card catalog, so the direct pick above normally returns).
  const ranked = [...DMN_RARITIES].sort(
    (a, b) =>
      Math.abs(rarityOrder(a) - rarityOrder(target)) -
      Math.abs(rarityOrder(b) - rarityOrder(target)),
  )
  for (const candidate of ranked) {
    if (byRarity[candidate].length > 0) {
      const idx = Math.floor(rng() * byRarity[candidate].length)
      return byRarity[candidate][idx]!
    }
  }
  return DMN_CARD_CATALOG[0]!
}

// ─── Permanent equipment selection (weighted by P1–P5 rarity) ───────────────

function equipmentRarityOrder(r: EquipmentRarity): number {
  return { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }[r]
}

function pickEquipmentRarity(rng: () => number = Math.random): EquipmentRarity {
  const total = EQUIPMENT_RARITIES.reduce((s, r) => s + EQUIPMENT_RARITY_WEIGHTS[r], 0)
  const target = rng() * total
  let acc = 0
  for (const rarity of EQUIPMENT_RARITIES) {
    acc += EQUIPMENT_RARITY_WEIGHTS[rarity]
    if (target < acc) return rarity
  }
  return EQUIPMENT_RARITIES[EQUIPMENT_RARITIES.length - 1]!
}

function selectEquipmentFromPool(
  ownedEquipmentIds: Set<string>,
  rng: () => number = Math.random,
): EquipmentDef | null {
  const unowned = EQUIPMENT_CATALOG.filter((e) => !ownedEquipmentIds.has(e.equipmentId))
  if (unowned.length === 0) return null

  const byRarity = new Map<EquipmentRarity, EquipmentDef[]>()
  for (const r of EQUIPMENT_RARITIES) byRarity.set(r, [])
  for (const e of unowned) byRarity.get(e.rarity)!.push(e)

  const target = pickEquipmentRarity(rng)
  const direct = byRarity.get(target)!
  if (direct.length > 0) return direct[Math.floor(rng() * direct.length)]!

  // Nearest-unowned fallback: closest tier first.
  const ranked = [...EQUIPMENT_RARITIES].sort(
    (a, b) =>
      Math.abs(equipmentRarityOrder(a) - equipmentRarityOrder(target)) -
      Math.abs(equipmentRarityOrder(b) - equipmentRarityOrder(target)),
  )
  for (const candidate of ranked) {
    const pool = byRarity.get(candidate)!
    if (pool.length > 0) return pool[Math.floor(rng() * pool.length)]!
  }
  return null
}

// ─── Draw result ────────────────────────────────────────────────────────────

export type DrawDmnCardResult =
  | { kind: 'consumable'; card: DmnCardRow; catalog: DmnCardDef; duplicate: boolean }
  | { kind: 'equipment'; equipment: OwnedEquipmentRow; def: EquipmentDef }

/**
 * Pull a draw from `dmnDrawsAvailable`. Yields either a permanent owned-once
 * equipment (low probability) or a REPEATABLE consumable (deposited to the
 * backpack — NO auto-fire; a duplicate just adds stock). Returns null ONLY when
 * no draws are available (consumables never exhaust). `rng` is injectable.
 */
export async function drawDmnCard(
  rng: () => number = Math.random,
): Promise<DrawDmnCardResult | null> {
  const ownedEquipRows = await db.equipment.toArray()
  const ownedEquipSet = new Set(ownedEquipRows.map((r) => r.equipmentId))
  const unownedEquipCount = EQUIPMENT_CATALOG.length - ownedEquipSet.size

  // Equipment is a low-probability owned-once branch, rolled ONLY when unowned
  // equipment remains. Otherwise a (possibly duplicate) consumable — consumables
  // are repeatable, so a draw with a ticket always produces something.
  const wantEquipment = rng() < EQUIPMENT_DRAW_RATE && unownedEquipCount > 0
  if (wantEquipment) {
    return await drawEquipment_(ownedEquipSet, rng)
  }
  return await drawConsumable_(rng)
}

async function drawEquipment_(
  ownedEquipSet: Set<string>,
  rng: () => number,
): Promise<DrawDmnCardResult | null> {
  const def = selectEquipmentFromPool(ownedEquipSet, rng)
  if (def === null) return null

  const obtainedAt = Date.now()
  const row: OwnedEquipmentRow = {
    equipmentId: def.equipmentId,
    rarity: def.rarity,
    obtainedAt,
    updatedAt: obtainedAt,
  }

  let consumed = false
  await db.transaction('rw', db.meta, db.equipment, async () => {
    // Entitlement = derived pool (grants − consumes); re-check race-safe in-tx.
    const grants = await readSeededGrantsTotal()
    const consumes = parseIntSafe((await db.meta.get(META_KEY_LIFETIME))?.value)
    if (deriveDrawsAvailable(grants, consumes) < 1) return
    if ((await db.equipment.get(def.equipmentId)) !== undefined) return // race-safe
    await db.equipment.put(row)
    const newConsumes = consumes + 1
    await db.meta.put({ key: META_KEY_LIFETIME, value: String(newConsumes) })
    await db.meta.put({ key: META_KEY_GRANTS, value: String(grants) }) // materialize counter
    await db.meta.put({ key: META_KEY_DRAWS, value: String(deriveDrawsAvailable(grants, newConsumes)) })
    consumed = true
  })

  if (!consumed) {
    console.info('[dmn] equipment draw aborted (no entitlement or race-loss)')
    return null
  }
  return { kind: 'equipment', equipment: row, def }
}

async function drawConsumable_(
  rng: () => number,
): Promise<DrawDmnCardResult | null> {
  const catalogEntry = selectCardFromPool(rng)

  const obtainedAt = Date.now()
  const cardRow: DmnCardRow = {
    cardId: catalogEntry.cardId,
    rarity: catalogEntry.rarity,
    eventKind: catalogEntry.eventKind,
    artworkId: catalogEntry.artworkId,
    displayName: catalogEntry.displayName,
    obtainedAt,
  }

  let consumed = false
  let isNew = false
  await db.transaction('rw', db.meta, db.dmnCards, db.inventory, async () => {
    // Entitlement = derived pool (grants − consumes); re-check race-safe in-tx.
    const grants = await readSeededGrantsTotal()
    const consumes = parseIntSafe((await db.meta.get(META_KEY_LIFETIME))?.value)
    if (deriveDrawsAvailable(grants, consumes) < 1) return // no entitlement
    // REPEATABLE: a duplicate consumable still spends a ticket + adds stock, but
    // does NOT re-write the dex row (preserve the first-seen obtainedAt).
    isNew = (await db.dmnCards.get(cardRow.cardId)) === undefined
    if (isNew) await db.dmnCards.put(cardRow)
    const newConsumes = consumes + 1
    await db.meta.put({ key: META_KEY_LIFETIME, value: String(newConsumes) })
    await db.meta.put({ key: META_KEY_GRANTS, value: String(grants) }) // materialize counter
    await db.meta.put({ key: META_KEY_DRAWS, value: String(deriveDrawsAvailable(grants, newConsumes)) })
    // Deposit stock to the backpack (manual-activate; NO auto-fire). Unbounded.
    const existing = await db.inventory.get(catalogEntry.eventKind)
    await db.inventory.put({
      kind: catalogEntry.eventKind,
      count: (existing?.count ?? 0) + 1,
      updatedAt: obtainedAt,
    })
    consumed = true
  })

  if (!consumed) {
    console.info('[dmn] draw aborted (no entitlement); returning null')
    return null
  }

  // Post-commit provenance log ONLY for a first-seen card (synced, monotonic-union;
  // NO effect dispatch). A duplicate draw preserves the at-most-once provenance row.
  if (isNew) {
    try {
      await db.dmnEventLog.put({
        cardId: cardRow.cardId,
        dispatchedAt: obtainedAt,
        deviceId: getClientId(),
      })
    } catch (err) {
      console.error('[dmn] post-commit eventLog write failed (card persisted):', err)
    }
  }

  return { kind: 'consumable', card: cardRow, catalog: catalogEntry, duplicate: !isNew }
}
