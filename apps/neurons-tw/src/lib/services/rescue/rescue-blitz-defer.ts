/**
 * Deferred blitz-completion resolver (pure) — add-neurons-multi-subject-rescue.
 *
 * Writing `blitzDoneAt` is a per-family envelope write, so it is gated on the startup
 * force-pull having landed (`startupSyncPending`) like every other lifecycle write. But
 * a diagnostic blitz finishes exactly once and the scene advances regardless, so a
 * stale (still-pending) device must **defer** the write until the pull lands — NOT drop
 * it. Dropping it permanently loses `blitzDoneAt` (cold boot → immediate blitz), which
 * makes another device re-run the diagnostic (spec scenario "Blitz completion is gated
 * on startup sync" requires DEFER, not skip).
 *
 * This module owns only the pure decision — "given a pending completion, should it now
 * be flushed, and to what?" — so the RescueScene component wiring stays testable.
 */

/** A blitz completion whose envelope write was deferred until the startup pull lands. */
export interface PendingBlitzDone {
  familyId: string
  createdAt: number
}

/**
 * Decide whether a deferred blitz-completion should now be flushed. Pure — the caller
 * supplies the current active plan for the pending family. Returns the record to flush,
 * or `null` when: still gated (`startupSyncPending`), nothing pending, or the plan was
 * replaced / abandoned in the meantime (a stale `createdAt` must NOT resurrect a dead
 * run's blitz marker). A mismatched or absent plan is a no-op flush — the caller clears
 * the pending ref either way once the pull has landed.
 */
export function resolvePendingBlitzFlush(
  pending: PendingBlitzDone | null,
  startupSyncPending: boolean,
  activePlan: { createdAt: number } | null,
): PendingBlitzDone | null {
  if (startupSyncPending || !pending) return null
  if (!activePlan || activePlan.createdAt !== pending.createdAt) return null
  return pending
}
