/**
 * Variant gacha service (promote-maze-to-home / Model A) — per-family PULL,
 * triggered ONLY by a maze node settle (lib/maze/economy `reconcileSettles`);
 * there is no player-initiated manual pull. This is the ONLY mechanism that
 * creates `neuronVariants` rows.
 *
 * Capability spec: openspec/specs/neuron-variant-gacha/spec.md
 *
 * A pull is FREE at this layer (the per-family maze energy consumed reaching the
 * node is the cost — see economy.ts): in one tx bump familyAccrual.pullCount (the
 * P0 soft-pity clock), roll a rarity (P0 soft-pity applied; P0 excluded once
 * owned), resolve the (family, rarity) catalog variant, then persist a new row
 * (copies=1, provenance stamped) or increment `copies` on a dupe + mint a new
 * individual. The reveal (`variantRolled`) fires post-commit. Open-collection —
 * a fully-collected family is still pullable and yields a dupe (feeds fusion).
 */

import {
  NEURON_VARIANT_CATALOG,
  P0_PITY_START,
  composeVariantDisplayName,
  rollRarityWithP0Pity,
  type NeuronVariantDef,
  type Rarity,
} from '@study-rpg/content-neurons-tw'
import {
  db,
  defaultFamilyAccrualRow,
  todayISO,
  type NeuronVariantRow,
  type NeuronVariantProvenance,
  type NeuronInstanceRow,
} from '../db'
import { emitVariantCollected } from './connectome'
import { getStreaks } from './streak'
import { buildAchievementStats, triggerAchievementCheck } from './achievement'
import { consumeVariantRateUpBuff } from './dmn-event-dispatcher'

/** Rarity rank for "take the rarer" (P0 rarest = 0). */
const RARITY_RANK: Record<Rarity, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }

/**
 * Device-stable instance id (add-neurons-dupe-fusion). NOT a Dexie `++id` — an
 * auto-increment collides across devices under R2 union sync. New pulls use a
 * random suffix (each pull is a genuinely new individual minted on one device);
 * the v13 migration uses a deterministic `:m<i>` suffix instead so two devices
 * expanding the same legacy `copies` converge.
 */
function mintInstanceId(familyId: string, slotIndex: number, rolledAt: number): string {
  return `${familyId}:${slotIndex}:${rolledAt}:${Math.random().toString(36).slice(2, 8)}`
}

/** Build one individual instance row for a freshly-minted neuron (its own birth context). */
export function buildInstance(
  familyId: string,
  slotIndex: number,
  rarity: Rarity,
  spriteKey: string,
  rolledAt: number,
  provenance: NeuronVariantProvenance,
): NeuronInstanceRow {
  return {
    instanceId: mintInstanceId(familyId, slotIndex, rolledAt),
    familyId,
    slotIndex,
    rarity,
    spriteKey,
    rolledAt,
    provenance,
    consumedAt: null,
  }
}

/**
 * Current OWNED individual count (add-neurons-dupe-fusion) — held instances
 * (`consumedAt == null`). Distinct from `neuronVariants.copies`, which is the
 * monotonic lifetime-mint count kept for MAX-merge sync.
 */
export async function currentOwnedCount(familyId: string, slotIndex?: number): Promise<number> {
  const rows = await db.neuronInstances.where('familyId').equals(familyId).toArray()
  return rows.filter(
    (r) => r.consumedAt === null && (slotIndex === undefined || r.slotIndex === slotIndex),
  ).length
}

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
  /**
   * The reveal-modal queue just drained (last queued reveal dismissed). Pure
   * presentation signal — MazeGrid holds the §2.5 settle-travel walker animation
   * while the full-screen reveal covers the maze and flushes it on this event.
   */
  revealQueueIdle: Record<string, never>
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

export type PullRejectReason = 'insufficient' | 'error'

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
 *
 * `opts.silent`: suppress the per-pull `variantRolled` reveal AND skip the inline
 * `triggerAchievementCheck` (achievements still persist via the boot/sync backfill).
 * `emitVariantCollected` (connectome refresh) still fires; the variant is persisted
 * identically. Used by the per-family first-pull (add-neurons-first-pull-path-rep).
 * `opts.forceRarity` pins the rolled rarity (the first-pull's guaranteed P5) — the
 * pullCount/P0-pity clock still advances. `opts.firstPull` stamps the minted
 * individual's provenance so the caption / future reveal can distinguish it.
 */
export async function pullVariant(
  familyId: string,
  resolveFamilyDisplayName: ResolveFamilyDisplayName,
  opts?: { silent?: boolean; forceRarity?: Rarity; firstPull?: boolean; forceSlotIndex?: number },
): Promise<PullResult> {
  const defs = CATALOG_BY_FAMILY.get(familyId)
  if (!defs || defs.length === 0) {
    console.error(`[variant-gacha] no catalog for family ${familyId}`)
    return { ok: false, reason: 'error' }
  }

  try {
    // No balance preflight: the settle pull is free at this layer (the maze
    // energy consumed reaching the node is the cost). Open-collection — a
    // fully-collected family is still pullable (the within-tier pick yields a dupe).

    // DMN variant-rate-up: consume the buff (own tx on dmnActiveBuffs) BEFORE the
    // pull tx (different table scope). When active, the pull rolls twice and keeps
    // the rarer outcome — the spine's mapping of the legacy boosted-weights buff.
    // A 二回目 forced (position-bound) unlock does NOT roll → it neither consumes
    // nor benefits from the rate-up buff (add-neurons-maze-second-lap-variants).
    const variantRateUp =
      opts?.forceSlotIndex === undefined ? await consumeVariantRateUpBuff() : false
    if (variantRateUp) console.info('[variant-gacha] DMN variant-rate-up consumed (roll-twice-take-rarer)')

    const { current: streakAtMint } = await getStreaks()
    const prevStats = opts?.silent ? null : await buildAchievementStats()

    // The transaction RETURNS the outcome (don't mutate outer `let`s — TS cannot
    // narrow a variable assigned only inside an async callback).
    const out = await db.transaction(
      'rw',
      [db.familyAccrual, db.neuronVariants, db.neuronInstances],
      async (): Promise<{
        rarity: Rarity
        isDupe: boolean
        resultRow: NeuronVariantRow
        persistedNew: boolean
      }> => {
        // Lazy-seed a missing accrual row in-tx (fresh save / sync-hydration race):
        // the row may not exist yet when a maze settle or the silent first-pull
        // fires before any cloud hydration / answer write has created it. Seed the
        // canonical default then proceed, so a family's first auto-pull is never
        // dropped (mirrors recordCorrectAnswer's lazy-seed on the answer path). The
        // subsequent `update` then bumps pullCount 0 → 1 on the freshly-added row.
        let accrual = await db.familyAccrual.get(familyId)
        if (!accrual) {
          accrual = defaultFamilyAccrualRow(familyId)
          await db.familyAccrual.add(accrual)
        }
        const newPullCount = (accrual.pullCount ?? 0) + 1
        await db.familyAccrual.update(familyId, { pullCount: newPullCount })

        const ownedRows = await db.neuronVariants.where('familyId').equals(familyId).toArray()
        const p0Owned = ownedRows.some((r) => r.slotIndex === 0)
        // Silent P1 soft-pity (rebalance-neurons-maze-economy): converge the lone
        // P1 once the family lacks it. No pity-floor flag is set for P1 (wasPityFloor
        // below is P0-only), so the player perceives it as luck.
        const p1Owned = ownedRows.some((r) => r.rarity === 'P1')

        // 二回目 deterministic position-bound unlock (add-neurons-maze-second-lap-variants):
        // a settle on a second-route node unlocks THAT position's location variant —
        // no rarity roll, no within-tier pick. First-route settles keep the random
        // within-tier roll (P0 soft-pity), with 二回目 location variants excluded.
        let rarity: Rarity
        let target: NeuronVariantDef
        const forcedSlot = opts?.forceSlotIndex
        if (forcedSlot !== undefined) {
          const t = defs.find((d) => d.slotIndex === forcedSlot)
          if (!t) throw new Error(`no catalog variant for ${familyId} slot ${forcedSlot}`)
          target = t
          rarity = t.rarity
        } else {
          rarity = rollRarityWithP0Pity(newPullCount, p0Owned, p1Owned)
          if (variantRateUp) {
            const second = rollRarityWithP0Pity(newPullCount, p0Owned, p1Owned)
            if (RARITY_RANK[second] < RARITY_RANK[rarity]) rarity = second
          }
          // First-pull guarantee (add-neurons-first-pull-path-rep): pin the rarity
          // (the common P5 starter). The pullCount/P0-pity clock still advanced above.
          if (opts?.forceRarity) rarity = opts.forceRarity

          // Within-tier FILL-MISSING-FIRST pick (rebalance-neurons-maze-economy): a
          // tier may hold several variants (pyramid). Prefer an UNOWNED slot in the
          // rolled tier so a pull never wastes on a within-tier dupe while that tier
          // still has missing slots; fall back to a uniform-random pick (dupe) only
          // when every slot in the tier is already owned (open-collection). The
          // cross-tier rarity RNG above is unchanged — only the slot choice within
          // the rolled tier changed. Excludes 二回目 location variants (isLocation).
          const tierDefs = defs.filter((d) => d.rarity === rarity && !d.isLocation)
          if (tierDefs.length === 0) throw new Error(`no catalog variant for ${familyId} ${rarity}`)
          const ownedSlots = new Set(ownedRows.map((r) => r.slotIndex))
          const unownedInTier = tierDefs.filter((d) => !ownedSlots.has(d.slotIndex))
          const pickPool = unownedInTier.length > 0 ? unownedInTier : tierDefs
          target = pickPool[Math.floor(Math.random() * pickPool.length)]
        }

        // Each pull mints an INDIVIDUAL (add-neurons-dupe-fusion) with its own
        // birth context (provenance + rolledAt) so dupes render distinct context-art.
        const rolledAtNow = Date.now()
        const provenance: NeuronVariantProvenance = {
          bornAtISO: todayISO(),
          apAtUnlock: accrual.ap,
          wasRedemption: false, // pulls are not question-tied (no 救贖 for pulls)
          streakAtMint,
          ...(opts?.firstPull ? { firstPull: true } : {}),
        }

        const existing = await db.neuronVariants.get([familyId, target.slotIndex])
        if (existing) {
          // Dupe: bump the slot's lifetime-mint count (`copies`, MAX-merge sync)
          // AND mint a new individual. The slot-row provenance is NOT rewritten
          // (gacha spec); the new individual carries this pull's own provenance.
          const row: NeuronVariantRow = { ...existing, copies: (existing.copies ?? 1) + 1 }
          await db.neuronVariants.put(row)
          await db.neuronInstances.add(
            buildInstance(familyId, target.slotIndex, rarity, target.spriteKey, rolledAtNow, provenance),
          )
          return { rarity, isDupe: true, resultRow: row, persistedNew: false }
        }

        const row: NeuronVariantRow = {
          familyId,
          slotIndex: target.slotIndex,
          rarity,
          displayName: composeVariantDisplayName(target.displayName, rarity),
          spriteKey: target.spriteKey,
          rolledAt: rolledAtNow,
          // 保底 flag: a P0 obtained while the soft-pity ramp was active.
          wasPityFloor: rarity === 'P0' && newPullCount > P0_PITY_START,
          copies: 1,
          provenance,
        }
        await db.neuronVariants.put(row)
        await db.neuronInstances.add(
          buildInstance(familyId, target.slotIndex, rarity, target.spriteKey, rolledAtNow, provenance),
        )
        return { rarity, isDupe: false, resultRow: row, persistedNew: true }
      },
    )

    if (!opts?.silent) {
      variantGachaEvents.emit('variantRolled', {
        variant: out.resultRow,
        isDupe: out.isDupe,
        familyDisplayName: resolveFamilyDisplayName(familyId),
      })
    }
    if (out.persistedNew) {
      // New variant collected → refresh connectome leaf + DMN behavior draw.
      emitVariantCollected({
        familyId,
        slotIndex: out.resultRow.slotIndex,
        apAtUnlock: out.resultRow.provenance?.apAtUnlock ?? 0,
        wasRedemption: false,
      })
    }
    // Silent (first-pull batch): the orchestrator runs ONE achievement check
    // after its combined reveal — skip the inline per-pull check here.
    if (!opts?.silent && prevStats) await triggerAchievementCheck(prevStats)

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
