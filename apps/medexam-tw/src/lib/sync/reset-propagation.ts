// Cross-device account-reset propagation (一階).
//
// Mirror of apps/medexam2-hospital-tw/src/lib/sync/reset-propagation.ts;
// see that file for full rationale. Difference: this app uses
// `StudyRpgDB` and the `snapshotLocalToBackup` / `wipeLocalSyncedTables`
// signatures from migration.ts in this app.
//
// Keep both impls aligned when behaviour changes.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StudyRpgDB } from '@study-rpg/core'
import { snapshotLocalToBackup, wipeLocalSyncedTables } from './migration'

const ACK_KEY_PREFIX = 'study-rpg.sync.lastAckResetAt:'

function ackKey(userId: string): string {
  return ACK_KEY_PREFIX + userId
}

/**
 * Fetch `account_metadata.last_reset_at` for the given user as epoch ms.
 * Returns null when no row exists OR when the fetch fails for any reason
 * (including pre-migration clients hitting a DB without the table).
 */
export async function fetchCloudResetTimestamp(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('account_metadata')
      .select('last_reset_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn('[reset-propagation] fetch error, treating as no marker', error)
      return null
    }
    if (!data?.last_reset_at) return null
    const ms = new Date(data.last_reset_at as string).getTime()
    return Number.isFinite(ms) ? ms : null
  } catch (err) {
    console.warn('[reset-propagation] fetch threw, treating as no marker', err)
    return null
  }
}

export function readLocalAckResetAt(userId: string): number {
  if (typeof localStorage === 'undefined') return 0
  const v = localStorage.getItem(ackKey(userId))
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function writeLocalAckResetAt(userId: string, ms: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(ackKey(userId), String(ms))
  } catch {
    // ignore quota / private-mode errors
  }
}

export interface ResetPropagationResult {
  propagated: boolean
  cloudResetAt: number | null
}

/**
 * Detect "another device ran reset since our last ack" and auto-mirror
 * cloud's empty state locally. Idempotent on the device that ran the
 * reset (its ack already matches cloud → no-op).
 *
 * Failure modes:
 * - Fetch fails → returns { propagated: false, cloudResetAt: null },
 *   does not throw. Sync engine start MUST NOT be blocked by this gate.
 * - Snapshot fails (Dexie quota / IO) → throws to caller. The ack is
 *   NOT bumped, so next call retries.
 * - Wipe fails partway → throws. Ack NOT bumped. Local may be in an
 *   inconsistent partial-wipe state; the next successful run will
 *   complete the wipe.
 */
export async function applyResetPropagationIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  db: StudyRpgDB,
): Promise<ResetPropagationResult> {
  const cloudResetAt = await fetchCloudResetTimestamp(supabase, userId)
  if (cloudResetAt === null) {
    return { propagated: false, cloudResetAt: null }
  }
  const localAck = readLocalAckResetAt(userId)
  if (cloudResetAt <= localAck) {
    return { propagated: false, cloudResetAt }
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[reset-propagation] applying', { cloudResetAt, localAck, userId })
  }
  await snapshotLocalToBackup(db, userId, 'auto-mirror-on-reset')
  await wipeLocalSyncedTables(db)
  writeLocalAckResetAt(userId, cloudResetAt)
  return { propagated: true, cloudResetAt }
}
