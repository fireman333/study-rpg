/** Subject↔room affinity mapping + rarity-scaled bonus table. */

import type { SubjectId } from '@study-rpg/core'
import { ROOM_TYPE_LABELS, type RoomType } from './rooms'
import type { Rarity } from './recruitment'

/** 14 二階國考 subjects → room type. Frozen to prevent runtime mutation. */
export const SUBJECT_TO_ROOM: Readonly<Record<SubjectId, RoomType>> = Object.freeze({
  // ward (4) — heavy inpatient load in TW clinical practice
  內科: 'ward',
  神經內科: 'ward',
  小兒科: 'ward',
  復健科: 'ward',
  // surgery (6) — pure surgical specialties
  外科: 'surgery',
  骨科: 'surgery',
  婦產科: 'surgery',
  泌尿科: 'surgery',
  耳鼻喉科: 'surgery',
  眼科: 'surgery',
  // outpatient (4) — mostly clinic / pain clinic / pre-op clinic
  家醫科: 'outpatient',
  皮膚科: 'outpatient',
  精神科: 'outpatient',
  麻醉科: 'outpatient',
})

/** Match bonus per rarity tier. Mismatch is always 1.0× (no penalty). */
export const AFFINITY_MATCH_BONUS: Readonly<Record<Rarity, number>> = Object.freeze({
  P1: 1.5,
  P2: 1.4,
  P3: 1.3,
  P4: 1.2,
  P5: 1.1,
})

/** Return the throughput multiplier to apply for a doctor in a given room. */
export function getAffinityBonus(
  rarity: Rarity,
  subjectId: SubjectId,
  roomType: RoomType,
): number {
  const mapped = SUBJECT_TO_ROOM[subjectId]
  if (mapped !== roomType) return 1.0
  return AFFINITY_MATCH_BONUS[rarity]
}

/** Human-readable room hint for recruitment / roster card display. */
export function getRoomHintForSubject(subjectId: SubjectId): string {
  const roomType = SUBJECT_TO_ROOM[subjectId]
  return roomType ? ROOM_TYPE_LABELS[roomType] : ''
}
