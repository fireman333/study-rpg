/**
 * DMN event dispatcher — applies the one-time effect of a drawn card.
 *
 * Branches on `eventKind`:
 *  - family-buff       → insert dmnActiveBuffs row, AP bonus while active
 *  - variant-rate-up   → insert dmnActiveBuffs row, single-consume on next slot unlock
 *  - quick-review-batch → emit `dmn.quickReviewBatchRequested` event for UI to surface
 *  - streak-shield     → set meta['dmnStreakShieldAvailable'] = true
 *  - hidden-reveal     → append next undrawn P1 cardId to meta['dmnHiddenRevealedArtworkIds']
 *
 * Idempotency: dispatcher checks `dmnEventLog` before applying; if cardId
 * already logged, no-op. The orchestrator (`dmn-fate-card.ts`) writes the log
 * entry POST commit so a race between two callers cannot double-apply.
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 */

import {
  DMN_CARD_CATALOG,
  DMN_FAMILY_BUFF_DURATION_MS,
  type DmnActiveBuffRow,
  type DmnCardRow,
} from '@study-rpg/content-neurons-tw'

import { db } from '../db'

// ─── Event bus for UI-consumed events (quick-review-batch) ──────────────────

type DmnUiEventMap = {
  'dmn.quickReviewBatchRequested': { sourceCardId: string }
}

type DmnUiListener<E extends keyof DmnUiEventMap> = (payload: DmnUiEventMap[E]) => void

class DmnUiEventEmitter {
  private listeners = new Map<keyof DmnUiEventMap, Set<DmnUiListener<keyof DmnUiEventMap>>>()

  on<E extends keyof DmnUiEventMap>(event: E, listener: DmnUiListener<E>): void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener as DmnUiListener<keyof DmnUiEventMap>)
    this.listeners.set(event, set)
  }

  off<E extends keyof DmnUiEventMap>(event: E, listener: DmnUiListener<E>): void {
    this.listeners.get(event)?.delete(listener as DmnUiListener<keyof DmnUiEventMap>)
  }

  emit<E extends keyof DmnUiEventMap>(event: E, payload: DmnUiEventMap[E]): void {
    this.listeners.get(event)?.forEach((l) => {
      try {
        ;(l as DmnUiListener<E>)(payload)
      } catch (err) {
        console.error(`[dmn-ui] listener for ${event} threw:`, err)
      }
    })
  }
}

export const dmnUiEvents = new DmnUiEventEmitter()

// ─── Meta keys for non-buff dispatch state ──────────────────────────────────

const META_STREAK_SHIELD = 'dmnStreakShieldAvailable'
const META_HIDDEN_REVEALED = 'dmnHiddenRevealedArtworkIds'

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function dispatchDmnEvent(card: DmnCardRow): Promise<void> {
  // Idempotency: skip if log row already exists. The orchestrator writes the
  // log AFTER calling dispatch (post-commit), so on a fresh draw this check
  // passes; on a duplicate dispatch (e.g., sync round-trip re-applying a
  // bundle), the log row pre-exists and we no-op.
  const existing = await db.dmnEventLog.get(card.cardId)
  if (existing !== undefined && existing.dispatchedAt < card.obtainedAt) {
    // Card was already dispatched at an earlier instant — no-op.
    console.info(`[dmn] event for ${card.cardId} already dispatched at ${existing.dispatchedAt}`)
    return
  }

  switch (card.eventKind) {
    case 'family-buff':
      await dispatchFamilyBuff(card)
      break
    case 'variant-rate-up':
      await dispatchVariantRateUp(card)
      break
    case 'quick-review-batch':
      dmnUiEvents.emit('dmn.quickReviewBatchRequested', { sourceCardId: card.cardId })
      break
    case 'streak-shield':
      await dispatchStreakShield(card)
      break
    case 'hidden-reveal':
      await dispatchHiddenReveal(card)
      break
    default: {
      // Exhaustiveness check
      const _exhaustive: never = card.eventKind
      console.warn(`[dmn] unknown eventKind: ${String(_exhaustive)}`)
    }
  }
}

// ─── Per-kind dispatchers ───────────────────────────────────────────────────

async function dispatchFamilyBuff(card: DmnCardRow): Promise<void> {
  // Pick a random family from the 11 known neuron families. Reads from
  // familyAccrual to stay agnostic of content-pack catalog.
  const families = await db.familyAccrual.toArray()
  if (families.length === 0) {
    console.warn('[dmn] family-buff: no families found; skipping')
    return
  }
  const chosen = families[Math.floor(Math.random() * families.length)]!
  const expiresAt = Date.now() + DMN_FAMILY_BUFF_DURATION_MS
  const row: DmnActiveBuffRow = {
    buffKind: 'family-buff',
    familyId: chosen.familyId,
    expiresAt,
    payload: null,
    sourceCardId: card.cardId,
  }
  await db.dmnActiveBuffs.add(row)
  console.info(
    `[dmn] family-buff activated for ${chosen.familyId} until ${new Date(expiresAt).toISOString()}`,
  )
}

async function dispatchVariantRateUp(card: DmnCardRow): Promise<void> {
  // Sentinel expiresAt = far future; consumed on next variant slot unlock.
  // We use 9999-12-31 as the "never-expires-naturally" marker; the consumer
  // (variant-gacha) will delete the row after first use.
  const row: DmnActiveBuffRow = {
    buffKind: 'variant-rate-up',
    familyId: null,
    expiresAt: 32503680000000, // year 3000 UTC ms
    payload: null,
    sourceCardId: card.cardId,
  }
  await db.dmnActiveBuffs.add(row)
  console.info('[dmn] variant-rate-up buff queued for next slot unlock')
}

async function dispatchStreakShield(card: DmnCardRow): Promise<void> {
  await db.meta.put({ key: META_STREAK_SHIELD, value: 'true' })
  console.info(`[dmn] streak-shield armed (source=${card.cardId})`)
}

// ─── Consumer-side helpers ──────────────────────────────────────────────────

/**
 * Read active `family-buff` rows matching the given familyId that haven't
 * expired. Returns the AP bonus (currently always +1 if a buff is active).
 * Caller: `connectome.recordCorrectAnswer`.
 */
export async function getActiveFamilyBuffBonus(familyId: string): Promise<number> {
  const now = Date.now()
  const buffs = await db.dmnActiveBuffs
    .where('buffKind')
    .equals('family-buff')
    .toArray()
  for (const b of buffs) {
    if (b.familyId === familyId && b.expiresAt > now) {
      return 1
    }
  }
  return 0
}

/**
 * Consume the active `variant-rate-up` buff (delete row, return true). If no
 * active variant-rate-up buff exists, return false. Caller: `variant-gacha`
 * before its weighted roll.
 */
export async function consumeVariantRateUpBuff(): Promise<boolean> {
  const buffs = await db.dmnActiveBuffs
    .where('buffKind')
    .equals('variant-rate-up')
    .toArray()
  if (buffs.length === 0) return false
  // Pick the oldest (FIFO) and delete
  const oldest = buffs.reduce((min, b) => (b.expiresAt < min.expiresAt ? b : min), buffs[0]!)
  if (oldest.id !== undefined) {
    await db.dmnActiveBuffs.delete(oldest.id)
  }
  return true
}

/**
 * Consume the streak-shield meta flag if set. Returns true if shield was
 * consumed (caller: `streak.resetCurrentStreak` — preserve streak in this
 * case). Returns false if no shield available.
 */
export async function consumeStreakShield(): Promise<boolean> {
  const row = await db.meta.get(META_STREAK_SHIELD)
  if (!row || row.value !== 'true') return false
  await db.meta.put({ key: META_STREAK_SHIELD, value: 'false' })
  console.info('[dmn] streak-shield consumed')
  return true
}

/**
 * Read the set of P1 artworkIds revealed via hidden-reveal (used by
 * DmnCollectionPage to render reduced-opacity silhouettes).
 */
export async function readHiddenRevealedArtworkIds(): Promise<Set<string>> {
  const row = await db.meta.get(META_HIDDEN_REVEALED)
  if (!row?.value) return new Set()
  return new Set(row.value.split(',').filter(Boolean))
}

async function dispatchHiddenReveal(card: DmnCardRow): Promise<void> {
  // Reveal the next undrawn P1 card's artworkId. Pick the first un-owned P1
  // entry in catalog order; if all P1s already owned or revealed, no-op.
  const ownedRows = await db.dmnCards.toArray()
  const ownedSet = new Set(ownedRows.map((r) => r.cardId))

  const existingRevealed = (await db.meta.get(META_HIDDEN_REVEALED))?.value ?? ''
  const revealedSet = new Set(existingRevealed.split(',').filter(Boolean))

  const target = DMN_CARD_CATALOG.find(
    (c) => c.rarity === 'P1' && !ownedSet.has(c.cardId) && !revealedSet.has(c.artworkId),
  )
  if (!target) {
    console.info(`[dmn] hidden-reveal: no undrawn/unrevealed P1 cards (source=${card.cardId})`)
    return
  }
  revealedSet.add(target.artworkId)
  await db.meta.put({
    key: META_HIDDEN_REVEALED,
    value: [...revealedSet].join(','),
  })
  console.info(`[dmn] hidden-reveal: spoiler hint for ${target.cardId} (source=${card.cardId})`)
}
