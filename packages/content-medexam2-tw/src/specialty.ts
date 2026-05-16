/** Specialty match bonus: same-subject doctor partner multiplies mastery accrual. */

import type { SubjectId } from '@study-rpg/core'
import type { Rarity } from './recruitment'

/**
 * Mastery multiplier per rarity tier when partner.subjectId === quiz.subjectId.
 * Cross-subject or missing partner → 1.0 (no bonus).
 *
 * Direction matches `AFFINITY_MATCH_BONUS` (rare doctor = stronger bonus) so
 * the rarity-vs-multiplier mental model stays consistent across the game.
 *
 * Dogfood-tunable: edit this table to retune; spec contract
 * `hospital-specialty-bonus` Req 2 expects these literal values.
 */
export const SPECIALTY_MATCH_MULTIPLIER: Readonly<Record<Rarity, number>> = Object.freeze({
  P1: 1.5,
  P2: 1.3,
  P3: 1.2,
  P4: 1.1,
  P5: 1.05,
})

/**
 * Resolve the mastery multiplier for a quiz partner pairing.
 *
 * Returns the rarity-tiered multiplier when both fields are non-null and
 * `doctorSubjectId === quizSubjectId` (exact match, no cluster fallback).
 * Returns 1.0 otherwise (no partner, missing fields, or cross-subject).
 */
export function getSpecialtyMultiplier(
  doctorSubjectId: SubjectId | null,
  doctorRarity: Rarity | null,
  quizSubjectId: SubjectId,
): number {
  if (doctorSubjectId === null || doctorRarity === null) return 1.0
  if (doctorSubjectId !== quizSubjectId) return 1.0
  return SPECIALTY_MATCH_MULTIPLIER[doctorRarity]
}
