/**
 * Build-time validator for the DMN fate-card catalog.
 *
 * Rules (per spec Req "DMN catalog build-time validator SHALL reject invalid catalogs"):
 * 1. Catalog size === 20
 * 2. Rarity distribution === 2/4/6/8 across P1/P2/P3/P4
 * 3. cardId values globally unique
 * 4. Every entry MUST have non-empty required fields (cardId / displayName / description / rarity / eventKind / artworkId)
 * 5. rarity ∈ DMN_RARITIES
 * 6. eventKind ∈ DMN_EVENT_TYPES
 * 7. Each eventKind appears in ≥ 3 catalog entries (avoid unreachable event types)
 *
 * Throws Error aggregating all failures. Caller wires into the package build
 * script + smoke fixture (scripts/verify-dmn-validator.ts).
 */

import {
  DMN_EVENT_TYPES,
  DMN_RARITIES,
  type DmnCardDef,
  type DmnEventKind,
  type DmnRarity,
} from './dmn-types'

export interface ValidationFailure {
  rule: string
  entryId?: string
  message: string
}

export const EXPECTED_CATALOG_SIZE = 20

export const EXPECTED_RARITY_DISTRIBUTION: Record<DmnRarity, number> = {
  P1: 2,
  P2: 4,
  P3: 6,
  P4: 8,
} as const

export const MIN_CARDS_PER_EVENT_KIND = 3

export function validateDmnCardCatalog(catalog: readonly DmnCardDef[]): void {
  const failures: ValidationFailure[] = []

  // R1: catalog size
  if (catalog.length !== EXPECTED_CATALOG_SIZE) {
    failures.push({
      rule: 'WRONG_CATALOG_SIZE',
      message: `catalog size must equal ${EXPECTED_CATALOG_SIZE}, got ${catalog.length}`,
    })
  }

  // R2: rarity distribution
  const rarityCount: Record<string, number> = {}
  for (const c of catalog) {
    rarityCount[c.rarity] = (rarityCount[c.rarity] ?? 0) + 1
  }
  for (const rarity of DMN_RARITIES) {
    const got = rarityCount[rarity] ?? 0
    const expected = EXPECTED_RARITY_DISTRIBUTION[rarity]
    if (got !== expected) {
      failures.push({
        rule: 'WRONG_RARITY_DISTRIBUTION',
        message: `rarity ${rarity} expected ${expected} entries, got ${got}`,
      })
    }
  }

  // R3: id uniqueness
  const seen = new Map<string, number>()
  for (const c of catalog) {
    seen.set(c.cardId, (seen.get(c.cardId) ?? 0) + 1)
  }
  for (const [id, count] of seen.entries()) {
    if (count > 1) {
      failures.push({
        rule: 'DUPLICATE_ID',
        entryId: id,
        message: `cardId "${id}" appears ${count} times — ids must be globally unique`,
      })
    }
  }

  // R4 + R5 + R6: required fields + enum membership
  const allowedRarities = new Set<string>(DMN_RARITIES)
  const allowedEvents = new Set<string>(DMN_EVENT_TYPES)
  for (const c of catalog) {
    if (!c.cardId || c.cardId.trim().length === 0) {
      failures.push({ rule: 'MISSING_ID', message: 'entry has empty cardId' })
    }
    if (!c.displayName || c.displayName.trim().length === 0) {
      failures.push({
        rule: 'MISSING_DISPLAY_NAME',
        entryId: c.cardId,
        message: `cardId "${c.cardId}" has empty displayName`,
      })
    }
    if (!c.description || c.description.trim().length === 0) {
      failures.push({
        rule: 'MISSING_DESCRIPTION',
        entryId: c.cardId,
        message: `cardId "${c.cardId}" has empty description`,
      })
    }
    if (!c.artworkId || c.artworkId.trim().length === 0) {
      failures.push({
        rule: 'MISSING_ARTWORK_ID',
        entryId: c.cardId,
        message: `cardId "${c.cardId}" has empty artworkId`,
      })
    }
    if (!allowedRarities.has(c.rarity)) {
      failures.push({
        rule: 'INVALID_RARITY',
        entryId: c.cardId,
        message: `cardId "${c.cardId}" has invalid rarity "${c.rarity}"`,
      })
    }
    if (!allowedEvents.has(c.eventKind)) {
      failures.push({
        rule: 'INVALID_EVENT_KIND',
        entryId: c.cardId,
        message: `cardId "${c.cardId}" has invalid eventKind "${c.eventKind}"`,
      })
    }
  }

  // R7: each eventKind has ≥ MIN_CARDS_PER_EVENT_KIND entries
  const eventCount: Record<string, number> = {}
  for (const c of catalog) {
    eventCount[c.eventKind] = (eventCount[c.eventKind] ?? 0) + 1
  }
  for (const kind of DMN_EVENT_TYPES) {
    const got = eventCount[kind] ?? 0
    if (got < MIN_CARDS_PER_EVENT_KIND) {
      failures.push({
        rule: 'UNREACHABLE_EVENT_KIND',
        message: `eventKind "${kind}" has only ${got} card(s); minimum is ${MIN_CARDS_PER_EVENT_KIND} (avoid unreachable event types)`,
      })
    }
  }

  if (failures.length > 0) {
    const lines = failures.map((f) => `  - [${f.rule}] ${f.message}`)
    throw new Error(
      `DMN fate-card catalog validation failed (${failures.length} violation${
        failures.length === 1 ? '' : 's'
      }):\n${lines.join('\n')}`,
    )
  }
}

/** Helper used by tests / smoke fixtures — counts cards per eventKind. */
export function countByEventKind(catalog: readonly DmnCardDef[]): Record<DmnEventKind, number> {
  const out = Object.fromEntries(DMN_EVENT_TYPES.map((k) => [k, 0])) as Record<DmnEventKind, number>
  for (const c of catalog) out[c.eventKind] += 1
  return out
}
