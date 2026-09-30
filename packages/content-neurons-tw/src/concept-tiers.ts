/**
 * Recurrence tiers — the SINGLE source of the tier vocabulary and of `tierOf`
 * (add-neurons-handout-cloze-corpus D3; extracted from `scripts/build-concept-recurrence.ts`,
 * behaviour unchanged).
 *
 * Pure: no side effects, no `node:` import. `build-concept-recurrence.ts` writes files at its top
 * level, so nothing else may import it; the recurrence build AND the cloze gate import this module
 * instead, and a test locks the gate's closed `maxCards` table to `CONCEPT_TIERS`.
 */

/** Every tier `tierOf` can return, HIGHEST first (the order the cloze gate ranks by). */
export const CONCEPT_TIERS = ['常青必掃', '近年新寵', '穩定考點', '經典但降溫', 'low-yield'] as const

export type ConceptTier = (typeof CONCEPT_TIERS)[number]

/** 押題 threshold: breadth ≥ this many sittings is rankable; below it is searchable low-yield. */
export const PUSH_THRESHOLD = 5

/**
 * Recency-gap-aware tiering (revised per §3.4 二輪 panel — Codex+Fable consensus).
 * The old "近3=0 → 降溫" 3-sitting hard window had no statistical power (a b8 concept has
 * >20% chance of a coincidental 3-empty streak) and mislabeled staples (S.aureus/opioids/
 * thrombosis) whose last appearance was 113-2 — just one sitting outside the window.
 *   - `lastGap` = sittings since last tested (0 = tested in the most recent sitting).
 *   - 常青必掃: breadth ≥ 13 AND still active (lastGap ≤ 4) — catches permanent hot topics
 *     the old ≥15 cutoff missed (抗藥性/抗癲癇, b14 & recently tested).
 *   - 經典但降溫: breadth ≥ 8 AND genuinely absent (lastGap ≥ 6) — real decline only; a
 *     concept last seen at 113-2 (gap 3) is NOT cooling.
 *   - 近年新寵: genuinely new — first appearance within the last 6 sittings AND recurring
 *     (breadth ≥ 2). (Honest: very few concepts qualify; the old label over-claimed.)
 *
 * `sittingsTotal` is the number of ingested sittings (N); `firstIdx` is the 0-based index of the
 * first tested sitting (-1 when never tested).
 */
export function tierOf(breadth: number, lastGap: number, firstIdx: number, sittingsTotal: number): ConceptTier {
  if (firstIdx >= sittingsTotal - 6 && breadth >= 2) return '近年新寵'
  if (breadth < PUSH_THRESHOLD) return 'low-yield'
  if (breadth >= 13 && lastGap <= 4) return '常青必掃'
  // Cooling requires a genuinely long absence (≥6 sittings ≈ 3 yr). A gap of 5 is too weak
  // to call a historically-frequent flagship (e.g. S. aureus) "cooling" — those stay neutral.
  if (breadth >= 8 && lastGap >= 6) return '經典但降溫'
  return '穩定考點'
}
