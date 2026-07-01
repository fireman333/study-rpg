/**
 * Tier-promote (add-neurons-dupe-fusion) — the dupe sink. Consume K held SURPLUS
 * (DUPLICATE) individuals of one rarity tier within a family → mint one individual
 * of the next-rarer tier. Fusion only ever eats DUPLICATES: at least one held
 * individual per owned slot is protected (last-copy protection). No energy, no new
 * currency, no rarity-weight change (loot product principle). Reuses the mint
 * reveal / provenance / achievement flow.
 *
 * Capability spec: openspec/specs/neuron-variant-fusion/spec.md
 */

import {
  NEURON_VARIANT_CATALOG,
  PROMOTE_COST_K,
  composeVariantDisplayName,
  type NeuronVariantDef,
  type Rarity,
} from '@study-rpg/content-neurons-tw'
import {
  db,
  todayISO,
  type NeuronInstanceRow,
  type NeuronVariantRow,
  type NeuronVariantProvenance,
} from '../db'
import { emitVariantCollected } from './connectome'
import { getStreaks } from './streak'
import { buildAchievementStats, triggerAchievementCheck } from './achievement'
import { variantGachaEvents, buildInstance } from './variant-gacha'

const RANK_BY_RARITY: Record<Rarity, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }
const RARITY_BY_RANK: Rarity[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']

export const PROMOTE_COUNT_KEY = 'promoteCount'
/** Stores the RAREST rank ever produced by a promote (lower rank = rarer). */
export const RAREST_PROMOTED_RANK_KEY = 'rarestPromotedRank'

/** The next-rarer tier (T → T−1), or null if `rarity` is already the rarest (P0). */
function nextRarerTier(rarity: Rarity): Rarity | null {
  const rank = RANK_BY_RARITY[rarity]
  return rank <= 0 ? null : RARITY_BY_RANK[rank - 1]
}

function familyDefsByRarity(familyId: string, rarity: Rarity): NeuronVariantDef[] {
  return NEURON_VARIANT_CATALOG.filter((d) => d.familyId === familyId && d.rarity === rarity)
}

/**
 * Held individuals of `rarity` in `familyId` eligible to consume — the SURPLUS
 * (duplicates) beyond the protected first-held-per-slot (last-copy protection).
 * Fusion only eats duplicates: the oldest held individual of each slot is the
 * protected copy (deterministic) and is never returned. Oldest-first order.
 */
export async function eligibleSurplusByTier(
  familyId: string,
  rarity: Rarity,
): Promise<NeuronInstanceRow[]> {
  const held = (await db.neuronInstances.where('familyId').equals(familyId).toArray())
    .filter((r) => r.consumedAt === null && r.rarity === rarity)
    .sort((a, b) => a.rolledAt - b.rolledAt)
  const seenSlot = new Set<number>()
  const surplus: NeuronInstanceRow[] = []
  for (const inst of held) {
    if (!seenSlot.has(inst.slotIndex)) {
      seenSlot.add(inst.slotIndex) // protect the oldest held per slot (last-copy)
      continue
    }
    surplus.push(inst)
  }
  return surplus
}

export interface PromoteState {
  rarity: Rarity
  targetRarity: Rarity | null
  /** Surplus (duplicate) individuals of this tier — the fusable pool. */
  surplusCount: number
  costK: number
  canPromote: boolean
  reason?: 'p0' | 'insufficient'
}

export async function getPromoteState(familyId: string, rarity: Rarity): Promise<PromoteState> {
  const targetRarity = nextRarerTier(rarity)
  if (targetRarity === null) {
    return { rarity, targetRarity: null, surplusCount: 0, costK: PROMOTE_COST_K, canPromote: false, reason: 'p0' }
  }
  const surplus = await eligibleSurplusByTier(familyId, rarity)
  const canPromote = surplus.length >= PROMOTE_COST_K
  return {
    rarity,
    targetRarity,
    surplusCount: surplus.length,
    costK: PROMOTE_COST_K,
    canPromote,
    reason: canPromote ? undefined : 'insufficient',
  }
}

export interface PromoteResult {
  ok: boolean
  reason?: 'p0' | 'insufficient' | 'error'
  minted?: NeuronInstanceRow
  targetRarity?: Rarity
  isDupe?: boolean
}

async function bumpMetaInt(key: string, delta: number): Promise<void> {
  const cur = parseInt((await db.meta.get(key))?.value ?? '0', 10) || 0
  await db.meta.put({ key, value: String(cur + delta) })
}

/** Record the rarest rank reached (keep the MIN — lower rank = rarer). */
async function recordRarestRank(rank: number): Promise<void> {
  const cur = (await db.meta.get(RAREST_PROMOTED_RANK_KEY))?.value
  const curRank = cur === undefined ? Number.POSITIVE_INFINITY : parseInt(cur, 10)
  if (rank < curRank) await db.meta.put({ key: RAREST_PROMOTED_RANK_KEY, value: String(rank) })
}

/**
 * Promote one tier in a family. Consumes K SURPLUS (duplicate) individuals of
 * `rarity` — never a slot's protected last copy — and mints one individual of the
 * next-rarer tier (prefers an unowned target slot, else mints a dupe individual of
 * an owned slot). Never throws — returns a structured result. SHALL NOT touch
 * neural energy or rarity weights.
 */
export async function promoteTier(
  familyId: string,
  rarity: Rarity,
  resolveFamilyDisplayName: (familyId: string) => string,
): Promise<PromoteResult> {
  const targetRarity = nextRarerTier(rarity)
  if (targetRarity === null) return { ok: false, reason: 'p0' }

  try {
    const prevStats = await buildAchievementStats()
    const { current: streakAtMint } = await getStreaks()

    const out = await db.transaction(
      'rw',
      [db.neuronInstances, db.neuronVariants, db.meta],
      async () => {
        const surplus = await eligibleSurplusByTier(familyId, rarity)
        if (surplus.length < PROMOTE_COST_K) return null

        const now = Date.now()
        for (const inst of surplus.slice(0, PROMOTE_COST_K)) {
          await db.neuronInstances.update(inst.instanceId, { consumedAt: now })
        }

        const targetDefs = familyDefsByRarity(familyId, targetRarity)
        if (targetDefs.length === 0) throw new Error(`no ${targetRarity} catalog for ${familyId}`)
        let targetDef: NeuronVariantDef | undefined
        for (const d of targetDefs) {
          if (!(await db.neuronVariants.get([familyId, d.slotIndex]))) {
            targetDef = d
            break
          }
        }
        const isDupe = targetDef === undefined
        if (!targetDef) targetDef = targetDefs[Math.floor(Math.random() * targetDefs.length)]

        const provenance: NeuronVariantProvenance = {
          bornAtISO: todayISO(),
          apAtUnlock: 0,
          wasRedemption: false,
          streakAtMint,
        }
        const minted = buildInstance(
          familyId,
          targetDef.slotIndex,
          targetRarity,
          targetDef.spriteKey,
          now,
          provenance,
        )
        await db.neuronInstances.add(minted)

        const slotRow = await db.neuronVariants.get([familyId, targetDef.slotIndex])
        if (slotRow) {
          await db.neuronVariants.put({ ...slotRow, copies: (slotRow.copies ?? 1) + 1 })
        } else {
          const newRow: NeuronVariantRow = {
            familyId,
            slotIndex: targetDef.slotIndex,
            rarity: targetRarity,
            displayName: composeVariantDisplayName(targetDef.displayName, targetRarity),
            spriteKey: targetDef.spriteKey,
            rolledAt: now,
            wasPityFloor: false,
            copies: 1,
            provenance,
          }
          await db.neuronVariants.put(newRow)
        }

        await bumpMetaInt(PROMOTE_COUNT_KEY, 1)
        await recordRarestRank(RANK_BY_RARITY[targetRarity])

        return {
          minted,
          isDupe,
          slotIndex: targetDef.slotIndex,
          displayName: composeVariantDisplayName(targetDef.displayName, targetRarity),
        }
      },
    )

    if (!out) return { ok: false, reason: 'insufficient' }

    // Reveal + hooks post-commit (mirror the pull path).
    variantGachaEvents.emit('variantRolled', {
      variant: {
        familyId,
        slotIndex: out.slotIndex,
        rarity: targetRarity,
        displayName: out.displayName,
        spriteKey: out.minted.spriteKey,
        rolledAt: out.minted.rolledAt,
        wasPityFloor: false,
        copies: 1,
        provenance: out.minted.provenance,
      },
      isDupe: out.isDupe,
      familyDisplayName: resolveFamilyDisplayName(familyId),
    })
    if (!out.isDupe) {
      emitVariantCollected({ familyId, slotIndex: out.slotIndex, apAtUnlock: 0, wasRedemption: false })
    }
    await triggerAchievementCheck(prevStats)

    return { ok: true, minted: out.minted, targetRarity, isDupe: out.isDupe }
  } catch (err) {
    console.error(`[variant-fusion] promoteTier failed for ${familyId} ${rarity}:`, err)
    return { ok: false, reason: 'error' }
  }
}

/* DEV-only debug handle for manual smoke tests. */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __variantFusion?: unknown }).__variantFusion = {
    surplus: eligibleSurplusByTier,
    state: getPromoteState,
    promote: (familyId: string, rarity: Rarity) =>
      promoteTier(familyId, rarity, (f) => f),
  }
}
