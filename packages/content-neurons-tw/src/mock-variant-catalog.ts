// Mock-exam variant catalog (add-neurons-exam-set-mock-variants).
//
// A collection line UNLOCKED ONLY by submitting a 模擬考試 (full-paper closed-book)
// run — independent of the maze taxonomy pool (`variants.ts` / `neuronVariants`),
// the DMN axis, and the energy economy. Theme = 考試腦力: neurons of cognition,
// memory, attention, and reward that underwrite test performance.
//
// MVP scope: structure + textbook-canonical neuro-identities + PLACEHOLDER sprites.
// Every entry carries `neuroAnchorTODO: true` — per the project M_3rd neuroscience
// rule, each neuro-identity (NT branch / anatomy / mechanism) MUST be OE-anchored
// (PubMed PMID, attached to `pmids`) before it is considered final. Real 立繪 lands
// in the follow-up `generate-mock-variant-sprites`.

import type { Rarity } from './variants'

export interface MockVariantDef {
  /** Stable catalog id = Dexie PK. kebab/slug, never reused. */
  variantId: string
  rarity: Rarity
  /** Player-facing 中文 name (the neuron). */
  displayName: string
  /** One-line flavor + the neuro-fact hook (content-only, not persisted/synced). */
  blurb: string
  /** Stable sprite key; placeholder glyph until the art follow-up swaps it. */
  spriteKey: string
  /** True until the neuro-identity is OE-anchored with PMIDs (project M_3rd rule). */
  neuroAnchorTODO: boolean
  /** PubMed anchors backing the neuro-identity; filled by the OE-anchoring pass. */
  pmids?: string[]
}

const mk = (
  variantId: string,
  rarity: Rarity,
  displayName: string,
  blurb: string,
): MockVariantDef => ({
  variantId,
  rarity,
  displayName,
  blurb,
  spriteKey: `mock-variant:${variantId}`,
  neuroAnchorTODO: true,
})

/**
 * MVP catalog — 13 entries across the P5→P0 pyramid. Identities are
 * textbook-canonical (settled neuroscience) and flagged for PMID anchoring.
 */
export const MOCK_VARIANT_CATALOG: readonly MockVariantDef[] = [
  // ── P5 common ──────────────────────────────────────────────────────────
  mk('dentate-granule', 'P5', '齒狀回顆粒細胞', '海馬齒狀回的顆粒細胞，負責 pattern separation——把相似考題情境分流成不同記憶。'),
  mk('cortical-pyramidal', 'P5', '皮質錐體細胞', '大腦皮質的主力投射神經元，glutamatergic，撐起整張答題網路的興奮傳遞。'),
  mk('cerebellar-granule', 'P5', '小腦顆粒細胞', '全腦數量最多的神經元，把程序性「手感」練成自動化作答節奏。'),
  mk('thalamic-relay', 'P5', '視丘中繼神經元', '感覺資訊進皮質的閘門，決定哪些題幹細節被送上意識桌面。'),
  // ── P4 ─────────────────────────────────────────────────────────────────
  mk('ca1-pyramidal', 'P4', 'CA1 錐體細胞', '海馬 CA1 的輸出層，把當下作答經驗鞏固成可回憶的長期記憶。'),
  mk('basal-forebrain-ach', 'P4', '基底前腦膽鹼神經元', 'acetylcholine 來源，拉高皮質訊噪比——專注力的化學油門。'),
  mk('gaba-interneuron', 'P4', 'GABA 中間神經元', '抑制性守門員，靠 GABA 把過度興奮壓住，避免考場焦慮失控。'),
  // ── P3 ─────────────────────────────────────────────────────────────────
  mk('locus-coeruleus-ne', 'P3', '藍斑核正腎上腺素神經元', '腦中 noradrenaline 的唯一主源，調節警醒與「該緊張了」的相位反應。'),
  mk('dlpfc-neuron', 'P3', '背外側前額葉神經元', '工作記憶的持續放電核心，把多步驟題目的中間結果暫存在線上。'),
  // ── P2 rare ────────────────────────────────────────────────────────────
  mk('vta-dopamine', 'P2', '腹側被蓋區多巴胺神經元', 'reward prediction error 的訊號源——答對那一刻的多巴胺脈衝。'),
  mk('raphe-serotonin', 'P2', '中縫核血清素神經元', 'serotonin 主源，穩定情緒與耐心，撐過冗長的模擬考。'),
  // ── P1 epic ────────────────────────────────────────────────────────────
  mk('hippocampal-place-cell', 'P1', '海馬位置細胞', 'O’Keefe 發現的空間記憶細胞，在腦中畫出「知識地圖」的座標。'),
  // ── P0 apex ────────────────────────────────────────────────────────────
  mk('mtl-concept-cell', 'P0', '內側顳葉概念細胞', '單一神經元編碼一整個抽象概念（著名的「Jennifer Aniston 神經元」），記憶的最高抽象層。'),
] as const

// ── Score-tier → rarity weight (dogfood-tunable) ─────────────────────────
//
// Bands by national-equivalent score; weights ordered LOW→HIGH rarity
// (P5..P0) to match the core gacha `tiers[0] = lowest` convention. Higher
// band shifts probability mass toward rarer tiers (monotonic — the only
// normative property; exact numbers are tunable).

export type MockScoreBand = 'fail' | 'pass' | 'good' | 'excellent'

/**
 * Score band from a run's national-equivalent score. NOTE: `score` is the
 * normalized `examScore = (correct/total)×100` (0–100 ceiling, per the neurons
 * exam-set scoring contract) — these 90/80/60 cutoffs are coupled to that scale.
 */
export function mockBandForScore(score: number): MockScoreBand {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 60) return 'pass'
  return 'fail'
}

/** Per-band weight vectors, keyed by rarity. Tunable game-design values. */
export const MOCK_RARITY_WEIGHTS: Record<MockScoreBand, Record<Rarity, number>> = {
  fail: { P5: 55, P4: 25, P3: 12, P2: 6, P1: 1.5, P0: 0.5 },
  pass: { P5: 45, P4: 27, P3: 16, P2: 8, P1: 3, P0: 1 },
  good: { P5: 32, P4: 28, P3: 20, P2: 12, P1: 6, P0: 2 },
  excellent: { P5: 20, P4: 25, P3: 24, P2: 18, P1: 9, P0: 4 },
}

/** Guarantee a rare (>= P2) after this many consecutive rolls without one. Tunable. */
export const MOCK_PITY_AT_ROLLS = 8

/** Lowest rarity that counts as a "rare" for the pity floor. */
export const MOCK_PITY_FLOOR: Rarity = 'P2'

/** Rarity order LOW→HIGH for building the core gacha tier list. */
export const MOCK_RARITY_ORDER: readonly Rarity[] = ['P5', 'P4', 'P3', 'P2', 'P1', 'P0'] as const

/** Rarity → accent color (P0 apex warm → P5 muted). Shared by the reveal badge + dex. */
export const MOCK_RARITY_COLOR: Record<Rarity, string> = {
  P0: '#d4843a',
  P1: '#b45fd0',
  P2: '#d4a04d',
  P3: '#6a9bc4',
  P4: '#6a8c3f',
  P5: '#8a8f98',
}

/** Rarity → display label for the collection dex chips. */
export const MOCK_RARITY_LABEL: Record<Rarity, string> = {
  P0: 'P0 始源',
  P1: 'P1 傳說',
  P2: 'P2 稀有',
  P3: 'P3 罕見',
  P4: 'P4 常見',
  P5: 'P5 普通',
}

/** Lookup a catalog entry by id (undefined if unknown — caller decides). */
export function mockVariantById(variantId: string): MockVariantDef | undefined {
  return MOCK_VARIANT_CATALOG.find((v) => v.variantId === variantId)
}

/** All catalog entries of a given rarity (for the gacha's within-tier pick). */
export function mockVariantsByRarity(rarity: Rarity): MockVariantDef[] {
  return MOCK_VARIANT_CATALOG.filter((v) => v.rarity === rarity)
}
