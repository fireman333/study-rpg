/**
 * Character-card data layer (add-neurons-og-share).
 *
 * Aggregates the player's already-stored local state into a plain,
 * serialisable `CharacterCardPayload` that the canvas renderer consumes. Pure
 * functions (`pickBranchRepresentatives`) are split out so they unit-test
 * without a DOM; the aggregator (`buildCharacterCardPayload`) reads Dexie only.
 *
 * NO account identifier (email / auth user_id) is ever placed on the payload —
 * only display strings. NO new stored or synced state; this is a pure derived
 * view of existing tables. Capability spec:
 * openspec/specs/neurons-character-card/spec.md
 */

import { FAMILY_NT_BRANCH, NEURON_VARIANT_CATALOG, type NtBranchId } from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow, type VariantRarity } from '../db'
import { getRepresentativesRaw, type RepresentativeMap } from './representatives'
import { readTotalStudyMinutes } from './reading-timer'

/** Fixed display order of the four NT branches across the card's hero row. */
export const CARD_BRANCH_ORDER: readonly NtBranchId[] = ['DA', '5HT', 'GABA', 'Glu']

/** Shown when the player has not set a leaderboard nickname. */
export const DEFAULT_CARD_NICKNAME = '神經元研究員'

/** Lower rank = higher rarity (P0 始源 is best, P5 拉完了 is worst). */
const RARITY_RANK: Record<VariantRarity, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 }

export interface BranchRepresentative {
  branch: NtBranchId
  familyId: string
  slotIndex: number
  spriteKey: string
  rarity: VariantRarity
  displayName: string
}

export interface CharacterCardPayload {
  nickname: string
  title: string | null
  /** One entry per NT branch in `CARD_BRANCH_ORDER`; null = no variant in that branch. */
  reps: (BranchRepresentative | null)[]
  totalAp: number
  strongSynapseCount: number
  variantCount: number
  variantTotal: number
  familiesComplete: number
  familyTotal: number
  totalStudyMinutes: number
  renderedAt: number
}

/**
 * Pick one representative variant per NT branch. Pure / DOM-free.
 *
 * Within a branch, prefer the player's explicitly-chosen representative(s);
 * otherwise consider all collected variants in the branch. Order by rarity
 * (P1 best), then higher family AP, then more recent roll. A branch with no
 * collected variant yields `null`.
 */
export function pickBranchRepresentatives(
  variants: readonly NeuronVariantRow[],
  representativeMap: RepresentativeMap,
  apByFamily: ReadonlyMap<string, number>,
): (BranchRepresentative | null)[] {
  const byBranch = new Map<NtBranchId, NeuronVariantRow[]>()
  for (const v of variants) {
    const branch = FAMILY_NT_BRANCH[v.familyId]
    if (!branch) continue
    const list = byBranch.get(branch) ?? []
    list.push(v)
    byBranch.set(branch, list)
  }

  const compare = (a: NeuronVariantRow, b: NeuronVariantRow): number => {
    const byRarity = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]
    if (byRarity !== 0) return byRarity
    const apA = apByFamily.get(a.familyId) ?? 0
    const apB = apByFamily.get(b.familyId) ?? 0
    if (apB !== apA) return apB - apA
    return b.rolledAt - a.rolledAt
  }

  return CARD_BRANCH_ORDER.map((branch) => {
    const list = byBranch.get(branch)
    if (!list || list.length === 0) return null
    const chosen = list.filter((v) => representativeMap[v.familyId] === v.slotIndex)
    const pool = chosen.length > 0 ? chosen : list
    const best = pool.slice().sort(compare)[0]
    return {
      branch,
      familyId: best.familyId,
      slotIndex: best.slotIndex,
      spriteKey: best.spriteKey,
      rarity: best.rarity,
      displayName: best.displayName,
    }
  })
}

const VARIANT_TOTAL = NEURON_VARIANT_CATALOG.length
const FAMILY_TOTAL = new Set(NEURON_VARIANT_CATALOG.map((e) => e.familyId)).size
// Derived from the catalog (uniform slots/family) so it tracks the model —
// Collection 2.0 widened this 5 → 6 (P0–P5); a hardcoded literal would silently
// miscount familiesComplete after the catalog grows.
const SLOTS_PER_FAMILY = VARIANT_TOTAL / FAMILY_TOTAL

/**
 * Build the card payload from local Dexie state. `userId` is optional: when
 * given the matching leaderboard profile is read; otherwise the single local
 * profile row (if any) is used — so the card works without leaderboard opt-in.
 */
export async function buildCharacterCardPayload(
  userId?: string | null,
): Promise<CharacterCardPayload> {
  const [variants, accruals, synapses, representativeMap, profile, totalStudyMinutes] =
    await Promise.all([
      db.neuronVariants.toArray(),
      db.familyAccrual.toArray(),
      db.synapses.toArray(),
      getRepresentativesRaw(),
      userId
        ? db.leaderboardProfile.get(userId)
        : db.leaderboardProfile.toArray().then((rows) => rows[0]),
      readTotalStudyMinutes(),
    ])

  const apByFamily = new Map(accruals.map((a) => [a.familyId, a.ap ?? 0]))
  const reps = pickBranchRepresentatives(variants, representativeMap, apByFamily)

  const familyCounts = new Map<string, number>()
  for (const v of variants) {
    familyCounts.set(v.familyId, (familyCounts.get(v.familyId) ?? 0) + 1)
  }
  const familiesComplete = Array.from(familyCounts.values()).filter(
    (c) => c === SLOTS_PER_FAMILY,
  ).length

  return {
    nickname: profile?.nickname?.trim() || DEFAULT_CARD_NICKNAME,
    title: profile?.selectedTitle ?? null,
    reps,
    totalAp: accruals.reduce((sum, a) => sum + (a.ap ?? 0), 0),
    strongSynapseCount: synapses.filter((s) => s.state === 'strong').length,
    variantCount: variants.length,
    variantTotal: VARIANT_TOTAL,
    familiesComplete,
    familyTotal: FAMILY_TOTAL,
    totalStudyMinutes,
    renderedAt: Date.now(),
  }
}
