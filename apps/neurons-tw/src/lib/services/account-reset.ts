// Account reset (add-neurons-account-reset) — 「♻ 重置此帳號進度」.
//
// Spec: openspec/changes/add-neurons-account-reset/specs/neurons-cloud-sync/spec.md
//   "In-place account reset wipes cloud, local, and leaderboard while
//    preserving the signed-in identity"
//
// Ordering discipline (wipe-then-ack — mirrors the pull-side gate
// honorResetMarker in account-guard.ts):
//   1. leaderboard row delete — BEST-EFFORT (a Worker outage must not block
//      the reset; the row can be re-deleted by re-running the reset)
//   2. reset-bundle push — MUST succeed or the whole reset aborts; local data
//      is untouched at this point so a retry is always safe
//   3. wipe local synced data (account-guard helper — device-local meta and
//      the ownership marker survive; the user stays signed in)
//   4. ack the reset instant, written ONLY after the wipe succeeds (so this
//      device's own next pull skips the gate). Ack-after-wipe is the invariant:
//      if the wipe throws, no ack is persisted, so this device's next pull sees
//      reset_at still > its ack and re-runs the idempotent (already-empty) wipe
//      gate — rather than leaving the gate disarmed against un-wiped data, which
//      would let the next push silently resurrect the just-reset account.
//
// Steps 2–4 run inside ONE per-user push lock (port-neurons-r2-single-flight-push
// D6). The cloud wipe, the local wipe, AND the ack must all complete before any
// debounced/manual push can acquire the lock — otherwise a push queued behind the
// reset would slot in right after the empty bundle lands, read the still-unwiped
// Dexie data, and resurrect the just-reset account. We call the LOW-LEVEL
// pushBundle here (not pushBundleSerialized) to avoid acquiring the same Web Lock
// name twice (self-deadlock); refreshEtagFromStore preserves the fresh-ETag win.

import { getSupabase } from '../auth/client'
import { db } from '../db'
import { clearLocalSyncedData, writeAckResetAt } from '../sync/account-guard'
import { buildResetSnapshot } from '../sync/r2/bundles'
import { pushBundle } from '../sync/r2/engine-r2'
import { refreshEtagFromStore } from '../sync/r2/etag'
import { withPushLock } from '../sync/r2/push-lock'
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

  // (2)–(4) One critical section under the per-user push lock, so no debounced /
  // manual push can interleave between the cloud wipe and the local wipe and
  // resurrect the account (single-flight D6).
  const resetAt = Date.now()
  await withPushLock(userId, async () => {
    refreshEtagFromStore(userId)
    // (2) Cloud wipe + broadcast. Abort on failure — the throw propagates out of
    // the lock BEFORE ack/wipe, so local data stays untouched and a retry is safe.
    await pushBundle(supabase, db, userId, {
      snapshotOverride: () => buildResetSnapshot(resetAt),
    })
    // (3) Local wipe — signed-in identity and device-local meta survive.
    await clearLocalSyncedData(db)
    // (4) Ack our own reset so this device's next pull doesn't re-trigger the
    // gate — written ONLY after the wipe above succeeds. If clearLocalSyncedData
    // throws, this line is skipped: no ack is persisted, so the next pull re-runs
    // the idempotent (already-empty) wipe gate instead of resurrecting the account.
    writeAckResetAt(userId, resetAt)
  })
}
