// Cross-device account-reset propagation (二階).
//
// The per-row LWW sync engine has no way to communicate "the rows you
// have locally were deleted on cloud" — pull queries return 0 rows, the
// apply loop iterates 0 times, and local Dexie keeps the stale state.
// Worse, the next debounced auto-push re-uploads the stale rows back to
// cloud, resurrecting them.
//
// `delete_my_data()` now bumps `account_metadata.last_reset_at` (see
// 0011_account_reset_marker.sql). This module is the client half: read
// the marker, compare with a per-user localStorage ack, and if cloud is
// newer, snapshot local to localBackup → wipe local sync tables → write
// the new ack. Called from useSync.ts at three points:
//   1. before computeGateState in the sign-in resolution effect
//   2. at the start of forcePull (the 「立即同步下載」 button)
//   3. after delete_my_data in safeResetAccountData, to ack our own bump
//
// Failures are non-fatal: log + skip so sync engine start never blocks
// on this gate. Mirror of apps/medexam-tw/src/lib/sync/reset-propagation.ts
// — keep both impls aligned when behaviour changes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { snapshotLocalToBackup, wipeLocalSyncedTables } from './migration'
import type { HospitalDB } from '../../db/schema'

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
  db: HospitalDB,
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
