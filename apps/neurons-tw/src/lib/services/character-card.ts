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

import {
  CONNECTOR_TOTAL,
  FAMILY_NT_BRANCH,
  NEURON_VARIANT_CATALOG,
  NEURON_VARIANT_TOTAL,
  connectorColors,
  connectorFamilies,
  connectorSpriteKey,
  type NtBranchId,
} from '@study-rpg/content-neurons-tw'
import { db, type ConnectorNeuronRow, type NeuronVariantRow, type VariantRarity } from '../db'
import { getRepresentativesRaw, type RepresentativeMap } from './representatives'
import { readTotalStudyMinutes } from './reading-timer'
import { computeOwnedSlotCount } from './variant-ownership'
import { variantBirthCaption } from '../variant-caption'

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

const FAMILY_TOTAL = new Set(NEURON_VARIANT_CATALOG.map((e) => e.familyId)).size
// Derived from the catalog (uniform slots/family) so it tracks the model —
// a hardcoded literal would silently miscount familiesComplete after the catalog grows.
const SLOTS_PER_FAMILY = NEURON_VARIANT_TOTAL / FAMILY_TOTAL

/**
 * Build the card payload from local Dexie state. `userId` is optional: when
 * given the matching leaderboard profile is read; otherwise the single local
 * profile row (if any) is used — so the card works without leaderboard opt-in.
 */
export async function buildCharacterCardPayload(
  userId?: string | null,
): Promise<CharacterCardPayload> {
  const [variants, instances, accruals, synapses, representativeMap, profile, totalStudyMinutes] =
    await Promise.all([
      db.neuronVariants.toArray(),
      db.neuronInstances.toArray(),
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
    // Distinct-owned count via the canonical projection — a cross-device fusion
    // ghost slot (variant row, 0 held individuals) does NOT inflate it. `variants`
    // is still used above for reps + familiesComplete (catalog-history reads).
    variantCount: computeOwnedSlotCount(variants, instances),
    variantTotal: NEURON_VARIANT_TOTAL,
    familiesComplete,
    familyTotal: FAMILY_TOTAL,
    totalStudyMinutes,
    renderedAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// 變體 / 連結 share cards (enhance-neurons-share-cards) — pure-derived, no new state.
// ---------------------------------------------------------------------------

/** Per-rarity Chinese label, shared with VariantUnlockModal copy. */
export const RARITY_LABEL: Record<VariantRarity, string> = {
  P0: 'P0 始源',
  P1: 'P1 夯',
  P2: 'P2 頂級',
  P3: 'P3 人上人',
  P4: 'P4 NPC',
  P5: 'P5 拉完了',
}

/** Stable picker key for a collected variant (familyId + slotIndex identity). */
export function variantCardKey(v: Pick<NeuronVariantRow, 'familyId' | 'slotIndex'>): string {
  return `${v.familyId}:${v.slotIndex}`
}

export interface VariantCardPayload {
  nickname: string
  title: string | null
  spriteKey: string
  displayName: string
  familyId: string
  rarity: VariantRarity
  rarityLabel: string
  caption: string
  variantCount: number
  variantTotal: number
  renderedAt: number
}

export interface ConnectorCardPayload {
  nickname: string
  pairKey: string
  familyA: string
  familyB: string
  colorA: string
  colorB: string
  spriteKey: string
  unlockedAt: number
  connectorCount: number
  connectorTotal: number
  renderedAt: number
}

/**
 * The variant to feature by default: rarest collected (lowest RARITY_RANK),
 * tiebreak most-recent roll. Pure; returns null for an empty collection.
 */
export function pickDefaultVariant(
  variants: readonly NeuronVariantRow[],
): NeuronVariantRow | null {
  if (variants.length === 0) return null
  return variants
    .slice()
    .sort((a, b) => {
      const byRarity = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]
      if (byRarity !== 0) return byRarity
      return b.rolledAt - a.rolledAt
    })[0]
}

/**
 * The connector to feature by default: most-recently unlocked. Pure; returns
 * null when no connector is unlocked.
 */
export function pickDefaultConnector(
  connectors: readonly ConnectorNeuronRow[],
): ConnectorNeuronRow | null {
  if (connectors.length === 0) return null
  return connectors.slice().sort((a, b) => b.unlockedAt - a.unlockedAt)[0]
}

/** Variants in picker order (rarest first), for the 變體 tab strip. */
export function sortVariantsForPicker(
  variants: readonly NeuronVariantRow[],
): NeuronVariantRow[] {
  return variants.slice().sort((a, b) => {
    const byRarity = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]
    if (byRarity !== 0) return byRarity
    return b.rolledAt - a.rolledAt
  })
}

/** Unlocked connectors in picker order (most-recent first), for the 連結 tab strip. */
export function sortConnectorsForPicker(
  connectors: readonly ConnectorNeuronRow[],
): ConnectorNeuronRow[] {
  return connectors.slice().sort((a, b) => b.unlockedAt - a.unlockedAt)
}

async function readCardNickname(userId?: string | null): Promise<{ nickname: string; title: string | null }> {
  const profile = userId
    ? await db.leaderboardProfile.get(userId)
    : await db.leaderboardProfile.toArray().then((rows) => rows[0])
  return {
    nickname: profile?.nickname?.trim() || DEFAULT_CARD_NICKNAME,
    title: profile?.selectedTitle ?? null,
  }
}

/** Build the variant-card payload for one collected variant row. Pure. */
export function buildVariantCardPayload(
  variant: NeuronVariantRow,
  meta: { nickname: string; title: string | null; variantCount: number },
): VariantCardPayload {
  return {
    nickname: meta.nickname,
    title: meta.title,
    spriteKey: variant.spriteKey,
    displayName: variant.displayName,
    familyId: variant.familyId,
    rarity: variant.rarity,
    rarityLabel: RARITY_LABEL[variant.rarity],
    caption: variantBirthCaption(variant),
    variantCount: meta.variantCount,
    variantTotal: NEURON_VARIANT_TOTAL,
    renderedAt: Date.now(),
  }
}

/** Build the connector-card payload for one unlocked connector row. Pure. */
export function buildConnectorCardPayload(
  connector: ConnectorNeuronRow,
  meta: { nickname: string; connectorCount: number },
): ConnectorCardPayload {
  const [familyA, familyB] = connectorFamilies(connector.pairKey)
  const [colorA, colorB] = connectorColors(connector.pairKey)
  return {
    nickname: meta.nickname,
    pairKey: connector.pairKey,
    familyA,
    familyB,
    colorA,
    colorB,
    spriteKey: connectorSpriteKey(connector.pairKey),
    unlockedAt: connector.unlockedAt,
    connectorCount: meta.connectorCount,
    connectorTotal: CONNECTOR_TOTAL,
    renderedAt: Date.now(),
  }
}

export interface VariantShareState {
  /** Full collected-row picker list (every slot the player can feature). */
  variants: NeuronVariantRow[]
  /** Canonical distinct-owned count for the card stat (ghost slots excluded). */
  ownedCount: number
  nickname: string
  title: string | null
}

export interface ConnectorShareState {
  connectors: ConnectorNeuronRow[]
  nickname: string
  title: string | null
}

/** Load everything the 變體 tab needs in one pass (picker list + owned count + nickname). */
export async function loadVariantShareState(userId?: string | null): Promise<VariantShareState> {
  const [variants, instances, { nickname, title }] = await Promise.all([
    db.neuronVariants.toArray(),
    db.neuronInstances.toArray(),
    readCardNickname(userId),
  ])
  return {
    variants: sortVariantsForPicker(variants),
    ownedCount: computeOwnedSlotCount(variants, instances),
    nickname,
    title,
  }
}

/** Load everything the 連結 tab needs in one pass (picker list + nickname). */
export async function loadConnectorShareState(userId?: string | null): Promise<ConnectorShareState> {
  const [connectors, { nickname, title }] = await Promise.all([
    db.connectorNeurons.toArray(),
    readCardNickname(userId),
  ])
  return { connectors: sortConnectorsForPicker(connectors), nickname, title }
}
