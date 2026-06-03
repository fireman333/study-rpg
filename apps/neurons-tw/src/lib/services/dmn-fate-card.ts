/**
 * DMN fate-card draw orchestrator.
 *
 * Algorithm (per spec Req "Drawing a DMN card SHALL produce exactly one new
 * dmnCard row + one event dispatch + permanent collection entry"):
 * 1. Pre-check: `dmnDrawsAvailable >= 1` (else return null)
 * 2. Compute un-owned pool grouped by rarity
 * 3. Weighted-pick a rarity (P1/P2/P3/P4 weights 2/10/30/58)
 *    — if picked rarity exhausted in pool, fall back to next-highest available
 * 4. Uniform-pick a cardId from that rarity's un-owned subset
 * 5. Inside one tx: decrement dmnDrawsAvailable, insert dmnCards row,
 *    bump lifetime counter
 * 6. After commit: dispatch the card's event via dmn-event-dispatcher.ts
 * 7. Append dmnEventLog row (idempotency guard for cross-device sync)
 * 8. Return the rolled card (caller pushes to UI toast/modal queue)
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 */

import {
  DMN_CARD_CATALOG,
  DMN_RARITIES,
  DMN_RARITY_WEIGHTS,
  type DmnCardDef,
  type DmnCardRow,
  type DmnRarity,
} from '@study-rpg/content-neurons-tw'

import { db } from '../db'
import { dispatchDmnEvent } from './dmn-event-dispatcher'
import { getClientId } from '../sync/r2/bundles'

const META_KEY_DRAWS = 'dmnDrawsAvailable'
const META_KEY_LIFETIME = 'dmnLifetimeDrawsConsumed'

function parseIntSafe(v: string | undefined): number {
  if (!v) return 0
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

// Weighted random pick across the 4 rarity tiers.
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

/**
 * Pick a card from un-owned pool. Strategy:
 * - Roll rarity by weight
 * - If that rarity's un-owned subset is empty, walk down the ladder (rarer
 *   first if rolled rarity was common, else fall to next rarity) — guarantees
 *   we always return a card while pool is non-empty
 */
function selectCardFromPool(
  ownedCardIds: Set<string>,
  rng: () => number = Math.random,
): DmnCardDef | null {
  const unowned = DMN_CARD_CATALOG.filter((c) => !ownedCardIds.has(c.cardId))
  if (unowned.length === 0) return null

  const byRarity: Record<DmnRarity, DmnCardDef[]> = {
    P1: [],
    P2: [],
    P3: [],
    P4: [],
  }
  for (const card of unowned) byRarity[card.rarity].push(card)

  // First try the rolled rarity
  let target = pickRarity(rng)
  if (byRarity[target].length > 0) {
    const idx = Math.floor(rng() * byRarity[target].length)
    return byRarity[target][idx]!
  }

  // Fallback: walk rarity ladder. Try rarer tiers first (player gets a
  // pleasant surprise when "their" tier is exhausted), then walk down.
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

export interface DrawDmnCardResult {
  card: DmnCardRow
  catalog: DmnCardDef
}

/**
 * Pull a draw from `dmnDrawsAvailable`, persist + dispatch + log. Returns the
 * card + its catalog entry, or null if no draws available / collection
 * complete.
 *
 * Caller (UI) is responsible for showing reveal modal/toast based on rarity.
 */
export async function drawDmnCard(): Promise<DrawDmnCardResult | null> {
  // Pre-check available draws + load owned set (outside tx to keep tx small)
  const ownedRows = await db.dmnCards.toArray()
  if (ownedRows.length >= DMN_CARD_CATALOG.length) {
    console.info('[dmn] collection complete — no further draws possible')
    return null
  }

  const ownedSet = new Set(ownedRows.map((r) => r.cardId))
  const catalogEntry = selectCardFromPool(ownedSet)
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
  await db.transaction('rw', db.meta, db.dmnCards, async () => {
    const available = parseIntSafe((await db.meta.get(META_KEY_DRAWS))?.value)
    if (available < 1) return // race-safe re-check
    // Double-check still un-owned (race-safe)
    if ((await db.dmnCards.get(cardRow.cardId)) !== undefined) return
    await db.dmnCards.put(cardRow)
    await db.meta.put({ key: META_KEY_DRAWS, value: String(available - 1) })
    const lifetime = parseIntSafe((await db.meta.get(META_KEY_LIFETIME))?.value)
    await db.meta.put({ key: META_KEY_LIFETIME, value: String(lifetime + 1) })
    consumed = true
  })

  if (!consumed) {
    console.info('[dmn] draw aborted (no entitlement or race-loss); returning null')
    return null
  }

  // Post-commit side effects: log + dispatch event.
  try {
    await db.dmnEventLog.put({
      cardId: cardRow.cardId,
      dispatchedAt: obtainedAt,
      deviceId: getClientId(),
    })
    await dispatchDmnEvent(cardRow)
  } catch (err) {
    console.error('[dmn] post-commit dispatch failed (card persisted):', err)
  }

  return { card: cardRow, catalog: catalogEntry }
}
