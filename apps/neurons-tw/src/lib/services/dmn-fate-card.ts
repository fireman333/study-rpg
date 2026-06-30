/**
 * DMN fate-card draw orchestrator (add-neurons-acceleration-system).
 *
 * Each draw yields ONE of two forms (single acquisition channel, design D1):
 *  - low-probability PERMANENT equipment (EQUIPMENT_DRAW_RATE ≈ 5% vs the
 *    unowned equipment pool) → rarity-weighted P1–P5 → `equipment` table
 *  - else a CONSUMABLE card → `dmnCards` dex row + `inventory` backpack stock
 *    (NO auto-fire; the player activates from the backpack later)
 *
 * Algorithm:
 * 1. Pre-check draws ≥ 1 + load owned consumable + owned equipment sets
 * 2. Roll equipment branch: rng() < EQUIPMENT_DRAW_RATE AND unowned equipment
 *    pool non-empty → award equipment; else consumable. If the chosen branch's
 *    pool is empty, fall through to the other; if BOTH empty → null (no entitlement
 *    consumed).
 * 3. Inside one tx: re-check entitlement, persist the award, decrement
 *    dmnDrawsAvailable, bump the lifetime counter (+ deposit consumable stock)
 * 4. Consumable: append a dmnEventLog provenance row post-commit (NO dispatch)
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

function selectCardFromPool(
  ownedCardIds: Set<string>,
  rng: () => number = Math.random,
): DmnCardDef | null {
  const unowned = DMN_CARD_CATALOG.filter((c) => !ownedCardIds.has(c.cardId))
  if (unowned.length === 0) return null

  const byRarity: Record<DmnRarity, DmnCardDef[]> = { P1: [], P2: [], P3: [], P4: [] }
  for (const card of unowned) byRarity[card.rarity].push(card)

  const target = pickRarity(rng)
  if (byRarity[target].length > 0) {
    const idx = Math.floor(rng() * byRarity[target].length)
    return byRarity[target][idx]!
  }

  // Fallback: walk rarity ladder, nearest tier first.
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
  return null
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
  | { kind: 'consumable'; card: DmnCardRow; catalog: DmnCardDef }
  | { kind: 'equipment'; equipment: OwnedEquipmentRow; def: EquipmentDef }

/**
 * Pull a draw from `dmnDrawsAvailable`. Yields either a permanent equipment or a
 * consumable (deposited to the backpack — NO auto-fire). Returns null if no
 * draws available or BOTH pools are fully owned. `rng` is injectable for tests.
 */
export async function drawDmnCard(
  rng: () => number = Math.random,
): Promise<DrawDmnCardResult | null> {
  const ownedCardRows = await db.dmnCards.toArray()
  const ownedEquipRows = await db.equipment.toArray()
  const ownedCardSet = new Set(ownedCardRows.map((r) => r.cardId))
  const ownedEquipSet = new Set(ownedEquipRows.map((r) => r.equipmentId))

  const unownedEquipCount = EQUIPMENT_CATALOG.length - ownedEquipSet.size
  const unownedCardCount = DMN_CARD_CATALOG.length - ownedCardSet.size
  if (unownedEquipCount === 0 && unownedCardCount === 0) {
    console.info('[dmn] all consumables + equipment owned — no further draws possible')
    return null
  }

  // Branch: low-prob equipment vs consumable. Fall through to the other pool if
  // the chosen one is exhausted.
  const wantEquipment = rng() < EQUIPMENT_DRAW_RATE && unownedEquipCount > 0
  const drawEquipment = wantEquipment || unownedCardCount === 0

  if (drawEquipment) {
    return await drawEquipment_(ownedEquipSet, rng)
  }
  return await drawConsumable_(ownedCardSet, rng)
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
  ownedCardSet: Set<string>,
  rng: () => number,
): Promise<DrawDmnCardResult | null> {
  const catalogEntry = selectCardFromPool(ownedCardSet, rng)
  if (catalogEntry === null) return null

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
  await db.transaction('rw', db.meta, db.dmnCards, db.inventory, async () => {
    // Entitlement = derived pool (grants − consumes); re-check race-safe in-tx.
    const grants = await readSeededGrantsTotal()
    const consumes = parseIntSafe((await db.meta.get(META_KEY_LIFETIME))?.value)
    if (deriveDrawsAvailable(grants, consumes) < 1) return // race-safe re-check
    if ((await db.dmnCards.get(cardRow.cardId)) !== undefined) return // race-safe
    await db.dmnCards.put(cardRow)
    const newConsumes = consumes + 1
    await db.meta.put({ key: META_KEY_LIFETIME, value: String(newConsumes) })
    await db.meta.put({ key: META_KEY_GRANTS, value: String(grants) }) // materialize counter
    await db.meta.put({ key: META_KEY_DRAWS, value: String(deriveDrawsAvailable(grants, newConsumes)) })
    // Deposit stock to the backpack (manual-activate; NO auto-fire).
    const existing = await db.inventory.get(catalogEntry.eventKind)
    await db.inventory.put({
      kind: catalogEntry.eventKind,
      count: (existing?.count ?? 0) + 1,
      updatedAt: obtainedAt,
    })
    consumed = true
  })

  if (!consumed) {
    console.info('[dmn] draw aborted (no entitlement or race-loss); returning null')
    return null
  }

  // Post-commit provenance log (synced, monotonic-union; NO effect dispatch —
  // the effect fires on backpack activation).
  try {
    await db.dmnEventLog.put({
      cardId: cardRow.cardId,
      dispatchedAt: obtainedAt,
      deviceId: getClientId(),
    })
  } catch (err) {
    console.error('[dmn] post-commit eventLog write failed (card persisted):', err)
  }

  return { kind: 'consumable', card: cardRow, catalog: catalogEntry }
}
