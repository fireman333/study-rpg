/**
 * Variant gacha service (Collection 2.0) — player-initiated, currency-gated,
 * per-family PULL. This is the ONLY mechanism that creates `neuronVariants` rows
 * (the pre-gacha AP-slot-unlock subscriber + backfill are gone).
 *
 * Capability spec: openspec/specs/neuron-variant-gacha/spec.md
 *
 * A pull: require balance ≥ PULL_COST and family not fully collected → in one tx
 * spend PULL_COST, bump familyAccrual.pullCount (the P0 soft-pity clock), roll a
 * rarity (P0 soft-pity applied; P0 excluded once owned), resolve the (family,
 * rarity) catalog variant, then persist a new row (copies=1, provenance stamped)
 * or increment `copies` on a dupe. The reveal (`variantRolled`) fires post-commit.
 */

import {
  NEURON_VARIANT_CATALOG,
  PULL_COST,
  P0_PITY_START,
  composeVariantDisplayName,
  rollRarityWithP0Pity,
  type NeuronVariantDef,
  type Rarity,
} from '@study-rpg/content-neurons-tw'
import { db, todayISO, type NeuronVariantRow, type NeuronVariantProvenance } from '../db'
import { emitVariantCollected } from './connectome'
import { getStreaks } from './streak'
import { buildAchievementStats, triggerAchievementCheck } from './achievement'
import { consumeVariantRateUpBuff } from './dmn-event-dispatcher'
import { readBalance, spendEnergyInTx } from './currency'

/** Rarity rank for "take the rarer" (P0 rarest = 0). */
const RARITY_RANK: Record<Rarity, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }

const CATALOG_BY_FAMILY = new Map<string, NeuronVariantDef[]>()
for (const def of NEURON_VARIANT_CATALOG) {
  const list = CATALOG_BY_FAMILY.get(def.familyId) ?? []
  list.push(def)
  CATALOG_BY_FAMILY.set(def.familyId, list)
}

/**
 * The family's pyramid total (closed cap) — derived from the catalog, never a
 * hardcoded literal. A family is "fully collected" at this count.
 */
export function slotsForFamily(familyId: string): number {
  return CATALOG_BY_FAMILY.get(familyId)?.length ?? 0
}

export interface VariantRolledPayload {
  variant: NeuronVariantRow
  /** True when the pull resolved to an already-owned variant (copies incremented). */
  isDupe: boolean
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
    this.listeners.get(event)?.delete(listener as Listener<keyof VariantGachaEventMap>)
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

type ResolveFamilyDisplayName = (familyId: string) => string

export interface PullableState {
  /** Family is fully collected (all of the family's pyramid slots owned). */
  complete: boolean
  /** Whether the family's P0 apex is already owned. */
  p0Owned: boolean
  /** Count of collected variants in this family (0..N). */
  ownedCount: number
}

export async function getPullableState(familyId: string): Promise<PullableState> {
  const rows = await db.neuronVariants.where('familyId').equals(familyId).toArray()
  return {
    ownedCount: rows.length,
    complete: rows.length >= slotsForFamily(familyId),
    p0Owned: rows.some((r) => r.slotIndex === 0),
  }
}

export type PullRejectReason = 'insufficient' | 'complete' | 'error'

export interface PullResult {
  ok: boolean
  reason?: PullRejectReason
  rarity?: Rarity
  isDupe?: boolean
  variant?: NeuronVariantRow
}

/**
 * Perform one per-family pull. Returns a structured result; never throws to the
 * caller (errors are logged + returned as `{ ok:false, reason:'error' }`).
 */
export async function pullVariant(
  familyId: string,
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
): Promise<PullResult> {
  const defs = CATALOG_BY_FAMILY.get(familyId)
  if (!defs || defs.length === 0) {
    console.error(`[variant-gacha] no catalog for family ${familyId}`)
    return { ok: false, reason: 'error' }
  }

  try {
    // Preflight (outside tx): balance + completeness.
    const balanceBefore = await readBalance()
    if (balanceBefore < PULL_COST) return { ok: false, reason: 'insufficient' }
    const state = await getPullableState(familyId)
    if (state.complete) return { ok: false, reason: 'complete' }

    // DMN variant-rate-up: consume the buff (own tx on dmnActiveBuffs) BEFORE the
    // pull tx (different table scope). When active, the pull rolls twice and keeps
    // the rarer outcome — the spine's mapping of the legacy boosted-weights buff.
    const variantRateUp = await consumeVariantRateUpBuff()
    if (variantRateUp) console.info('[variant-gacha] DMN variant-rate-up consumed (roll-twice-take-rarer)')

    const { current: streakAtMint } = await getStreaks()
    const prevStats = await buildAchievementStats()

    // The transaction RETURNS the outcome (don't mutate outer `let`s — TS cannot
    // narrow a variable assigned only inside an async callback).
    const out = await db.transaction(
      'rw',
      [db.meta, db.familyAccrual, db.neuronVariants],
      async (): Promise<{
        rarity: Rarity
        isDupe: boolean
        resultRow: NeuronVariantRow
        persistedNew: boolean
      }> => {
        await spendEnergyInTx(PULL_COST)

        const accrual = await db.familyAccrual.get(familyId)
        if (!accrual) throw new Error(`no familyAccrual row for "${familyId}"`)
        const newPullCount = (accrual.pullCount ?? 0) + 1
        await db.familyAccrual.update(familyId, { pullCount: newPullCount })

        const ownedRows = await db.neuronVariants.where('familyId').equals(familyId).toArray()
        const p0Owned = ownedRows.some((r) => r.slotIndex === 0)

        let rarity = rollRarityWithP0Pity(newPullCount, p0Owned)
        if (variantRateUp) {
          const second = rollRarityWithP0Pity(newPullCount, p0Owned)
          if (RARITY_RANK[second] < RARITY_RANK[rarity]) rarity = second
        }

        // Within-tier uniform pick — a tier may hold several variants (pyramid),
        // so the result can be a new variant or a dupe in any non-P0 tier (P0 has
        // exactly one). Reads the explicit `rarity` field (decoupled from slot).
        const tierDefs = defs.filter((d) => d.rarity === rarity)
        if (tierDefs.length === 0) throw new Error(`no catalog variant for ${familyId} ${rarity}`)
        const target = tierDefs[Math.floor(Math.random() * tierDefs.length)]

        const existing = await db.neuronVariants.get([familyId, target.slotIndex])
        if (existing) {
          const row: NeuronVariantRow = { ...existing, copies: (existing.copies ?? 1) + 1 }
          await db.neuronVariants.put(row)
          return { rarity, isDupe: true, resultRow: row, persistedNew: false }
        }

        const provenance: NeuronVariantProvenance = {
          bornAtISO: todayISO(),
          apAtUnlock: accrual.ap,
          wasRedemption: false, // pulls are not question-tied (no 救贖 for pulls)
          streakAtMint,
        }
        const row: NeuronVariantRow = {
          familyId,
          slotIndex: target.slotIndex,
          rarity,
          displayName: composeVariantDisplayName(target.displayName, rarity),
          spriteKey: target.spriteKey,
          rolledAt: Date.now(),
          // 保底 flag: a P0 obtained while the soft-pity ramp was active.
          wasPityFloor: rarity === 'P0' && newPullCount > P0_PITY_START,
          copies: 1,
          provenance,
        }
        await db.neuronVariants.put(row)
        return { rarity, isDupe: false, resultRow: row, persistedNew: true }
      },
    )

    variantGachaEvents.emit('variantRolled', {
      variant: out.resultRow,
      isDupe: out.isDupe,
      familyDisplayName: resolveFamilyDisplayName(familyId),
    })
    if (out.persistedNew) {
      // New variant collected → refresh connectome leaf + DMN behavior draw.
      emitVariantCollected({
        familyId,
        slotIndex: out.resultRow.slotIndex,
        apAtUnlock: out.resultRow.provenance?.apAtUnlock ?? 0,
        wasRedemption: false,
      })
    }
    await triggerAchievementCheck(prevStats)

    return { ok: true, rarity: out.rarity, isDupe: out.isDupe, variant: out.resultRow }
  } catch (err) {
    console.error(`[variant-gacha] pullVariant failed for ${familyId}:`, err)
    return { ok: false, reason: 'error' }
  }
}

/* DEV-only debug handles for manual smoke tests. */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __variantGacha?: unknown }).__variantGacha = {
    peekAll: async () => db.neuronVariants.toArray(),
    peekByFamily: async (familyId: string) =>
      db.neuronVariants.where('familyId').equals(familyId).toArray(),
    countByFamily: async (familyId: string) =>
      db.neuronVariants.where('familyId').equals(familyId).count(),
    pullableState: getPullableState,
    forcePull: async (familyId: string, resolve: ResolveFamilyDisplayName) =>
      pullVariant(familyId, resolve),
    clearAll: async () => {
      await db.neuronVariants.clear()
      console.warn('[variant-gacha] DEV: cleared all neuronVariant rows')
    },
  }
}
