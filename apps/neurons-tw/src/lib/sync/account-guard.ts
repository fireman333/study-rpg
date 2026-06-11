// Account-switch guard — device-local ownership marker + wipe helper.
//
// Spec: openspec/changes/fix-neurons-account-switch-guard/specs/neurons-cloud-sync/spec.md
//   "Local data ownership marker" / "Account-switch gate blocks cross-account merge"
//   / "Account-switch wipe covers all synced surfaces plus local drafts"
//
// The marker lives in localStorage (NOT Dexie meta): it must be device-local,
// must never participate in cloud sync, and must survive the wipe it guards.
// Every accessor fails open — a missing/blocked localStorage degrades to the
// pre-guard status quo (first-sign-in merge path), never worse.

import type { NeuronsDB } from '../db'
import { NEURONS_ADAPTERS, SYNCED_META_KEYS } from './tables'

const MARKER_KEY = 'neurons:lastSyncedUserId'
const ACK_RESET_KEY_PREFIX = 'neurons:lastAckResetAt:'

export function readLastSyncedUserId(): string | null {
  try {
    return localStorage.getItem(MARKER_KEY)
  } catch {
    return null
  }
}

export function writeLastSyncedUserId(userId: string): void {
  try {
    localStorage.setItem(MARKER_KEY, userId)
  } catch {
    // fail-open — gate degrades to first-sign-in semantics next launch
  }
}

/**
 * Reset acknowledgement (add-neurons-account-reset) — the highest bundle
 * `meta.reset_at` this device has already honoured for a given user. Keyed
 * per-user so account switching on one device never cross-acks. 0 = never.
 * Fail-open like the marker: lost storage just means the pull-side gate
 * re-runs one (idempotent) wipe against already-empty data.
 */
export function readAckResetAt(userId: string | null): number {
  if (!userId) return 0
  try {
    const raw = localStorage.getItem(ACK_RESET_KEY_PREFIX + userId)
    const n = raw === null ? 0 : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function writeAckResetAt(userId: string | null, resetAt: number): void {
  if (!userId) return
  try {
    localStorage.setItem(ACK_RESET_KEY_PREFIX + userId, String(resetAt))
  } catch {
    // fail-open
  }
}

export type AccountGateDecision = 'proceed-and-write' | 'proceed' | 'prompt'

/**
 * Pure gate decision — kept React-free so the three branches are unit-testable.
 * - no marker        → first sign-in / anonymous-upgrade: write marker, mount
 * - marker == user   → returning account: mount
 * - marker != user   → foreign local data: block mount, prompt
 */
export function evaluateAccountGate(markerUserId: string | null, currentUserId: string): AccountGateDecision {
  if (markerUserId === null) return 'proceed-and-write'
  if (markerUserId === currentUserId) return 'proceed'
  return 'prompt'
}

/**
 * Wipe the previous account's local data before mounting the engine for a new
 * account. Covers every adapter-registered table (derived from NEURONS_ADAPTERS
 * so future adapters are auto-covered), the synced subset of `meta`, and the
 * local-only `mockExamDrafts` (drafts are the previous account's answers).
 * Atomic: a single rw transaction — partial failure leaves the marker unwritten
 * and the engine unmounted, so the caller can retry without pollution.
 */
export async function clearLocalSyncedData(db: NeuronsDB): Promise<void> {
  const tableNames = [...new Set([...NEURONS_ADAPTERS.map((a) => a.name), 'mockExamDrafts'])]
  const tables = tableNames.map((name) => db.table(name))
  await db.transaction('rw', tables, async () => {
    for (const name of tableNames) {
      if (name === 'meta') {
        await db.meta.where('key').anyOf([...SYNCED_META_KEYS]).delete()
      } else {
        await db.table(name).clear()
      }
    }
  })
}

/**
 * Confirm-path of the account-switch dialog: wipe first, adopt second. A wipe
 * failure throws BEFORE the marker is written, so the gate stays closed and
 * the engine never runs against partially-cleared foreign data.
 */
export async function adoptAccount(db: NeuronsDB, userId: string): Promise<void> {
  await clearLocalSyncedData(db)
  writeLastSyncedUserId(userId)
}

/**
 * Pull-side reset-propagation gate (add-neurons-account-reset): when a pulled
 * bundle carries a `reset_at` this device hasn't acked for the current owner,
 * local pre-reset data must die BEFORE adapters merge — the merges are
 * monotonic, so applying first would resurrect the wiped account. Returns true
 * when a wipe ran. Idempotent: the resetting device acks before its own next
 * pull, and a re-run wipes already-empty tables.
 */
export async function honorResetMarker(db: NeuronsDB, resetAt: unknown): Promise<boolean> {
  if (typeof resetAt !== 'number' || resetAt <= 0) return false
  const owner = readLastSyncedUserId()
  if (resetAt <= readAckResetAt(owner)) return false
  await clearLocalSyncedData(db)
  writeAckResetAt(owner, resetAt)
  return true
}
