/**
 * DMN consumable effect applier (add-neurons-acceleration-system).
 *
 * Branches on `eventKind`. This is the ACTIVATION applier — the player activates
 * a consumable from the backpack (`inventory.activateConsumable`); the DRAW path
 * no longer fires effects (it deposits stock — see dmn-fate-card.ts). There is
 * therefore NO cardId-keyed idempotency here: each activation is a deliberate
 * action gated by the backpack stock decrement.
 *  - family-buff        → insert dmnActiveBuffs row, family-scoped energy bonus while active
 *  - surge              → insert dmnActiveBuffs row, global speed bonus while active
 *  - bolus              → insert dmnActiveBuffs row, global energy bonus while active
 *  - variant-rate-up    → insert dmnActiveBuffs row, single-consume on next slot unlock
 *  - quick-review-batch → emit `dmn.quickReviewBatchRequested` event for UI to surface
 *  - hidden-reveal      → append next undrawn P1 cardId to meta['dmnHiddenRevealedArtworkIds']
 *  (streak-shield removed — integrity; add-neurons-acceleration-system)
 *
 * The additive bonus + lane each active buff contributes to the acceleration
 * pools is derived from `buffKind` in `acceleration.ts` (energyAccel/speedAccel).
 *
 * Capability spec: openspec/specs/neurons-acceleration-system/spec.md
 */

import {
  DMN_CARD_CATALOG,
  DMN_FAMILY_BUFF_DURATION_MS,
  type DmnActiveBuffRow,
  type DmnEventKind,
} from '@study-rpg/content-neurons-tw'

import { db } from '../db'
import { CONSUMABLE_BOOSTS } from './acceleration'

// ─── Event bus for UI-consumed events (quick-review-batch) ──────────────────

type DmnUiEventMap = {
  // Applier → toast: a quick-review-batch consumable was activated (arm the CTA).
  'dmn.quickReviewBatchRequested': { sourceCardId: string }
  // Toast → OverviewPage: player tapped the CTA; open a 5-question 出征 mini-batch.
  'dmn.quickReviewStart': Record<string, never>
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

// ─── Meta keys for non-buff applier state ───────────────────────────────────

const META_HIDDEN_REVEALED = 'dmnHiddenRevealedArtworkIds'

// ─── Applier ────────────────────────────────────────────────────────────────

/**
 * Apply one consumable's effect, by kind. Called from the backpack on activation
 * (`inventory.activateConsumable`). `sourceCardId` is provenance stamped onto any
 * resulting active-buff row (a synthetic `activate:<kind>:<ts>` id when activated
 * from stock rather than tied to one collected card).
 */
export async function applyConsumableEffect(
  kind: DmnEventKind,
  sourceCardId: string,
): Promise<void> {
  switch (kind) {
    case 'family-buff':
      await applyFamilyBuff(sourceCardId)
      break
    case 'variant-rate-up':
      await applyVariantRateUp(sourceCardId)
      break
    case 'quick-review-batch':
      dmnUiEvents.emit('dmn.quickReviewBatchRequested', { sourceCardId })
      break
    case 'surge':
    case 'bolus':
      await applyTimedConsumable(kind, sourceCardId)
      break
    case 'hidden-reveal':
      await applyHiddenReveal(sourceCardId)
      break
    default: {
      // Exhaustiveness check
      const _exhaustive: never = kind
      console.warn(`[dmn] unknown eventKind: ${String(_exhaustive)}`)
    }
  }
}

// ─── Per-kind appliers ──────────────────────────────────────────────────────

async function applyFamilyBuff(sourceCardId: string): Promise<void> {
  // Pick a random family from the known neuron families. Reads from
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
    sourceCardId,
  }
  await db.dmnActiveBuffs.add(row)
  console.info(
    `[dmn] family-buff activated for ${chosen.familyId} until ${new Date(expiresAt).toISOString()}`,
  )
}

async function applyVariantRateUp(sourceCardId: string): Promise<void> {
  // Sentinel expiresAt = far future; consumed on next variant slot unlock.
  // The consumer (variant-gacha) deletes the row after first use.
  const row: DmnActiveBuffRow = {
    buffKind: 'variant-rate-up',
    familyId: null,
    expiresAt: 32503680000000, // year 3000 UTC ms
    payload: null,
    sourceCardId,
  }
  await db.dmnActiveBuffs.add(row)
  console.info('[dmn] variant-rate-up buff queued for next slot unlock')
}

/**
 * surge / bolus → insert a timed dmnActiveBuffs row. The additive bonus + lane
 * are derived from `CONSUMABLE_BOOSTS[buffKind]` in the acceleration engine;
 * here we only stamp the kind + expiry. surge/bolus are global (familyId null).
 */
async function applyTimedConsumable(
  kind: 'surge' | 'bolus',
  sourceCardId: string,
): Promise<void> {
  const spec = CONSUMABLE_BOOSTS[kind]
  if (!spec) {
    console.warn(`[dmn] no consumable boost spec for ${kind}; skipping`)
    return
  }
  const expiresAt = Date.now() + spec.durationMs
  const row: DmnActiveBuffRow = {
    buffKind: kind,
    familyId: null,
    expiresAt,
    payload: null,
    sourceCardId,
  }
  await db.dmnActiveBuffs.add(row)
  console.info(`[dmn] ${kind} activated until ${new Date(expiresAt).toISOString()}`)
}

// ─── Consumer-side helpers ──────────────────────────────────────────────────

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
 * Read the set of P1 artworkIds revealed via hidden-reveal (used by
 * DmnCollectionPage to render reduced-opacity silhouettes).
 */
export async function readHiddenRevealedArtworkIds(): Promise<Set<string>> {
  const row = await db.meta.get(META_HIDDEN_REVEALED)
  if (!row?.value) return new Set()
  return new Set(row.value.split(',').filter(Boolean))
}

async function applyHiddenReveal(sourceCardId: string): Promise<void> {
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
    console.info(`[dmn] hidden-reveal: no undrawn/unrevealed P1 cards (source=${sourceCardId})`)
    return
  }
  revealedSet.add(target.artworkId)
  await db.meta.put({
    key: META_HIDDEN_REVEALED,
    value: [...revealedSet].join(','),
  })
  console.info(`[dmn] hidden-reveal: spoiler hint for ${target.cardId} (source=${sourceCardId})`)
}
