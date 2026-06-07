/**
 * Per-family second-lap completion celebration marker (synced one-shot).
 *
 * Meta key `mazeSecondLapCelebrated:<familyId>` (value = ISO completion stamp).
 * Presence = that family's second-lap completion celebration has already fired
 * → never replay (cross-session AND cross-device via SYNCED_META_KEYS). The
 * marker is set-once; the meta sync adapter's first-write-wins resolution is
 * sufficient because we only check PRESENCE — a timestamp that diverges across
 * devices (both completed offline before syncing) is harmless, both sides end
 * up with the key set → neither re-celebrates. No backfill post-pass needed.
 *
 * Spec: openspec/specs/neurons-maze-second-lap/spec.md
 *   "Second-lap completion celebration SHALL fire at most once per family
 *    across sessions and devices (synced one-shot)"
 */

import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { db } from '../db'

const KEY_PREFIX = 'mazeSecondLapCelebrated:'

/** Meta key for a family's completion-celebration marker. */
export function celebrationKey(familyId: string): string {
  return `${KEY_PREFIX}${familyId}`
}

/** Single source for the sync allowlist (spread into SYNCED_META_KEYS). */
export const PER_FAMILY_CELEBRATION_KEYS: string[] = FAMILY_IDS.map(celebrationKey)

/** True once this family's completion celebration has fired (on any device). */
export async function hasCelebrated(familyId: string): Promise<boolean> {
  const row = await db.meta.get(celebrationKey(familyId))
  return row?.value != null && row.value !== ''
}

/**
 * Mark a family celebrated. Presence is the only signal (the stamp value is
 * never read), so an unconditional put is idempotent in effect — re-marking an
 * already-celebrated family leaves it celebrated. No read-before-write needed.
 */
export async function markCelebrated(familyId: string): Promise<void> {
  await db.meta.put({ key: celebrationKey(familyId), value: new Date().toISOString() })
}
