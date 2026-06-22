// Account reset (add-neurons-account-reset) — 「♻ 重置此帳號進度」.
//
// Spec: openspec/changes/add-neurons-account-reset/specs/neurons-cloud-sync/spec.md
//   "In-place account reset wipes cloud, local, and leaderboard while
//    preserving the signed-in identity"
//
// Ordering discipline (mirrors 二階 safeResetAccountData):
//   1. leaderboard row delete — BEST-EFFORT (a Worker outage must not block
//      the reset; the row can be re-deleted by re-running the reset)
//   2. reset-bundle push — MUST succeed or the whole reset aborts; local data
//      is untouched at this point so a retry is always safe
//   3. ack the reset instant (so this device's own next pull skips the gate)
//   4. wipe local synced data (account-guard helper — device-local meta and
//      the ownership marker survive; the user stays signed in)
//
// No engine coordination needed: a racing debounced push after step 4 builds
// "empty data + carried-forward reset_at" (equivalent to the reset bundle),
// and a racing pull sees reset_at == ack → no-op.

import { getSupabase } from '../auth/client'
import { db } from '../db'
import { clearLocalSyncedData, writeAckResetAt } from '../sync/account-guard'
import { buildResetSnapshot } from '../sync/r2/bundles'
import { pushBundle } from '../sync/r2/engine-r2'
import { deleteLeaderboardRow, getLeaderboardProfile } from './neurons-leaderboard'

export async function resetNeuronsAccountData(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('雲端同步未啟用')
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session?.user) throw new Error('未登入')
  const userId = session.user.id

  // (1) Leaderboard D1 row — only when a local profile exists (skipping
  // never-opted-in players avoids a wasted Worker round-trip; mirrors 二階).
  try {
    const profile = await getLeaderboardProfile(userId)
    if (profile) {
      await deleteLeaderboardRow(session.access_token, userId)
    }
  } catch (err) {
    console.warn('[account-reset] leaderboard delete failed; continuing', err)
  }

  // (2) Cloud wipe + broadcast. Abort on failure — nothing local touched yet.
  const resetAt = Date.now()
  await pushBundle(supabase, db, userId, { snapshotOverride: () => buildResetSnapshot(resetAt) })

  // (3) Ack our own reset so the next pull doesn't re-trigger the gate.
  writeAckResetAt(userId, resetAt)

  // (4) Local wipe — signed-in identity and device-local meta survive.
  await clearLocalSyncedData(db)
}
