/**
 * Variant gacha service — listens to `connectome.variantSlotUnlocked` events
 * from the connectome service, rolls a P1-P5 rarity per slot (with slot-4 P3 /
 * slot-5 P2 floors), persists a `neuronVariants` Dexie row, and emits a
 * UI-facing `variantRolled` event for modal+toast consumption.
 *
 * Capability spec: openspec/specs/neuron-variant-gacha/spec.md
 * Borrowed from 二階 recruitment-gacha per neurons-mode Req 5.
 *
 * Idempotency: if the (familyId, slotIndex) row already exists, the handler
 * returns early — no reroll, no UI, no Dexie write. This guards against event
 * replay and dev-tool resets.
 */

import { rollGachaWithFloor, type GachaConfig } from '@study-rpg/core'
import {
  NEURON_VARIANT_CATALOG,
  VARIANT_RARITY_WEIGHTS,
  SLOT_RARITY_FLOOR,
  VARIANT_REROLL_CAP,
  composeVariantDisplayName,
  type Rarity,
  type SlotIndex,
} from '@study-rpg/content-neurons-tw'
import { db, todayISO, type NeuronVariantRow, type NeuronVariantProvenance } from '../db'
import { subscribeConnectomeEvents } from './connectome'
import { getStreaks } from './streak'
import { buildAchievementStats, triggerAchievementCheck } from './achievement'
import { consumeVariantRateUpBuff } from './dmn-event-dispatcher'

const GACHA_CONFIG: GachaConfig = {
  // rollGacha convention: tiers[0] is the LOWEST rarity (highest weight);
  // last is the HIGHEST rarity. VARIANT_RARITY_WEIGHTS already ships in that
  // order ([P5, P4, P3, P2, P1] = [60, 25, 10, 4, 1]) — DO NOT reverse, or
  // tierRank lookups invert and the floor enforcement breaks.
  tiers: VARIANT_RARITY_WEIGHTS.slice(),
  pityRules: [],
}

export interface VariantRolledPayload {
  variant: NeuronVariantRow
  apAtUnlock: number
  /** Family display name resolved at emit time from the content pack subjects list. */
  familyDisplayName: string
}

type VariantGachaEventMap = {
  variantRolled: VariantRolledPayload
}

type Listener<E extends keyof VariantGachaEventMap> = (
  payload: VariantGachaEventMap[E],
) => void

class VariantGachaEventEmitter {
  private listeners = new Map<keyof VariantGachaEventMap, Set<Listener<keyof VariantGachaEventMap>>>()

  on<E extends keyof VariantGachaEventMap>(event: E, listener: Listener<E>): void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener as Listener<keyof VariantGachaEventMap>)
    this.listeners.set(event, set)
  }

  off<E extends keyof VariantGachaEventMap>(event: E, listener: Listener<E>): void {
    this.listeners
      .get(event)
      ?.delete(listener as Listener<keyof VariantGachaEventMap>)
  }

  emit<E extends keyof VariantGachaEventMap>(
    event: E,
    payload: VariantGachaEventMap[E],
  ): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        ;(listener as Listener<E>)(payload)
      } catch (err) {
        console.error(`[variant-gacha] listener for ${event} threw:`, err)
      }
    })
  }
}

export const variantGachaEvents = new VariantGachaEventEmitter()

export interface VariantGachaSubscription {
  dispose: () => void
}

export function subscribeVariantGachaEvents(
  handlers: Partial<{
    [E in keyof VariantGachaEventMap]: Listener<E>
  }>,
): VariantGachaSubscription {
  const bound: Array<[keyof VariantGachaEventMap, Listener<keyof VariantGachaEventMap>]> = []
  for (const event of Object.keys(handlers) as Array<keyof VariantGachaEventMap>) {
    const listener = handlers[event] as Listener<typeof event> | undefined
    if (!listener) continue
    variantGachaEvents.on(event, listener)
    bound.push([event, listener as Listener<keyof VariantGachaEventMap>])
  }
  return {
    dispose: () => {
      for (const [event, listener] of bound) variantGachaEvents.off(event, listener)
    },
  }
}

interface ResolveFamilyDisplayName {
  (familyId: string): string
}

interface RollAndPersistOptions {
  /** When true, skip the `variantRolled` event emit so backfill paths don't
   *  spawn modal/toast for variants the player "already had" pre-upgrade. */
  silent?: boolean
}

async function rollAndPersist(
  familyId: string,
  slotIndex: number,
  apAtUnlock: number,
  wasRedemption: boolean,
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
  { silent = false }: RollAndPersistOptions = {},
): Promise<void> {
  const slot = slotIndex as SlotIndex
  if (!([1, 2, 3, 4, 5] as const).includes(slot)) {
    console.error(`[variant-gacha] invalid slotIndex ${slotIndex} for ${familyId}`)
    return
  }
  const catalogEntry = NEURON_VARIANT_CATALOG.find(
    (e) => e.familyId === familyId && e.slotIndex === slot,
  )
  if (!catalogEntry) {
    console.error(`[variant-gacha] no catalog entry for ${familyId}:${slotIndex}`)
    return
  }
  const floor = SLOT_RARITY_FLOOR[slot]
  const initialStats = { totalRolls: 0, rollsSinceLast: {} }
  // DMN variant-rate-up: if active, use boosted weights 20/30/30/15/5
  // (vs default 60/25/10/4/1) for this single roll. Buff is consumed
  // regardless of roll outcome.
  const variantRateUpActive = await consumeVariantRateUpBuff()
  const activeConfig = variantRateUpActive
    ? {
        ...GACHA_CONFIG,
        tiers: [
          { id: 'P5', weight: 20 },
          { id: 'P4', weight: 30 },
          { id: 'P3', weight: 30 },
          { id: 'P2', weight: 15 },
          { id: 'P1', weight: 5 },
        ],
      }
    : GACHA_CONFIG
  if (variantRateUpActive) {
    console.info('[variant-gacha] DMN variant-rate-up buff consumed; using boosted weights')
  }
  const result = rollGachaWithFloor(
    activeConfig,
    initialStats,
    floor,
    VARIANT_REROLL_CAP,
  )
  const rarity = result.tier as Rarity
  const wasPityFloor = floor !== null
  // Provenance (add-neurons-variant-provenance): stamp the study context at
  // mint. `apAtUnlock < 0` is the synthetic sentinel used by the silent
  // backfill + DEV forceUnlock paths — those rows MUST NOT fabricate context;
  // leaving `provenance` undefined renders them as 元老 / 傳承 individuals (the
  // absence-is-the-marker rule, design D1/3.2). Real unlocks always carry a
  // positive slot threshold (10/30/80/200/500). `streakAtMint` reads the streak
  // service AFTER recordCorrectAnswer's tx incremented it (event fires
  // post-commit), so it is the player's streak at the moment of mint.
  let provenance: NeuronVariantProvenance | undefined
  if (apAtUnlock >= 0) {
    const { current: streakAtMint } = await getStreaks()
    provenance = { bornAtISO: todayISO(), apAtUnlock, wasRedemption, streakAtMint }
  }
  const variantRow: NeuronVariantRow = {
    familyId,
    slotIndex,
    rarity,
    displayName: composeVariantDisplayName(catalogEntry.displayName, rarity),
    spriteKey: catalogEntry.spriteKey,
    rolledAt: Date.now(),
    wasPityFloor,
    ...(provenance ? { provenance } : {}),
  }
  let persisted = false
  await db.transaction('rw', db.neuronVariants, async () => {
    const existing = await db.neuronVariants.get([familyId, slotIndex])
    if (existing) return
    await db.neuronVariants.put(variantRow)
    persisted = true
  })
  if (persisted && !silent) {
    variantGachaEvents.emit('variantRolled', {
      variant: variantRow,
      apAtUnlock,
      familyDisplayName: resolveFamilyDisplayName(familyId),
    })
  }
}

export async function handleSlotUnlock(
  payload: { familyId: string; slotIndex: number; apAtUnlock: number; wasRedemption: boolean },
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
  options: RollAndPersistOptions = {},
): Promise<void> {
  try {
    // Pre-check idempotency outside the rolling tx to avoid wasted RNG calls.
    const existing = await db.neuronVariants.get([payload.familyId, payload.slotIndex])
    if (existing) return
    // Capture pre-state for achievement diff (only non-silent path).
    const prevStats = options.silent ? null : await buildAchievementStats()
    await rollAndPersist(
      payload.familyId,
      payload.slotIndex,
      payload.apAtUnlock,
      payload.wasRedemption,
      resolveFamilyDisplayName,
      options,
    )
    if (prevStats) {
      // Variant just persisted — check for variant / family-complete / fortune
      // category achievements. Silent backfill path skips toast pipeline entirely.
      await triggerAchievementCheck(prevStats)
    }
  } catch (err) {
    console.error(`[variant-gacha] handleSlotUnlock failed for ${payload.familyId}:${payload.slotIndex}:`, err)
  }
}

/**
 * Retroactively roll + persist variants for any slot a player has already
 * unlocked (via past AP threshold crossings) but for which no variant row
 * exists yet. Runs silently — does NOT emit `variantRolled` events, so the
 * player does not see modal/toast spam for "old" unlocks on first app boot
 * post-upgrade. Idempotent: existing variant rows are skipped.
 *
 * Returns counts for DEV-only diagnostics.
 */
export async function backfillUnlockedSlots(
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
): Promise<{ backfilled: number; skipped: number }> {
  let backfilled = 0
  let skipped = 0
  try {
    const accruals = await db.familyAccrual.toArray()
    for (const accrual of accruals) {
      for (const slotIndex of accrual.unlockedSlots) {
        const existing = await db.neuronVariants.get([accrual.familyId, slotIndex])
        if (existing) {
          skipped += 1
          continue
        }
        await handleSlotUnlock(
          // apAtUnlock: -1 → synthetic backfill; no provenance written (→ 元老).
          { familyId: accrual.familyId, slotIndex, apAtUnlock: -1, wasRedemption: false },
          resolveFamilyDisplayName,
          { silent: true },
        )
        backfilled += 1
      }
    }
    if (import.meta.env.DEV && (backfilled > 0 || skipped > 0)) {
      console.info(
        `[variant-gacha] backfill: ${backfilled} new variant${backfilled === 1 ? '' : 's'}, ${skipped} already present`,
      )
    }
  } catch (err) {
    console.error('[variant-gacha] backfillUnlockedSlots failed:', err)
  }
  return { backfilled, skipped }
}

let registered = false
let currentSubscription: ReturnType<typeof subscribeConnectomeEvents> | null = null

/**
 * Singleton registration. Calling multiple times is a no-op (the first
 * subscription persists). Pass a `resolveFamilyDisplayName` callback so the
 * service stays content-pack-agnostic.
 */
export function registerVariantGachaSubscriber(
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
): void {
  if (registered) return
  registered = true
  currentSubscription = subscribeConnectomeEvents({
    'connectome.variantSlotUnlocked': (payload) => {
      void handleSlotUnlock(payload, resolveFamilyDisplayName)
    },
  })
}

/**
 * For test / hot-reload teardown only. Production callers should not need
 * this — the singleton lives the lifetime of the page.
 */
export function disposeVariantGachaSubscriber(): void {
  currentSubscription?.dispose()
  currentSubscription = null
  registered = false
}

/* DEV-only debug handles attached to globalThis to support manual smoke tests. */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __variantGacha?: unknown }).__variantGacha = {
    peekAll: async () => db.neuronVariants.toArray(),
    peekByFamily: async (familyId: string) =>
      db.neuronVariants.where('familyId').equals(familyId).toArray(),
    countByFamily: async (familyId: string) =>
      db.neuronVariants.where('familyId').equals(familyId).count(),
    clearAll: async () => {
      await db.neuronVariants.clear()
      console.warn('[variant-gacha] DEV: cleared all neuronVariant rows')
    },
    /** Force-emit a slot-unlock event end-to-end (rolls + persists + UI). */
    forceUnlock: async (familyId: string, slotIndex: number, resolve: ResolveFamilyDisplayName) => {
      // apAtUnlock: -1 → synthetic; no provenance written (→ 元老 in dex).
      await handleSlotUnlock({ familyId, slotIndex, apAtUnlock: -1, wasRedemption: false }, resolve)
    },
  }
}
