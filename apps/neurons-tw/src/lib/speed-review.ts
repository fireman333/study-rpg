/**
 * Pure card-deck builder for the 5-minute speed-review (add-neurons-5min-speed-review).
 *
 * Extracts each family's kernel (🎯 高頻考古) essence lines from the existing cram.json
 * (design D3 — reuse, no new artifact), caps them at 5 per family, and orders families
 * weakest-first from read-only mastery (D6). Pure: no I/O, no writes, no Dexie/R2 — the
 * caller passes already-loaded data. Unit-tested in __tests__/speed-review.test.ts.
 */
import type { CramData } from '@study-rpg/content-neurons-tw'
import { FAMILY_COLOR } from '@study-rpg/content-neurons-tw'
import type { FamilyMasteryRow } from './db'

export const SPEED_REVIEW_MAX_PER_FAMILY = 5
/** Attempts needed before a family's accuracy is trusted for ordering / weak-flagging. */
export const SPEED_REVIEW_MIN_DIAGNOSED = 5
/** Below this accuracy (once diagnosed) a family is flagged 近期較弱. Dogfood-tunable. */
export const SPEED_REVIEW_WEAK_RATIO = 0.6

export type SpeedReviewEssence = { html: string; cite?: string }
export interface SpeedReviewCard {
  familyId: string
  name: string
  color: string
  items: SpeedReviewEssence[]
  weak: boolean
  /** 0..1, lower = weaker; the deck is sorted ascending by this. */
  score: number
}

export function buildSpeedReviewCards(
  cram: CramData,
  mastery: readonly FamilyMasteryRow[],
): SpeedReviewCard[] {
  const mMap = new Map(mastery.map((m) => [m.familyId, m]))
  const cards: SpeedReviewCard[] = cram.books
    .flatMap((b) => b.subjects)
    .map((s) => {
      const items = s.blocks
        .filter((b) => b.kind === 'kernel')
        .flatMap((b) => (b.kind === 'kernel' ? b.items : []))
        .slice(0, SPEED_REVIEW_MAX_PER_FAMILY)
      const m = mMap.get(s.subjectId)
      const diagnosed = !!m && m.total >= SPEED_REVIEW_MIN_DIAGNOSED
      const ratio = diagnosed ? m!.correct / m!.total : null
      return {
        familyId: s.subjectId,
        name: s.name ?? s.subjectId,
        color: FAMILY_COLOR[s.subjectId] ?? '#8c6d4a',
        items,
        weak: diagnosed && (ratio ?? 1) < SPEED_REVIEW_WEAK_RATIO,
        // Undiagnosed families sink toward the middle (absence of data ≠ weakness).
        score: ratio ?? 0.99,
      }
    })
    .filter((c) => c.items.length > 0)
  cards.sort((a, b) => a.score - b.score)
  return cards
}
